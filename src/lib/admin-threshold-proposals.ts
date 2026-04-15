export type ThresholdProposalStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "superseded";

export type ThresholdProposalType = "threshold_review" | "calibration_review";

export interface ThresholdProposalFeedbackSnapshot {
  confirmedDiagnosis: string | null;
  feedbackSource: string | null;
  matchedExpectation: "yes" | "partly" | "no" | null;
  ownerNotes: string | null;
  reportRecommendation: string | null;
  reportSeverity: string | null;
  reportTitle: string | null;
  submittedAt: string | null;
  symptomSummary: string | null;
  vetOutcome: string | null;
}

export interface ThresholdProposalRecord {
  createdAt: string;
  feedback: ThresholdProposalFeedbackSnapshot | null;
  id: string;
  payload: Record<string, unknown>;
  proposalType: ThresholdProposalType;
  rationale: string;
  reviewerNotes: string;
  status: ThresholdProposalStatus;
  summary: string;
  symptomCheckId: string | null;
  updatedAt: string;
}

export interface ThresholdProposalSummary {
  approved: number;
  calibrationReview: number;
  draft: number;
  readyForDraftPr: number;
  rejected: number;
  superseded: number;
  thresholdReview: number;
  total: number;
}

export interface ThresholdProposalDashboardData {
  proposals: ThresholdProposalRecord[];
  summary: ThresholdProposalSummary;
}

export interface ThresholdProposalPullRequestDraft {
  body: string;
  branchName: string;
  commitMessage: string;
  fileContent: string;
  filePath: string;
  title: string;
}

