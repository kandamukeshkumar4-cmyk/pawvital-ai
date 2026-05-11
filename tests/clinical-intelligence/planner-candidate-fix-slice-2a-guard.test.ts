import fs from "node:fs";
import path from "node:path";

import annotations from "../fixtures/clinical-intelligence/shadow-eval-failure-annotations.json";
import edgeCases from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import normalizationRows from "../fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json";
import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { triageShadowPlannerEvalFailures } from "@/lib/clinical-intelligence/shadow-planner-eval-triage";
import {
  evaluateShadowPlannerScenarios,
  type ShadowPlannerEdgeCaseScenarioFixture,
  type ShadowPlannerExpectedOutcomeFixture,
  type ShadowPlannerExpectedOutcomeNormalizationFixture,
  type ShadowPlannerScenarioEvalCaseResult,
  type ShadowPlannerScenarioFixture,
} from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

type RecommendedFixOwner =
  | "fixture"
  | "adapter_trigger"
  | "planner_scoring"
  | "module_phase_priority"
  | "question_card_metadata";

type RegressionRisk = "low" | "medium" | "high";

type ProposalRow = {
  caseId: string;
  selectedComplaintModule: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  recommendedFixOwner: RecommendedFixOwner;
  regressionRisk: RegressionRisk;
};

type PrimaryFailureClass =
  | "fixture_ambiguity"
  | "report_only_quality_gap"
  | "adapter_selection_gap"
  | "red_flag_coverage_gap"
  | "repeated_metric_setup_gap"
  | "generic_metric_setup_gap"
  | "planner_improvement_candidate";

type AnnotationRow = {
  caseId: string;
  primaryFailureClass: PrimaryFailureClass;
};

type IntendedSliceCaseRow = {
  caseId: string;
  recommendedFixOwner:
    | "adapter_trigger"
    | "planner_scoring"
    | "module_phase_priority";
  selectedComplaintModule: string;
  acceptableTargetQuestionIds: string[];
  expectedOutcome:
    | "passed_on_accepted_non_generic_question"
    | "red_flag_coverage_gap_after_generic_avoidance";
  remainingMissingRedFlags: string[];
  expectedPlannedQuestionId?: string;
};

type ExcludedGenericCandidateRow = {
  caseId: string;
  recommendedFixOwner: RecommendedFixOwner;
  regressionRisk: RegressionRisk;
  currentPlannedQuestionId: string;
};

type GlobalGuardrails = {
  genericQuestionEligibleCases: number;
  genericQuestionAvoidanceCount: number;
  genericQuestionAvoidanceCaseIds: string[];
  repeatedQuestionEligibleCases: number;
  repeatedQuestionAvoidanceCount: number;
  repeatedQuestionAvoidanceRate: number;
  actualRepeatedQuestionFailureCount: number;
  actualRepeatedQuestionFailureCaseIds: string[];
  emergencyScreenAlignmentCount: number;
  emergencyScreenAlignmentRelevantCases: number;
  emergencyScreenAlignmentRate: number;
  safetyBlockerCount: number;
  reportOnlyRowsReclassifiedAsPlannerSuccesses: string[];
};

type GuardDocPayload = {
  intendedSliceCaseRows: IntendedSliceCaseRow[];
  excludedGenericCandidateRows: ExcludedGenericCandidateRow[];
  globalGuardrails: GlobalGuardrails;
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2a-guard-qwen.md"
);
const PROPOSAL_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2-proposal-kimi.md"
);
const PROPOSAL_DOC = fs.readFileSync(PROPOSAL_DOC_PATH, "utf8");

const TARGET_CASE_IDS = [
  "skin_itching_allergy_02_paws_belly_itching",
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
  "edge_trauma_small_scrape_vs_steady_bleed",
] as const;

const EXCLUDED_CASE_IDS = [
  "gi_vomiting_diarrhea_03_water_comes_back_up",
  "edge_limping_not_sure_pain_or_weakness",
  "edge_multi_diarrhea_limping_cut",
] as const;

const OWNER_FACING_CLAIM_PATTERNS = [
  /\bdiagnos(?:e|is|ed|ing)\b/i,
  /\btreat(?:ment|ed|ing|s)?\b/i,
  /\bcure(?:d|s)?\b/i,
  /\bprescri(?:be|bed|ption)\b/i,
  /\bantibiotic\b/i,
  /\bsteroid\b/i,
  /\bsurgery\b/i,
  /\bdos(?:e|age)\b/i,
];

