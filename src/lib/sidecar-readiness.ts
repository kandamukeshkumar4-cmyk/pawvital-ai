import type { SidecarServiceName } from "./clinical-evidence";
import { buildObservabilitySnapshot } from "./sidecar-observability";
import { buildShadowRolloutSummary } from "./shadow-rollout";
import sidecarServiceRegistry from "./sidecar-service-registry.json";
import type { TriageSession } from "./triage-engine";

interface SidecarRegistryEntry {
  name: SidecarServiceName;
  env: string;
  expectedPath: string;
  expectedHealthService: SidecarServiceName;
}

export interface SidecarConfigSummary {
  service: SidecarServiceName;
  env: string;
  configured: boolean;
  valid: boolean;
  url: string | null;
  expectedPath: string;
  warning: string | null;
}

export interface SidecarHealthSummary {
  service: SidecarServiceName;
  status:
    | "healthy"
    | "stub"
    | "unconfigured"
    | "misconfigured"
    | "unhealthy"
    | "unreachable";
  statusCode: number | null;
  mode: string | null;
  model: string | null;
  version: string | null;
  latencyMs: number;
  timedOut: boolean;
  detail: string | null;
}

export interface ReadinessAggregation {
  services: Array<{
    name: string;
    status: "healthy" | "stub" | "down" | "timeout";
    latencyMs: number;
    version?: string;
  }>;
  healthy: string[];
  stub: string[];
  down: string[];
  summary: "all_healthy" | "degraded" | "offline";
  totalLatencyMs: number;
  checkedAt: string;
}

export interface SidecarReadinessSnapshot {
  generatedAt: string;
  configuredCount: number;
  validCount: number;
  misconfiguredCount: number;
  unconfiguredCount: number;
  healthyCount: number;
  stubCount: number;
  unhealthyCount: number;
  unreachableCount: number;
  configs: SidecarConfigSummary[];
  health: SidecarHealthSummary[];
  aggregation: ReadinessAggregation;
  shadow?: ReturnType<typeof buildShadowRolloutSummary>;
  observability?: {
    shadowModeActive: boolean;
    timeoutCount: number;
    fallbackCount: number;
    serviceCallCounts: Record<string, number>;
    recentServiceCallCount: number;
    recentShadowComparisonCount: number;
  };
}

interface FetchHealthResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  latencyMs: number;
}

const registry = sidecarServiceRegistry as SidecarRegistryEntry[];
const HEALTH_TIMEOUT_MS = Number(process.env.HF_SIDECAR_HEALTH_TIMEOUT_MS) || 5000;

