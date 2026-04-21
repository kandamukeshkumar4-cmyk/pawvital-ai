const mockCreateServerSupabaseClient = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

describe("journal upload route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ success: true });
    mockGetRateLimitId.mockReturnValue("ip:test");
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      storage: {
        from: jest.fn().mockReturnValue({
          upload: jest.fn(),
        }),
      },
    });
  });

  it("rejects files whose bytes do not match the declared image type", async () => {
    const formData = new FormData();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    formData.set(
      "file",
      new File([pngBytes], "mismatch.jpg", { type: "image/jpeg" })
    );

    const { POST } = await import("@/app/api/journal/upload/route");
    const response = await POST(
      new Request("http://localhost/api/journal/upload", {
        method: "POST",
        body: formData,
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("do not match");
  });
});
