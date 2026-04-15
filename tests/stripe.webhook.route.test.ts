const mockConstructEvent = jest.fn();
const mockCustomerRetrieve = jest.fn();
const mockProductRetrieve = jest.fn();
const mockSubscriptionRetrieve = jest.fn();
const mockGetServiceSupabase = jest.fn();

jest.mock("@/lib/stripe", () => ({
  isStripeConfigured: true,
  isStripeWebhookConfigured: true,
  stripe: {
    customers: {
      retrieve: (...args: unknown[]) => mockCustomerRetrieve(...args),
    },
    products: {
      retrieve: (...args: unknown[]) => mockProductRetrieve(...args),
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => mockSubscriptionRetrieve(...args),
    },
    webhooks: {
      constructEvent: (...args: unknown[]) => mockConstructEvent(...args),
    },
  },
}));

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

function makeWebhookRequest(body = "{}", signature = "sig_test") {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });
}

function buildSupabaseMock(options?: {
  profileByCustomerId?: Record<string, { id: string } | null>;
  profileByEmail?: Record<string, { id: string } | null>;
  subscriptionUserByCustomerId?: Record<string, { user_id: string } | null>;
  profileUpdateError?: { message: string } | null;
  subscriptionCancelError?: { message: string } | null;
  subscriptionUpsertError?: { message: string } | null;
}) {
  const profileLookups = {
    customerId: options?.profileByCustomerId ?? {},
    email: options?.profileByEmail ?? {},
  };
  const subscriptionLookups = options?.subscriptionUserByCustomerId ?? {};

  let lastProfileEq: { column: string; value: unknown } | null = null;
  let lastProfileUpdate: Record<string, unknown> | null = null;
  let lastSubscriptionEq: { column: string; value: unknown } | null = null;
  let lastSubscriptionUpdate: Record<string, unknown> | null = null;

  const profileUpdates: Array<{
    column: string;
    payload: Record<string, unknown>;
    value: unknown;
  }> = [];
  const subscriptionUpdates: Array<{
    column: string;
    payload: Record<string, unknown>;
    value: unknown;
  }> = [];
  const subscriptionUpserts: Array<Record<string, unknown>> = [];

  const profileSelectChain = {
    eq: jest.fn((column: string, value: unknown) => {
      lastProfileEq = { column, value };
      return profileSelectChain;
    }),
    maybeSingle: jest.fn().mockImplementation(async () => {
      if (!lastProfileEq) {
        return { data: null, error: null };
      }

      if (lastProfileEq.column === "stripe_customer_id") {
        return {
          data: profileLookups.customerId[String(lastProfileEq.value)] ?? null,
          error: null,
        };
      }

      if (lastProfileEq.column === "email") {
        return {
          data: profileLookups.email[String(lastProfileEq.value)] ?? null,
          error: null,
        };
      }

      return { data: null, error: null };
    }),
  };

  const profileUpdateEq = jest.fn((column: string, value: unknown) => {
    profileUpdates.push({
      column,
      payload: lastProfileUpdate ?? {},
      value,
    });

    return Promise.resolve({ error: options?.profileUpdateError ?? null });
  });

  const profileTable = {
    select: jest.fn().mockReturnValue(profileSelectChain),
    update: jest.fn((payload: Record<string, unknown>) => {
      lastProfileUpdate = payload;
      return {
        eq: profileUpdateEq,
      };
    }),
  };

  const subscriptionSelectChain = {
    eq: jest.fn((column: string, value: unknown) => {
      lastSubscriptionEq = { column, value };
      return subscriptionSelectChain;
    }),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockImplementation(async () => {
      if (!lastSubscriptionEq) {
        return { data: null, error: null };
      }

      if (lastSubscriptionEq.column === "stripe_customer_id") {
        return {
          data: subscriptionLookups[String(lastSubscriptionEq.value)] ?? null,
          error: null,
        };
      }

      return { data: null, error: null };
    }),
    order: jest.fn().mockReturnThis(),
  };

  const subscriptionUpdateEq = jest.fn((column: string, value: unknown) => {
    subscriptionUpdates.push({
      column,
      payload: lastSubscriptionUpdate ?? {},
      value,
    });

    return Promise.resolve({ error: options?.subscriptionCancelError ?? null });
  });

  const subscriptionTable = {
    select: jest.fn().mockReturnValue(subscriptionSelectChain),
    upsert: jest.fn((payload: Record<string, unknown>) => {
      subscriptionUpserts.push(payload);
      return Promise.resolve({ error: options?.subscriptionUpsertError ?? null });
    }),
    update: jest.fn((payload: Record<string, unknown>) => {
      lastSubscriptionUpdate = payload;
      return {
        eq: subscriptionUpdateEq,
      };
    }),
  };

  const supabase = {
    from: jest.fn((table: string) => {
      if (table === "profiles") {
        return profileTable;
      }

      if (table === "subscriptions") {
        return subscriptionTable;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
  };

  return {
    profileUpdates,
    subscriptionUpdates,
    subscriptionUpserts,
    supabase,
  };
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockGetServiceSupabase.mockReturnValue(buildSupabaseMock().supabase);
    mockCustomerRetrieve.mockResolvedValue({
      deleted: false,
      email: "owner@example.com",
    });
    mockProductRetrieve.mockResolvedValue({
      id: "prod_pro",
      name: "PawVital AI Pro",
    });
    mockSubscriptionRetrieve.mockResolvedValue({
      id: "sub_from_checkout",
      current_period_end: 1_710_000_000,
      customer: "cus_checkout",
      items: {
        data: [
          {
            price: {
              metadata: { plan: "pro" },
              product: { name: "PawVital AI Pro" },
            },
          },
        ],
      },
      metadata: { userId: "user-1" },
      status: "trialing",
    });
  });

  it("rejects unsigned webhook requests", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest("{}", ""));

    expect(response.status).toBe(401);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid webhook signatures", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest());

    expect(response.status).toBe(401);
  });

  it("persists checkout completion into subscriptions and profiles", async () => {
    const { profileUpdates, subscriptionUpserts, supabase } = buildSupabaseMock();
    mockGetServiceSupabase.mockReturnValue(supabase);
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          metadata: { userId: "user-1" },
          mode: "subscription",
          customer: "cus_checkout",
          subscription: "sub_from_checkout",
        },
      },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest("{\"id\":\"evt_1\"}"));

    expect(response.status).toBe(200);
    expect(mockSubscriptionRetrieve).toHaveBeenCalledWith("sub_from_checkout", {
      expand: ["items.data.price.product"],
    });
    expect(subscriptionUpserts[0]).toEqual(
      expect.objectContaining({
        plan: "pro",
        status: "trialing",
        stripe_customer_id: "cus_checkout",
        stripe_subscription_id: "sub_from_checkout",
        user_id: "user-1",
      })
    );
    expect(profileUpdates[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          stripe_customer_id: "cus_checkout",
          subscription_status: "free_trial",
        }),
        value: "user-1",
      })
    );
  });

  it("updates subscription state when a subscription changes", async () => {
    const { profileUpdates, subscriptionUpserts, supabase } = buildSupabaseMock({
      profileByCustomerId: {
        cus_live: { id: "user-42" },
      },
    });
    mockGetServiceSupabase.mockReturnValue(supabase);
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_live",
          current_period_end: 1_720_000_000,
          customer: "cus_live",
          items: {
            data: [
              {
                price: {
                  metadata: { plan: "clinic" },
                  product: { name: "PawVital Clinic" },
                },
              },
            ],
          },
          metadata: {},
          status: "active",
        },
      },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest("{\"id\":\"evt_2\"}"));

    expect(response.status).toBe(200);
    expect(subscriptionUpserts[0]).toEqual(
      expect.objectContaining({
        plan: "clinic",
        status: "active",
        stripe_customer_id: "cus_live",
        stripe_subscription_id: "sub_live",
        user_id: "user-42",
      })
    );
    expect(profileUpdates[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          stripe_customer_id: "cus_live",
          subscription_status: "active",
        }),
        value: "user-42",
      })
    );
  });

  it("marks subscriptions canceled when Stripe deletes them", async () => {
    const { profileUpdates, subscriptionUpdates, supabase } = buildSupabaseMock({
      profileByCustomerId: {
        cus_cancelled: { id: "user-9" },
      },
    });
    mockGetServiceSupabase.mockReturnValue(supabase);
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_cancelled",
          customer: "cus_cancelled",
          items: { data: [] },
          metadata: {},
          status: "canceled",
        },
      },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const response = await POST(makeWebhookRequest("{\"id\":\"evt_3\"}"));

    expect(response.status).toBe(200);
    expect(subscriptionUpdates[0]).toEqual(
      expect.objectContaining({
        column: "stripe_subscription_id",
        payload: expect.objectContaining({
          current_period_end: null,
          status: "canceled",
        }),
        value: "sub_cancelled",
      })
    );
    expect(profileUpdates[0]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          stripe_customer_id: "cus_cancelled",
          subscription_status: "cancelled",
        }),
        value: "user-9",
      })
    );
  });
});
