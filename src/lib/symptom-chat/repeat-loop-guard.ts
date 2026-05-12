import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical-matrix";
import { buildCannotAssessOutcome } from "@/lib/clinical/uncertainty-routing";
import type { UncertaintyTerminalOutcome } from "@/lib/clinical/uncertainty-routing";
import type { TriageSession } from "@/lib/triage-engine";
import {
  getClarificationAttemptCount,
  getQuestionAskedCount,
} from "@/lib/symptom-chat/pending-question-state";

export const MAX_PENDING_QUESTION_ASKS = 2;
export const NON_CRITICAL_UNKNOWN_VALUE = "unknown";

type RepeatLoopGuardDecision =
  | {
      kind: "allow_reask";
      askedCount: number;
      clarificationAttemptCount: number;
      reason: "needs_clarification_re_ask";
    }
  | {
      kind: "record_unknown";
      askedCount: number;
      clarificationAttemptCount: number;
      value: typeof NON_CRITICAL_UNKNOWN_VALUE;
      reason: "max_pending_ask_count_reached_noncritical_unknown";
    }
  | {
      kind: "cannot_assess";
      askedCount: number;
      clarificationAttemptCount: number;
      outcome: UncertaintyTerminalOutcome;
      redFlag: string;
      reason: "max_pending_ask_count_reached_critical_cannot_assess";
    };

export function decideRepeatLoopGuard(
  session: TriageSession,
  questionId: string,
  petName: string,
  questionText?: string | null
): RepeatLoopGuardDecision {
  const askedCount = getQuestionAskedCount(session, questionId);
  const clarificationAttemptCount =
    getClarificationAttemptCount(session, questionId) + 1;

  if (askedCount < MAX_PENDING_QUESTION_ASKS) {
    return {
      kind: "allow_reask",
      askedCount,
      clarificationAttemptCount,
      reason: "needs_clarification_re_ask",
    };
  }

  if (!FOLLOW_UP_QUESTIONS[questionId]?.critical) {
    return {
      kind: "record_unknown",
      askedCount,
      clarificationAttemptCount,
      value: NON_CRITICAL_UNKNOWN_VALUE,
      reason: "max_pending_ask_count_reached_noncritical_unknown",
    };
  }

  return {
    kind: "cannot_assess",
    askedCount,
    clarificationAttemptCount,
    outcome: buildCannotAssessOutcome({
      petName,
      questionId,
      questionText,
    }),
    redFlag: `cannot_assess_${questionId}`,
    reason: "max_pending_ask_count_reached_critical_cannot_assess",
  };
}
