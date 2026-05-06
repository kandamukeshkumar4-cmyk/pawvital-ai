import fs from "node:fs";
import path from "node:path";

import { triageShadowPlannerEvalFailures } from "@/lib/clinical-intelligence/shadow-planner-eval-triage";
import {
  evaluateShadowPlannerScenarios,
  type ShadowPlannerEdgeCaseScenarioFixture,
  type ShadowPlannerExpectedOutcomeFixture,
  type ShadowPlannerExpectedOutcomeNormalizationFixture,
  type ShadowPlannerScenarioFixture,
} from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

type FailureClass =
  | "fixture_ambiguity"
  | "report_only_quality_gap"
  | "adapter_selection_gap"
  | "red_flag_coverage_gap"
  | "repeated_metric_setup_gap"
  | "generic_metric_setup_gap"
  | "planner_improvement_candidate";

type ProposedFixType =
  | "scoring_weight_adjustment"
  | "module_phase_priority_adjustment"
  | "question_card_metadata_adjustment"
  | "fixture_expectation_adjustment"
  | "adapter_trigger_adjustment";

type ProposalRow = {
  caseId: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  proposedFixType: ProposedFixType;
};

type AnnotationRow = {
  caseId: string;
  primaryFailureClass: FailureClass;
  secondaryFailureClasses: FailureClass[];
};

type IntendedRepeatedCandidateRow = {
  caseId: string;
  proposedFixType:
    | "scoring_weight_adjustment"
    | "module_phase_priority_adjustment";
  currentPlannedQuestionId: string;
  selectedComplaintModule: string;
  acceptableTargetQuestionIds: string[];
};

type ExcludedRepeatedCandidateRow = {
  caseId: string;
  redirectedFixType:
    | "fixture_expectation_adjustment"
    | "adapter_trigger_adjustment"
    | "question_card_metadata_adjustment";
};

type GlobalGuardrails = {
  repeatedQuestionEligibleCases: number;
  actualRepeatedQuestionFailureCount: number;
  actualRepeatedQuestionFailureCaseIds: string[];
  emergencyScreenAlignmentCount: number;
  emergencyScreenAlignmentRelevantCases: number;
  emergencyScreenAlignmentRate: number;
  safetyBlockerCount: number;
  reportOnlyRowsReclassifiedAsPlannerSuccesses: string[];
};

type GuardDocPayload = {
  intendedRepeatedCandidateRows: IntendedRepeatedCandidateRow[];
  excludedRepeatedCandidateRows: ExcludedRepeatedCandidateRow[];
  globalGuardrails: GlobalGuardrails;
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-1-guard-qwen.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const PROPOSAL_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-proposal-pack-kimi.md"
);
const PROPOSAL_DOC = fs.readFileSync(PROPOSAL_DOC_PATH, "utf8");
const FIXTURE_DIR = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "clinical-intelligence"
);

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

const PLANNER_OWNED_FIX_TYPES = new Set<ProposedFixType>([
  "scoring_weight_adjustment",
  "module_phase_priority_adjustment",
]);

const EXPECTED_GUARD_PAYLOAD: GuardDocPayload = {
  intendedRepeatedCandidateRows: [
    {
      caseId: "skin_itching_allergy_02_paws_belly_itching",
      proposedFixType: "module_phase_priority_adjustment",
      currentPlannedQuestionId: "emergency_global_screen",
      selectedComplaintModule: "skin_itching_allergy",
      acceptableTargetQuestionIds: [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
      ],
    },
    {
      caseId: "edge_trauma_repeat_bleeding_avoidance",
      proposedFixType: "scoring_weight_adjustment",
      currentPlannedQuestionId: "emergency_global_screen",
      selectedComplaintModule: "limping_mobility_pain",
      acceptableTargetQuestionIds: [
        "wound_characterization_check",
        "laceration_depth_check",
        "limping_weight_bearing",
        "limping_trauma_onset",
      ],
    },
  ],
  excludedRepeatedCandidateRows: [
    {
      caseId: "gi_vomiting_diarrhea_03_water_comes_back_up",
      redirectedFixType: "fixture_expectation_adjustment",
    },
    {
      caseId: "limping_mobility_pain_02_sudden_after_jump",
      redirectedFixType: "adapter_trigger_adjustment",
    },
    {
      caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
      redirectedFixType: "adapter_trigger_adjustment",
    },
    {
      caseId: "edge_skin_repeat_location_avoidance",
      redirectedFixType: "question_card_metadata_adjustment",
    },
  ],
  globalGuardrails: {
    repeatedQuestionEligibleCases: 6,
    actualRepeatedQuestionFailureCount: 0,
    actualRepeatedQuestionFailureCaseIds: [],
    emergencyScreenAlignmentCount: 39,
    emergencyScreenAlignmentRelevantCases: 39,
    emergencyScreenAlignmentRate: 1,
    safetyBlockerCount: 0,
    reportOnlyRowsReclassifiedAsPlannerSuccesses: [],
  },
};

