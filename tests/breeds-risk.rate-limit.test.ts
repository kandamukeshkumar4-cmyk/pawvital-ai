import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetBreedRiskProfiles = jest.fn();
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
  };
});

describe("GET /api/breeds/risk rate-limit failover", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useRealTimers();
    mockGetBreedRiskProfiles.mockResolvedValue([
      {
        breed: "beagle",
        condition: "ear infection",
        risk_score: 0.31,
        mention_count: 9,
      },
    ]);
  });

  it("allows the first request through the local fallback when Redis is degraded", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { __registerRateLimitFallbackForTests } = await import(
      "../src/lib/rate-limit"
    );
    __registerRateLimitFallbackForTests(mockGeneralApiLimiter, {
      limit: 60,
      scope: "general",
      windowMs: 60_000,
    });
    mockGeneralApiLimiter.limit.mockRejectedValue(new Error("ECONNRESET"));

    const { GET } = await import("../src/app/api/breeds/risk/route");
    const response = await GET(
      new Request("http://localhost/api/breeds/risk?breed=beagle&top=2", {
        headers: {
          "x-forwarded-for": "198.51.100.22, 203.0.113.5",
        },
      })
    );
    const payload = (await response.json()) as {
      breed: string;
      profiles: Array<{ condition: string }>;
      modifierProvenance: Array<{ rule_id: string }>;
      source: string;
    };

    expect(response.status).toBe(200);
    expect(payload.breed).toBe("beagle");
    expect(payload.source).toBe("supabase");
    expect(payload.profiles).toHaveLength(1);
    expect(Array.isArray(payload.modifierProvenance)).toBe(true);
    expect(mockGetBreedRiskProfiles).toHaveBeenCalledWith("beagle", 2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("blocks repeated abuse through the local fallback and ignores spoofed x-user-id headers", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { __registerRateLimitFallbackForTests } = await import(
      "../src/lib/rate-limit"
    );
    __registerRateLimitFallbackForTests(mockGeneralApiLimiter, {
      limit: 60,
      scope: "general",
      windowMs: 60_000,
    });
    mockGeneralApiLimiter.limit.mockRejectedValue(new Error("ECONNRESET"));

    const { GET } = await import("../src/app/api/breeds/risk/route");

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await GET(
        new Request("http://localhost/api/breeds/risk?breed=beagle&top=2", {
          headers: {
            "x-real-ip": "203.0.113.7",
            "x-user-id": `attacker-${attempt}`,
          },
        })
      );

      expect(response.status).toBe(200);
    }

    const blockedResponse = await GET(
      new Request("http://localhost/api/breeds/risk?breed=beagle&top=2", {
        headers: {
          "x-real-ip": "203.0.113.7",
          "x-user-id": "final-attacker",
        },
      })
    );
    const payload = (await blockedResponse.json()) as { error: string };

    expect(blockedResponse.status).toBe(429);
    expect(payload.error).toContain("Too many requests");
    expect(Number(blockedResponse.headers.get("Retry-After"))).toBeGreaterThan(
      0
    );
    expect(mockGetBreedRiskProfiles).toHaveBeenCalledTimes(60);
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
