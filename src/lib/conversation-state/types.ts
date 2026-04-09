// =============================================================================
// CONVERSATION STATE MACHINE TYPES
// VET-717 establishes the explicit state-machine contract without changing
// runtime behavior. These types define the future state surface that later
// tickets will observe and progressively wire into the route.
// =============================================================================

export const CONVERSATION_STATE_VALUES = [
  "idle",
  "asking",
  "answered_unconfirmed",
  "confirmed",
  "needs_clarification",
  "escalation",
] as const;

export type ConversationState = (typeof CONVERSATION_STATE_VALUES)[number];

export const QUESTION_STATE_VALUES = [
  "pending",
  "asked",
  "answered_this_turn",
  "confirmed",
  "needs_clarification",
  "skipped",
] as const;

export type QuestionState = (typeof QUESTION_STATE_VALUES)[number];

export type ConversationAnswerValue = string | boolean | number;

export interface StateTransition {
  from: QuestionState;
  to: QuestionState;
  reason: string;
  timestamp: number;
  questionId?: string;
}

export interface QuestionStateRecord {
  questionId: string;
  state: QuestionState;
  updatedAt: number;
  lastReason?: string;
}

export interface ConversationControlStateSnapshot {
  answeredQuestionIds: string[];
  extractedAnswers: Record<string, ConversationAnswerValue>;
  unresolvedQuestionIds: string[];
  clarificationReasons: Record<string, string>;
  lastQuestionAsked?: string;
}

export interface ConversationStateMachine {
  currentState: ConversationState;
  questionStates: Record<string, QuestionStateRecord>;
  controlState: ConversationControlStateSnapshot;
  transitionHistory: StateTransition[];
  lastUpdatedAt?: number;
}
