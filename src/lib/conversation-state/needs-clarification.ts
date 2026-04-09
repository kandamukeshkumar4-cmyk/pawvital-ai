import { createSession, type TriageSession } from "@/lib/triage-engine";
import { getStateSnapshot, observeTransition } from "./observer";

export type ClarificationReasonCode = "pending_recovery_failed";

export interface TransitionToNeedsClarificationInput {
  session: TriageSession;
  questionId: string;
  reason: ClarificationReasonCode;
}

export function transitionToNeedsClarification(
  input: TransitionToNeedsClarificationInput
): TriageSession {
  const { session, questionId, reason } = input;
  const beforeState = getStateSnapshot(session);
  const caseMemory = session.case_memory ?? createSession().case_memory!;
  const unresolvedQuestionIds = caseMemory.unresolved_question_ids.includes(questionId)
    ? caseMemory.unresolved_question_ids
    : [...caseMemory.unresolved_question_ids, questionId];
  const updated = observeTransition(
    {
      ...session,
      case_memory: {
        ...caseMemory,
        unresolved_question_ids: unresolvedQuestionIds,
        clarification_reasons: {
          ...(caseMemory.clarification_reasons ?? {}),
          [questionId]: reason,
        },
      },
    },
    {
      before: beforeState,
      after: getStateSnapshot({
        ...session,
        case_memory: {
          ...caseMemory,
          unresolved_question_ids: unresolvedQuestionIds,
          clarification_reasons: {
            ...(caseMemory.clarification_reasons ?? {}),
            [questionId]: reason,
          },
        },
      }),
      questionId,
      reason,
      to: "needs_clarification",
    }
  );

  console.log(
    `[StateMachine] state_transition: needs_clarification | question=${questionId} | reason=${reason}`
  );
  return updated;
}
