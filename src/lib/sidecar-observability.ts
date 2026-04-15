import type {
  ShadowComparisonRecord,
  SidecarObservation,
  SidecarServiceName,
} from "./clinical-evidence";
import type { NormalizedContradictionRecord } from "./clinical/contradiction-detector";
import {
  buildDiagnosisContext,
  type PetProfile,
  type TriageSession,
} from "./triage-engine";
import {
  ensureStructuredCaseMemory,
  type NormalizedTerminalOutcomeMetric,
} from "./symptom-memory";

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

const GLOBAL_SHADOW_MODE = parseBooleanEnv(process.env.HF_SIDECAR_SHADOW_MODE);
const ROUTINE_SHADOW_SAMPLE_RATE = clampRate(
  parseNumberEnv(
    process.env.HF_SHADOW_ROUTINE_SAMPLE_RATE ||
      process.env.HF_SHADOW_SAMPLE_RATE ||
      process.env.SHADOW_SAMPLE_RATE,
    0.05
  )
);
const SHADOW_EMERGENCY_ONLY = parseBooleanEnv(
  process.env.HF_SHADOW_EMERGENCY_ONLY
);
const ROUTINE_SHADOW_MAX_P95_OVERHEAD_MS = Math.max(
  0,
  parseNumberEnv(process.env.HF_SHADOW_MAX_P95_OVERHEAD_MS, 50)
);
const ROUTINE_SHADOW_MAX_ERROR_RATE = clampRate(
  parseNumberEnv(process.env.HF_SHADOW_MAX_ERROR_RATE, 0.2)
);
const SHADOW_GUARDRAIL_WINDOW_MS = 15 * 60 * 1000;

const SERVICE_SHADOW_MODE_FLAGS: Record<SidecarServiceName, boolean> = {
  "vision-preprocess-service": parseBooleanEnv(
    process.env.HF_SHADOW_VISION_PREPROCESS
  ),
  "text-retrieval-service": parseBooleanEnv(
    process.env.HF_SHADOW_TEXT_RETRIEVAL
  ),
  "image-retrieval-service": parseBooleanEnv(
    process.env.HF_SHADOW_IMAGE_RETRIEVAL
  ),
  "multimodal-consult-service": parseBooleanEnv(
    process.env.HF_SHADOW_MULTIMODAL_CONSULT
  ),
  "async-review-service": parseBooleanEnv(process.env.HF_SHADOW_ASYNC_REVIEW),
};

export type ShadowUrgencyBucket = "emergency" | "high" | "routine";

export interface ShadowModeDecision {
  service: SidecarServiceName;
  enabled: boolean;
  urgency: ShadowUrgencyBucket;
  mode:
    | "disabled"
    | "urgent_all"
    | "routine_sampled"
    | "routine_skipped"
    | "emergency_only"
    | "routine_auto_disabled";
  routineSampleRate: number;
  caseSample: number;
  autoDisabled: boolean;
  autoDisableReason: string | null;
}

interface ObservabilitySnapshotOptions {
  includeInternalTelemetry?: boolean;
}

interface ShadowGuardrailMetrics {
  shadowObservationCount: number;
  shadowErrorRate: number;
  liveP95LatencyMs: number | null;
  shadowP95LatencyMs: number | null;
  p95OverheadMs: number | null;
}

interface InferShadowUrgencyInput {
  session: TriageSession;
  pet?: PetProfile | null;
  fallbackUrgency?: string | null;
}

export const INTERNAL_TELEMETRY_STAGES = new Set([
  "compression",
  "contradiction_detection",
  "extraction",
  "pending_recovery",
  "repeat_suppression",
  "state_transition",
  "terminal_outcome",
]);

export const INTERNAL_TELEMETRY_NOTE_MARKERS = [
  "question_state=",
  "conversation_state=",
  "clarification_reason=",
  "contradiction_records=",
  "terminal_outcome_metric=",
];

function parseContradictionRecordsFromNote(
  note: string | undefined
): NormalizedContradictionRecord[] {
  const noteText = typeof note === "string" ? note : "";
  const contradictionPart = noteText
    .split(" | ")
    .find((part) => part.startsWith("contradiction_records="));

  if (!contradictionPart) {
    return [];
  }

  const encoded = contradictionPart.slice("contradiction_records=".length);
  if (!encoded) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return Array.isArray(parsed)
      ? (parsed as NormalizedContradictionRecord[])
      : [];
  } catch {
    return [];
  }
}