export interface ThresholdProposalReviewCycleDraft {
  fileContent: string;
  filePath: string;
  title: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizeStatus(value: unknown): ThresholdProposalStatus {
  return ["approved", "rejected", "superseded"].includes(String(value))
    ? (value as ThresholdProposalStatus)
    : "draft";
}

function normalizeProposalType(value: unknown): ThresholdProposalType {
  return value === "calibration_review"
    ? "calibration_review"
    : "threshold_review";
}

function normalizeFeedback(
  value: unknown,
): ThresholdProposalFeedbackSnapshot | null {
  const source = Array.isArray(value) ? value[0] : value;
  if (!isObject(source)) {
    return null;
  }

  return {
    confirmedDiagnosis: asString(
      source.confirmed_diagnosis ?? source.confirmedDiagnosis,
    ),
    feedbackSource: asString(source.feedback_source ?? source.feedbackSource),
    matchedExpectation: ["yes", "partly", "no"].includes(
      String(source.matched_expectation ?? source.matchedExpectation),
    )
      ? ((source.matched_expectation ??
          source.matchedExpectation) as ThresholdProposalFeedbackSnapshot["matchedExpectation"])
      : null,
    ownerNotes: asString(source.owner_notes ?? source.ownerNotes),
    reportRecommendation: asString(
      source.report_recommendation ?? source.reportRecommendation,
    ),
    reportSeverity: asString(source.report_severity ?? source.reportSeverity),
    reportTitle: asString(source.report_title ?? source.reportTitle),
    submittedAt: asString(source.submitted_at ?? source.submittedAt),
    symptomSummary: asString(source.symptom_summary ?? source.symptomSummary),
    vetOutcome: asString(source.vet_outcome ?? source.vetOutcome),
  };
}

export function normalizeThresholdProposalRows(
  rows: unknown[],
): ThresholdProposalRecord[] {
  return rows.flatMap((row) => {
    if (!isObject(row) || !asString(row.id)) {
      return [];
    }

    return [
      {
        createdAt:
          asString(row.created_at ?? row.createdAt) || new Date().toISOString(),
        feedback: normalizeFeedback(
          row.outcome_feedback_entries ?? row.outcomeFeedbackEntries,
        ),
        id: String(row.id),
        payload: isObject(row.payload) ? row.payload : {},
        proposalType: normalizeProposalType(
          row.proposal_type ?? row.proposalType,
        ),
        rationale: asString(row.rationale) || "No rationale provided.",
        reviewerNotes: asString(row.reviewer_notes ?? row.reviewerNotes) || "",
        status: normalizeStatus(row.status),
        summary: asString(row.summary) || "Untitled threshold proposal",
        symptomCheckId:
          asString(row.symptom_check_id ?? row.symptomCheckId) || null,
        updatedAt:
          asString(row.updated_at ?? row.updatedAt) || new Date().toISOString(),
      },
    ];
  });
}

export function summarizeThresholdProposals(
  proposals: ThresholdProposalRecord[],
): ThresholdProposalSummary {
  return proposals.reduce<ThresholdProposalSummary>(
    (summary, proposal) => {
      summary.total += 1;
      summary.readyForDraftPr += proposal.status === "approved" ? 1 : 0;
      summary.thresholdReview +=
        proposal.proposalType === "threshold_review" ? 1 : 0;
      summary.calibrationReview +=
        proposal.proposalType === "calibration_review" ? 1 : 0;
      summary[proposal.status] += 1;
      return summary;
    },
    {
      approved: 0,
      calibrationReview: 0,
      draft: 0,
      readyForDraftPr: 0,
      rejected: 0,
      superseded: 0,
      thresholdReview: 0,
      total: 0,
    },
  );
}

export function isReviewedThresholdProposal(proposal: ThresholdProposalRecord) {
  return proposal.status !== "draft";
}

export function buildDemoThresholdProposalDashboardData(): ThresholdProposalDashboardData {
  const proposals: ThresholdProposalRecord[] = [
    {
      createdAt: "2026-04-12T14:20:00.000Z",
      feedback: {
        confirmedDiagnosis: "otitis media",
        feedbackSource: "historical_backfill",
        matchedExpectation: "no",
        ownerNotes: "Needed sedation and same-day imaging.",
        reportRecommendation: "vet_24h",
        reportSeverity: "high",
        reportTitle: "Painful ear disease",
        submittedAt: "2026-04-12T14:20:00.000Z",
        symptomSummary: "head shaking, painful ear, odor",
        vetOutcome: "Same-day sedated exam and imaging.",
      },
      id: "demo-threshold-1",
      payload: {
        confirmedDiagnosis: "otitis media",
        recommendation: "vet_24h",
        reportSeverity: "high",
        topDifferentials: ["Otitis externa", "Otitis media"],
      },
      proposalType: "threshold_review",
      rationale:
        'Owner-reported feedback was marked "no" for a high / vet_24h report.',
      reviewerNotes:
        "Clinical reviewer requested a ticket to review same-day escalation criteria before any threshold edits.",
      status: "approved",
      summary: "Review vet_24h threshold for otitis media",
      symptomCheckId: "demo-check-1",
      updatedAt: "2026-04-13T09:45:00.000Z",
    },
    {
      createdAt: "2026-04-13T16:05:00.000Z",
      feedback: {
        confirmedDiagnosis: "dietary indiscretion",
        feedbackSource: "owner_feedback",
        matchedExpectation: "partly",
        ownerNotes: "Improved after bland diet and fluids.",
        reportRecommendation: "monitor",
        reportSeverity: "low",
        reportTitle: "Vomiting after scavenging",
        submittedAt: "2026-04-13T16:05:00.000Z",
        symptomSummary: "single vomit, normal energy, recent trash exposure",
        vetOutcome: "Observed at home with bland diet.",
      },
      id: "demo-threshold-2",
      payload: {
        recommendation: "monitor",
        reportSeverity: "low",
        topDifferentials: ["Dietary indiscretion"],
      },
      proposalType: "calibration_review",
      rationale:
        'Owner-reported feedback was marked "partly" for a low / monitor report.',
      reviewerNotes: "",
      status: "draft",
      summary:
        "Review monitor calibration for partially matched vomiting outcome",
      symptomCheckId: "demo-check-2",
      updatedAt: "2026-04-13T16:05:00.000Z",
    },
  ];

  return {
    proposals,
    summary: summarizeThresholdProposals(proposals),
  };
}

function createProposalSection(proposal: ThresholdProposalRecord) {
  const payloadPreview = JSON.stringify(proposal.payload, null, 2);
  const lines = [
    `## ${proposal.summary}`,
    `- Proposal ID: \`${proposal.id}\``,
    `- Proposal type: \`${proposal.proposalType}\``,
    `- Status: \`${proposal.status}\``,
    proposal.symptomCheckId
      ? `- Symptom check: \`${proposal.symptomCheckId}\``
      : "",
    proposal.feedback?.matchedExpectation
      ? `- Matched expectation: \`${proposal.feedback.matchedExpectation}\``
      : "",
    proposal.feedback?.reportSeverity
      ? `- Report severity: \`${proposal.feedback.reportSeverity}\``
      : "",
    proposal.feedback?.reportRecommendation
      ? `- Recommendation: \`${proposal.feedback.reportRecommendation}\``
      : "",
    proposal.feedback?.confirmedDiagnosis
      ? `- Confirmed diagnosis: ${proposal.feedback.confirmedDiagnosis}`
      : "",
    proposal.feedback?.vetOutcome
      ? `- Vet outcome: ${proposal.feedback.vetOutcome}`
      : "",
    proposal.feedback?.symptomSummary
      ? `- Symptoms: ${proposal.feedback.symptomSummary}`
      : "",
    proposal.feedback?.ownerNotes
      ? `- Owner notes: ${proposal.feedback.ownerNotes}`
      : "",
    proposal.reviewerNotes ? `- Reviewer notes: ${proposal.reviewerNotes}` : "",
    "",
    "### Rationale",
    proposal.rationale,
    "",
    "### Payload snapshot",
    "```json",
    payloadPreview,
    "```",
  ];

  return lines.filter(Boolean).join("\n");
}

function toTimestampFragment(isoString: string) {
  return isoString.replace(/[-:]/g, "").replace(/\..+$/, "").toLowerCase();
}

function createReviewCycleDecisionSection(proposal: ThresholdProposalRecord) {
  const lines = [
    `### ${proposal.summary}`,
    `- Proposal ID: \`${proposal.id}\``,
    `- Decision: \`${proposal.status}\``,
    `- Proposal type: \`${proposal.proposalType}\``,
    `- Decision recorded: ${proposal.updatedAt}`,
    proposal.symptomCheckId
      ? `- Symptom check: \`${proposal.symptomCheckId}\``
      : "",
    proposal.feedback?.confirmedDiagnosis
      ? `- Confirmed diagnosis: ${proposal.feedback.confirmedDiagnosis}`
      : "",
    proposal.feedback?.reportRecommendation
      ? `- Report recommendation: \`${proposal.feedback.reportRecommendation}\``
      : "",
    proposal.feedback?.reportSeverity
      ? `- Report severity: \`${proposal.feedback.reportSeverity}\``
      : "",
    proposal.feedback?.matchedExpectation
      ? `- Matched expectation: \`${proposal.feedback.matchedExpectation}\``
      : "",
    "",
    "#### Original rationale",
    proposal.rationale,
    "",
    "#### Reviewer decision notes",
    proposal.reviewerNotes || "No reviewer notes recorded.",
  ];

  return lines.filter(Boolean).join("\n");
}

function createReviewCycleStatusSection(
  proposals: ThresholdProposalRecord[],
  status: Extract<
    ThresholdProposalStatus,
    "approved" | "rejected" | "superseded"
  >,
) {
  if (proposals.length === 0) {
    return "";
  }

  const heading =
    status === "approved"
      ? "## Approved proposals"
      : status === "rejected"
        ? "## Rejected proposals"
        : "## Superseded proposals";

  return [
    heading,
    "",
    proposals.map(createReviewCycleDecisionSection).join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildThresholdProposalReviewCycleDraft(input: {
  cycleSlug?: string;
  generatedAt: string;
  generatedBy: string;
  proposals: ThresholdProposalRecord[];
}): ThresholdProposalReviewCycleDraft {
  const cycleSlug = (input.cycleSlug || "round1").trim().toLowerCase();
  const reviewedProposals = input.proposals.filter(isReviewedThresholdProposal);
  const summary = summarizeThresholdProposals(reviewedProposals);
  const filePath = `plans/threshold-proposals-${cycleSlug}.md`;
  const title = `docs: threshold proposal review ${cycleSlug}`;
  const approved = reviewedProposals.filter(
    (proposal) => proposal.status === "approved",
  );
  const rejected = reviewedProposals.filter(
    (proposal) => proposal.status === "rejected",
  );
  const superseded = reviewedProposals.filter(
    (proposal) => proposal.status === "superseded",
  );
  const sections = [
    createReviewCycleStatusSection(approved, "approved"),
    createReviewCycleStatusSection(rejected, "rejected"),
    createReviewCycleStatusSection(superseded, "superseded"),
  ].filter(Boolean);

  const fileContent = [
    "# Threshold Proposal Review Cycle",
    "",
    `Review cycle: ${cycleSlug}`,
    `Generated at: ${input.generatedAt}`,
    `Generated by: ${input.generatedBy}`,
    "",
    "This record captures the first human review cycle for threshold and calibration proposals.",
    "It is documentation only and does not mutate deterministic triage logic or runtime thresholds.",
    "",
    "## Review summary",
    `- Reviewed proposals: ${summary.approved + summary.rejected + summary.superseded}`,
    `- Approved for documentation-only follow-up: ${summary.approved}`,
    `- Rejected: ${summary.rejected}`,
    `- Superseded: ${summary.superseded}`,
    `- Still in draft: ${summary.draft}`,
    "",
    "## Required approvals before any threshold-changing follow-up",
    "- [ ] Human engineer approval",
    "- [ ] Clinical reviewer approval",
    "- [ ] Separate implementation ticket before any runtime threshold change",
    "",
    sections.length > 0
      ? sections.join("\n\n")
      : "## Decisions\n\nNo reviewed proposals recorded yet.",
    "",
    "## Guardrail",
    "Accepted proposals remain display-only. Any threshold edit must land later in a separate, clinically reviewed implementation PR.",
  ].join("\n");

  return {
    fileContent,
    filePath,
    title,
  };
}

export function buildThresholdProposalPullRequestDraft(input: {
  generatedAt: string;
  generatedBy: string;
  proposals: ThresholdProposalRecord[];
  reviewCycleFilePath?: string;
}): ThresholdProposalPullRequestDraft {
  const approvedProposals = input.proposals.filter(
    (proposal) => proposal.status === "approved",
  );
  const timestamp = toTimestampFragment(input.generatedAt);
  const fileSlug = `threshold-proposals-${timestamp}`;
  const filePath = `plans/threshold-proposals/${fileSlug}.md`;
  const title = `docs: threshold proposal review batch ${input.generatedAt.slice(0, 10)}`;
  const branchName = `codex/threshold-proposals-${timestamp}`;
  const commitMessage = title;

  const sections = approvedProposals.map(createProposalSection).join("\n\n");
  const fileContent = [
    "# Threshold Proposal Review Batch",
    "",
    `Generated at: ${input.generatedAt}`,
    `Generated by: ${input.generatedBy}`,
    "",
    "This document records approved threshold and calibration proposals for human review only.",
    "No deterministic triage thresholds are changed by this PR.",
    "",
    "## Required approvals before merge",
    "- [ ] Human engineer approval",
    "- [ ] Clinical reviewer approval",
    "- [ ] Follow-up implementation ticket confirmed before any runtime threshold change",
    "",
    "## Included proposals",
    "",
    sections,
  ].join("\n");

  const body = [
    "## Summary",
    "This draft PR records approved threshold proposal notes for review only.",
    "",
    "## Merge gates",
    "- [ ] Human engineer approval",
    "- [ ] Clinical reviewer approval",
    "- [ ] Follow-up implementation ticket confirmed before any runtime threshold change",
    "",
    "## Notes",
    "- This PR does not apply runtime threshold changes.",
    `- Proposal batch file: \`${filePath}\``,
    input.reviewCycleFilePath
      ? `- Review cycle record: \`${input.reviewCycleFilePath}\``
      : "",
    `- Approved proposals included: ${approvedProposals.length}`,
  ].join("\n");

  return {
    body,
    branchName,
    commitMessage,
    fileContent,
    filePath,
    title,
  };
}
