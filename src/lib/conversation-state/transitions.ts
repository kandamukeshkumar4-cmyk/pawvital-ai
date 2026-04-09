import type {
  ConversationControlStateSnapshot,
  ConversationState,
  QuestionState,
} from "./types";

export interface TransitionNoteInput {
  before: ConversationControlStateSnapshot;
  after: ConversationControlStateSnapshot;
  from: QuestionState;
  questionId: string;
  reason: string;
  to: QuestionState;
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

export function inferQuestionState(
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

function sameReasonMap(
  left: ConversationControlStateSnapshot["clarificationReasons"],
  right: ConversationControlStateSnapshot["clarificationReasons"]
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

export function hasControlStateChanged(
  before: ConversationControlStateSnapshot,
  after: ConversationControlStateSnapshot
): boolean {
  return !(
    before.lastQuestionAsked === after.lastQuestionAsked &&
    sameStringArray(before.answeredQuestionIds, after.answeredQuestionIds) &&
    sameStringArray(before.unresolvedQuestionIds, after.unresolvedQuestionIds) &&
    sameReasonMap(before.clarificationReasons, after.clarificationReasons) &&
    sameAnswerMap(before.extractedAnswers, after.extractedAnswers)
  );
}

export function buildTransitionNote(input: TransitionNoteInput): string {
  const clarificationReason =
    input.after.clarificationReasons[input.questionId] ??
    input.before.clarificationReasons[input.questionId];
  const parts = [
    `question=${input.questionId}`,
    `question_state=${input.from}->${input.to}`,
    `conversation_state=${inferConversationState(input.before)}->${inferConversationState(input.after)}`,
    `reason=${input.reason}`,
    `answered=${input.after.answeredQuestionIds.length}`,
    `unresolved=${input.after.unresolvedQuestionIds.length}`,
  ];

  if (clarificationReason) {
    parts.push(`clarification_reason=${clarificationReason}`);
  }

  return parts.join(" | ");
}
