import {
  DISEASE_DB,
  FOLLOW_UP_QUESTIONS,
  SYMPTOM_MAP,
} from "@/lib/clinical-matrix";
import {
  addSymptoms,
  createSession,
  isReadyForDiagnosis,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";
import { shouldEscalateForUnknown } from "@/lib/symptom-chat/answer-coercion";
import { findReportBlockingCriticalInfo } from "@/lib/clinical/uncertainty-routing";

/**
 * VET-1382 / #341 — Unknown-Concern Breathing Ambiguity Regression Pass.
 *
 * Safety-watch coverage for the ambiguous `unknown_concern` / "can't assess
 * breathing" flow. Locks four clinical invariants and the gap-closing change
 * that makes `breathing_status` a critical, escalation-grade sign (consistent
 * with `breathing_onset` / `gum_color` / `consciousness_level`).
 */

function buildSyntheticSession(
  symptoms: string[],
  answers: Record<string, string | boolean | number> = {}
): TriageSession {
  let session = addSymptoms(createSession(), symptoms);
  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }
  return session;
}

describe("VET-1382 breathing ambiguity invariants", () => {
  // Invariant 2: clear breathing distress still escalates to emergency.
  it("keeps clear breathing distress (labored + blue gums) on an emergency path", () => {
    const session = buildSyntheticSession(["difficulty_breathing"], {
      breathing_status: "labored",
      gum_color: "blue",
    });

    expect(SYMPTOM_MAP.difficulty_breathing.red_flags).toContain("blue_gums");
    expect(session.red_flags_triggered).toContain("blue_gums");
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["heart_failure", "pleural_effusion"])
    );
    expect(DISEASE_DB.heart_failure.urgency).toBe("emergency");
    // A triggered red flag must short-circuit the interview as decision-ready.
    expect(isReadyForDiagnosis(session)).toBe(true);
  });

  // Invariant 5: mild, non-distress unknown-concern wording must not escalate.
  it("does not over-escalate a calm unknown-concern case with normal breathing", () => {
    const session = buildSyntheticSession(["unknown_concern"], {
      breathing_status: "normal",
      gum_color: "pink_normal",
    });

    expect(session.red_flags_triggered).toHaveLength(0);
    expect(session.extracted_answers.breathing_status).toBe("normal");
  });

  // Invariant 3: later ambiguity must not downgrade prior emergency evidence.
  it("preserves triggered emergency evidence after a later ambiguous answer", () => {
    let session = buildSyntheticSession(["difficulty_breathing"], {
      gum_color: "blue",
    });

    expect(session.red_flags_triggered).toContain("blue_gums");
    const readyBefore = isReadyForDiagnosis(session);

    // A subsequent non-emergency / ambiguous answer arrives.
    session = recordAnswer(session, "breathing_rate", "not sure");

    expect(session.red_flags_triggered).toContain("blue_gums");
    expect(isReadyForDiagnosis(session)).toBe(readyBefore);
    expect(isReadyForDiagnosis(session)).toBe(true);
  });
});

describe("VET-1382 breathing_status is an escalation-grade critical sign", () => {
  // Invariant 1 (gap-closer): can't-assess breathing routes to escalation,
  // consistent with the other critical breathing/gum signals.
  it("treats breathing_status as unsafe-to-mark-unknown (escalation-grade)", () => {
    expect(shouldEscalateForUnknown("breathing_status")).toBe(true);
    // Parity with the existing critical breathing/gum signals.
    expect(shouldEscalateForUnknown("breathing_onset")).toBe(true);
    expect(shouldEscalateForUnknown("gum_color")).toBe(true);
  });

  it("keeps breathing_status defined as a critical follow-up question", () => {
    expect(FOLLOW_UP_QUESTIONS.breathing_status?.critical).toBe(true);
  });

  // Report-time backstop: a missing current-breathing sign on the
  // unknown-concern path must block the report and route to cannot_assess.
  it("blocks the report when breathing_status is missing on an unknown-concern case", () => {
    const session = buildSyntheticSession(["unknown_concern"], {
      gum_color: "pink_normal",
    });

    const finding = findReportBlockingCriticalInfo(session);

    expect(finding).not.toBeNull();
    expect(finding?.questionId).toBe("breathing_status");
    expect(finding?.reason).toBe("missing");
  });

  it("blocks the report when breathing_status is recorded as unknown", () => {
    const session = buildSyntheticSession(["unknown_concern"], {
      gum_color: "pink_normal",
      breathing_status: "unknown",
    });

    const finding = findReportBlockingCriticalInfo(session);

    expect(finding).not.toBeNull();
    expect(finding?.questionId).toBe("breathing_status");
    expect(finding?.reason).toBe("unknown");
  });
});
