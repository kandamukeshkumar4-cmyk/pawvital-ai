import { NextResponse } from "next/server";
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
import { sanitizeSessionForClient } from "@/lib/symptom-chat/context-helpers";
import {
  buildQuestionPhrasingContext,
  shouldIncludeImageContextInQuestion,
} from "@/lib/symptom-chat/context-helpers";
import {
  gateQuestionBeforePhrasing,
  phraseQuestion,
  type SymptomChatTurnMessage,
} from "@/lib/symptom-chat/question-phrasing";

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
    return session;
  }

  const withConfirmedTransition = shouldConfirmSufficientData(session)
    ? transitionToConfirmed({
        session,
        reason: "sufficient_data_reached",
      })
    : session;

  return transitionToAsked({
    session: withConfirmedTransition,
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
  const questionGate = await gateQuestionBeforePhrasing(
    input.nextQuestionId,
    questionText,
    input.session,
    input.effectivePet,
    input.messages,
    input.lastUserMessage,
    basePhrasingContext,
    hasLiveVisionThisTurn
  );

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
    questionGate.useDeterministicFallback
  );
}
