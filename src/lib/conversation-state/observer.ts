import { appendSidecarObservation } from "../sidecar-observability";
import type { TriageSession } from "../triage-engine";
import type {
  ConversationControlStateSnapshot,
  QuestionState,
} from "./types";
import {
  buildTransitionNote,
  hasControlStateChanged,
  inferConversationState,
  inferQuestionState,
} from "./transitions";

export const STATE_TRANSITION_STAGE = "state_transition";

export interface ObserveTransitionInput {
  before: ConversationControlStateSnapshot;
  after: ConversationControlStateSnapshot;
  questionId: string;
  reason: string;
  to: QuestionState;
}

export function getStateSnapshot(
  session: TriageSession
): ConversationControlStateSnapshot {
  return {
    answeredQuestionIds: [...(session.answered_questions ?? [])],
    extractedAnswers: { ...(session.extracted_answers ?? {}) },
    unresolvedQuestionIds: [
      ...(session.case_memory?.unresolved_question_ids ?? []),
    ],
    clarificationReasons: {
      ...(session.case_memory?.clarification_reasons ?? {}),
    },
    lastQuestionAsked: session.last_question_asked,
  };
}

export function observeTransition(
  session: TriageSession,
  input: ObserveTransitionInput
): TriageSession {
  if (!input.questionId || !hasControlStateChanged(input.before, input.after)) {
    return session;
  }

  const from = inferQuestionState(input.before, input.questionId);
  const beforeConversation = inferConversationState(input.before);
  const afterConversation = inferConversationState(input.after);

  if (from === input.to && beforeConversation === afterConversation) {
    return session;
  }

  return appendSidecarObservation(session, {
    service: "async-review-service",
    stage: STATE_TRANSITION_STAGE,
    latencyMs: 0,
    outcome: "success",
    shadowMode: false,
    fallbackUsed: false,
    note: buildTransitionNote({
      before: input.before,
      after: input.after,
      from,
      questionId: input.questionId,
      reason: input.reason,
      to: input.to,
    }),
  });
}
