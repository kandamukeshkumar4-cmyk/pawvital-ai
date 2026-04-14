import thresholdConfig from "./shadow-rollout-thresholds.json";
import type { SidecarServiceName } from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";
import { ensureStructuredCaseMemory } from "./symptom-memory";

export type ShadowRolloutStatus =
  | "ready"
  | "watch"
  | "blocked"
  | "insufficient_data";

export interface ShadowLoadTestSummary {
  targetRoute: string;
  baselineRps: number;
  targetRps: number;
  durationSeconds: number;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  errorRate: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  passed: boolean;
  blockers: string[];
}

export interface SidecarShadowWindowGate {
  windowHours: number;
  sampleIntervalMinutes: number;
  requiredHealthySamples: number;
  requiredHealthyRatio: number;
  observedWindowSamples: number;
  observedHealthySamples: number;
  healthySampleRatio: number;
}

export interface SidecarShadowServiceSummary {
  service: SidecarServiceName;
  sampleMode: "shadow" | "live" | "none";
  totalObservations: number;
  shadowObservations: number;
  successfulObservations: number;
  timeoutObservations: number;
  errorObservations: number;
  fallbackObservations: number;
  averageLatencyMs: number | null;
  maxLatencyMs: number | null;
  shadowComparisonCount: number;
  disagreementCount: number;
  status: ShadowRolloutStatus;
  blockers: string[];
  window: SidecarShadowWindowGate;
  loadTestStatus: "passed" | "missing" | "failed" | "not_required";
}

export interface ShadowRolloutSummary {
  overallStatus: ShadowRolloutStatus;
  shadowModeDataPresent: boolean;
  services: SidecarShadowServiceSummary[];
  blockers: string[];
  gateConfig: {
    windowHours: number;
    sampleIntervalMinutes: number;
    requiredHealthyRatio: number;
    requiredHealthySamples: number;
    loadTestRequired: boolean;
    minTargetRpsMultiplier: number;
    maxLoadTestErrorRate: number;
    maxLoadTestP99LatencyMs: number;
  };
  loadTest: ShadowLoadTestSummary | null;
}

interface ShadowThresholds {
  minObservations: number;
  maxTimeoutRate: number;
  maxErrorRate: number;
  maxFallbackRate: number;
  maxAverageLatencyMs: number;
  maxDisagreementCount: number;
}

interface ShadowRolloutGateConfig {
  windowHours: number;
  sampleIntervalMinutes: number;
  requiredHealthyRatio: number;
  requiredHealthySamples: number;
  loadTestRequired: boolean;
  minTargetRpsMultiplier: number;
  maxLoadTestErrorRate: number;
  maxLoadTestP99LatencyMs: number;
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const SERVICE_THRESHOLDS = thresholdConfig.services as Record<
  SidecarServiceName,
  ShadowThresholds
>;
const SERVICE_ORDER = Object.keys(SERVICE_THRESHOLDS) as SidecarServiceName[];

function readGateConfig(): ShadowRolloutGateConfig {
  return {
    windowHours: Math.max(
      1,
      parseNumberEnv(
        process.env.HF_SHADOW_WINDOW_HOURS,
        thresholdConfig.windowHours
      )
    ),
    sampleIntervalMinutes: Math.max(
      1,
      parseNumberEnv(
        process.env.HF_SHADOW_SAMPLE_INTERVAL_MINUTES,
        thresholdConfig.sampleIntervalMinutes
      )
    ),
    requiredHealthyRatio: clampRate(
      parseNumberEnv(
        process.env.HF_SHADOW_REQUIRED_HEALTHY_RATIO,
        thresholdConfig.requiredHealthySampleRatio
      )
    ),
    requiredHealthySamples: Math.max(
      1,
      parseNumberEnv(
        process.env.HF_SHADOW_REQUIRED_HEALTH_SAMPLES,
        thresholdConfig.requiredHealthySamples
      )
    ),
    loadTestRequired: parseBooleanEnv(
      process.env.HF_SHADOW_LOAD_TEST_REQUIRED,
      thresholdConfig.loadTest.required
    ),
    minTargetRpsMultiplier: Math.max(
      1,
      parseNumberEnv(
        process.env.HF_SHADOW_LOAD_TEST_MIN_TARGET_RPS_MULTIPLIER,
        thresholdConfig.loadTest.minTargetRpsMultiplier
      )
    ),
    maxLoadTestErrorRate: clampRate(
      parseNumberEnv(
        process.env.HF_SHADOW_LOAD_TEST_MAX_ERROR_RATE,
        thresholdConfig.loadTest.maxErrorRate
      )
    ),
    maxLoadTestP99LatencyMs: Math.max(
      1,
      parseNumberEnv(
        process.env.HF_SHADOW_LOAD_TEST_MAX_P99_LATENCY_MS,
        thresholdConfig.loadTest.maxP99LatencyMs
      )
    ),
  };
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );
  return sorted[index] ?? null;
}