export function extractContradictionRecordsFromObservations(
  observations: SidecarObservation[]
): NormalizedContradictionRecord[] {
  return observations.flatMap((observation) =>
    parseContradictionRecordsFromNote(observation.note)
  );
}

function parseTerminalOutcomeMetricFromNote(
  note: string | undefined
): NormalizedTerminalOutcomeMetric[] {
  const noteText = typeof note === "string" ? note : "";
  const terminalMetricPart = noteText
    .split(" | ")
    .find((part) => part.startsWith("terminal_outcome_metric="));

  if (!terminalMetricPart) {
    return [];
  }

  const encoded = terminalMetricPart.slice("terminal_outcome_metric=".length);
  if (!encoded) {
    return [];
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded));
    return parsed &&
      typeof parsed === "object" &&
      typeof parsed.terminal_state === "string" &&
      typeof parsed.reason_code === "string"
      ? [parsed as NormalizedTerminalOutcomeMetric]
      : [];
  } catch {
    return [];
  }
}

export function extractTerminalOutcomeMetricsFromObservations(
  observations: SidecarObservation[]
): NormalizedTerminalOutcomeMetric[] {
  return observations.flatMap((observation) =>
    parseTerminalOutcomeMetricFromNote(observation.note)
  );
}

/**
 * VET-900: Centralized check for internal-only telemetry observations.
 * Returns true if the observation should NEVER appear in client-facing payloads.
 */
export function isInternalTelemetry(obs: SidecarObservation): boolean {
  if (obs.service === "async-review-service") return true;
  if (INTERNAL_TELEMETRY_STAGES.has(obs.stage)) return true;
  const note = typeof obs.note === "string" ? obs.note : "";
  return INTERNAL_TELEMETRY_NOTE_MARKERS.some((m) => note.includes(m));
}

export function isShadowModeEnabledForService(
  service: SidecarServiceName
): boolean {
  return GLOBAL_SHADOW_MODE || SERVICE_SHADOW_MODE_FLAGS[service];
}

