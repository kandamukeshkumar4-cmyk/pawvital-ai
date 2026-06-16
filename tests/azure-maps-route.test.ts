import { NextResponse } from "next/server";

const mockFindNearestEmergencyVets = jest.fn();
const mockRequireAuthenticatedApiUser = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();

jest.mock("@/lib/azure/maps", () => ({
  findNearestEmergencyVets: (...args: unknown[]) =>
    mockFindNearestEmergencyVets(...args),
}));

jest.mock("@/lib/api-auth", () => ({
  requireAuthenticatedApiUser: (...args: unknown[]) =>
    mockRequireAuthenticatedApiUser(...args),
}));

jest.mock("@/lib/rate-limit", () => ({
  generalApiLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

function makeRequest(body: string) {
  return new Request("http://localhost/api/azure/maps/nearest-vets", {
    body,
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/azure/maps/nearest-vets", () => {
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
  });

  it("returns no-store invalid_location for malformed JSON", async () => {
    const { POST } = await import("@/app/api/azure/maps/nearest-vets/route");

    const response = await POST(makeRequest("{"));

    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "invalid_location",
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockFindNearestEmergencyVets).not.toHaveBeenCalled();
  });

  it("passes coordinates to the Azure Maps helper without caching the response", async () => {
    mockFindNearestEmergencyVets.mockResolvedValue({
      clinics: [],
      enabled: true,
    });
    const { POST } = await import("@/app/api/azure/maps/nearest-vets/route");

    const response = await POST(
      makeRequest(JSON.stringify({ latitude: 41.149, longitude: -81.358 }))
    );

    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: true,
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockFindNearestEmergencyVets).toHaveBeenCalledWith({
      latitude: 41.149,
      longitude: -81.358,
    });
    expect(mockGetRateLimitId).toHaveBeenCalledWith(
      expect.any(Request),
      "user-1"
    );
  });

  it("rejects unauthenticated callers with 401 and never calls Azure Maps", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    });
    const { POST } = await import("@/app/api/azure/maps/nearest-vets/route");

    const response = await POST(
      makeRequest(JSON.stringify({ latitude: 41.1, longitude: -81.3 }))
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
    });
    expect(mockFindNearestEmergencyVets).not.toHaveBeenCalled();
  });

  it("maps demo mode (503) to the graceful not_configured envelope (200)", async () => {
    mockRequireAuthenticatedApiUser.mockResolvedValueOnce({
      response: NextResponse.json(
        {
          error: "Nearby vet lookup is unavailable in demo mode",
          code: "DEMO_MODE",
        },
        { status: 503 }
      ),
    });
    const { POST } = await import("@/app/api/azure/maps/nearest-vets/route");

    const response = await POST(
      makeRequest(JSON.stringify({ latitude: 41.1, longitude: -81.3 }))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "not_configured",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mockFindNearestEmergencyVets).not.toHaveBeenCalled();
  });

  it("rate limits by authenticated user id with a 429 and Retry-After header", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      success: false,
      remaining: 0,
      reset: Date.now() + 10_000,
    });
    const { POST } = await import("@/app/api/azure/maps/nearest-vets/route");

    const response = await POST(
      makeRequest(JSON.stringify({ latitude: 41.1, longitude: -81.3 }))
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      clinics: [],
      enabled: false,
      reason: "rate_limited",
    });
    expect(response.headers.get("Retry-After")).toBeTruthy();
    expect(mockGetRateLimitId).toHaveBeenCalledWith(
      expect.any(Request),
      "user-1"
    );
    expect(mockFindNearestEmergencyVets).not.toHaveBeenCalled();
  });
});