const EXPECTED_GUARD_PAYLOAD: GuardDocPayload = {
  intendedSliceCaseRows: [
    {
      caseId: "skin_itching_allergy_02_paws_belly_itching",
      recommendedFixOwner: "module_phase_priority",
      selectedComplaintModule: "skin_itching_allergy",
      acceptableTargetQuestionIds: [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
      ],
      expectedOutcome: "passed_on_accepted_non_generic_question",
      remainingMissingRedFlags: [],
    },
    {
      caseId: "limping_mobility_pain_02_sudden_after_jump",
      recommendedFixOwner: "adapter_trigger",
      selectedComplaintModule: "limping_mobility_pain",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "trauma_mechanism_check",
      ],
      expectedOutcome: "red_flag_coverage_gap_after_generic_avoidance",
      remainingMissingRedFlags: ["post_trauma_lameness"],
      expectedPlannedQuestionId: "limping_weight_bearing",
    },
    {
      caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
      recommendedFixOwner: "adapter_trigger",
      selectedComplaintModule: "limping_mobility_pain",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check",
      ],
      expectedOutcome: "red_flag_coverage_gap_after_generic_avoidance",
      remainingMissingRedFlags: [
        "post_trauma_lameness",
        "non_weight_bearing",
      ],
      expectedPlannedQuestionId: "bleeding_volume_check",
    },
    {
      caseId: "edge_trauma_small_scrape_vs_steady_bleed",
      recommendedFixOwner: "planner_scoring",
      selectedComplaintModule: "trauma_bleeding_wound",
      acceptableTargetQuestionIds: [
        "bleeding_volume_check",
        "wound_characterization_check",
        "laceration_depth_check",
        "trauma_mechanism_check",
      ],
      expectedOutcome: "passed_on_accepted_non_generic_question",
      remainingMissingRedFlags: [],
    },
  ],
  excludedGenericCandidateRows: [
    {
      caseId: "gi_vomiting_diarrhea_03_water_comes_back_up",
      recommendedFixOwner: "fixture",
      regressionRisk: "low",
      currentPlannedQuestionId: "emergency_global_screen",
    },
    {
      caseId: "edge_limping_not_sure_pain_or_weakness",
      recommendedFixOwner: "module_phase_priority",
      regressionRisk: "high",
      currentPlannedQuestionId: "emergency_global_screen",
    },
    {
      caseId: "edge_multi_diarrhea_limping_cut",
      recommendedFixOwner: "planner_scoring",
      regressionRisk: "high",
      currentPlannedQuestionId: "emergency_global_screen",
    },
  ],
  globalGuardrails: {
    genericQuestionEligibleCases: 11,
    genericQuestionAvoidanceCount: 4,
    genericQuestionAvoidanceCaseIds: [...TARGET_CASE_IDS],
    repeatedQuestionEligibleCases: 6,
    repeatedQuestionAvoidanceCount: 6,
    repeatedQuestionAvoidanceRate: 1,
    actualRepeatedQuestionFailureCount: 0,
    actualRepeatedQuestionFailureCaseIds: [],
    emergencyScreenAlignmentCount: 39,
    emergencyScreenAlignmentRelevantCases: 39,
    emergencyScreenAlignmentRate: 1,
    safetyBlockerCount: 0,
    reportOnlyRowsReclassifiedAsPlannerSuccesses: [],
  },
};

function extractJsonBlock<T>(rawDoc: string): T {
  const match = rawDoc.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block");
  }

  return JSON.parse(match[1]) as T;
}

function readGuardDoc(): string {
  if (!fs.existsSync(DOC_PATH)) {
    throw new Error(`Missing guard doc at ${DOC_PATH}`);
  }

  return fs.readFileSync(DOC_PATH, "utf8");
}

function extractProposalRows(): ProposalRow[] {
  return extractJsonBlock<ProposalRow[]>(PROPOSAL_DOC);
}

function extractGuardPayload(): GuardDocPayload {
  return extractJsonBlock<GuardDocPayload>(readGuardDoc());
}

function buildEvalReport() {
  return evaluateShadowPlannerScenarios({
    scenarios: scenarios as ShadowPlannerScenarioFixture[],
    expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
    edgeScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    normalizationRows:
      normalizationRows as ShadowPlannerExpectedOutcomeNormalizationFixture[],
  });
}