function extractJsonBlock(rawDoc: string): unknown {
  const match = rawDoc.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block");
  }

  return JSON.parse(match[1]);
}

function extractProposalRows(): ProposalRow[] {
  return extractJsonBlock(PROPOSAL_DOC) as ProposalRow[];
}

function extractGuardPayload(): GuardDocPayload {
  return extractJsonBlock(DOC) as GuardDocPayload;
}

function readJsonFixture<T>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, fileName), "utf8")
  ) as T;
}

function loadAnnotations(): AnnotationRow[] {
  return readJsonFixture<AnnotationRow[]>(
    "shadow-eval-failure-annotations.json"
  );
}

function loadScenarioInputs() {
  return {
    scenarios: readJsonFixture<ShadowPlannerScenarioFixture[]>(
      "shadow-planner-scenarios.json"
    ),
    expectedOutcomes: readJsonFixture<ShadowPlannerExpectedOutcomeFixture[]>(
      "shadow-planner-expected-outcomes.json"
    ),
    edgeScenarios: readJsonFixture<ShadowPlannerEdgeCaseScenarioFixture[]>(
      "shadow-planner-edge-case-scenarios.json"
    ),
    normalizationRows:
      readJsonFixture<ShadowPlannerExpectedOutcomeNormalizationFixture[]>(
        "shadow-planner-expected-outcome-normalization.json"
      ),
  };
}

function buildEvalReport() {
  const { scenarios, expectedOutcomes, edgeScenarios, normalizationRows } =
    loadScenarioInputs();

  return evaluateShadowPlannerScenarios({
    scenarios,
    expectedOutcomes,
    edgeScenarios,
    normalizationRows,
  });
}

function buildIntendedRepeatedCandidateRows(): IntendedRepeatedCandidateRow[] {
  const proposalRows = extractProposalRows();
  const report = buildEvalReport();
  const failedCaseMap = new Map(
    report.summary.failedCases.map((failedCase) => [failedCase.caseId, failedCase])
  );

  return loadAnnotations()
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "planner_improvement_candidate" &&
        annotation.secondaryFailureClasses.includes("repeated_metric_setup_gap")
    )
    .flatMap((annotation) => {
      const proposalRow = proposalRows.find(
        (proposal) => proposal.caseId === annotation.caseId
      );

      if (
        !proposalRow ||
        !PLANNER_OWNED_FIX_TYPES.has(proposalRow.proposedFixType)
      ) {
        return [];
      }

      const failedCase = failedCaseMap.get(annotation.caseId);
      if (!failedCase || !failedCase.actual.complaintModuleId) {
        throw new Error(`Missing failed-case row for ${annotation.caseId}`);
      }

      return [
        {
          caseId: annotation.caseId,
          proposedFixType: proposalRow.proposedFixType,
          currentPlannedQuestionId: failedCase.actual.plannedQuestionId ?? "",
          selectedComplaintModule: failedCase.actual.complaintModuleId,
          acceptableTargetQuestionIds: [
            ...proposalRow.acceptableTargetQuestionIds,
          ],
        },
      ];
    });
}