function normalizeUrgencyBucket(
  value: string | null | undefined
): ShadowUrgencyBucket {
  if (value === "emergency") return "emergency";
  if (value === "high") return "high";
  return "routine";
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

function isWithinGuardrailWindow(recordedAt: string, now: number): boolean {
  const timestamp = Date.parse(recordedAt);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return now - timestamp <= SHADOW_GUARDRAIL_WINDOW_MS;
}

function buildShadowCaseSignature(
  session: TriageSession,
  service: SidecarServiceName,
  additionalKey?: string
): string {
  const memory = ensureStructuredCaseMemory(session);
  const answerSignature = Object.entries(session.extracted_answers || {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join("|")
    .slice(0, 400);

  return [
    service,
    session.last_uploaded_image_hash || "",
    session.latest_image_domain || "",
    memory.chief_complaints.join(","),
    session.known_symptoms.join(","),
    answerSignature,
    memory.latest_owner_turn || "",
    additionalKey || "",
  ].join("|");
}

function deterministicSample(signature: string): number {
  let hash = 2166136261;
  for (const char of signature) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function buildShadowGuardrailMetrics(
  session: TriageSession,
  service: SidecarServiceName
): ShadowGuardrailMetrics {
  const now = Date.now();
  const observations = ensureStructuredCaseMemory(session).service_observations.filter(
    (entry) =>
      entry.service === service && isWithinGuardrailWindow(entry.recordedAt, now)
  );

  const shadowObservations = observations.filter((entry) => entry.shadowMode);
  const liveObservations = observations.filter((entry) => !entry.shadowMode);
  const shadowErrorRate =
    shadowObservations.length > 0
      ? shadowObservations.filter(
          (entry) => entry.outcome === "timeout" || entry.outcome === "error"
        ).length / shadowObservations.length
      : 0;

  const liveP95LatencyMs = percentile(
    liveObservations
      .map((entry) => entry.latencyMs)
      .filter((value) => Number.isFinite(value) && value >= 0),
    0.95
  );
  const shadowP95LatencyMs = percentile(
    shadowObservations
      .map((entry) => entry.latencyMs)
      .filter((value) => Number.isFinite(value) && value >= 0),
    0.95
  );

  return {
    shadowObservationCount: shadowObservations.length,
    shadowErrorRate,
    liveP95LatencyMs,
    shadowP95LatencyMs,
    p95OverheadMs:
      liveP95LatencyMs !== null && shadowP95LatencyMs !== null
        ? Math.round(shadowP95LatencyMs - liveP95LatencyMs)
        : null,
  };
}

export function inferShadowUrgencyBucket(
  input: InferShadowUrgencyInput
): ShadowUrgencyBucket {
  const fallbackUrgency = normalizeUrgencyBucket(input.fallbackUrgency);
  if (fallbackUrgency !== "routine") {
    return fallbackUrgency;
  }

  if (input.session.red_flags_triggered.length > 0) {
    return "emergency";
  }

  if (
    input.session.vision_severity === "urgent" ||
    input.session.latest_visual_evidence?.severity === "urgent"
  ) {
    return "high";
  }

  if (input.pet && input.session.known_symptoms.length > 0) {
    return normalizeUrgencyBucket(
      buildDiagnosisContext(input.session, input.pet).highest_urgency
    );
  }

  return "routine";
}

export function getShadowModeDecision(input: {
  service: SidecarServiceName;
  session: TriageSession;
  pet?: PetProfile | null;
  urgencyHint?: string | null;
  additionalKey?: string;
}): ShadowModeDecision {
  const urgency = inferShadowUrgencyBucket({
    session: input.session,
    pet: input.pet,
    fallbackUrgency: input.urgencyHint,
  });
  const caseSample = deterministicSample(
    buildShadowCaseSignature(input.session, input.service, input.additionalKey)
  );
  const guardrails = buildShadowGuardrailMetrics(input.session, input.service);

  if (!isShadowModeEnabledForService(input.service)) {
    return {
      service: input.service,
      enabled: false,
      urgency,
      mode: "disabled",
      routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
      caseSample,
      autoDisabled: false,
      autoDisableReason: null,
    };
  }

  if (urgency === "emergency" || urgency === "high") {
    return {
      service: input.service,
      enabled: true,
      urgency,
      mode: "urgent_all",
      routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
      caseSample,
      autoDisabled: false,
      autoDisableReason: null,
    };
  }

  if (SHADOW_EMERGENCY_ONLY) {
    return {
      service: input.service,
      enabled: false,
      urgency,
      mode: "emergency_only",
      routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
      caseSample,
      autoDisabled: false,
      autoDisableReason: "routine shadow sampling disabled by HF_SHADOW_EMERGENCY_ONLY",
    };
  }

  const overheadExceeded =
    guardrails.p95OverheadMs !== null &&
    guardrails.p95OverheadMs > ROUTINE_SHADOW_MAX_P95_OVERHEAD_MS;
  const errorRateExceeded =
    guardrails.shadowErrorRate > ROUTINE_SHADOW_MAX_ERROR_RATE;
  const autoDisableReason = overheadExceeded
    ? `shadow p95 overhead ${guardrails.p95OverheadMs}ms exceeds ${ROUTINE_SHADOW_MAX_P95_OVERHEAD_MS}ms`
    : errorRateExceeded
      ? `shadow error rate ${Math.round(guardrails.shadowErrorRate * 100)}% exceeds ${Math.round(ROUTINE_SHADOW_MAX_ERROR_RATE * 100)}%`
      : null;

  if (autoDisableReason) {
    return {
      service: input.service,
      enabled: false,
      urgency,
      mode: "routine_auto_disabled",
      routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
      caseSample,
      autoDisabled: true,
      autoDisableReason,
    };
  }

  return {
    service: input.service,
    enabled: caseSample < ROUTINE_SHADOW_SAMPLE_RATE,
    urgency,
    mode:
      caseSample < ROUTINE_SHADOW_SAMPLE_RATE
        ? "routine_sampled"
        : "routine_skipped",
    routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
    caseSample,
    autoDisabled: false,
    autoDisableReason: null,
  };
}

export function describeShadowModeDecision(
  decision: ShadowModeDecision
): string {
  const parts = [
    `shadowMode=${decision.enabled}`,
    `shadowPolicy=${decision.mode}`,
    `shadowUrgency=${decision.urgency}`,
    `shadowSampleRate=${decision.routineSampleRate.toFixed(2)}`,
    `shadowCaseSample=${decision.caseSample.toFixed(4)}`,
  ];

  if (decision.autoDisableReason) {
    parts.push(`shadowGuardrail=${decision.autoDisableReason}`);
  }

  return parts.join("; ");
}

export function appendSidecarObservation(
  session: TriageSession,
  observation: Omit<SidecarObservation, "recordedAt">
): TriageSession {
  const memory = ensureStructuredCaseMemory(session);
  const nextObservation: SidecarObservation = {
    ...observation,
    recordedAt: new Date().toISOString(),
  };

  return {
    ...session,
    case_memory: {
      ...memory,
      service_observations: [
        ...(memory.service_observations || []),
        nextObservation,
      ].slice(-30),
    },
  };
}

export function appendShadowComparison(
  session: TriageSession,
  comparison: Omit<ShadowComparisonRecord, "recordedAt">
): TriageSession {
  const memory = ensureStructuredCaseMemory(session);
  const nextComparison: ShadowComparisonRecord = {
    ...comparison,
    recordedAt: new Date().toISOString(),
  };

  return {
    ...session,
    case_memory: {
      ...memory,
      shadow_comparisons: [
        ...(memory.shadow_comparisons || []),
        nextComparison,
      ].slice(-20),
    },
  };
}

export function buildObservabilitySnapshot(
  session: TriageSession,
  options: ObservabilitySnapshotOptions = {}
) {
  const memory = ensureStructuredCaseMemory(session);
  const contradictionRecords = extractContradictionRecordsFromObservations(
    memory.service_observations || []
  );
  const includeInternalTelemetry = options.includeInternalTelemetry === true;
  const observations = (memory.service_observations || []).filter((item) =>
    includeInternalTelemetry ? true : !isInternalTelemetry(item)
  );
  const timeouts = memory.service_timeouts || [];
  const shadowComparisons = memory.shadow_comparisons || [];
  const recentGuardrails = Object.keys(SERVICE_SHADOW_MODE_FLAGS).map((service) => ({
    service,
    ...buildShadowGuardrailMetrics(session, service as SidecarServiceName),
  }));

  const byService = observations.reduce<Record<string, number>>((acc, item) => {
    acc[item.service] = (acc[item.service] || 0) + 1;
    return acc;
  }, {});

  return {
    shadowModeActive:
      GLOBAL_SHADOW_MODE ||
      Object.values(SERVICE_SHADOW_MODE_FLAGS).some(Boolean) ||
      observations.some((item) => item.shadowMode) ||
      shadowComparisons.length > 0,
    recentServiceCalls: observations.slice(-8),
    contradictionRecords: contradictionRecords.slice(-8),
    recentShadowComparisons: shadowComparisons.slice(-4),
    timeoutCount: timeouts.length,
    serviceCallCounts: byService,
    fallbackCount: observations.filter(
      (item) => item.fallbackUsed && !item.shadowMode
    ).length,
    shadowConfig: {
      globalMode: GLOBAL_SHADOW_MODE,
      routineSampleRate: ROUTINE_SHADOW_SAMPLE_RATE,
      emergencyOnly: SHADOW_EMERGENCY_ONLY,
      maxRoutineOverheadP95Ms: ROUTINE_SHADOW_MAX_P95_OVERHEAD_MS,
      maxShadowErrorRate: ROUTINE_SHADOW_MAX_ERROR_RATE,
      guardrailWindowMinutes: SHADOW_GUARDRAIL_WINDOW_MS / 60000,
    },
    recentShadowGuardrails: recentGuardrails,
  };
}

export function describeShadowComparison(
  service: SidecarServiceName,
  usedStrategy: string,
  shadowStrategy: string,
  summary: string,
  disagreementCount = 0
): Omit<ShadowComparisonRecord, "recordedAt"> {
  return {
    service,
    usedStrategy,
    shadowStrategy,
    summary,
    disagreementCount,
  };
}
