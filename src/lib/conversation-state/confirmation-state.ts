import type { TriageSession } from "@/lib/triage-engine";
import { getStateSnapshot, observeTransition } from "./observer";

export interface TransitionToConfirmedInput {
  session: TriageSession;
  questionId: string;
  reason: "answer_acknowledged";
}

export function transitionToConfirmed(
  input: TransitionToConfirmedInput
): TriageSession {
  const { session, questionId, reason } = input;
  const beforeState = getStateSnapshot(session);
  // Intentional: `after` mirrors `before` because this is a read-observe-only step.
  // `transitionToConfirmed` does not mutate control state — `answered_questions`,
  // `extracted_answers`, and `last_question_asked` are already written by
  // `transitionToAnswered`. The observer receives identical snapshots so
  // `hasControlStateChanged` returns false and no sidecar entry is appended.
  // The console log below is the sole observable artifact of this transition.
  const updated = observeTransition(session, {
    before: beforeState,
    after: getStateSnapshot(session),
    questionId,
    reason,
    to: "confirmed",
  });
  console.log(
    `[StateMachine] state_transition: confirmed | question=${questionId} | reason=${reason}`
  );
  return updated;
}