function buildExcludedRepeatedCandidateRows(): ExcludedRepeatedCandidateRow[] {
  const proposalRows = extractProposalRows();
  const intendedIds = new Set(
    buildIntendedRepeatedCandidateRows().map((row) => row.caseId)
  );

  return loadAnnotations()
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "planner_improvement_candidate" &&
        annotation.secondaryFailureClasses.includes("repeated_metric_setup_gap") &&
        !intendedIds.has(annotation.caseId)
    )
    .map((annotation) => {
      const proposalRow = proposalRows.find(
        (proposal) => proposal.caseId === annotation.caseId
      );

      if (!proposalRow) {
        throw new Error(`Missing proposal row for ${annotation.caseId}`);
      }

      return {
        caseId: annotation.caseId,
        redirectedFixType: proposalRow.proposedFixType as ExcludedRepeatedCandidateRow["redirectedFixType"],
      };
    });
}

function buildGlobalGuardrails(): GlobalGuardrails {
  const report = buildEvalReport();
  const { scenarios, expectedOutcomes, edgeScenarios } = loadScenarioInputs();
  const triage = triageShadowPlannerEvalFailures({
    report,
    scenarios,
    expectedOutcomes,
    edgeCaseScenarios: edgeScenarios,
  });

  const actualRepeatedQuestionFailureCaseIds = report.summary.failedCases
    .filter(
      (failedCase) =>
        failedCase.repeatedQuestionMetricStatus ===
        "actual_repeated_question_failure"
    )
    .map((failedCase) => failedCase.caseId);
  const failedCaseIds = new Set(
    report.summary.failedCases.map((failedCase) => failedCase.caseId)
  );
  const reportOnlyRowsReclassifiedAsPlannerSuccesses = loadAnnotations()
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "report_only_quality_gap" &&
        !annotation.secondaryFailureClasses.includes("repeated_metric_setup_gap") &&
        !failedCaseIds.has(annotation.caseId)
    )
    .map((annotation) => annotation.caseId);

  return {
    repeatedQuestionEligibleCases: report.summary.repeatedQuestionEligibleCases,
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

describe("planner candidate fix slice 1 guard", () => {
  it("locks the repeated planner-owned slice rows and the explicit repeated exclusions", () => {
    expect(buildIntendedRepeatedCandidateRows()).toEqual(
      EXPECTED_GUARD_PAYLOAD.intendedRepeatedCandidateRows
    );
    expect(buildExcludedRepeatedCandidateRows()).toEqual(
      EXPECTED_GUARD_PAYLOAD.excludedRepeatedCandidateRows
    );
  });

  it("keeps repeated eligibility explicit, repeated failures flat, emergency alignment perfect, and safety blockers at zero", () => {
    expect(buildGlobalGuardrails()).toEqual(
      EXPECTED_GUARD_PAYLOAD.globalGuardrails
    );
  });

  it("keeps the doc aligned to the locked slice, excluded rows, and no-treatment boundary", () => {
    const payload = extractGuardPayload();

    expect(payload).toEqual(EXPECTED_GUARD_PAYLOAD);
    expect(DOC).toContain("Validation-only guard.");
    expect(DOC).toContain("No runtime files touched.");
    expect(DOC).toContain("The planner-owned repeated-question slice currently contains exactly `2` rows:");
    expect(DOC).toContain("The other repeated planner-candidate rows are intentionally outside slice 1:");
    expect(DOC).toContain("`repeatedQuestionEligibleCases`: `6`");
    expect(DOC).toContain("`actual_repeated_question_failure`: `0`");
    expect(DOC).toContain("emergency alignment: `39/39 = 100%`");
    expect(DOC).toContain("safety blockers: `0`");
    expect(DOC).toContain(
      "non-repeated report-only rows reclassified as planner successes: `0`"
    );

    for (const row of EXPECTED_GUARD_PAYLOAD.intendedRepeatedCandidateRows) {
      expect(DOC).toContain(`\`${row.caseId}\``);
      expect(DOC).toContain(`\`${row.proposedFixType}\``);
    }

    for (const row of EXPECTED_GUARD_PAYLOAD.excludedRepeatedCandidateRows) {
      expect(DOC).toContain(`\`${row.caseId}\``);
      expect(DOC).toContain(`\`${row.redirectedFixType}\``);
    }

    for (const caseId of EXPECTED_GUARD_PAYLOAD.globalGuardrails.actualRepeatedQuestionFailureCaseIds) {
      expect(DOC).toContain(`\`${caseId}\``);
    }

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(DOC).not.toMatch(pattern);
    }
  });
});
