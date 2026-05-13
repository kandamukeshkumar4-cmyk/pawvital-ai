import {
  addSymptoms,
  createSession,
  recordAnswer,
  type PetProfile,
} from "@/lib/triage-engine";
import { createModelBudgetState } from "@/lib/model-budget";
import {
  buildDeterministicVetHandoffSummary,
  getFinalSafetyVerifierMode,
  parseFinalSafetyVerifierResponse,
  verifyFinalUrgencyAndHandoffSafety,
} from "@/lib/symptom-chat/final-safety-verifier";

const PET: PetProfile = {
  name: "Milo",
  breed: "Labrador Retriever",
  age_years: 6,
  weight: 62,
};

function buildSession() {
  let session = createSession();
  session = addSymptoms(session, ["vomiting"]);
  session = recordAnswer(session, "vomit_blood", true);
  session.red_flags_triggered = ["vomit_blood"];
  session.case_memory = {
    ...session.case_memory!,
    latest_owner_turn: "He vomited blood twice this morning.",
    unresolved_question_ids: ["gum_color"],
  };

  return session;
}

function buildReport() {
  return {
    severity: "low",
    recommendation: "monitor",
    title: "GI upset",
    explanation: "This report draft will be checked before the final handoff is shown.",
    actions: ["Monitor closely at home."],
    warning_signs: ["Vomiting gets worse"],
  };
}

