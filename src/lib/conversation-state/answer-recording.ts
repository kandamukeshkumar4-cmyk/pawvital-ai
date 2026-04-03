import { recordAnswer } from "@/lib/triage-engine";
import type { TriageSession } from "@/lib/triage-engine";
import { getStateSnapshot, observeTransition } from "./observer";

export interface TransitionToAnsweredInput {
  session: TriageSession;
  questionId: string;
  value: string | boolean | number;
  reason:
    | "turn_answer_recorded"
    | "pending_question_recovered"
    | "location_answer_propagated";
}

/**
 * Runtime composition layer: records an answer then observes the transition.
 * Keeps pure `transitions.ts` free of triage-engine / observer wiring (VET-720).
 */
export function transitionToAnswered(
  input: TransitionToAnsweredInput
): TriageSession {
  const { session, questionId, value, reason } = input;
  const beforeState = getStateSnapshot(session);
  let updated = recordAnswer(session, questionId, value);
  updated = observeTransition(updated, {
    before: beforeState,
    after: getStateSnapshot(updated),
    questionId,
    reason,
    to: "answered_this_turn",
  });
  console.log(
    `[StateMachine] state_transition: answered | question=${questionId} | reason=${reason}`
  );
  return updated;
}
