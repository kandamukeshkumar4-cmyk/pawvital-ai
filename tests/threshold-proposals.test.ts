import type { SymptomReport } from "@/components/symptom-report/types";
import { buildThresholdProposalDraft } from "@/lib/threshold-proposals";

function makeReport(
  overrides: Partial<SymptomReport> = {}
): SymptomReport {
  return {
    severity: "high",
    recommendation: "vet_24h",
    title: "Painful ear infection",
    explanation: "Painful ear changes need same-day care.",
    actions: ["Book a same-day visit."],
    warning_signs: ["Head tilt", "Loss of balance"],
    differential_diagnoses: [
      {
        condition: "Otitis externa",
        description: "External ear inflammation",
        likelihood: "high",
      },
    ],
    ...overrides,
  };
}

describe("threshold proposal drafts", () => {
  it("does not create a proposal for fully matched outcomes", () => {
    const proposal = buildThresholdProposalDraft({
      feedback: {
        symptomCheckId: "check-1",
        matchedExpectation: "yes",
      },
      report: makeReport(),
      symptomSummary: "ear pain, head shaking",
    });

    expect(proposal).toBeNull();
  });

  it("creates a threshold review draft for mismatched outcomes", () => {
    const proposal = buildThresholdProposalDraft({
      feedback: {
        symptomCheckId: "check-1",
        matchedExpectation: "no",
        confirmedDiagnosis: "middle ear disease",
        vetOutcome: "same-day imaging",
      },
      report: makeReport(),
      symptomSummary: "ear pain, head shaking",
    });

    expect(proposal?.proposalType).toBe("threshold_review");
    expect(proposal?.summary).toContain("middle ear disease");
    expect(proposal?.rationale).toContain('Owner-reported feedback was marked "no"');
    expect(proposal?.payload).toEqual(
      expect.objectContaining({
        confirmedDiagnosis: "middle ear disease",
        matchedExpectation: "no",
        recommendation: "vet_24h",
      })
    );
  });
});
