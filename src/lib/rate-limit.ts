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

// ── Rate limiters ──────────────────────────────────────────────────────────

/** Symptom chat: 30 requests per minute per user */
export const symptomChatLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 m"),
      prefix: "rl:symptom-chat",
      analytics: true,
    })
  : null;

/** Image analysis: 10 requests per minute per user */
export const imageAnalysisLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:image-analysis",
      analytics: true,
    })
  : null;

/** General API: 60 requests per minute per user */
export const generalApiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "rl:general",
      analytics: true,
    })
  : null;

// ── Helper ──────────────────────────────────────────────────────────────────

type RateLimitResult =
  | { success: true }
  | { success: false; reset: number; remaining: number };

export async function checkRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<RateLimitResult> {
  if (!limiter) return { success: true }; // No-op in dev/demo

  const result = await limiter.limit(identifier);

  if (!result.success) {
    return {
      success: false,
      reset: result.reset,
      remaining: result.remaining,
    };
  }

  return { success: true };
}

/**
 * Extract a rate-limit identifier from request headers.
 * Uses Supabase user ID if available, otherwise falls back to IP.
 */
export function getRateLimitId(request: Request): string {
  // Check for Supabase auth header (set by middleware)
  const userId = request.headers.get("x-user-id");
  if (userId) return `user:${userId}`;

  // Fallback to IP
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "anonymous";
  return `ip:${ip}`;
}
