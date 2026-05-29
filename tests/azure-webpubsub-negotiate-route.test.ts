import { NextResponse } from "next/server";

const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockNegotiateTriageLiveUpdates = jest.fn();

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/azure/web-pubsub", () => ({
  negotiateTriageLiveUpdates: (...args: unknown[]) =>
    mockNegotiateTriageLiveUpdates(...args),
}));

function makeRequest(sessionId = "session-1") {
  return new Request(
    `http://localhost/api/azure/webpubsub/negotiate?sessionId=${encodeURIComponent(
      sessionId,
    )}`,
  );
}

describe("azure Web PubSub negotiate route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRequireAuthenticatedApiUser.mockResolvedValue({
      supabase: {},
      user: { id: "user-1" },
    });
    mockCheckRateLimit.mockResolvedValue({
      reset: Date.now() + 30_000,
      success: true,
    });
    mockGetRateLimitId.mockReturnValue("user:user-1");
    mockNegotiateTriageLiveUpdates.mockResolvedValue({
      enabled: true,
      sessionId: "session-1",
      url: "wss://pawvital-webpubsub.webpubsub.azure.com/client/hubs/pawvital_triage?access_token=client-token",
    });
  });

  it("requires an authenticated user because API routes bypass the proxy", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    });

    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required");
    expect(mockNegotiateTriageLiveUpdates).not.toHaveBeenCalled();
  });

  it("rate limits negotiations by authenticated user id", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      remaining: 0,
      reset: Date.now() + 10_000,
      success: false,
    });

    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mockGetRateLimitId).toHaveBeenCalledWith(expect.any(Request), "user-1");
    expect(mockNegotiateTriageLiveUpdates).not.toHaveBeenCalled();
  });

  it("returns a no-store browser WebSocket URL without exposing the connection string", async () => {
    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toEqual({
      enabled: true,
      sessionId: "session-1",
      url: expect.stringContaining("wss://"),
    });
    expect(JSON.stringify(payload)).not.toContain("AccessKey=");
    expect(mockNegotiateTriageLiveUpdates).toHaveBeenCalledWith({
      sessionId: "session-1",
      userId: "user-1",
    });
  });

  it("returns disabled when the App Config Web PubSub flag is off", async () => {
    mockNegotiateTriageLiveUpdates.mockResolvedValueOnce({
      enabled: false,
      reason: "feature_disabled",
    });

    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toEqual({
      enabled: false,
      reason: "feature_disabled",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("fails closed for invalid session IDs", async () => {
    mockNegotiateTriageLiveUpdates.mockResolvedValueOnce({
      enabled: false,
      reason: "invalid_request",
    });

    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest("../session"));

    await expect(response.json()).resolves.toEqual({
      enabled: false,
      reason: "invalid_request",
    });
    expect(response.status).toBe(400);
  });

  it("fails closed when Web PubSub is unavailable", async () => {
    mockNegotiateTriageLiveUpdates.mockResolvedValueOnce({
      enabled: false,
      reason: "not_configured",
    });

    const { GET } = await import(
      "@/app/api/azure/webpubsub/negotiate/route"
    );
    const response = await GET(makeRequest());

    await expect(response.json()).resolves.toEqual({
      enabled: false,
      reason: "webpubsub_unavailable",
    });
    expect(response.status).toBe(503);
  });
});
