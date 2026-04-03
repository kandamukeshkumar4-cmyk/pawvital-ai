import { appendSidecarObservation } from "../sidecar-observability";
import type { TriageSession } from "../triage-engine";
import type {
  ConversationControlStateSnapshot,
  ConversationState,
  QuestionState,
} from "./types";

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
    lastQuestionAsked: session.last_question_asked,
  };
}

export function inferConversationState(
  snapshot: ConversationControlStateSnapshot
): ConversationState {
  if (
    snapshot.lastQuestionAsked &&
    !snapshot.answeredQuestionIds.includes(snapshot.lastQuestionAsked)
  ) {
    return "asking";
  }

  if (
    snapshot.lastQuestionAsked &&
    snapshot.answeredQuestionIds.includes(snapshot.lastQuestionAsked)
  ) {
    return "answered_unconfirmed";
  }

  if (snapshot.unresolvedQuestionIds.length > 0) {
    return "needs_clarification";
  }

  if (snapshot.answeredQuestionIds.length > 0) {
    return "confirmed";
  }

  return "idle";
}

function inferQuestionState(
  snapshot: ConversationControlStateSnapshot,
  questionId: string
): QuestionState {
  if (snapshot.answeredQuestionIds.includes(questionId)) {
    return "confirmed";
  }

  if (snapshot.lastQuestionAsked === questionId) {
    return "asked";
  }

  if (snapshot.unresolvedQuestionIds.includes(questionId)) {
    return "needs_clarification";
  }

  return "pending";
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sameAnswerMap(
  left: ConversationControlStateSnapshot["extractedAnswers"],
  right: ConversationControlStateSnapshot["extractedAnswers"]
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function snapshotsEqual(
  before: ConversationControlStateSnapshot,
  after: ConversationControlStateSnapshot
): boolean {
  return (
    before.lastQuestionAsked === after.lastQuestionAsked &&
    sameStringArray(before.answeredQuestionIds, after.answeredQuestionIds) &&
    sameStringArray(before.unresolvedQuestionIds, after.unresolvedQuestionIds) &&
    sameAnswerMap(before.extractedAnswers, after.extractedAnswers)
  );
}

function buildTransitionNote(
  input: ObserveTransitionInput,
  from: QuestionState,
  beforeConversation: ConversationState,
  afterConversation: ConversationState
): string {
  return [
    `question=${input.questionId}`,
    `question_state=${from}->${input.to}`,
    `conversation_state=${beforeConversation}->${afterConversation}`,
    `reason=${input.reason}`,
    `answered=${input.after.answeredQuestionIds.length}`,
    `unresolved=${input.after.unresolvedQuestionIds.length}`,
  ].join(" | ");
}

export function observeTransition(
  session: TriageSession,
  input: ObserveTransitionInput
): TriageSession {
  if (!input.questionId || snapshotsEqual(input.before, input.after)) {
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
    note: buildTransitionNote(
      input,
      from,
      beforeConversation,
      afterConversation
    ),
  });
}
