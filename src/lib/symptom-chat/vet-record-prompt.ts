import { getQuestionCardById } from "@/lib/clinical-intelligence/question-card-registry";
import type { TriageSession } from "@/lib/triage-engine";

/**
 * Proactively suggest vet-record upload when the planner is in a history phase
 * and no prior record context is stored yet (VET-1576 / plan enable-azure-features).
 */
export function shouldPromptVetRecordUpload(
  session: TriageSession,
  nextQuestionId: string | null
): boolean {
  const memory = session.case_memory;
  if (memory?.vet_record_context?.trim()) {
    return false;
  }
  if (!nextQuestionId) {
    return false;
  }

  const card = getQuestionCardById(nextQuestionId);
  return card?.phase === "history";
}
