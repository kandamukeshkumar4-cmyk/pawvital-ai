/**
 * VET-1511: Per-pack cost/latency guardrails and staged shadow→canary→live rollout.
 *
 * Each Wave 5 clinical analysis pack (VET-1504 through VET-1509) starts in shadow
 * mode. Results are computed but not used to alter the owner-facing response.
 * Promotion to canary and then live requires the guardrail thresholds to be met
 * across a minimum observation window.
 *
 * Advisory-only rule: packs NEVER reduce clinical urgency below the deterministic
 * matrix result. Promotion changes only whether the advisory evidence is surfaced
 * in the report — emergency escalation paths remain unaffected at all stages.
 */

import thresholdConfig from "./shadow-rollout-thresholds.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PackId =
  | "vet-1504"
  | "vet-1505"
  | "vet-1506"
  | "vet-1507"
  | "vet-1508"
  | "vet-1509";

export type PackRolloutStage = "shadow" | "canary" | "live";

export interface PackGuardrailConfig {
  name: string;
  maxLatencyMs: number;
  maxErrorRate: number;
  maxAbstentionRate: number;
  maxCostPerCallUSD: number;
  minObservations: number;
  rolloutStage: PackRolloutStage;
  canaryTrafficFraction: number;
  canaryMinHealthySamples: number;
}

export interface PackObservation {
  latencyMs: number;
  errored: boolean;
  abstained: boolean;
  costUSD?: number;
}

export interface PackGuardrailWindow {
  totalObservations: number;
  errorCount: number;
  abstentionCount: number;
  totalCostUSD: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
}

export type PackGuardrailVerdict = "pass" | "warn" | "block";

export interface PackGuardrailEvaluation {
  packId: PackId;
  stage: PackRolloutStage;
  verdict: PackGuardrailVerdict;
  blockers: string[];
  warnings: string[];
  metrics: {
    errorRate: number;
    abstentionRate: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
    averageCostUSD: number;
    observations: number;
  };
  canPromote: boolean;
}

// ---------------------------------------------------------------------------
// Config access
// ---------------------------------------------------------------------------

const PACK_CONFIG = thresholdConfig.packs as Record<
  PackId,
  PackGuardrailConfig
>;

export const PACK_IDS: PackId[] = [
  "vet-1504",
  "vet-1505",
  "vet-1506",
  "vet-1507",
  "vet-1508",
  "vet-1509",
];

export function getPackConfig(packId: PackId): PackGuardrailConfig {
  return PACK_CONFIG[packId];
}

// ---------------------------------------------------------------------------
// Guardrail evaluation
// ---------------------------------------------------------------------------

export function evaluatePackGuardrail(
  packId: PackId,
  window: PackGuardrailWindow,
  stageOverride?: PackRolloutStage
): PackGuardrailEvaluation {
  const config = getPackConfig(packId);
  const stage = stageOverride ?? config.rolloutStage;
  const n = window.totalObservations;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (n < config.minObservations) {
    return {
      packId,
      stage,
      verdict: "warn",
      blockers: [],
      warnings: [
        `insufficient_observations: ${n}/${config.minObservations} required`,
      ],
      metrics: {
        errorRate: 0,
        abstentionRate: 0,
        averageLatencyMs: 0,
        maxLatencyMs: 0,
        averageCostUSD: 0,
        observations: n,
      },
      canPromote: false,
    };
  }

  const errorRate = window.errorCount / n;
  const abstentionRate = window.abstentionCount / n;
  const averageLatencyMs = n > 0 ? window.totalLatencyMs / n : 0;
  const averageCostUSD = n > 0 ? window.totalCostUSD / n : 0;

  if (errorRate > config.maxErrorRate) {
    blockers.push(
      `error_rate_exceeded: ${(errorRate * 100).toFixed(1)}% > ${(config.maxErrorRate * 100).toFixed(1)}% limit`
    );
  }
  if (abstentionRate > config.maxAbstentionRate) {
    blockers.push(
      `abstention_rate_exceeded: ${(abstentionRate * 100).toFixed(1)}% > ${(config.maxAbstentionRate * 100).toFixed(1)}% limit`
    );
  }
  if (averageLatencyMs > config.maxLatencyMs) {
    blockers.push(
      `avg_latency_exceeded: ${averageLatencyMs.toFixed(0)}ms > ${config.maxLatencyMs}ms limit`
    );
  }
  if (window.maxLatencyMs > config.maxLatencyMs * 2) {
    // Warn (not block) on tail latency spikes
    warnings.push(
      `tail_latency_spike: max ${window.maxLatencyMs}ms is >2× the ${config.maxLatencyMs}ms limit`
    );
  }
  if (averageCostUSD > config.maxCostPerCallUSD) {
    blockers.push(
      `cost_exceeded: $${averageCostUSD.toFixed(4)} > $${config.maxCostPerCallUSD.toFixed(4)} per call`
    );
  }

  const verdict: PackGuardrailVerdict =
    blockers.length > 0 ? "block" : warnings.length > 0 ? "warn" : "pass";

  // Promotion eligibility: no blockers AND enough healthy observations
  const healthySamples = n - window.errorCount - window.abstentionCount;
  const canPromote =
    blockers.length === 0 &&
    healthySamples >= config.canaryMinHealthySamples;

  return {
    packId,
    stage,
    verdict,
    blockers,
    warnings,
    metrics: {
      errorRate,
      abstentionRate,
      averageLatencyMs,
      maxLatencyMs: window.maxLatencyMs,
      averageCostUSD,
      observations: n,
    },
    canPromote,
  };
}

// ---------------------------------------------------------------------------
// Window accumulation helper
// ---------------------------------------------------------------------------

export function accumulateObservation(
  window: PackGuardrailWindow,
  obs: PackObservation
): PackGuardrailWindow {
  return {
    totalObservations: window.totalObservations + 1,
    errorCount: window.errorCount + (obs.errored ? 1 : 0),
    abstentionCount: window.abstentionCount + (obs.abstained ? 1 : 0),
    totalCostUSD: window.totalCostUSD + (obs.costUSD ?? 0),
    totalLatencyMs: window.totalLatencyMs + obs.latencyMs,
    maxLatencyMs: Math.max(window.maxLatencyMs, obs.latencyMs),
  };
}

export function emptyWindow(): PackGuardrailWindow {
  return {
    totalObservations: 0,
    errorCount: 0,
    abstentionCount: 0,
    totalCostUSD: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
  };
}

// ---------------------------------------------------------------------------
// Traffic routing helper
// ---------------------------------------------------------------------------

/**
 * Returns true if a pack call should be used (not just shadow-recorded) for
 * this request, given the pack's current rollout stage.
 *
 * - shadow: always false — compute but do not surface to owner
 * - canary: probabilistic based on canaryTrafficFraction
 * - live:   always true
 *
 * randomSample is injected rather than called internally so callers can
 * control reproducibility in tests.
 */
export function shouldUsePackResult(
  packId: PackId,
  randomSample: number
): boolean {
  const config = getPackConfig(packId);
  switch (config.rolloutStage) {
    case "shadow":
      return false;
    case "canary":
      return randomSample < config.canaryTrafficFraction;
    case "live":
      return true;
  }
}
