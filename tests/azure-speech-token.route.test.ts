import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockGetSpeechAuthorizationToken = jest.fn();

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/azure/speech", () => ({
  getSpeechAuthorizationToken: (...args: unknown[]) =>
    mockGetSpeechAuthorizationToken(...args),
}));

function makeRequest() {
  return new Request("http://localhost/api/azure/speech-token");
}

describe("azure speech token route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
    });
    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 30_000,
    });
    mockGetRateLimitId.mockReturnValue("user:user-1");
    mockGetSpeechAuthorizationToken.mockResolvedValue({
      enabled: true,
      expiresInSeconds: 540,
      region: "centralus",
      token: "browser-token",
    });
  });

  it("requires an authenticated user because API routes bypass the proxy", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    });

    const { GET } = await import("@/app/api/azure/speech-token/route");
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required");
    expect(mockGetSpeechAuthorizationToken).not.toHaveBeenCalled();
  });

  it("rate limits token requests by authenticated user id", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 10_000,
    });

    const { GET } = await import("@/app/api/azure/speech-token/route");
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(mockGetRateLimitId).toHaveBeenCalledWith(expect.any(Request), "user-1");
    expect(mockGetSpeechAuthorizationToken).not.toHaveBeenCalled();
  });

  it("returns disabled when the App Config speech flag is off", async () => {
    mockGetSpeechAuthorizationToken.mockResolvedValueOnce({
      enabled: false,
      reason: "feature_disabled",
    });

    const { GET } = await import("@/app/api/azure/speech-token/route");
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ enabled: false });
  });

  it("returns a browser token without exposing the subscription key", async () => {
    const { GET } = await import("@/app/api/azure/speech-token/route");
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      enabled: true,
      expiresInSeconds: 540,
      region: "centralus",
      token: "browser-token",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.stringify(payload)).not.toContain("speech-secret");
  });

  it("fails closed when Azure Speech is unavailable", async () => {
    mockGetSpeechAuthorizationToken.mockResolvedValueOnce({
      enabled: false,
      reason: "speech_unavailable",
    });

    const { GET } = await import("@/app/api/azure/speech-token/route");
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      code: "SPEECH_UNAVAILABLE",
      enabled: false,
    });
  });
});
