import {
  buildDemoThresholdProposalDashboardData,
  buildThresholdProposalPullRequestDraft,
  normalizeThresholdProposalRows,
  summarizeThresholdProposals,
} from "@/lib/admin-threshold-proposals";

describe("admin threshold proposal helpers", () => {
  it("normalizes proposal rows and summarizes counts", () => {
    const proposals = normalizeThresholdProposalRows([
      {
        created_at: "2026-04-12T14:20:00.000Z",
        id: "proposal-1",
        outcome_feedback_entries: [
          {
            confirmed_diagnosis: "otitis media",
            matched_expectation: "no",
            symptom_summary: "head tilt, painful ear",
          },
        ],
        payload: { recommendation: "vet_24h" },
        proposal_type: "threshold_review",
        rationale: "Mismatch on same-day ear case.",
        reviewer_notes: "Needs clinician review.",
        status: "approved",
        summary: "Review vet_24h threshold",
        symptom_check_id: "check-1",
        updated_at: "2026-04-13T09:45:00.000Z",
      },
      {
        id: "proposal-2",
        proposal_type: "calibration_review",
        rationale: "Partial match on vomiting.",
        status: "draft",
        summary: "Review monitor calibration",
      },
    ]);

    expect(proposals).toHaveLength(2);
    expect(proposals[0].feedback?.confirmedDiagnosis).toBe("otitis media");
    expect(summarizeThresholdProposals(proposals)).toEqual(
      expect.objectContaining({
        approved: 1,
        calibrationReview: 1,
        draft: 1,
        readyForDraftPr: 1,
        thresholdReview: 1,
        total: 2,
      })
    );
  });

  it("builds a PR draft with the required two-human approval gates", () => {
    const draft = buildThresholdProposalPullRequestDraft({
      generatedAt: "2026-04-14T12:00:00.000Z",
      generatedBy: "admin@pawvital.ai",
      proposals: buildDemoThresholdProposalDashboardData().proposals,
    });

    expect(draft.title).toContain("threshold proposal review batch");
    expect(draft.body).toContain("Human engineer approval");
    expect(draft.body).toContain("Clinical reviewer approval");
    expect(draft.fileContent).toContain("No deterministic triage thresholds are changed");
    expect(draft.filePath).toContain("plans/threshold-proposals/");
  });
});
