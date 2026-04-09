import type { SidecarObservation } from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";

const INTERNAL_TELEMETRY_STAGES = new Set([
  "compression",
  "extraction",
  "pending_recovery",
  "repeat_suppression",
  "state_transition",
]);

const INTERNAL_TELEMETRY_NOTE_MARKERS = [
  "question_state=",
  "conversation_state=",
];

export function isInternalTelemetryObservationForClient(
  observation: SidecarObservation
): boolean {
  if (observation.service === "async-review-service") {
    return true;
  }

  if (INTERNAL_TELEMETRY_STAGES.has(observation.stage)) {
    return true;
  }

  const note = typeof observation.note === "string" ? observation.note : "";
  return INTERNAL_TELEMETRY_NOTE_MARKERS.some((marker) =>
    note.includes(marker)
  );
}

export function sanitizeServiceObservationsForClient(
  observations: SidecarObservation[] | undefined
): SidecarObservation[] {
  return (observations ?? []).filter(
    (observation) => !isInternalTelemetryObservationForClient(observation)
  );
}

export function sanitizeSessionForClient(session: TriageSession): TriageSession {
  if (!session || !session.case_memory) return session;

  const sanitizedMemory = {
    ...session.case_memory,
    service_observations: sanitizeServiceObservationsForClient(
      session.case_memory.service_observations
    ),
    shadow_comparisons: [],
    service_timeouts: [],
  };

  return {
    ...session,
    case_memory: sanitizedMemory,
  };
}