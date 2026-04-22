const mockCreateServerSupabaseClient = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

function buildSupabaseClient({
  profilesRow = null,
  user = null,
  usersRow = null,
}: {
  profilesRow?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
  usersRow?: Record<string, unknown> | null;
} = {}) {
  const rowsByTable: Record<string, Record<string, unknown> | null> = {
    profiles: profilesRow,
    users: usersRow,
  };

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: rowsByTable[table] ?? null,
            error: null,
          }),
        }),
      }),
    })),
  };
}

describe("admin auth override hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockCreateServerSupabaseClient.mockResolvedValue(buildSupabaseClient());
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("ignores ADMIN_OVERRIDE in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_OVERRIDE = "true";

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toBeNull();
  });

  it("still allows ADMIN_OVERRIDE outside production", async () => {
    process.env.NODE_ENV = "development";
    process.env.ADMIN_OVERRIDE = "true";
    process.env.ADMIN_OVERRIDE_EMAIL = "local-admin@example.com";

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toEqual({
      email: "local-admin@example.com",
      isDemo: false,
      userId: "admin-override",
    });
  });

  it("fails closed on demo-mode auth fallback in production", async () => {
    process.env.NODE_ENV = "production";
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error("DEMO_MODE");
    });

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toBeNull();
  });

  it("retains the demo admin fallback outside production", async () => {
    process.env.NODE_ENV = "development";
    mockCreateServerSupabaseClient.mockImplementation(() => {
      throw new Error("DEMO_MODE");
    });

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toEqual({
      email: "demo-admin@pawvital.local",
      isDemo: true,
      userId: "demo-admin",
    });
  });

  it("accepts admins flagged in Supabase app_metadata", async () => {
    process.env.NODE_ENV = "production";
    mockCreateServerSupabaseClient.mockResolvedValue(
      buildSupabaseClient({
        user: {
          app_metadata: {
            provider: "email",
            role: "admin",
          },
          email: "Founder@PawVital.ai",
          id: "founder-admin-id",
          role: "authenticated",
          user_metadata: {},
        },
      })
    );

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toEqual({
      email: "founder@pawvital.ai",
      isDemo: false,
      userId: "founder-admin-id",
    });
  });

  it("accepts founder/admin users from the ADMIN_EMAILS allowlist", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_EMAILS = " founder@pawvital.ai , backup@pawvital.ai ";
    mockCreateServerSupabaseClient.mockResolvedValue(
      buildSupabaseClient({
        user: {
          app_metadata: {
            provider: "email",
          },
          email: "Founder@PawVital.ai",
          id: "founder-admin-id",
          role: "authenticated",
          user_metadata: {},
        },
      })
    );

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toEqual({
      email: "founder@pawvital.ai",
      isDemo: false,
      userId: "founder-admin-id",
    });
  });

  it("accepts admins flagged in the profiles row when auth metadata is absent", async () => {
    process.env.NODE_ENV = "production";
    mockCreateServerSupabaseClient.mockResolvedValue(
      buildSupabaseClient({
        profilesRow: {
          is_admin: true,
          role: "admin",
        },
        user: {
          app_metadata: {
            provider: "email",
          },
          email: "Founder@PawVital.ai",
          id: "founder-admin-id",
          role: "authenticated",
          user_metadata: {},
        },
      })
    );

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toEqual({
      email: "founder@pawvital.ai",
      isDemo: false,
      userId: "founder-admin-id",
    });
  });

  it("blocks signed-in non-admin users without admin auth metadata or table role", async () => {
    process.env.NODE_ENV = "production";
    mockCreateServerSupabaseClient.mockResolvedValue(
      buildSupabaseClient({
        profilesRow: {
          is_admin: false,
          role: "tester",
        },
        user: {
          app_metadata: {
            provider: "email",
          },
          email: "tester@example.com",
          id: "tester-user-id",
          role: "authenticated",
          user_metadata: {},
        },
        usersRow: {
          is_admin: false,
          role: "tester",
        },
      })
    );

    const { getAdminRequestContext } = await import("@/lib/admin-auth");
    await expect(getAdminRequestContext()).resolves.toBeNull();
  });
});