function buildExcludedGenericCandidateRows(): ExcludedGenericCandidateRow[] {
  const targetIds = new Set<string>(TARGET_CASE_IDS);

  return extractProposalRows()
    .filter((row) => !targetIds.has(row.caseId))
    .map((row) => ({
      caseId: row.caseId,
      recommendedFixOwner: row.recommendedFixOwner,
      regressionRisk: row.regressionRisk,
      currentPlannedQuestionId: row.currentPlannedQuestionId,
    }));
}

function buildGlobalGuardrails(): GlobalGuardrails {
  const report = buildEvalReport();
  const triage = triageShadowPlannerEvalFailures({
    report,
    scenarios: scenarios as ShadowPlannerScenarioFixture[],
    expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
    edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
  });
  const failedCaseIds = new Set(
    report.summary.failedCases.map((failedCase) => failedCase.caseId)
  );
  const targetCaseOrder = new Map(
    TARGET_CASE_IDS.map((caseId, index) => [caseId, index])
  );
  const genericQuestionAvoidanceCaseIds = report.caseResults
    .filter(
      (caseResult) =>
        caseResult.expected.shouldBeatGenericQuestion &&
        caseResult.genericQuestionMetricStatus !== "no_metric_setup" &&
        caseResult.genericQuestionAvoided
    )
    .map((caseResult) => caseResult.caseId)
    .sort(
      (left, right) =>
        (targetCaseOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (targetCaseOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
    );
  const actualRepeatedQuestionFailureCaseIds = report.summary.failedCases
    .filter(
      (failedCase) =>
        failedCase.repeatedQuestionMetricStatus ===
        "actual_repeated_question_failure"
    )
    .map((failedCase) => failedCase.caseId)
    .sort();
  const reportOnlyRowsReclassifiedAsPlannerSuccesses = (
    annotations as AnnotationRow[]
  )
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "report_only_quality_gap" &&
        !failedCaseIds.has(annotation.caseId)
    )
    .map((annotation) => annotation.caseId)
    .sort();

  return {
    genericQuestionEligibleCases: report.summary.genericQuestionEligibleCases,
    genericQuestionAvoidanceCount: report.summary.genericQuestionAvoidanceCount,
    genericQuestionAvoidanceCaseIds,
    repeatedQuestionEligibleCases: report.summary.repeatedQuestionEligibleCases,
    repeatedQuestionAvoidanceCount: report.summary.repeatedQuestionAvoidanceCount,
    repeatedQuestionAvoidanceRate: report.summary.repeatedQuestionAvoidanceRate,
    actualRepeatedQuestionFailureCount:
      actualRepeatedQuestionFailureCaseIds.length,
    actualRepeatedQuestionFailureCaseIds,
    emergencyScreenAlignmentCount: report.summary.emergencyScreenAlignmentCount,
    emergencyScreenAlignmentRelevantCases:
      report.summary.emergencyScreenAlignmentRelevantCases,
    emergencyScreenAlignmentRate: report.summary.emergencyScreenAlignmentRate,
    safetyBlockerCount: triage.safetyBlockers.length,
    reportOnlyRowsReclassifiedAsPlannerSuccesses,
  };
}

function getCaseResult(caseId: string): ShadowPlannerScenarioEvalCaseResult {
  const report = buildEvalReport();
  const caseResult = report.caseResults.find((result) => result.caseId === caseId);

  if (!caseResult) {
    throw new Error(`Missing eval case result for ${caseId}`);
  }

  return caseResult;
}

describe("planner candidate fix slice 2A guard", () => {
  it("locks the exact four medium-risk slice rows and the three explicit non-slice proposal rows", () => {
    const proposalRows = extractProposalRows();

    expect(
      proposalRows
        .filter((row) => TARGET_CASE_IDS.includes(row.caseId as (typeof TARGET_CASE_IDS)[number]))
        .map((row) => row.caseId)
    ).toEqual(TARGET_CASE_IDS);

    for (const expectedRow of EXPECTED_GUARD_PAYLOAD.intendedSliceCaseRows) {
      const proposalRow = proposalRows.find(
        (row) => row.caseId === expectedRow.caseId
      );

      expect(proposalRow).toBeDefined();
      expect(proposalRow?.recommendedFixOwner).toBe(
        expectedRow.recommendedFixOwner
      );
      expect(proposalRow?.selectedComplaintModule).toBe(
        expectedRow.selectedComplaintModule
      );
      expect(proposalRow?.acceptableTargetQuestionIds).toEqual(
        expectedRow.acceptableTargetQuestionIds
      );
      expect(proposalRow?.regressionRisk).toBe("medium");
    }

    expect(buildExcludedGenericCandidateRows()).toEqual(
      EXPECTED_GUARD_PAYLOAD.excludedGenericCandidateRows
    );
  });

  it("keeps slice-2A as the only setup-aware generic-avoidance gain without emergency, repeated, or report-only regressions", () => {
    const report = buildEvalReport();
    const failedCaseIds = new Set(
      report.summary.failedCases.map((failedCase) => failedCase.caseId)
    );

    expect(buildGlobalGuardrails()).toEqual(
      EXPECTED_GUARD_PAYLOAD.globalGuardrails
    );

    for (const expectedRow of EXPECTED_GUARD_PAYLOAD.intendedSliceCaseRows) {
      const caseResult = getCaseResult(expectedRow.caseId);

      expect(caseResult.actual.complaintModuleId).toBe(
        expectedRow.selectedComplaintModule
      );
      expect(expectedRow.acceptableTargetQuestionIds).toContain(
        caseResult.actual.plannedQuestionId ?? ""
      );
      expect(caseResult.actual.plannedQuestionId).not.toBe(
        "emergency_global_screen"
      );
      expect(caseResult.acceptableQuestionMatched).toBe(true);
      expect(caseResult.genericQuestionAvoided).toBe(true);
      expect(caseResult.repeatedQuestionAvoided).toBe(true);
      expect(caseResult.emergencyScreenAligned).toBe(true);
      expect(caseResult.missingRequiredRedFlags).toEqual(
        expectedRow.remainingMissingRedFlags
      );

      if (expectedRow.expectedPlannedQuestionId) {
        expect(caseResult.actual.plannedQuestionId).toBe(
          expectedRow.expectedPlannedQuestionId
        );
      }

      if (
        expectedRow.expectedOutcome ===
        "passed_on_accepted_non_generic_question"
      ) {
        expect(failedCaseIds.has(expectedRow.caseId)).toBe(false);
        expect(caseResult.failures).toEqual([]);
      } else {
        expect(failedCaseIds.has(expectedRow.caseId)).toBe(true);
        expect(caseResult.failures).toEqual(
          expect.arrayContaining([
            expect.stringContaining("Missing required screened red flags"),
          ])
        );
      }
    }

    for (const excludedRow of EXPECTED_GUARD_PAYLOAD.excludedGenericCandidateRows) {
      const caseResult = getCaseResult(excludedRow.caseId);

      expect(caseResult.actual.plannedQuestionId).toBe(
        excludedRow.currentPlannedQuestionId
      );
      expect(caseResult.genericQuestionAvoided).toBe(false);
      expect(failedCaseIds.has(excludedRow.caseId)).toBe(true);
    }
  });

  it("keeps the guard doc aligned to the locked slice boundary and the validation-only scope", () => {
    const doc = readGuardDoc();
    const payload = extractGuardPayload();

    expect(payload).toEqual(EXPECTED_GUARD_PAYLOAD);
    expect(doc).toContain("Validation-only guard.");
    expect(doc).toContain("No runtime files touched.");
    expect(doc).toContain(
      "The medium-risk generic-avoidance slice currently contains exactly `4` rows:"
    );
    expect(doc).toContain("The other non-repeated generic candidates stay outside slice 2A:");
    expect(doc).toContain("`genericQuestionEligibleCases`: `11`");
    expect(doc).toContain("`genericQuestionAvoidanceCount`: `4`");
    expect(doc).toContain("`actual_repeated_question_failure`: `0`");
    expect(doc).toContain("emergency alignment: `39/39 = 100%`");
    expect(doc).toContain("safety blockers: `0`");
    expect(doc).toContain(
      "report-only rows reclassified as planner successes: `0`"
    );

    for (const row of EXPECTED_GUARD_PAYLOAD.intendedSliceCaseRows) {
      expect(doc).toContain(`\`${row.caseId}\``);
      expect(doc).toContain(`\`${row.recommendedFixOwner}\``);
    }

    for (const row of EXPECTED_GUARD_PAYLOAD.excludedGenericCandidateRows) {
      expect(doc).toContain(`\`${row.caseId}\``);
      expect(doc).toContain(`\`${row.recommendedFixOwner}\``);
      expect(doc).toContain(`\`${row.regressionRisk}\``);
    }

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(doc).not.toMatch(pattern);
    }
  });
});
