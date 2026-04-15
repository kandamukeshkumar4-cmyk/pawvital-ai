import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Redis } from "@upstash/redis";
import type { ShadowLoadTestSummary } from "./shadow-rollout";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const SHADOW_TELEMETRY_KEY = "shadow:rollout:reports:v1";
const SHADOW_LOAD_TEST_KEY = "shadow:rollout:load-test:v1";
const MAX_STORED_REPORTS = 2000;
const DEFAULT_FILE_STORE_DIR = path.join(process.cwd(), "plans", ".shadow-telemetry");
const FILE_STORE_REPORTS_PATH = path.resolve(
  process.cwd(),
  process.env.SHADOW_TELEMETRY_FILE_PATH?.trim() ||
    path.join(DEFAULT_FILE_STORE_DIR, "reports.json")
);
const FILE_STORE_LOAD_TEST_PATH = path.resolve(
  process.cwd(),
  process.env.SHADOW_LOAD_TEST_FILE_PATH?.trim() ||
    path.join(DEFAULT_FILE_STORE_DIR, "load-test.json")
);

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

export type StoredShadowLoadTestSummary = ShadowLoadTestSummary;

function isTruthyFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());
}

function isFileFallbackEnabled(): boolean {
  if (process.env.SHADOW_TELEMETRY_FILE_FALLBACK?.trim()) {
    return isTruthyFlag(process.env.SHADOW_TELEMETRY_FILE_FALLBACK);
  }

  return process.env.NODE_ENV === "development";
}

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function normalizeSnapshot(
  snapshot: StoredShadowTelemetrySnapshot
): StoredShadowTelemetrySnapshot {
  return {
    generatedAt:
      typeof snapshot.generatedAt === "string"
        ? snapshot.generatedAt
        : new Date().toISOString(),
    recentServiceCalls: Array.isArray(snapshot.recentServiceCalls)
      ? snapshot.recentServiceCalls
      : [],
    recentShadowComparisons: Array.isArray(snapshot.recentShadowComparisons)
      ? snapshot.recentShadowComparisons
      : [],
  };
}

function isShadowLoadTestSummary(value: unknown): value is StoredShadowLoadTestSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.targetRoute === "string" &&
    Number.isFinite(Number(candidate.baselineRps)) &&
    Number.isFinite(Number(candidate.targetRps)) &&
    Number.isFinite(Number(candidate.durationSeconds)) &&
    Number.isFinite(Number(candidate.totalRequests)) &&
    Number.isFinite(Number(candidate.successCount)) &&
    Number.isFinite(Number(candidate.failureCount)) &&
    typeof candidate.passed === "boolean" &&
    Array.isArray(candidate.blockers)
  );
}

function writeSnapshotsToFile(
  snapshots: StoredShadowTelemetrySnapshot[]
): boolean {
  if (!isFileFallbackEnabled()) {
    return false;
  }

  ensureParentDir(FILE_STORE_REPORTS_PATH);
  fs.writeFileSync(FILE_STORE_REPORTS_PATH, JSON.stringify(snapshots, null, 2));
  return true;
}

function readSnapshotsFromFile(
  limit: number
): StoredShadowTelemetrySnapshot[] | null {
  if (!isFileFallbackEnabled()) {
    return null;
  }

  const stored = readJsonFile<StoredShadowTelemetrySnapshot[]>(
    FILE_STORE_REPORTS_PATH,
    []
  );

  return stored
    .map((entry) => normalizeSnapshot(entry))
    .slice(0, Math.max(0, limit));
}

function writeLoadTestToFile(summary: StoredShadowLoadTestSummary): boolean {
  if (!isFileFallbackEnabled()) {
    return false;
  }

  ensureParentDir(FILE_STORE_LOAD_TEST_PATH);
  fs.writeFileSync(FILE_STORE_LOAD_TEST_PATH, JSON.stringify(summary, null, 2));
  return true;
}

function readLoadTestFromFile(): StoredShadowLoadTestSummary | null {
  if (!isFileFallbackEnabled()) {
    return null;
  }

  const stored = readJsonFile<unknown>(FILE_STORE_LOAD_TEST_PATH, null);
  return isShadowLoadTestSummary(stored) ? stored : null;
}

export function isShadowTelemetryStoreConfigured(): boolean {
  return Boolean(redis || isFileFallbackEnabled());
}

export async function appendShadowTelemetrySnapshot(
  snapshot: StoredShadowTelemetrySnapshot
): Promise<boolean> {
  const normalized = normalizeSnapshot(snapshot);

  if (redis) {
    try {
      const payload = JSON.stringify(normalized);
      await redis.lpush(SHADOW_TELEMETRY_KEY, payload);
      await redis.ltrim(SHADOW_TELEMETRY_KEY, 0, MAX_STORED_REPORTS - 1);
      return true;
    } catch (error) {
      if (!isFileFallbackEnabled()) {
        throw error;
      }
    }
  }

  const existingSnapshots = readSnapshotsFromFile(MAX_STORED_REPORTS) || [];
  return writeSnapshotsToFile([normalized, ...existingSnapshots].slice(0, MAX_STORED_REPORTS));
}

export async function listShadowTelemetrySnapshots(
  limit: number
): Promise<StoredShadowTelemetrySnapshot[] | null> {
  if (redis) {
    try {
      const rawEntries = await redis.lrange<string[]>(
        SHADOW_TELEMETRY_KEY,
        0,
        Math.max(0, limit - 1)
      );

      const entries = Array.isArray(rawEntries) ? rawEntries : [];
      return entries
        .map((entry) => {
          try {
            return normalizeSnapshot(
              JSON.parse(String(entry)) as StoredShadowTelemetrySnapshot
            );
          } catch {
            return null;
          }
        })
        .filter(
          (entry): entry is StoredShadowTelemetrySnapshot => entry !== null
        );
    } catch (error) {
      if (!isFileFallbackEnabled()) {
        throw error;
      }
    }
  }

  return readSnapshotsFromFile(limit);
}

export async function persistShadowLoadTestSummary(
  summary: StoredShadowLoadTestSummary
): Promise<boolean> {
  if (redis) {
    try {
      await redis.set(SHADOW_LOAD_TEST_KEY, JSON.stringify(summary));
      return true;
    } catch (error) {
      if (!isFileFallbackEnabled()) {
        throw error;
      }
    }
  }

  return writeLoadTestToFile(summary);
}

export async function readShadowLoadTestSummary(): Promise<StoredShadowLoadTestSummary | null> {
  if (redis) {
    try {
      const rawValue = await redis.get<string | null>(SHADOW_LOAD_TEST_KEY);
      if (!rawValue) {
        return null;
      }

      const parsed =
        typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
      return isShadowLoadTestSummary(parsed) ? parsed : null;
    } catch (error) {
      if (!isFileFallbackEnabled()) {
        throw error;
      }
    }
  }

  return readLoadTestFromFile();
}
