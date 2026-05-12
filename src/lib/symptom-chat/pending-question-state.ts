import { createSession, type TriageSession } from "@/lib/triage-engine";

export interface PendingQuestionStateSnapshot {
  pendingQuestionId?: string;
  questionAskedCounts: Record<string, number>;
  clarificationAttempts: Record<string, number>;
}

function getCaseMemory(session: TriageSession) {
  return session.case_memory ?? createSession().case_memory!;
}

function getFallbackPendingQuestionId(session: TriageSession): string | undefined {
  const lastQuestionAsked = session.last_question_asked;
  if (!lastQuestionAsked) {
    return undefined;
  }

  return (session.answered_questions ?? []).includes(lastQuestionAsked)
    ? undefined
    : lastQuestionAsked;
}

export function getPendingQuestionState(
  session: TriageSession
): PendingQuestionStateSnapshot {
  const caseMemory = getCaseMemory(session);
  return {
    pendingQuestionId:
      caseMemory.pending_question_id ?? getFallbackPendingQuestionId(session),
    questionAskedCounts: { ...(caseMemory.question_asked_counts ?? {}) },
    clarificationAttempts: { ...(caseMemory.clarification_attempts ?? {}) },
  };
}

export function getPendingQuestionId(
  session: TriageSession
): string | undefined {
  return getPendingQuestionState(session).pendingQuestionId;
}

export function getQuestionAskedCount(
  session: TriageSession,
  questionId: string
): number {
  const state = getPendingQuestionState(session);
  if (state.questionAskedCounts[questionId] !== undefined) {
    return state.questionAskedCounts[questionId];
  }

  return state.pendingQuestionId === questionId ? 1 : 0;
}

export function getClarificationAttemptCount(
  session: TriageSession,
  questionId: string
): number {
  return getPendingQuestionState(session).clarificationAttempts[questionId] ?? 0;
}

export function markPendingQuestionAsked(
  session: TriageSession,
  questionId: string
): TriageSession {
  const caseMemory = getCaseMemory(session);
  const nextCount = getQuestionAskedCount(session, questionId) + 1;

  return {
    ...session,
    case_memory: {
      ...caseMemory,
      pending_question_id: questionId,
      question_asked_counts: {
        ...(caseMemory.question_asked_counts ?? {}),
        [questionId]: nextCount,
      },
    },
  };
}

export function markPendingQuestionClarificationAttempt(
  session: TriageSession,
  questionId: string
): TriageSession {
  const caseMemory = getCaseMemory(session);
  const nextAttempts = getClarificationAttemptCount(session, questionId) + 1;

  return {
    ...session,
    case_memory: {
      ...caseMemory,
      pending_question_id: questionId,
      clarification_attempts: {
        ...(caseMemory.clarification_attempts ?? {}),
        [questionId]: nextAttempts,
      },
    },
  };
}

export function clearPendingQuestion(
  session: TriageSession,
  questionId: string
): TriageSession {
  const caseMemory = getCaseMemory(session);
  if (caseMemory.pending_question_id !== questionId) {
    return session;
  }

  return {
    ...session,
    case_memory: {
      ...caseMemory,
      pending_question_id: undefined,
    },
  };
}

export function pruneAnsweredQuestionState(
  session: TriageSession
): TriageSession {
  const caseMemory = getCaseMemory(session);
  const answeredIds = new Set(session.answered_questions ?? []);
  const clarificationReasons = {
    ...(caseMemory.clarification_reasons ?? {}),
  };

  for (const answeredId of answeredIds) {
    delete clarificationReasons[answeredId];
  }

  return {
    ...session,
    case_memory: {
      ...caseMemory,
      pending_question_id:
        caseMemory.pending_question_id &&
        answeredIds.has(caseMemory.pending_question_id)
          ? undefined
          : caseMemory.pending_question_id,
      unresolved_question_ids: (caseMemory.unresolved_question_ids ?? []).filter(
        (questionId) => !answeredIds.has(questionId)
      ),
      clarification_reasons: clarificationReasons,
    },
  };
}
