const mockCreateServerSupabaseClient = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
}));

describe("server-identity", () => {
  beforeEach(() => {
    jest.resetModules();
    mockCreateServerSupabaseClient.mockReset();
  });

  it("returns the authenticated user id", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
        }),
      },
    });

    const { resolveVerifiedUserId } = await import(
      "@/lib/symptom-chat/server-identity"
    );

    await expect(resolveVerifiedUserId()).resolves.toBe("user-123");
  });

  it("returns null when no authenticated user exists", async () => {
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    });

    const { resolveVerifiedUserId } = await import(
      "@/lib/symptom-chat/server-identity"
    );

    await expect(resolveVerifiedUserId()).resolves.toBeNull();
  });

  it("fails open to null when auth lookup throws", async () => {
    mockCreateServerSupabaseClient.mockRejectedValue(new Error("DEMO_MODE"));

    const { resolveVerifiedUserId } = await import(
      "@/lib/symptom-chat/server-identity"
    );

    await expect(resolveVerifiedUserId()).resolves.toBeNull();
  });
});
