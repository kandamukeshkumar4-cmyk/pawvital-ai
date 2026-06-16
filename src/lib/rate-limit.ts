import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Rate limiting via Upstash Redis.
 *
 * Falls back to no-op if env vars are missing (dev/demo mode).
 */

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

const isConfigured =
  !!redisUrl &&
  !!redisToken &&
  redisUrl.startsWith("https://");

const redis = isConfigured
  ? new Redis({
      url: redisUrl!,
      token: redisToken!,
    })
  : null;

const RATE_LIMIT_ERROR_LOG_INTERVAL_MS = 60_000;
const DEFAULT_FALLBACK_WINDOW_MS = 60_000;
const DEFAULT_FALLBACK_LIMIT = 30;
let lastRateLimitErrorLogAt = 0;
let rateLimitUnconfiguredLogged = false;

export type RateLimitFallbackConfig = {
  limit: number;
  scope: string;
  windowMs: number;
};

/**
 * Config used by the in-process fallback limiter when no Upstash limiter
 * object exists at all (production with Upstash env unset). Every scope shares
 * one "default" bucket per identifier — coarser than the per-scope Redis
 * limits, but strictly safer than the previous unlimited fail-open.
 */
const DEFAULT_FALLBACK_CONFIG: RateLimitFallbackConfig = {
  limit: DEFAULT_FALLBACK_LIMIT,
  scope: "default",
  windowMs: DEFAULT_FALLBACK_WINDOW_MS,
};

type LocalFallbackState = {
  count: number;
  reset: number;
};

const limiterFallbackConfigs = new WeakMap<object, RateLimitFallbackConfig>();
const localFallbackState = new Map<string, LocalFallbackState>();

function registerFallbackConfig<T extends object>(
  limiter: T | null,
  config: RateLimitFallbackConfig
): T | null {
  if (limiter) {
    limiterFallbackConfigs.set(limiter, config);
  }
  return limiter;
}

export function __registerRateLimitFallbackForTests<T extends object>(
  limiter: T,
  config: RateLimitFallbackConfig
): T {
  registerFallbackConfig(limiter, config);
  return limiter;
}

// ── Rate limiters ──────────────────────────────────────────────────────────

/** Symptom chat: 30 requests per minute per user */
export const symptomChatLimiter = registerFallbackConfig(
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, "1 m"),
        prefix: "rl:symptom-chat",
        analytics: true,
      })
    : null,
  {
    limit: 30,
    scope: "symptom-chat",
    windowMs: DEFAULT_FALLBACK_WINDOW_MS,
  }
);

/** Image analysis: 10 requests per minute per user */
export const imageAnalysisLimiter = registerFallbackConfig(
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "1 m"),
        prefix: "rl:image-analysis",
        analytics: true,
      })
    : null,
  {
    limit: 10,
    scope: "image-analysis",
    windowMs: DEFAULT_FALLBACK_WINDOW_MS,
  }
);

/** General API: 60 requests per minute per user */
export const generalApiLimiter = registerFallbackConfig(
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        prefix: "rl:general",
        analytics: true,
      })
    : null,
  {
    limit: 60,
    scope: "general",
    windowMs: DEFAULT_FALLBACK_WINDOW_MS,
  }
);

/** Azure Translator: 20 requests per minute per user */
export const translatorApiLimiter = registerFallbackConfig(
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(20, "1 m"),
        prefix: "rl:azure-translator",
        analytics: true,
      })
    : null,
  {
    limit: 20,
    scope: "azure-translator",
    windowMs: DEFAULT_FALLBACK_WINDOW_MS,
  }
);

// ── Helper ──────────────────────────────────────────────────────────────────

export type RateLimitResult =
  | { success: true; degraded?: boolean; reason?: "redis_unavailable" }
  | { success: false; reset: number; remaining: number };

function logRateLimitFailure(
  identifier: string,
  error: unknown,
  now = Date.now()
) {
  if (now - lastRateLimitErrorLogAt < RATE_LIMIT_ERROR_LOG_INTERVAL_MS) {
    return;
  }

  lastRateLimitErrorLogAt = now;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[rate-limit] Upstash limiter unavailable; using local fallback for ${identifier}: ${message}`
  );
}

function logRateLimitUnconfiguredOnce(identifier: string) {
  if (rateLimitUnconfiguredLogged) {
    return;
  }

  rateLimitUnconfiguredLogged = true;
  console.warn(
    `[rate-limit] Upstash not configured in production; using in-process ` +
      `fallback limiter (default scope, ${DEFAULT_FALLBACK_CONFIG.limit} per ` +
      `${DEFAULT_FALLBACK_CONFIG.windowMs}ms). Set UPSTASH_REDIS_REST_URL and ` +
      `UPSTASH_REDIS_REST_TOKEN to restore distributed limiting. First seen: ${identifier}.`
  );
}

function pruneLocalFallbackState(now = Date.now()) {
  for (const [key, state] of localFallbackState.entries()) {
    if (now >= state.reset) {
      localFallbackState.delete(key);
    }
  }
}

function runLocalFallbackWithConfig(
  config: RateLimitFallbackConfig,
  identifier: string,
  now = Date.now()
): RateLimitResult {
  pruneLocalFallbackState(now);
  const key = `${config.scope}:${identifier}`;
  const existing = localFallbackState.get(key);
  const active =
    existing && now < existing.reset
      ? existing
      : {
          count: 0,
          reset: now + config.windowMs,
        };

  active.count += 1;
  localFallbackState.set(key, active);

  if (active.count > config.limit) {
    return {
      success: false,
      reset: active.reset,
      remaining: 0,
    };
  }

  return {
    success: true,
    degraded: true,
    reason: "redis_unavailable",
  };
}

function runLocalFallbackLimiter(
  limiter: Ratelimit,
  identifier: string,
  now = Date.now()
): RateLimitResult {
  const config =
    limiterFallbackConfigs.get(limiter as unknown as object) ||
    DEFAULT_FALLBACK_CONFIG;
  return runLocalFallbackWithConfig(config, identifier, now);
}

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) {
    // Production with no Upstash limiter must NOT run unlimited. Fall back to
    // the in-process limiter instead of granting every request (fail-open).
    if (process.env.NODE_ENV === "production") {
      logRateLimitUnconfiguredOnce(identifier);
      return runLocalFallbackWithConfig(DEFAULT_FALLBACK_CONFIG, identifier);
    }
    return { success: true }; // No-op in dev/demo
  }

  try {
    const result = await limiter.limit(identifier);

    if (!result.success) {
      return {
        success: false,
        reset: result.reset,
        remaining: result.remaining,
      };
    }
  } catch (error) {
    logRateLimitFailure(identifier, error);
    return runLocalFallbackLimiter(limiter, identifier);
  }

  return { success: true };
}

/**
 * Extract a rate-limit identifier from request headers.
 * Uses a trusted server-provided user ID when explicitly supplied,
 * otherwise falls back to proxy-derived client IP headers.
 */
export function getRateLimitId(
  request: Request,
  trustedUserId?: string | null
): string {
  if (trustedUserId?.trim()) {
    return `user:${trustedUserId.trim()}`;
  }

  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  return `ip:${ip}`;
}
