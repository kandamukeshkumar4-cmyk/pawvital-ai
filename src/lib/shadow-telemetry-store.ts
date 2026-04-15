import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const SHADOW_TELEMETRY_KEY = "shadow:rollout:reports:v1";
const MAX_STORED_REPORTS = 2000;

const redis =
  redisUrl && redisToken && redisUrl.startsWith("https://")
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : null;

export interface StoredShadowTelemetrySnapshot {
  generatedAt: string;
  recentServiceCalls: unknown[];
  recentShadowComparisons: unknown[];
}

export function isShadowTelemetryStoreConfigured(): boolean {
  return Boolean(redis);
}

export async function appendShadowTelemetrySnapshot(
  snapshot: StoredShadowTelemetrySnapshot
): Promise<boolean> {
  if (!redis) {
    return false;
  }

  const payload = JSON.stringify({
    generatedAt: snapshot.generatedAt,
    recentServiceCalls: Array.isArray(snapshot.recentServiceCalls)
      ? snapshot.recentServiceCalls
      : [],
    recentShadowComparisons: Array.isArray(snapshot.recentShadowComparisons)
      ? snapshot.recentShadowComparisons
      : [],
  });

  await redis.lpush(SHADOW_TELEMETRY_KEY, payload);
  await redis.ltrim(SHADOW_TELEMETRY_KEY, 0, MAX_STORED_REPORTS - 1);
  return true;
}

export async function listShadowTelemetrySnapshots(
  limit: number
): Promise<StoredShadowTelemetrySnapshot[] | null> {
  if (!redis) {
    return null;
  }

  const rawEntries = await redis.lrange<string[]>(
    SHADOW_TELEMETRY_KEY,
    0,
    Math.max(0, limit - 1)
  );

  const entries = Array.isArray(rawEntries) ? rawEntries : [];
  return entries
    .map((entry) => {
      try {
        const parsed = JSON.parse(String(entry)) as StoredShadowTelemetrySnapshot;
        return {
          generatedAt:
            typeof parsed.generatedAt === "string"
              ? parsed.generatedAt
              : new Date().toISOString(),
          recentServiceCalls: Array.isArray(parsed.recentServiceCalls)
            ? parsed.recentServiceCalls
            : [],
          recentShadowComparisons: Array.isArray(parsed.recentShadowComparisons)
            ? parsed.recentShadowComparisons
            : [],
        } satisfies StoredShadowTelemetrySnapshot;
      } catch {
        return null;
      }
    })
    .filter(
      (entry): entry is StoredShadowTelemetrySnapshot => entry !== null
    );
}