function readEnv(name: string): string {
  return (process.env[name] || "").trim();
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function validateSidecarUrl(
  env: string,
  expectedPath: string
): { valid: boolean; url: string | null; warning: string | null } {
  const rawUrl = readEnv(env);
  if (!rawUrl) {
    return { valid: false, url: null, warning: `${env} is not configured` };
  }

  try {
    const parsed = new URL(rawUrl);
    if (!/^https?:$/.test(parsed.protocol)) {
      return {
        valid: false,
        url: rawUrl,
        warning: `${env} must use http or https`,
      };
    }

    if (parsed.pathname !== expectedPath) {
      return {
        valid: false,
        url: rawUrl,
        warning: `${env} should point to ${expectedPath} but is ${parsed.pathname || "/"}`,
      };
    }

    return { valid: true, url: rawUrl, warning: null };
  } catch (error) {
    return {
      valid: false,
      url: rawUrl,
      warning: `${env} is not a valid URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildHealthUrl(rawUrl: string): string {
  const healthUrl = new URL(rawUrl);
  healthUrl.pathname = "/healthz";
  healthUrl.search = "";
  healthUrl.hash = "";
  return healthUrl.toString();
}

async function fetchHealth(rawUrl: string): Promise<FetchHealthResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(buildHealthUrl(rawUrl), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    return {
      ok: response.ok,
      status: response.status,
      body,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapHealthStatus(
  entry: SidecarHealthSummary
): "healthy" | "stub" | "down" | "timeout" {
  if (entry.status === "healthy") {
    return "healthy";
  }

  if (entry.status === "stub") {
    return "stub";
  }

  if (entry.timedOut) {
    return "timeout";
  }

  return "down";
}

export function aggregateReadiness(
  health: SidecarHealthSummary[],
  checkedAt = new Date().toISOString()
): ReadinessAggregation {
  const services = health.map((entry) => ({
    name: entry.service,
    status: mapHealthStatus(entry),
    latencyMs: entry.latencyMs,
    ...(entry.version ? { version: entry.version } : {}),
  }));

  const healthy = services
    .filter((entry) => entry.status === "healthy")
    .map((entry) => entry.name);
  const stub = services
    .filter((entry) => entry.status === "stub")
    .map((entry) => entry.name);
  const down = services
    .filter((entry) => entry.status === "down" || entry.status === "timeout")
    .map((entry) => entry.name);

  let summary: ReadinessAggregation["summary"] = "degraded";
  if (services.every((entry) => entry.status === "healthy")) {
    summary = "all_healthy";
  } else if (healthy.length === 0 && stub.length === 0) {
    summary = "offline";
  }

  return {
    services,
    healthy,
    stub,
    down,
    summary,
    totalLatencyMs: services.reduce((sum, entry) => sum + entry.latencyMs, 0),
    checkedAt,
  };
}

export function listSidecarRegistry(): SidecarRegistryEntry[] {
  return registry.map((entry) => ({ ...entry }));
}

export function getSidecarConfigSummaries(): SidecarConfigSummary[] {
  return registry.map((entry) => {
    const validation = validateSidecarUrl(entry.env, entry.expectedPath);
    return {
      service: entry.name,
      env: entry.env,
      configured: Boolean(readEnv(entry.env)),
      valid: validation.valid,
      url: validation.url,
      expectedPath: entry.expectedPath,
      warning: validation.warning,
    };
  });
}

export async function getSidecarHealthSummaries(): Promise<SidecarHealthSummary[]> {
  const configs = getSidecarConfigSummaries();
  const byService = new Map(configs.map((entry) => [entry.service, entry]));

  return Promise.all(
    registry.map(async (entry) => {
      const config = byService.get(entry.name);
      if (!config?.configured) {
        return {
          service: entry.name,
          status: "unconfigured",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: "Service URL is not configured",
        } satisfies SidecarHealthSummary;
      }

      if (!config.valid || !config.url) {
        return {
          service: entry.name,
          status: "misconfigured",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: false,
          detail: config.warning,
        } satisfies SidecarHealthSummary;
      }

      try {
        const result = await fetchHealth(config.url);
        const mode = String(result.body?.mode || "").trim() || null;
        const model = String(result.body?.model || "").trim() || null;
        const version =
          String(
            result.body?.version ||
              result.body?.build_version ||
              result.body?.app_version ||
              ""
          ).trim() || null;
        const reportedService = String(result.body?.service || "").trim();

        if (!result.ok || result.body?.ok !== true) {
          return {
            service: entry.name,
            status: "unhealthy",
            statusCode: result.status,
            mode,
            model,
            version,
            latencyMs: result.latencyMs,
            timedOut: false,
            detail: `Health check failed at status ${result.status}`,
          } satisfies SidecarHealthSummary;
        }

        if (reportedService && reportedService !== entry.expectedHealthService) {
          return {
            service: entry.name,
            status: "unhealthy",
            statusCode: result.status,
            mode,
            model,
            version,
            latencyMs: result.latencyMs,
            timedOut: false,
            detail: `Health check reported ${reportedService} instead of ${entry.expectedHealthService}`,
          } satisfies SidecarHealthSummary;
        }

        return {
          service: entry.name,
          status: mode === "stub" ? "stub" : "healthy",
          statusCode: result.status,
          mode,
          model,
          version,
          latencyMs: result.latencyMs,
          timedOut: false,
          detail: null,
        } satisfies SidecarHealthSummary;
      } catch (error) {
        return {
          service: entry.name,
          status: "unreachable",
          statusCode: null,
          mode: null,
          model: null,
          version: null,
          latencyMs: 0,
          timedOut: isAbortLikeError(error),
          detail: error instanceof Error ? error.message : String(error),
        } satisfies SidecarHealthSummary;
      }
    })
  );
}

export async function buildSidecarReadinessSnapshot(options?: {
  session?: TriageSession | null;
}): Promise<SidecarReadinessSnapshot> {
  const generatedAt = new Date().toISOString();
  const configs = getSidecarConfigSummaries();
  const health = await getSidecarHealthSummaries();

  const snapshot: SidecarReadinessSnapshot = {
    generatedAt,
    configuredCount: configs.filter((entry) => entry.configured).length,
    validCount: configs.filter((entry) => entry.valid).length,
    misconfiguredCount: configs.filter(
      (entry) => entry.configured && !entry.valid
    ).length,
    unconfiguredCount: configs.filter((entry) => !entry.configured).length,
    healthyCount: health.filter((entry) => entry.status === "healthy").length,
    stubCount: health.filter((entry) => entry.status === "stub").length,
    unhealthyCount: health.filter((entry) => entry.status === "unhealthy").length,
    unreachableCount: health.filter((entry) => entry.status === "unreachable").length,
    configs,
    health,
    aggregation: aggregateReadiness(health, generatedAt),
  };

  if (options?.session) {
    const observability = buildObservabilitySnapshot(options.session);
    snapshot.shadow = buildShadowRolloutSummary(options.session);
    snapshot.observability = {
      shadowModeActive: observability.shadowModeActive,
      timeoutCount: observability.timeoutCount,
      fallbackCount: observability.fallbackCount,
      serviceCallCounts: observability.serviceCallCounts,
      recentServiceCallCount: observability.recentServiceCalls.length,
      recentShadowComparisonCount:
        observability.recentShadowComparisons.length,
    };
  }

  return snapshot;
}
