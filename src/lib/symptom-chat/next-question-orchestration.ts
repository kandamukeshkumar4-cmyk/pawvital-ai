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
import {
  getNextQuestionWithSource,
  deriveBrainQuestionTrace,
  type BrainQuestionTrace,
} from "@/lib/symptom-chat/answer-coercion";
import type { BrainSymptomEvidence } from "@/lib/dog-brain/question-priority";
import { didVisualEvidenceInfluenceQuestion } from "@/lib/symptom-chat/report-helpers";
import {
  getPendingQuestionId,
  getQuestionAskedCount,
} from "@/lib/symptom-chat/pending-question-state";
import { MAX_PENDING_QUESTION_ASKS } from "@/lib/symptom-chat/repeat-loop-guard";

interface OrchestrateNextQuestionInput {
  session: TriageSession;
  incomingUnresolvedIds: string[];
  pendingQResolvedThisTurn: boolean;
  turnFocusSymptoms: string[];
  visualEvidence: VisionClinicalEvidence | null;
  /**
   * SUPPORTIVE Dog Brain memory: symptom keys from recurring owner-logged
   * signals. Passed to the selector as a tiebreak only — never overrides a
   * pending-clarification re-ask (resolved first below) or the current turn's
   * complaint. Optional; absent / empty preserves pre-Brain behavior exactly.
   */
  brainPrioritySymptoms?: string[];
  /**
   * Owner-friendly evidence per Brain priority symptom key — used ONLY to build
   * the explanation-only brainQuestionTrace. Never affects selection. Optional;
   * absent / empty means no trace is emitted.
   */
  brainPrioritySymptomEvidence?: Record<string, BrainSymptomEvidence>;
}

interface OrchestrateNextQuestionResult {
  session: TriageSession;
  nextQuestionId: string | null;
  needsClarificationQuestionId: string | null;
  visualEvidenceInfluencedQuestion: boolean;
  /**
   * Explanation-only metadata: present only when Dog Brain memory (not the
   * current complaint and not a pending clarification) drove nextQuestionId.
   */
  brainQuestionTrace: BrainQuestionTrace | null;
}

export function orchestrateNextQuestion(
  input: OrchestrateNextQuestionInput
): OrchestrateNextQuestionResult {
  const needsClarificationQuestionId = resolveNeedsClarificationQuestionId(input);
  // A pending clarification re-ask always wins; otherwise select the next
  // question AND record which branch produced it (complaint / brain / fallback).
  const selection = needsClarificationQuestionId
    ? null
    : getNextQuestionWithSource(
        input.session,
        input.turnFocusSymptoms,
        input.brainPrioritySymptoms ?? []
      );
  const nextQuestionId =
    needsClarificationQuestionId ?? selection?.questionId ?? null;

  // Explanation-only trace. A clarification turn yields no Brain trace. Otherwise
  // emit a trace ONLY when the selector reports Brain memory (not the complaint
  // or fallback) drove this exact question — no re-derivation.
  const brainQuestionTrace = selection
    ? deriveBrainQuestionTrace(
        selection.source,
        input.brainPrioritySymptoms ?? [],
        input.brainPrioritySymptomEvidence ?? {},
        nextQuestionId
      )
    : null;

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
    brainQuestionTrace,
  };
}

function resolveNeedsClarificationQuestionId(
  input: OrchestrateNextQuestionInput
): string | null {
  const pendingQuestionId = getPendingQuestionId(input.session);
  if (!pendingQuestionId || input.pendingQResolvedThisTurn) {
    return null;
  }

  if (
    getQuestionAskedCount(input.session, pendingQuestionId) >=
    MAX_PENDING_QUESTION_ASKS
  ) {
    return null;
  }

  const clarificationReasons =
    input.session.case_memory?.clarification_reasons ?? {};
  const wasPreviouslyUnresolved =
    clarificationReasons[pendingQuestionId] ||
    input.incomingUnresolvedIds.includes(pendingQuestionId);

  return wasPreviouslyUnresolved ? pendingQuestionId : null;
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
    gate_events: ["repeat_loop_detected"],
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
