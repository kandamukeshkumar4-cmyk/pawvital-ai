import { appendSidecarObservation } from "../sidecar-observability";
import type { TriageSession } from "../triage-engine";
import { getStateSnapshot, STATE_TRANSITION_STAGE } from "./observer";
import { inferConversationState } from "./transitions";

export interface TransitionToEscalationInput {
  session: TriageSession;
  redFlags: string[];
  reason:
    | "red_flags_detected"
    | "vision_red_flags_detected"
    | "clinical_escalation"
    | "owner_cannot_assess_critical_indicator"
    | "deterministic_emergency_first_turn";
}

/**
 * VET-900: Runtime composition layer for the escalation transition.
 *
 * Called when the route detects red flags in the triage session.
 * Escalation is an override state — it supersedes whatever conversation
 * state the snapshot would otherwise infer. This module records the
 * transition via sidecar telemetry without mutating answered_questions
 * or extracted_answers (same immutable pattern as sibling modules).
 *
 * Unlike `observeTransition()` which requires a control-state diff,
 * escalation fires unconditionally when red flags are present, so we
 * emit the observation directly via `appendSidecarObservation`.
 */
export function transitionToEscalation(
  input: TransitionToEscalationInput
): TriageSession {
  const { session, redFlags, reason } = input;
  const snapshot = getStateSnapshot(session);
  const priorState = inferConversationState(snapshot);

  const updated = appendSidecarObservation(session, {
    service: "async-review-service",
    stage: STATE_TRANSITION_STAGE,
    latencyMs: 0,
    outcome: "success",
    shadowMode: false,
    fallbackUsed: false,
    note: [
      `question=${session.last_question_asked ?? "session"}`,
      `conversation_state=${priorState}->escalation`,
      `reason=${reason}`,
      `red_flags=${redFlags.join(",")}`,
      `answered=${snapshot.answeredQuestionIds.length}`,
      `unresolved=${snapshot.unresolvedQuestionIds.length}`,
    ].join(" | "),
  });

  console.log(
    `[StateMachine] state_transition: escalation | reason=${reason} | flags=${redFlags.join(",")}`
  );

  return updated;
}
