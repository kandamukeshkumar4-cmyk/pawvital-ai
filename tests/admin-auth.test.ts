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
});
