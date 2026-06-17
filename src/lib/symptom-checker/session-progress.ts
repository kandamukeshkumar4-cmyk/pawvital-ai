import type { TriageSession } from "@/lib/triage-engine";

export function computeConversationProgress(session: TriageSession): {
  answered: number;
  total: number;
} {
  const answered = session.answered_questions?.length ?? 0;
  const unresolvedIds = session.case_memory?.unresolved_question_ids ?? [];
  const pendingId =
    session.case_memory?.pending_question_id ?? session.last_question_asked;

  const pendingIsOpen =
    Boolean(pendingId) &&
    !session.answered_questions.includes(pendingId!) &&
    !unresolvedIds.includes(pendingId!);

  const total = answered + unresolvedIds.length + (pendingIsOpen ? 1 : 0);

  return {
    answered,
    total: Math.max(total, answered),
  };
}
