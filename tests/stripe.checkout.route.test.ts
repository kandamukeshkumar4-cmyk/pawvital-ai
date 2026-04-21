const mockCreateServerSupabaseClient = jest.fn();
const mockCustomerCreate = jest.fn();
const mockCustomerList = jest.fn();
const mockCustomerUpdate = jest.fn();
const mockCheckoutSessionCreate = jest.fn();
const originalEnv = process.env;

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

jest.mock("@/lib/stripe", () => {
  const actual = jest.requireActual("@/lib/stripe") as typeof import("@/lib/stripe");

  return {
    ...actual,
    getSubscriptionLineItems: jest.fn(() => [{ price: "price_test", quantity: 1 }]),
    isStripeConfigured: true,
    stripe: {
      checkout: {
        sessions: {
          create: (...args: unknown[]) => mockCheckoutSessionCreate(...args),
        },
      },
      customers: {
        create: (...args: unknown[]) => mockCustomerCreate(...args),
        list: (...args: unknown[]) => mockCustomerList(...args),
        update: (...args: unknown[]) => mockCustomerUpdate(...args),
      },
    },
  };
});

function makeRequest(
  body: Record<string, unknown> = {},
  options?: {
    headers?: Record<string, string>;
    url?: string;
  }
) {
  return new Request(options?.url ?? "http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: JSON.stringify(body),
  });
}

function buildSupabaseMock(options?: {
  latestSubscription?: { current_period_end: string | null; plan: string; status: string } | null;
  profile?: { email: string | null; full_name: string | null; stripe_customer_id: string | null } | null;
  user?: { email?: string | null; id: string } | null;
}) {
  const profileSelectChain = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data:
        options?.profile === undefined
          ? {
              email: "owner@example.com",
              full_name: "Owner Name",
              stripe_customer_id: null,
            }
          : options.profile,
      error: null,
    }),
  };

  const subscriptionSelectChain = {
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({
      data: options?.latestSubscription ?? null,
      error: null,
    }),
    order: jest.fn().mockReturnThis(),
  };

  const profileUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const profileUpdateChain = {
    eq: profileUpdateEq,
  };
  const profileUpdate = jest.fn().mockReturnValue(profileUpdateChain);

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user:
            options?.user === undefined
              ? { email: "owner@example.com", id: "user-1" }
              : options.user,
        },
        error: null,
      }),
    },
    from: jest.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: jest.fn().mockReturnValue(profileSelectChain),
          update: profileUpdate,
        };
      }

      if (table === "subscriptions") {
        return {
          select: jest.fn().mockReturnValue(subscriptionSelectChain),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    profileSelectChain,
    profileUpdate,
    profileUpdateEq,
    subscriptionSelectChain,
    supabase,
  };
}

describe("POST /api/stripe/checkout", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    mockCheckoutSessionCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test-session",
    });
    mockCustomerCreate.mockResolvedValue({ id: "cus_created" });
    mockCustomerList.mockResolvedValue({ data: [] });
    mockCustomerUpdate.mockResolvedValue({ id: "cus_existing" });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("rejects unauthenticated checkout attempts", async () => {
    const { supabase } = buildSupabaseMock({ user: null });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it("creates a checkout session with the authenticated identity and persists the customer id", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pawvital.test";
    const { profileUpdate, profileUpdateEq, supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(
      makeRequest({
        email: "attacker@example.com",
        userId: "attacker-user",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toBe("https://checkout.stripe.com/test-session");
    expect(mockCustomerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@example.com",
        metadata: {
          userId: "user-1",
        },
      })
    );
    expect(profileUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_customer_id: "cus_created",
      })
    );
    expect(profileUpdateEq).toHaveBeenCalledWith("id", "user-1");
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url: "https://app.pawvital.test/pricing",
        client_reference_id: "user-1",
        customer: "cus_created",
        metadata: expect.objectContaining({
          userEmail: "owner@example.com",
          userId: "user-1",
        }),
        success_url:
          "https://app.pawvital.test/dashboard?session_id={CHECKOUT_SESSION_ID}",
      })
    );
  });

  it("uses the configured canonical app url instead of hostile host or origin headers", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pawvital.test";
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(
      makeRequest(
        {},
        {
          headers: {
            Host: "evil.example",
            Origin: "https://evil.example",
          },
          url: "https://evil.example/api/stripe/checkout",
        }
      )
    );

    expect(response.status).toBe(200);
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url: "https://app.pawvital.test/pricing",
        success_url:
          "https://app.pawvital.test/dashboard?session_id={CHECKOUT_SESSION_ID}",
      })
    );
  });

  it("fails safely when production checkout lacks a canonical app url", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL_URL = "preview.pawvital.ai";
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(makeRequest({}, { url: "https://evil.example/api/stripe/checkout" }));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "Stripe checkout requires a configured canonical application URL.",
      code: "APP_URL_NOT_CONFIGURED",
    });
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("fails safely when the canonical app url is malformed", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.pawvital.ai/path?secret=topsecret";
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "Stripe checkout requires a valid canonical application URL.",
      code: "APP_URL_INVALID",
    });
    expect(JSON.stringify(payload)).not.toContain("topsecret");
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it("prevents duplicate paid checkout sessions when a subscription is already live", async () => {
    const { supabase } = buildSupabaseMock({
      latestSubscription: {
        current_period_end: "2026-05-01T00:00:00.000Z",
        plan: "pro",
        status: "active",
      },
    });
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("ALREADY_SUBSCRIBED");
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });

  it("VET-1352 tester access smoke: blocks Stripe checkout when invite-only tester free access is already active", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS: "1",
      NEXT_PUBLIC_PRIVATE_TESTER_MODE: "1",
      PRIVATE_TESTER_ALLOWED_EMAILS: "owner@example.com",
    };

    const { supabase } = buildSupabaseMock();
    mockCreateServerSupabaseClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.code).toBe("TESTER_ACCESS_GRANTED");
    expect(payload.free_access).toBe(true);
    expect(mockCheckoutSessionCreate).not.toHaveBeenCalled();
  });
});
