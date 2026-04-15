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

  it("fails open and marks the result degraded when Upstash throws", async () => {
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
    expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain("failing open");
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

  it("prefers the injected user id before falling back to forwarded IP", async () => {
    const { getRateLimitId } = await import("../src/lib/rate-limit");
    const userRequest = new Request("http://localhost/api/test", {
      headers: { "x-user-id": "user-123", "x-forwarded-for": "198.51.100.22" },
    });
    const ipRequest = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": "198.51.100.22, 203.0.113.5" },
    });

    expect(getRateLimitId(userRequest)).toBe("user:user-123");
    expect(getRateLimitId(ipRequest)).toBe("ip:198.51.100.22");
  });
});
