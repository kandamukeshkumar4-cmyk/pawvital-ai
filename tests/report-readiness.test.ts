/**
 * Report-readiness gate — regression for the 409 SESSION_NOT_READY contradiction.
 *
 * Real-world bug (confirmed via Vercel logs): the chat declared "I have enough
 * information — preparing your report" (isReadyForDiagnosis true, at the question
 * ceiling with a critical the owner could not resolve), but generate_report
 * refused with 409 because hasMinimumDiagnosticInfo was false → the report never
 * generated. The gate now blocks ONLY when NEITHER readiness signal holds.
 */
import {
  addSymptoms,
  createSession,
  hasMinimumDiagnosticInfo,
  isReadyForDiagnosis,
  type TriageSession,
} from "@/lib/triage-engine";
import { isReportReadinessBlocked } from "@/lib/symptom-chat/report-readiness";

/** A session driven to the question ceiling with the real critical follow-ups
 *  still unanswered (filler ids stand in for the off-path / repeat-loop turns). */
function ceilingSession(): TriageSession {
  let s = createSession();
  s = addSymptoms(s, ["vomiting"]);
  return {
    ...s,
    red_flags_triggered: [],
    answered_questions: Array.from({ length: 12 }, (_, i) => `filler_q_${i}`),
  };
}

function prematureSession(): TriageSession {
  let s = createSession();
  s = addSymptoms(s, ["vomiting"]);
  return { ...s, red_flags_triggered: [], answered_questions: [] };
}

describe("isReportReadinessBlocked — honors the chat's readiness promise", () => {
  it("does NOT block a ceiling-ready session even if hasMinimumDiagnosticInfo is false", () => {
    const s = ceilingSession();
    // Precondition: the exact contradiction that produced the production 409s.
    expect(isReadyForDiagnosis(s)).toBe(true);
    expect(hasMinimumDiagnosticInfo(s)).toBe(false);
    // Fixed behavior: the report is allowed to generate (no 409).
    expect(isReportReadinessBlocked(s)).toBe(false);
  });

  it("still blocks a genuinely premature session (both gates fail → 409)", () => {
    const s = prematureSession();
    expect(isReadyForDiagnosis(s)).toBe(false);
    expect(hasMinimumDiagnosticInfo(s)).toBe(false);
    expect(isReportReadinessBlocked(s)).toBe(true);
  });

  it("does not block when the permissive gate is satisfied (red flags present)", () => {
    let s = createSession();
    s = addSymptoms(s, ["vomiting"]);
    s = { ...s, red_flags_triggered: ["vomit_blood"] };
    expect(hasMinimumDiagnosticInfo(s)).toBe(true);
    expect(isReportReadinessBlocked(s)).toBe(false);
  });
});