function isWithinWindow(recordedAt: string, windowStartMs: number): boolean {
  const timestamp = Date.parse(recordedAt);
  return Number.isFinite(timestamp) && timestamp >= windowStartMs;
}

function promoteStatus(
  current: ShadowRolloutStatus,
  next: ShadowRolloutStatus
): ShadowRolloutStatus {
  const rank: Record<ShadowRolloutStatus, number> = {
    ready: 0,
    watch: 1,
    insufficient_data: 2,
    blocked: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

function summarizeService(
  session: TriageSession,
  service: SidecarServiceName,
  gateConfig: ShadowRolloutGateConfig,
  loadTest: ShadowLoadTestSummary | null
): SidecarShadowServiceSummary {
  const memory = ensureStructuredCaseMemory(session);
  const allObservations = (memory.service_observations || []).filter(
    (entry) => entry.service === service
  );
  const windowStartMs = Date.now() - gateConfig.windowHours * 60 * 60 * 1000;
  const windowObservations = allObservations.filter((entry) =>
    isWithinWindow(entry.recordedAt, windowStartMs)
  );
  const windowShadowObservations = windowObservations.filter(
    (entry) => entry.shadowMode
  );
  const sampleObservations =
    windowShadowObservations.length > 0
      ? windowShadowObservations
      : windowObservations;
  const sampleMode: SidecarShadowServiceSummary["sampleMode"] =
    windowShadowObservations.length > 0
      ? "shadow"
      : windowObservations.length > 0
        ? "live"
        : "none";

  const thresholds = SERVICE_THRESHOLDS[service];
  const timeouts = sampleObservations.filter((entry) => entry.outcome === "timeout");
  const errors = sampleObservations.filter((entry) => entry.outcome === "error");
  const explicitFallbacks = sampleObservations.filter(
    (entry) => entry.outcome === "fallback"
  );
  const successful = sampleObservations.filter(
    (entry) => entry.outcome === "success" || entry.outcome === "shadow"
  );
  const shadowComparisons = (memory.shadow_comparisons || []).filter(
    (entry) =>
      entry.service === service && isWithinWindow(entry.recordedAt, windowStartMs)
  );

  const latencies = sampleObservations
    .map((entry) => entry.latencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const averageLatencyMs =
    latencies.length > 0
      ? Math.round(
          latencies.reduce((sum, value) => sum + value, 0) / latencies.length
        )
      : null;
  const maxLatencyMs =
    latencies.length > 0 ? Math.max(...latencies) : null;
  const disagreementCount = shadowComparisons.reduce(
    (sum, entry) => sum + entry.disagreementCount,
    0
  );

  const windowGate: SidecarShadowWindowGate = {
    windowHours: gateConfig.windowHours,
    sampleIntervalMinutes: gateConfig.sampleIntervalMinutes,
    requiredHealthySamples: gateConfig.requiredHealthySamples,
    requiredHealthyRatio: gateConfig.requiredHealthyRatio,
    observedWindowSamples: sampleObservations.length,
    observedHealthySamples: successful.length,
    healthySampleRatio: rate(successful.length, sampleObservations.length),
  };

  const blockers: string[] = [];
  let status: ShadowRolloutStatus = "ready";

  if (sampleObservations.length === 0) {
    status = "insufficient_data";
    blockers.push(
      `Needs recorded ${service} samples inside the rolling ${gateConfig.windowHours}h window; has none.`
    );
  }

  if (sampleObservations.length < thresholds.minObservations) {
    status = promoteStatus(status, "insufficient_data");
    blockers.push(
      `Needs at least ${thresholds.minObservations} ${sampleMode === "shadow" ? "shadow" : "recorded"} observation(s); has ${sampleObservations.length}.`
    );
  }

  if (sampleObservations.length < gateConfig.requiredHealthySamples) {
    status = promoteStatus(status, "insufficient_data");
    blockers.push(
      `Needs ${gateConfig.requiredHealthySamples} healthy-window samples over ${gateConfig.windowHours}h; has ${sampleObservations.length}.`
    );
  }

  if (
    sampleObservations.length >= gateConfig.requiredHealthySamples &&
    windowGate.healthySampleRatio < gateConfig.requiredHealthyRatio
  ) {
    status = "blocked";
    blockers.push(
      `Healthy sample ratio ${Math.round(windowGate.healthySampleRatio * 100)}% is below the ${Math.round(gateConfig.requiredHealthyRatio * 100)}% rolling-window gate.`
    );
  }

  const timeoutRate = rate(timeouts.length, sampleObservations.length);
  if (sampleObservations.length > 0 && timeoutRate > thresholds.maxTimeoutRate) {
    status = "blocked";
    blockers.push(
      `Timeout rate ${Math.round(timeoutRate * 100)}% exceeds ${Math.round(
        thresholds.maxTimeoutRate * 100
      )}% threshold.`
    );
  }

  const errorRate = rate(errors.length, sampleObservations.length);
  if (sampleObservations.length > 0 && errorRate > thresholds.maxErrorRate) {
    status = "blocked";
    blockers.push(
      `Error rate ${Math.round(errorRate * 100)}% exceeds ${Math.round(
        thresholds.maxErrorRate * 100
      )}% threshold.`
    );
  }

  const fallbackRate = rate(explicitFallbacks.length, sampleObservations.length);
  if (
    sampleObservations.length > 0 &&
    fallbackRate > thresholds.maxFallbackRate &&
    status !== "blocked"
  ) {
    status = promoteStatus(status, "watch");
    blockers.push(
      `Explicit fallback rate ${Math.round(fallbackRate * 100)}% exceeds ${Math.round(
        thresholds.maxFallbackRate * 100
      )}% threshold.`
    );
  }

  if (
    averageLatencyMs !== null &&
    averageLatencyMs > thresholds.maxAverageLatencyMs &&
    status !== "blocked"
  ) {
    status = promoteStatus(status, "watch");
    blockers.push(
      `Average latency ${averageLatencyMs}ms exceeds ${thresholds.maxAverageLatencyMs}ms threshold.`
    );
  }

  if (
    disagreementCount > thresholds.maxDisagreementCount &&
    status !== "blocked"
  ) {
    status = promoteStatus(status, "watch");
    blockers.push(
      `Shadow disagreements total ${disagreementCount} exceeds ${thresholds.maxDisagreementCount}.`
    );
  }

  const loadTestStatus: SidecarShadowServiceSummary["loadTestStatus"] =
    !gateConfig.loadTestRequired
      ? "not_required"
      : !loadTest
        ? "missing"
        : loadTest.passed
          ? "passed"
          : "failed";

  if (gateConfig.loadTestRequired) {
    if (!loadTest && status === "ready") {
      status = promoteStatus(status, "watch");
      blockers.push("Synthetic load-test evidence is required before promotion.");
    } else if (loadTest && !loadTest.passed) {
      status = "blocked";
      blockers.push(
        `Synthetic load test failed (p99=${loadTest.p99LatencyMs ?? "n/a"}ms, errorRate=${Math.round(loadTest.errorRate * 100)}%).`
      );
    }
  }

  return {
    service,
    sampleMode,
    totalObservations: allObservations.length,
    shadowObservations: windowShadowObservations.length,
    successfulObservations: successful.length,
    timeoutObservations: timeouts.length,
    errorObservations: errors.length,
    fallbackObservations: explicitFallbacks.length,
    averageLatencyMs,
    maxLatencyMs,
    shadowComparisonCount: shadowComparisons.length,
    disagreementCount,
    status,
    blockers,
    window: windowGate,
    loadTestStatus,
  };
}

export function buildShadowRolloutSummary(
  session: TriageSession,
  options?: { loadTest?: ShadowLoadTestSummary | null }
): ShadowRolloutSummary {
  const gateConfig = readGateConfig();
  const services = SERVICE_ORDER.map((service) =>
    summarizeService(session, service, gateConfig, options?.loadTest || null)
  );
  const blockers = services.flatMap((service) =>
    service.blockers.map((item) => `${service.service}: ${item}`)
  );

  const hasBlocked = services.some((service) => service.status === "blocked");
  const hasWatch = services.some((service) => service.status === "watch");
  const allInsufficient = services.every(
    (service) => service.status === "insufficient_data"
  );
  const someInsufficient = services.some(
    (service) => service.status === "insufficient_data"
  );

  let overallStatus: ShadowRolloutStatus = "ready";
  if (hasBlocked) {
    overallStatus = "blocked";
  } else if (allInsufficient) {
    overallStatus = "insufficient_data";
  } else if (hasWatch || someInsufficient) {
    overallStatus = "watch";
  }

  return {
    overallStatus,
    shadowModeDataPresent: services.some(
      (service) =>
        service.shadowObservations > 0 || service.shadowComparisonCount > 0
    ),
    services,
    blockers,
    gateConfig: {
      windowHours: gateConfig.windowHours,
      sampleIntervalMinutes: gateConfig.sampleIntervalMinutes,
      requiredHealthyRatio: gateConfig.requiredHealthyRatio,
      requiredHealthySamples: gateConfig.requiredHealthySamples,
      loadTestRequired: gateConfig.loadTestRequired,
      minTargetRpsMultiplier: gateConfig.minTargetRpsMultiplier,
      maxLoadTestErrorRate: gateConfig.maxLoadTestErrorRate,
      maxLoadTestP99LatencyMs: gateConfig.maxLoadTestP99LatencyMs,
    },
    loadTest: options?.loadTest || null,
  };
}

export function buildShadowLoadTestSummary(input: {
  targetRoute: string;
  baselineRps: number;
  targetRps: number;
  durationSeconds: number;
  latenciesMs: number[];
  failureCount: number;
}): ShadowLoadTestSummary {
  const gateConfig = readGateConfig();
  const totalRequests = input.latenciesMs.length + input.failureCount;
  const successCount = input.latenciesMs.length;
  const errorRate = rate(input.failureCount, totalRequests);
  const p50LatencyMs = percentile(input.latenciesMs, 0.5);
  const p95LatencyMs = percentile(input.latenciesMs, 0.95);
  const p99LatencyMs = percentile(input.latenciesMs, 0.99);
  const blockers: string[] = [];

  if (input.targetRps < input.baselineRps * gateConfig.minTargetRpsMultiplier) {
    blockers.push(
      `Target RPS ${input.targetRps} is below required ${(input.baselineRps * gateConfig.minTargetRpsMultiplier).toFixed(2)}.`
    );
  }

  if (errorRate > gateConfig.maxLoadTestErrorRate) {
    blockers.push(
      `Error rate ${Math.round(errorRate * 100)}% exceeds ${Math.round(gateConfig.maxLoadTestErrorRate * 100)}%.`
    );
  }

  if (
    p99LatencyMs !== null &&
    p99LatencyMs > gateConfig.maxLoadTestP99LatencyMs
  ) {
    blockers.push(
      `p99 latency ${p99LatencyMs}ms exceeds ${gateConfig.maxLoadTestP99LatencyMs}ms.`
    );
  }

  return {
    targetRoute: input.targetRoute,
    baselineRps: input.baselineRps,
    targetRps: input.targetRps,
    durationSeconds: input.durationSeconds,
    totalRequests,
    successCount,
    failureCount: input.failureCount,
    errorRate,
    p50LatencyMs,
    p95LatencyMs,
    p99LatencyMs,
    passed: blockers.length === 0,
    blockers,
  };
}