describe("VET-1426 final urgency summary + vet handoff safety verifier", () => {
  it("defaults the feature flag to off and accepts only supported modes", () => {
    expect(getFinalSafetyVerifierMode(undefined)).toBe("off");
    expect(getFinalSafetyVerifierMode("")).toBe("off");
    expect(getFinalSafetyVerifierMode("shadow")).toBe("shadow");
    expect(getFinalSafetyVerifierMode("ON")).toBe("on");
    expect(getFinalSafetyVerifierMode("unexpected")).toBe("off");
  });

  it("builds a deterministic vet handoff summary without diagnosis or treatment sections", () => {
    const summary = buildDeterministicVetHandoffSummary({
      session: buildSession(),
      pet: PET,
      recommendation: "emergency_vet",
      deterministicRedFlags: ["vomit_blood"],
    });

    expect(summary).toContain("Patient:");
    expect(summary).toContain("Urgency: emergency_vet.");
    expect(summary).toContain("Deterministic red flags:");
    expect(summary).toContain("Critical unknowns still unresolved:");
    expect(summary).not.toContain("Top differentials");
    expect(summary).not.toContain("Recommended diagnostics");
  });

  it("accepts strict JSON that keeps or raises urgency and uses only supported handoff notes", () => {
    const parsed = parseFinalSafetyVerifierResponse(
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: ["vomit_blood"],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: ["Vomited blood twice this morning"],
        safeToShow: true,
      }),
      {
        deterministicUrgency: "emergency",
        deterministicRedFlags: ["vomit_blood"],
        explicitOwnerAnswers: {
          vomit_blood: true,
        },
        unresolvedCriticalUnknowns: ["What color are the gums?"],
        ownerFacingSummaryDraft:
          "Urgency: emergency_vet. Warning signs: vomiting gets worse.",
        vetHandoffDraft:
          "Owner-reported facts: vomit blood: yes. He vomited blood twice this morning.",
      }
    );

    expect(parsed).toEqual({
      status: "accepted",
      output: {
        unsafeDowngradeDetected: false,
        missedRedFlags: ["vomit_blood"],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: ["Vomited blood twice this morning"],
        safeToShow: true,
      },
    });
  });

  it.each([
    ["```json\n{\"unsafeDowngradeDetected\":false}\n```", "malformed_json"],
    [
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: [],
        vetHandoffNotes: [],
        safeToShow: true,
      }),
      "missing_required_keys",
    ],
    [
      JSON.stringify({
        unsafeDowngradeDetected: true,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "monitor",
        vetHandoffNotes: [],
        safeToShow: false,
      }),
      "unsafe_downgrade",
    ],
    [
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: ["Likely hemorrhagic gastroenteritis"],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: [],
        safeToShow: false,
      }),
      "diagnosis_wording",
    ],
    [
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: ["Give carprofen at home tonight"],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: [],
        safeToShow: false,
      }),
      "treatment_wording",
    ],
    [
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: ["collapse"],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: [],
        safeToShow: false,
      }),
      "invented_unsupported_fact",
    ],
    [
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: ["Owner reports blue gums"],
        safeToShow: true,
      }),
      "invented_unsupported_fact",
    ],
  ])("rejects invalid verifier output with reason %s", (raw, reason) => {
    expect(
      parseFinalSafetyVerifierResponse(raw, {
        deterministicUrgency: "emergency",
        deterministicRedFlags: ["vomit_blood"],
        explicitOwnerAnswers: {
          vomit_blood: true,
        },
        unresolvedCriticalUnknowns: ["What color are the gums?"],
        ownerFacingSummaryDraft:
          "Urgency: emergency_vet. Warning signs: vomiting gets worse.",
        vetHandoffDraft:
          "Owner-reported facts: vomit blood: yes. He vomited blood twice this morning.",
      })
    ).toEqual({
      status: "rejected",
      reason,
    });
  });

  it("fails closed when the feature is disabled", async () => {
    const result = await verifyFinalUrgencyAndHandoffSafety({
      mode: "off",
      session: buildSession(),
      pet: PET,
      report: buildReport(),
      deterministicUrgency: "emergency",
      deterministicRedFlags: ["vomit_blood"],
      generatedVetHandoffDraft:
        "Top differentials: gastritis. Recommended diagnostics: CBC.",
      budgetState: createModelBudgetState(),
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("feature_disabled");
    expect(result.recommendation).toBe("emergency_vet");
    expect(result.severity).toBe("emergency");
    expect(result.vetHandoffSummary).not.toContain("Top differentials");
    expect(result.vetHandoffSummary).toContain("Deterministic red flags:");
  });

  it("runs behind the Grok safety budget and escalates urgency only in on mode", async () => {
    const modelCaller = jest.fn().mockResolvedValue(
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: ["vomit_blood"],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "same_day",
        vetHandoffNotes: ["Vomited blood twice this morning"],
        safeToShow: true,
      })
    );

    const accepted = await verifyFinalUrgencyAndHandoffSafety({
      mode: "on",
      session: buildSession(),
      pet: PET,
      report: buildReport(),
      deterministicUrgency: "moderate",
      deterministicRedFlags: ["vomit_blood"],
      generatedVetHandoffDraft:
        "Top differentials: gastritis. Recommended diagnostics: CBC.",
      budgetState: createModelBudgetState(),
      modelCaller,
    });

    expect(modelCaller).toHaveBeenCalledTimes(1);
    expect(accepted.status).toBe("accepted");
    expect(accepted.recommendation).toBe("vet_24h");
    expect(accepted.severity).toBe("high");
    expect(accepted.vetHandoffSummary).toContain(
      "Vomited blood twice this morning"
    );
    expect(accepted.budgetState?.callCounts.grok_final_safety).toBe(1);

    const shadow = await verifyFinalUrgencyAndHandoffSafety({
      mode: "shadow",
      session: buildSession(),
      pet: PET,
      report: buildReport(),
      deterministicUrgency: "moderate",
      deterministicRedFlags: ["vomit_blood"],
      generatedVetHandoffDraft:
        "Top differentials: gastritis. Recommended diagnostics: CBC.",
      budgetState: createModelBudgetState(),
      modelCaller,
    });

    expect(shadow.status).toBe("shadow");
    expect(shadow.recommendation).toBe("vet_48h");
    expect(shadow.severity).toBe("medium");
  });

  it("fails closed when the Grok final-safety budget is exhausted", async () => {
    const result = await verifyFinalUrgencyAndHandoffSafety({
      mode: "on",
      session: buildSession(),
      pet: PET,
      report: buildReport(),
      deterministicUrgency: "moderate",
      deterministicRedFlags: ["vomit_blood"],
      generatedVetHandoffDraft:
        "Top differentials: gastritis. Recommended diagnostics: CBC.",
      budgetState: {
        callCounts: {
          grok_final_safety: 1,
        },
        circuitOpen: {},
      },
      modelCaller: jest.fn(),
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("budget_exceeded");
    expect(result.recommendation).toBe("vet_48h");
    expect(result.vetHandoffSummary).not.toContain("Top differentials");
  });
});
