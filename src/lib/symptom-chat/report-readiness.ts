import {
  hasMinimumDiagnosticInfo,
  isReadyForDiagnosis,
  type TriageSession,
} from "@/lib/triage-engine";

/**
 * Should `generate_report` reject this session with 409 SESSION_NOT_READY?
 *
 * Blocks ONLY when NEITHER readiness gate is satisfied:
 *  - `hasMinimumDiagnosticInfo` — the permissive "owner asked for a report and we
 *    have the minimum critical info" gate, and
 *  - `isReadyForDiagnosis` — the engine's own "I have concluded, here is the
 *    report" gate (which also fires at the question ceiling).
 *
 * Honoring `isReadyForDiagnosis` removes the contradiction that produced the
 * real-world 409s: the chat would declare "I have enough information — preparing
 * your report" (isReadyForDiagnosis true, e.g. at the question ceiling with a
 * critical the owner couldn't resolve), but `generate_report` then refused
 * because `hasMinimumDiagnosticInfo` was false — so the report never generated.
 *
 * Safety: this never releases a dangerously premature report. Emergency-grade
 * critical questions are blocked UPSTREAM by `findReportBlockingCriticalInfo`
 * (which returns a terminal cannot-assess report before this gate is reached).
 * The ceiling case therefore yields, at worst, a "slightly less rich" report —
 * exactly what `isReadyForDiagnosis` was designed to conclude. Pure; no I/O.
 */
export function isReportReadinessBlocked(session: TriageSession): boolean {
  return !hasMinimumDiagnosticInfo(session) && !isReadyForDiagnosis(session);
}
