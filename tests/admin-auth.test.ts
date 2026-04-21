const mockCreateServerSupabaseClient = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

describe("admin auth override hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });
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
});
