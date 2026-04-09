import { getStateSnapshot, observeTransition } from "./observer";
import type { ConversationControlStateSnapshot } from "./types";
import type { TriageSession } from "@/lib/triage-engine";

export interface TransitionToConfirmedInput {
  session: TriageSession;
  reason:
    | "all_questions_answered"
    | "report_ready"
    | "sufficient_data_reached";
}

/**
 * VET-736: Runtime composition layer for the confirmed transition.
 *
 * Called when the route determines it has enough clinical data to
 * generate a report (or, between questions, that the last answer is
 * acknowledged before asking the next). Observes the transition toward
 * conversation-level confirmed without mutating answered_questions or
 * extracted_answers.
 *
 * `observeTransition` requires before/after snapshots to differ; the session
 * is not mutated, but the synthetic `after` snapshot clears `lastQuestionAsked`
 * so inferConversationState moves to "confirmed" while clinical answer data
 * stays identical (matches observer contract; same pattern as sibling modules).
 */
export function transitionToConfirmed(
  input: TransitionToConfirmedInput
): TriageSession {
  const { session, reason } = input;
  const beforeState = getStateSnapshot(session);

  const afterState: ConversationControlStateSnapshot = {
    ...beforeState,
    lastQuestionAsked: undefined,
  };

  const updated = observeTransition(session, {
    before: beforeState,
    after: afterState,
    questionId: session.last_question_asked ?? "session",
    reason,
    to: "confirmed",
  });

  console.log(
    `[StateMachine] state_transition: confirmed | reason=${reason} | answered=${beforeState.answeredQuestionIds.length}`
  );

  return updated;
}
