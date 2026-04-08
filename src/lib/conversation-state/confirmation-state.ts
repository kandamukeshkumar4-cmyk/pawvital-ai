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
