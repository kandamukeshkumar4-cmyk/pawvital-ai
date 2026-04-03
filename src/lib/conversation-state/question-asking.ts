import { getStateSnapshot, observeTransition } from "./observer";
import type { TriageSession } from "@/lib/triage-engine";

export interface TransitionToAskedInput {
  session: TriageSession;
  questionId: string;
  reason: "next_question_selected";
}

/**
 * Runtime composition layer: marks a question as asked and observes the transition.
 * Keeps pure `transitions.ts` free of triage-engine / observer wiring (VET-723).
 */
export function transitionToAsked(
  input: TransitionToAskedInput
): TriageSession {
  const { session, questionId, reason } = input;
  const beforeState = getStateSnapshot(session);

  // Create updated session with the new last_question_asked
  // Use type assertion to satisfy strict typing (last_question_asked is optional in TriageSession)
  let updated: TriageSession = {
    ...session,
    last_question_asked: questionId,
  } as TriageSession;

  updated = observeTransition(updated, {
    before: beforeState,
    after: getStateSnapshot(updated),
    questionId,
    reason,
    to: "asked",
  });

  console.log(
    `[StateMachine] state_transition: asked | question=${questionId} | reason=${reason}`
  );

  return updated;
}
