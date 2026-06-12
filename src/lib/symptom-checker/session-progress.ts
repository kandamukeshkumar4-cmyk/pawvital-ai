import type { TriageSession } from "@/lib/triage-engine";

type ProgressSession = Partial<
  Pick<TriageSession, "answered_questions" | "case_memory" | "last_question_asked">
>;

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function computeConversationProgress(session: ProgressSession): {
  answered: number;
  total: number;
} {
  const answeredQuestions = toStringArray(session.answered_questions);
  const answered = answeredQuestions.length;
  const unresolvedIds = toStringArray(
    session.case_memory?.unresolved_question_ids
  );
  const pendingId =
    toString(session.case_memory?.pending_question_id) ??
    toString(session.last_question_asked);

  const pendingIsOpen =
    Boolean(pendingId) &&
    !answeredQuestions.includes(pendingId) &&
    !unresolvedIds.includes(pendingId);

  const total = answered + unresolvedIds.length + (pendingIsOpen ? 1 : 0);

  return {
    answered,
    total: Math.max(total, answered),
  };
}
