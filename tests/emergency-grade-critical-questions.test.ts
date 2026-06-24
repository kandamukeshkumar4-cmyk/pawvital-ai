/**
 * Drift guard for the emergency-grade critical question set.
 *
 * The report-readiness relaxation (isReportReadinessBlocked) is clinically safe
 * ONLY because emergency-grade criticals are intercepted upstream by
 * findReportBlockingCriticalInfo, which keys off EMERGENCY_GRADE_CRITICAL_QUESTIONS.
 * If an id in that list is renamed, removed, or quietly flipped to non-critical
 * in FOLLOW_UP_QUESTIONS, that safety floor would break silently. This locks the
 * list to real, critical follow-up questions so the two can't drift apart.
 */
import {
  EMERGENCY_GRADE_CRITICAL_QUESTIONS,
  isEmergencyGradeCriticalQuestionId,
} from "@/lib/clinical/emergency-grade-critical-questions";
import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical/follow-up-questions";

describe("EMERGENCY_GRADE_CRITICAL_QUESTIONS — drift guard", () => {
  it("is non-empty and has no duplicates", () => {
    expect(EMERGENCY_GRADE_CRITICAL_QUESTIONS.length).toBeGreaterThan(0);
    const unique = new Set<string>(EMERGENCY_GRADE_CRITICAL_QUESTIONS);
    expect(unique.size).toBe(EMERGENCY_GRADE_CRITICAL_QUESTIONS.length);
  });

  it("every emergency-grade id is a real follow-up question still tagged critical", () => {
    const offenders = EMERGENCY_GRADE_CRITICAL_QUESTIONS.filter((id) => {
      const q = FOLLOW_UP_QUESTIONS[id];
      // Catches a renamed/removed id OR one silently flipped to critical: false.
      return !q || q.critical !== true;
    });
    expect(offenders).toEqual([]);
  });

  it("the type guard recognizes members and rejects non-members", () => {
    for (const id of EMERGENCY_GRADE_CRITICAL_QUESTIONS) {
      expect(isEmergencyGradeCriticalQuestionId(id)).toBe(true);
    }
    expect(isEmergencyGradeCriticalQuestionId("additional_context")).toBe(false);
    expect(isEmergencyGradeCriticalQuestionId("not_a_real_question")).toBe(false);
  });
});
