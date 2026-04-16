import {
  getMissingQuestions,
  type TriageSession,
} from "@/lib/triage-engine";
import type { VisionClinicalEvidence } from "@/lib/clinical-evidence";
import {
  ensureStructuredCaseMemory,
  recordConversationTelemetry,
  syncStructuredCaseMemoryQuestions,
} from "@/lib/symptom-memory";
import { getNextQuestionAvoidingRepeat } from "@/lib/symptom-chat/answer-coercion";
import { didVisualEvidenceInfluenceQuestion } from "@/lib/symptom-chat/report-helpers";

interface OrchestrateNextQuestionInput {
  session: TriageSession;
  incomingUnresolvedIds: string[];
  pendingQResolvedThisTurn: boolean;
  turnFocusSymptoms: string[];
  visualEvidence: VisionClinicalEvidence | null;
}

interface OrchestrateNextQuestionResult {
  session: TriageSession;
  nextQuestionId: string | null;
  needsClarificationQuestionId: string | null;
  visualEvidenceInfluencedQuestion: boolean;
}

export function orchestrateNextQuestion(
  input: OrchestrateNextQuestionInput
): OrchestrateNextQuestionResult {
  const needsClarificationQuestionId = resolveNeedsClarificationQuestionId(input);
  const nextQuestionId =
    needsClarificationQuestionId ??
    getNextQuestionAvoidingRepeat(input.session, input.turnFocusSymptoms);

  let session = recordRepeatSuppressionTelemetry(
    input.session,
    needsClarificationQuestionId,
    nextQuestionId
  );
  session = recordClarificationTelemetry(session, needsClarificationQuestionId);

  const visualEvidenceInfluencedQuestion = didVisualEvidenceInfluenceQuestion(
    nextQuestionId,
    input.visualEvidence,
    input.turnFocusSymptoms
  );

  session = applyVisualEvidenceQuestionInfluence(
    session,
    input.visualEvidence,
    nextQuestionId,
    visualEvidenceInfluencedQuestion
  );
  session = syncStructuredCaseMemoryQuestions(
    session,
    nextQuestionId,
    getMissingQuestions(session)
  );

  return {
    session,
    nextQuestionId,
    needsClarificationQuestionId,
    visualEvidenceInfluencedQuestion,
  };
}

function resolveNeedsClarificationQuestionId(
  input: OrchestrateNextQuestionInput
): string | null {
  const lastQuestionAsked = input.session.last_question_asked;
  if (!lastQuestionAsked || input.pendingQResolvedThisTurn) {
    return null;
  }

  const clarificationReasons =
    input.session.case_memory?.clarification_reasons ?? {};
  const wasPreviouslyUnresolved =
    clarificationReasons[lastQuestionAsked] ||
    input.incomingUnresolvedIds.includes(lastQuestionAsked);

  return wasPreviouslyUnresolved ? lastQuestionAsked : null;
}

function recordRepeatSuppressionTelemetry(
  session: TriageSession,
  needsClarificationQuestionId: string | null,
  nextQuestionId: string | null
): TriageSession {
  const wasRepeatSuppressed =
    needsClarificationQuestionId === null &&
    nextQuestionId !== null &&
    nextQuestionId === session.last_question_asked &&
    session.answered_questions.includes(nextQuestionId);

  if (!wasRepeatSuppressed) {
    return session;
  }

  return recordConversationTelemetry(session, {
    event: "repeat_suppression",
    turn_count: session.case_memory?.turn_count ?? 0,
    question_id: nextQuestionId,
    outcome: "success",
    reason: "repeat_of_last_asked_question_suppressed",
    repeat_prevented: true,
  });
}

function recordClarificationTelemetry(
  session: TriageSession,
  needsClarificationQuestionId: string | null
): TriageSession {
  if (!needsClarificationQuestionId) {
    return session;
  }

  return recordConversationTelemetry(session, {
    event: "pending_recovery",
    turn_count: session.case_memory?.turn_count ?? 0,
    question_id: needsClarificationQuestionId,
    outcome: "needs_clarification",
    source: "unresolved",
    reason: "needs_clarification_re_ask",
    pending_before: true,
    pending_after: true,
  });
}

function applyVisualEvidenceQuestionInfluence(
  session: TriageSession,
  visualEvidence: VisionClinicalEvidence | null,
  nextQuestionId: string | null,
  visualEvidenceInfluencedQuestion: boolean
): TriageSession {
  const memory = ensureStructuredCaseMemory(session);
  if (!visualEvidence || memory.visual_evidence.length === 0) {
    return session;
  }

  const nextVisualEvidence = memory.visual_evidence.map((entry, index, list) =>
    index === list.length - 1
      ? {
          ...entry,
          influencedQuestionSelection: visualEvidenceInfluencedQuestion,
        }
      : entry
  );
  const nextEvidenceChain = visualEvidenceInfluencedQuestion
    ? [
        ...memory.evidence_chain,
        `Visual evidence directly influenced next question: ${nextQuestionId || "ready_for_report"}`,
      ].slice(-16)
    : memory.evidence_chain;

  return {
    ...session,
    case_memory: {
      ...memory,
      visual_evidence: nextVisualEvidence,
      evidence_chain: nextEvidenceChain,
    },
    latest_visual_evidence: {
      ...visualEvidence,
      influencedQuestionSelection: visualEvidenceInfluencedQuestion,
    },
  };
}
