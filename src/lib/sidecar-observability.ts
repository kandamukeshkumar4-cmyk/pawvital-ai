import type {
  ShadowComparisonRecord,
  SidecarObservation,
  SidecarServiceName,
} from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";
import { ensureStructuredCaseMemory } from "./symptom-memory";

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

const GLOBAL_SHADOW_MODE = parseBooleanEnv(process.env.HF_SIDECAR_SHADOW_MODE);

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

export const INTERNAL_TELEMETRY_STAGES = new Set([
  "compression",
  "extraction",
  "pending_recovery",
  "repeat_suppression",
  "state_transition",
]);

export const INTERNAL_TELEMETRY_NOTE_MARKERS = [
  "question_state=",
  "conversation_state=",
  "clarification_reason=",
];

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

export function buildObservabilitySnapshot(session: TriageSession) {
  const memory = ensureStructuredCaseMemory(session);
  const observations = (memory.service_observations || []).filter(
    (item) => item.service !== "async-review-service"
  );
  const timeouts: unknown[] = [];
  const shadowComparisons: unknown[] = [];

  const byService = observations.reduce<Record<string, number>>((acc, item) => {
    acc[item.service] = (acc[item.service] || 0) + 1;
    return acc;
  }, {});

  return {
    shadowModeActive: GLOBAL_SHADOW_MODE,
    recentServiceCalls: observations.slice(-8),
    recentShadowComparisons: shadowComparisons.slice(-4),
    timeoutCount: timeouts.length,
    serviceCallCounts: byService,
    fallbackCount: observations.filter((item) => item.fallbackUsed).length,
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
