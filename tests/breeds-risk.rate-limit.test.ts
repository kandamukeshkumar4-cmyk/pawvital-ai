import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetBreedRiskProfiles = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockGeneralApiLimiter = {
  limit: jest.fn(),
};

jest.mock("@/lib/breed-risk", () => ({
  getBreedRiskProfiles: (...args: unknown[]) => mockGetBreedRiskProfiles(...args),
}));

jest.mock("@/lib/rate-limit", () => {
  const actual = jest.requireActual("../src/lib/rate-limit");

  return {
    ...actual,
    generalApiLimiter: mockGeneralApiLimiter,
    getRateLimitId: (request: Request) => mockGetRateLimitId(request),
  };
});

describe("GET /api/breeds/risk rate-limit failover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRateLimitId.mockReturnValue("ip:breed-risk");
    mockGetBreedRiskProfiles.mockResolvedValue([
      {
        breed: "beagle",
        condition: "ear infection",
        risk_score: 0.31,
        mention_count: 9,
      },
    ]);
  });

  it("fails open when the shared limiter throws", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockGeneralApiLimiter.limit.mockRejectedValue(new Error("ECONNRESET"));

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(
      new Request("http://localhost/api/breeds/risk?breed=beagle&top=2")
    );
    const payload = (await response.json()) as {
      breed: string;
      profiles: Array<{ condition: string }>;
      source: string;
    };

    expect(response.status).toBe(200);
    expect(payload.breed).toBe("beagle");
    expect(payload.source).toBe("supabase");
    expect(payload.profiles).toHaveLength(1);
    expect(mockGetBreedRiskProfiles).toHaveBeenCalledWith("beagle", 2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("still returns 429 when the limiter denies the request", async () => {
    mockGeneralApiLimiter.limit.mockResolvedValue({
      success: false,
      reset: Date.now() + 15_000,
      remaining: 0,
    });

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(
      new Request("http://localhost/api/breeds/risk?breed=beagle&top=2")
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(mockGetBreedRiskProfiles).not.toHaveBeenCalled();
  });
});
