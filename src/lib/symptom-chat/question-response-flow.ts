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
import { markPendingQuestionAsked } from "@/lib/symptom-chat/pending-question-state";
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
import {
  resolveOwnerVisiblePhrasingDeadline,
  type TurnDeadline,
} from "@/lib/symptom-chat/turn-deadline";
import {
  shouldRunNemotronQuestionGate,
  type TurnDepth,
} from "@/lib/symptom-chat/turn-depth";

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
  turnDeadline?: TurnDeadline;
  turnDepth?: TurnDepth;
  askingBecause?: string | null;
  promptVetRecord?: boolean;
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

  // Final safety strip: remove any "Got it — X." / "Okay." / "Understood." opener
  // that survived phrasing model sanitization. Acts as the authoritative last gate
  // before the message reaches the client.
  const safeMessage = stripOpenerPhrase(phrasedQuestion);

  return NextResponse.json({
    type: "question",
    message: safeMessage,
    session: sanitizeSessionForClient(session),
    ready_for_report: isReadyForDiagnosis(session),
    conversationState: input.needsClarificationQuestionId
      ? "needs_clarification"
      : inferConversationState(getStateSnapshot(session)),
    asking_because: input.askingBecause ?? session.case_memory?.asking_because ?? null,
    prompt_vet_record: Boolean(input.promptVetRecord),
  });
}

function stripOpenerPhrase(text: string): string {
  if (!/^(?:Got it|Okay|Understood|Noted|Sure|Alright)\b/i.test(text)) return text;
  // Find the first ASCII sentence boundary (". " or "! ") after the opener
  const ptIdx = text.indexOf(". ");
  const exIdx = text.indexOf("! ");
  const boundary =
    ptIdx >= 0 && exIdx >= 0
      ? Math.min(ptIdx, exIdx) + 2
      : ptIdx >= 0
        ? ptIdx + 2
        : exIdx >= 0
          ? exIdx + 2
          : -1;
  if (boundary <= 0) return text;
  const rest = text.substring(boundary).trim();
  if (!rest.includes("?")) return text;
  console.log("[flow] opener stripped:", text.substring(0, 70));
  return rest;
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
  const textTurnPhrasingDeadlineMs = resolveOwnerVisiblePhrasingDeadline(
    hasLiveVisionThisTurn,
    input.turnDeadline
  );
  if (
    input.forceDeterministicQuestionFallback ||
    (input.turnDepth && !shouldRunNemotronQuestionGate(input.turnDepth))
  ) {
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
      input.turnDepth
    );
  }

  const questionGate = await gateQuestionBeforePhrasing(
    input.nextQuestionId,
    questionText,
    input.session,
    input.effectivePet,
    input.messages,
    input.lastUserMessage,
    basePhrasingContext,
    hasLiveVisionThisTurn,
    textTurnPhrasingDeadlineMs
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
    questionGate.useDeterministicFallback,
    textTurnPhrasingDeadlineMs,
    input.turnDepth
  );
}
