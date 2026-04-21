import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("rate-limit helper", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("returns success when no limiter is configured", async () => {
    const { checkRateLimit } = await import("../src/lib/rate-limit");

    await expect(checkRateLimit(null, "ip:test")).resolves.toEqual({
      success: true,
    });
  });

  it("preserves denied limit responses", async () => {
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockResolvedValue({
        success: false,
        reset: 42_000,
        remaining: 0,
      }),
    };

    await expect(
      checkRateLimit(limiter as never, "user:blocked")
    ).resolves.toEqual({
      success: false,
      reset: 42_000,
      remaining: 0,
    });
  });

  it("returns success when the Redis-backed limiter allows the request", async () => {
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockResolvedValue({
        success: true,
        reset: Date.now() + 60_000,
        remaining: 29,
      }),
    };

    await expect(checkRateLimit(limiter as never, "user:allowed")).resolves.toEqual(
      {
        success: true,
      }
    );
    expect(limiter.limit).toHaveBeenCalledWith("user:allowed");
  });

  it("allows the same client again after the limiter window resets", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    const resetAt = Date.now() + 1_000;
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockImplementation(() => {
        if (Date.now() < resetAt) {
          return Promise.resolve({
            success: false,
            reset: resetAt,
            remaining: 0,
          });
        }

        return Promise.resolve({
          success: true,
          reset: resetAt,
          remaining: 29,
        });
      }),
    };

    await expect(
      checkRateLimit(limiter as never, "user:window-reset")
    ).resolves.toEqual({
      success: false,
      reset: resetAt,
      remaining: 0,
    });

    jest.setSystemTime(resetAt + 1);

    await expect(
      checkRateLimit(limiter as never, "user:window-reset")
    ).resolves.toEqual({
      success: true,
    });
  });

  it("uses the local fallback limiter and marks the result degraded when Upstash throws", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error("socket hang up")),
    };

    await expect(
      checkRateLimit(limiter as never, "ip:fail-open")
    ).resolves.toEqual({
      success: true,
      degraded: true,
      reason: "redis_unavailable",
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "using local fallback"
    );
  });

  it("blocks repeated requests through the local fallback limiter when Redis stays offline", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error("upstash offline")),
    };

    for (let attempt = 0; attempt < 30; attempt += 1) {
      await expect(
        checkRateLimit(limiter as never, "ip:offline-window")
      ).resolves.toEqual({
        success: true,
        degraded: true,
        reason: "redis_unavailable",
      });
    }

    await expect(
      checkRateLimit(limiter as never, "ip:offline-window")
    ).resolves.toEqual({
      success: false,
      reset: expect.any(Number),
      remaining: 0,
    });
  });

  it("throttles repeated fail-open warnings", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-14T12:00:00.000Z"));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { checkRateLimit } = await import("../src/lib/rate-limit");
    const limiter = {
      limit: jest.fn().mockRejectedValue(new Error("upstash offline")),
    };

    await checkRateLimit(limiter as never, "ip:first");
    await checkRateLimit(limiter as never, "ip:second");
    expect(warnSpy).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(60_001);
    await checkRateLimit(limiter as never, "ip:third");
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("prefers trusted user ids and the strongest proxy-derived IP header", async () => {
    const { getRateLimitId } = await import("../src/lib/rate-limit");
    const cfRequest = new Request("http://localhost/api/test", {
      headers: {
        "cf-connecting-ip": "192.0.2.10",
        "x-real-ip": "198.51.100.8",
        "x-forwarded-for": "203.0.113.4, 203.0.113.5",
      },
    });
    const realIpRequest = new Request("http://localhost/api/test", {
      headers: {
        "x-real-ip": "198.51.100.8",
        "x-forwarded-for": "203.0.113.4, 203.0.113.5",
      },
    });
    const forwardedIpRequest = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "198.51.100.22, 203.0.113.5" },
    });

    expect(getRateLimitId(cfRequest, "user-123")).toBe("user:user-123");
    expect(getRateLimitId(cfRequest)).toBe("ip:192.0.2.10");
    expect(getRateLimitId(realIpRequest)).toBe("ip:198.51.100.8");
    expect(getRateLimitId(forwardedIpRequest)).toBe("ip:198.51.100.22");
    expect(getRateLimitId(new Request("http://localhost/api/test"))).toBe(
      "ip:anonymous"
    );
  });

  it("ignores spoofed x-user-id headers when no trusted server identity is present", async () => {
    const { getRateLimitId } = await import("../src/lib/rate-limit");
    const spoofedHeaderRequest = new Request("http://localhost/api/test", {
      headers: {
        "x-user-id": "attacker-controlled",
        "x-real-ip": "203.0.113.7",
      },
    });

    expect(getRateLimitId(spoofedHeaderRequest)).toBe("ip:203.0.113.7");
  });
});
