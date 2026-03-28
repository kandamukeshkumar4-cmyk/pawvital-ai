import type { SidecarServiceName } from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";
import { ensureStructuredCaseMemory } from "./symptom-memory";

export type ShadowRolloutStatus =
  | "ready"
  | "watch"
  | "blocked"
  | "insufficient_data";

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
}

export interface ShadowRolloutSummary {
  overallStatus: ShadowRolloutStatus;
  shadowModeDataPresent: boolean;
  services: SidecarShadowServiceSummary[];
  blockers: string[];
}

interface ShadowThresholds {
  minObservations: number;
  maxTimeoutRate: number;
  maxErrorRate: number;
  maxFallbackRate: number;
  maxAverageLatencyMs: number;
  maxDisagreementCount: number;
}

const SHADOW_THRESHOLDS: Record<SidecarServiceName, ShadowThresholds> = {
  "vision-preprocess-service": {
    minObservations: 2,
    maxTimeoutRate: 0.2,
    maxErrorRate: 0.1,
    maxFallbackRate: 0.1,
    maxAverageLatencyMs: 3500,
    maxDisagreementCount: 2,
  },
  "text-retrieval-service": {
    minObservations: 2,
    maxTimeoutRate: 0.2,
    maxErrorRate: 0.1,
    maxFallbackRate: 0.1,
    maxAverageLatencyMs: 3000,
    maxDisagreementCount: 2,
  },
  "image-retrieval-service": {
    minObservations: 2,
    maxTimeoutRate: 0.2,
    maxErrorRate: 0.1,
    maxFallbackRate: 0.1,
    maxAverageLatencyMs: 3000,
    maxDisagreementCount: 2,
  },
  "multimodal-consult-service": {
    minObservations: 2,
    maxTimeoutRate: 0.2,
    maxErrorRate: 0.1,
    maxFallbackRate: 0.1,
    maxAverageLatencyMs: 9000,
    maxDisagreementCount: 3,
  },
  "async-review-service": {
    minObservations: 1,
    maxTimeoutRate: 0.35,
    maxErrorRate: 0.15,
    maxFallbackRate: 0.15,
    maxAverageLatencyMs: 20000,
    maxDisagreementCount: 5,
  },
};

const SERVICE_ORDER = Object.keys(SHADOW_THRESHOLDS) as SidecarServiceName[];

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return count / total;
}

function summarizeService(
  session: TriageSession,
  service: SidecarServiceName
): SidecarShadowServiceSummary {
  const memory = ensureStructuredCaseMemory(session);
  const observations = (memory.service_observations || []).filter(
    (entry) => entry.service === service
  );
  const shadowObservations = observations.filter((entry) => entry.shadowMode);
  const sampleObservations =
    shadowObservations.length > 0 ? shadowObservations : observations;
  const sampleMode: SidecarShadowServiceSummary["sampleMode"] =
    shadowObservations.length > 0
      ? "shadow"
      : observations.length > 0
        ? "live"
        : "none";

  const timeouts = observations.filter((entry) => entry.outcome === "timeout");
  const errors = observations.filter((entry) => entry.outcome === "error");
  const explicitFallbacks = observations.filter(
    (entry) => entry.outcome === "fallback"
  );
  const successful = observations.filter(
    (entry) => entry.outcome === "success" || entry.outcome === "shadow"
  );
  const shadowComparisons = (memory.shadow_comparisons || []).filter(
    (entry) => entry.service === service
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

  const thresholds = SHADOW_THRESHOLDS[service];
  const blockers: string[] = [];
  let status: ShadowRolloutStatus = "ready";

  if (sampleObservations.length < thresholds.minObservations) {
    status = "insufficient_data";
    blockers.push(
      `Needs at least ${thresholds.minObservations} ${sampleMode === "shadow" ? "shadow" : "recorded"} observation(s); has ${sampleObservations.length}.`
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
    status = "watch";
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
    status = "watch";
    blockers.push(
      `Average latency ${averageLatencyMs}ms exceeds ${thresholds.maxAverageLatencyMs}ms threshold.`
    );
  }

  const disagreementCount = shadowComparisons.reduce(
    (sum, entry) => sum + entry.disagreementCount,
    0
  );
  if (
    disagreementCount > thresholds.maxDisagreementCount &&
    status !== "blocked"
  ) {
    status = "watch";
    blockers.push(
      `Shadow disagreements total ${disagreementCount} exceeds ${thresholds.maxDisagreementCount}.`
    );
  }

  return {
    service,
    sampleMode,
    totalObservations: observations.length,
    shadowObservations: shadowObservations.length,
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
  };
}

export function buildShadowRolloutSummary(
  session: TriageSession
): ShadowRolloutSummary {
  const services = SERVICE_ORDER.map((service) =>
    summarizeService(session, service)
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
      (service) => service.shadowObservations > 0 || service.shadowComparisonCount > 0
    ),
    services,
    blockers,
  };
}
