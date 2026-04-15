import {
  buildDemoThresholdProposalDashboardData,
  buildThresholdProposalPullRequestDraft,
  buildThresholdProposalReviewCycleDraft,
  isReviewedThresholdProposal,
  normalizeReviewCycleSlug,
  normalizeThresholdProposalIds,
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
      }),
    );
  });

  it("builds a PR draft with the required two-human approval gates", () => {
    const draft = buildThresholdProposalPullRequestDraft({
      generatedAt: "2026-04-14T12:00:00.000Z",
      generatedBy: "admin@pawvital.ai",
      proposals: buildDemoThresholdProposalDashboardData().proposals,
      reviewCycleFilePath: "plans/threshold-proposals-round1.md",
    });

    expect(draft.title).toContain("threshold proposal review batch");
    expect(draft.body).toContain("Human engineer approval");
    expect(draft.body).toContain("Clinical reviewer approval");
    expect(draft.body).toContain("plans/threshold-proposals-round1.md");
    expect(draft.fileContent).toContain(
      "No deterministic triage thresholds are changed",
    );
    expect(draft.filePath).toContain("plans/threshold-proposals/");
  });

  it("builds a round-one review cycle record from reviewed proposals only", () => {
    const proposals = buildDemoThresholdProposalDashboardData().proposals;
    const draft = buildThresholdProposalReviewCycleDraft({
      cycleSlug: "round1",
      generatedAt: "2026-04-14T12:00:00.000Z",
      generatedBy: "clinical-reviewer@pawvital.ai",
      proposals,
    });

    expect(draft.filePath).toBe("plans/threshold-proposals-round1.md");
    expect(draft.fileContent).toContain("Review cycle: round1");
    expect(draft.fileContent).toContain(
      "Approved for documentation-only follow-up: 1",
    );
    expect(draft.fileContent).toContain("Still in draft: 0");
    expect(draft.fileContent).toContain("Clinical reviewer requested a ticket");
  });

  it("sanitizes review cycle slugs before building file paths", () => {
    const draft = buildThresholdProposalReviewCycleDraft({
      cycleSlug: "../../Round 1 Clinical Review!!!",
      generatedAt: "2026-04-14T12:00:00.000Z",
      generatedBy: "clinical-reviewer@pawvital.ai",
      proposals: buildDemoThresholdProposalDashboardData().proposals,
    });

    expect(normalizeReviewCycleSlug("../../Round 1 Clinical Review!!!")).toBe(
      "round-1-clinical-review",
    );
    expect(draft.filePath).toBe(
      "plans/threshold-proposals-round-1-clinical-review.md",
    );
  });

  it("filters proposal ids to safe deduplicated values", () => {
    expect(
      normalizeThresholdProposalIds([
        "proposal-1",
        " proposal-1 ",
        "../../etc/passwd",
        "proposal_2",
        "",
        null,
      ]),
    ).toEqual(["proposal-1", "proposal_2"]);
  });

  it("treats non-draft statuses as reviewed proposals", () => {
    const proposals = normalizeThresholdProposalRows([
      { id: "draft-1", status: "draft", summary: "Draft", rationale: "Draft" },
      {
        id: "approved-1",
        status: "approved",
        summary: "Approved",
        rationale: "Approved",
      },
    ]);

    expect(
      proposals
        .filter(isReviewedThresholdProposal)
        .map((proposal) => proposal.id),
    ).toEqual(["approved-1"]);
  });
});
