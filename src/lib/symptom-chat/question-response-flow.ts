import { NextResponse } from "next/server";
import type { ServiceTimeoutRecord } from "@/lib/clinical-evidence";
import {
  getQuestionText,
  isReadyForDiagnosis,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import {
  getStateSnapshot,
  inferConversationState,
  transitionToAsked,
  transitionToConfirmed,
} from "@/lib/conversation-state";
import { markPendingQuestionAsked } from "@/lib/symptom-chat/pending-question-state";
import { sanitizeSessionForClient } from "@/lib/symptom-chat/context-helpers";
import {
  buildQuestionPhrasingContext,
  shouldIncludeImageContextInQuestion,
} from "@/lib/symptom-chat/context-helpers";
import {
  TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS,
  gateQuestionBeforePhrasing,
  phraseQuestion,
  type SymptomChatTurnMessage,
} from "@/lib/symptom-chat/question-phrasing";
import {
  buildOptionalModelTimeoutRecord,
  getTurnBudgetDeadlineMs,
  shouldSkipOptionalModelStage,
  type TurnBudget,
} from "@/lib/symptom-chat/turn-budget";

interface BuildQuestionResponseFlowInput {
  session: TriageSession;
  nextQuestionId: string | null;
  needsClarificationQuestionId: string | null;
  pet: PetProfile;
  effectivePet: PetProfile;
  messages: SymptomChatTurnMessage[];
  lastUserMessage: string;
  turnFocusSymptoms: string[];
  visionAnalysis: string | null;
  visionSeverity?: "normal" | "needs_review" | "urgent";
  image?: string;
  forceDeterministicQuestionFallback?: boolean;
  turnBudget?: TurnBudget;
  serviceTimeouts?: ServiceTimeoutRecord[];
}

export type SymptomChatTurnDepth = "lean" | "standard" | "deep";
export const DEFAULT_SYMPTOM_CHAT_TURN_DEPTH: SymptomChatTurnDepth = "standard";

export function getSymptomChatTurnDepth(
  rawValue = process.env.SYMPTOM_CHAT_TURN_DEPTH
): SymptomChatTurnDepth {
  const normalized = rawValue?.trim().toLowerCase();
  if (
    normalized === "lean" ||
    normalized === "standard" ||
    normalized === "deep"
  ) {
    return normalized;
  }

  return DEFAULT_SYMPTOM_CHAT_TURN_DEPTH;
}

export async function buildQuestionResponseFlow(
  input: BuildQuestionResponseFlowInput
): Promise<NextResponse> {
  if (!input.nextQuestionId) {
    return NextResponse.json(buildNoQuestionPayload(input.session, input.pet, Boolean(input.image)));
  }

  const session = prepareSessionForQuestionResponse(
    input.session,
    input.nextQuestionId,
    input.needsClarificationQuestionId
  );
  const phrasedQuestion = await phraseNextQuestion({
    ...input,
    session,
    nextQuestionId: input.nextQuestionId,
  });

  return NextResponse.json({
    type: "question",
    message: phrasedQuestion,
    session: sanitizeSessionForClient(session),
    ready_for_report: isReadyForDiagnosis(session),
    conversationState: input.needsClarificationQuestionId
      ? "needs_clarification"
      : inferConversationState(getStateSnapshot(session)),
  });
}

function buildNoQuestionPayload(
  session: TriageSession,
  pet: PetProfile,
  hasImage: boolean
) {
  if (session.known_symptoms.length === 0) {
    return {
      type: "question",
      message: hasImage
        ? `I can see the photo, but I still need a little more context to triage ${pet.name} safely. What worries you most about this area, and when did you first notice it?`
        : `I need a little more detail before I can triage ${pet.name} safely. What symptom or change worries you most right now, and when did it start?`,
      session: sanitizeSessionForClient(session),
      ready_for_report: false,
    };
  }

  return {
    type: "ready",
    message: "I have enough information. Let me generate your full veterinary report.",
    session: sanitizeSessionForClient(session),
    ready_for_report: true,
  };
}

function prepareSessionForQuestionResponse(
  session: TriageSession,
  nextQuestionId: string,
  needsClarificationQuestionId: string | null
): TriageSession {
  if (needsClarificationQuestionId) {
    return markPendingQuestionAsked(session, nextQuestionId);
  }

  const withConfirmedTransition = shouldConfirmSufficientData(session)
    ? transitionToConfirmed({
        session,
        reason: "sufficient_data_reached",
      })
    : session;

  const withPendingState = markPendingQuestionAsked(
    withConfirmedTransition,
    nextQuestionId
  );

  return transitionToAsked({
    session: withPendingState,
    questionId: nextQuestionId,
    reason: "next_question_selected",
  });
}

function shouldConfirmSufficientData(session: TriageSession): boolean {
  const lastAnsweredQuestionId = session.last_question_asked;
  return Boolean(
    lastAnsweredQuestionId &&
      session.answered_questions.includes(lastAnsweredQuestionId)
  );
}

async function phraseNextQuestion(
  input: BuildQuestionResponseFlowInput & { session: TriageSession; nextQuestionId: string }
): Promise<string> {
  const questionText = getQuestionText(input.nextQuestionId);
  const hasLiveVisionThisTurn = Boolean(input.visionAnalysis);
  const basePhrasingContext =
    hasLiveVisionThisTurn ||
    shouldIncludeImageContextInQuestion(
      input.nextQuestionId,
      input.session,
      input.turnFocusSymptoms
    )
      ? buildQuestionPhrasingContext(input.session, input.visionSeverity)
      : null;
  const routeDeadlineMs = getTurnBudgetDeadlineMs(input.turnBudget);
  const textTurnDeadlineMs = hasLiveVisionThisTurn
    ? null
    : Date.now() + TEXT_ONLY_QUESTION_PHRASING_BUDGET_MS;
  const textTurnPhrasingDeadlineMs = minNullableDeadline(
    textTurnDeadlineMs,
    routeDeadlineMs
  );
  const recordTimeout = (record: ServiceTimeoutRecord): void => {
    input.serviceTimeouts?.push(record);
  };
  const textTurnDepth = getSymptomChatTurnDepth();
  const useDeterministicTextQuestion =
    input.forceDeterministicQuestionFallback ||
    (!hasLiveVisionThisTurn && textTurnDepth === "lean");
  if (useDeterministicTextQuestion) {
    return phraseQuestion(
      questionText,
      input.nextQuestionId,
      input.session,
      input.effectivePet,
      input.messages,
      input.lastUserMessage,
      basePhrasingContext,
      hasLiveVisionThisTurn,
      false,
      true,
      textTurnPhrasingDeadlineMs,
      recordTimeout,
      false
    );
  }

  if (!hasLiveVisionThisTurn) {
    return phraseQuestion(
      questionText,
      input.nextQuestionId,
      input.session,
      input.effectivePet,
      input.messages,
      input.lastUserMessage,
      basePhrasingContext,
      hasLiveVisionThisTurn,
      false,
      false,
      textTurnPhrasingDeadlineMs,
      recordTimeout,
      true
    );
  }

  const questionGate = shouldSkipOptionalModelStage(
    input.turnBudget,
    "question_plan_review"
  )
    ? (() => {
        recordTimeout(buildOptionalModelTimeoutRecord("question_plan_review"));
        return {
          includeImageContext: Boolean(hasLiveVisionThisTurn && basePhrasingContext),
          useDeterministicFallback: false,
          reason: "turn-deadline-budget",
        };
      })()
    : await gateQuestionBeforePhrasing(
        input.nextQuestionId,
        questionText,
        input.session,
        input.effectivePet,
        input.messages,
        input.lastUserMessage,
        basePhrasingContext,
        hasLiveVisionThisTurn,
        textTurnPhrasingDeadlineMs,
        recordTimeout
      );
  const forcePhrasingFallback =
    questionGate.useDeterministicFallback ||
    shouldSkipOptionalModelStage(input.turnBudget, "question_phrasing");
  if (forcePhrasingFallback && !questionGate.useDeterministicFallback) {
    recordTimeout(buildOptionalModelTimeoutRecord("question_phrasing"));
  }

  return phraseQuestion(
    questionText,
    input.nextQuestionId,
    input.session,
    input.effectivePet,
    input.messages,
    input.lastUserMessage,
    basePhrasingContext,
    hasLiveVisionThisTurn,
    hasLiveVisionThisTurn && questionGate.includeImageContext,
    forcePhrasingFallback,
    textTurnPhrasingDeadlineMs,
    recordTimeout
  );
}

function minNullableDeadline(
  first: number | null,
  second: number | null
): number | null {
  if (first === null) return second;
  if (second === null) return first;
  return Math.min(first, second);
}
