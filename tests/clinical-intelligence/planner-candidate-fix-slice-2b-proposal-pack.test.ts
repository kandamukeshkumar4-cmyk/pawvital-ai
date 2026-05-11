import fs from "node:fs";
import path from "node:path";

import annotations from "../fixtures/clinical-intelligence/shadow-eval-failure-annotations.json";
import edgeCases from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import normalizationRows from "../fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json";
import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import {
  evaluateShadowPlannerScenarios,
  type ShadowPlannerEdgeCaseScenarioFixture,
  type ShadowPlannerExpectedOutcomeFixture,
  type ShadowPlannerExpectedOutcomeNormalizationFixture,
  type ShadowPlannerScenarioEvalCaseResult,
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

type RegressionRisk = "low" | "medium" | "high";

type SelectedBecause =
  | "emergency_screen"
  | "highest_information_gain"
  | "urgency_changing"
  | "report_value"
  | "clarification";

type RemainingFixLane =
  | "fixture_only"
  | "phase_priority"
  | "mixed_symptom_planner_scoring";

type ResidualStatus = "accepted_non_generic_question_but_red_flag_gap";

type EdgeCaseCoverageBucketName =
  | "fixture_only"
  | "module_phase_priority"
  | "high_risk_mixed_symptom"
  | "residual_after_slice_2a";

type AnnotationRow = {
  caseId: string;
  primaryFailureClass: FailureClass;
  secondaryFailureClasses: FailureClass[];
  safetyImpact: "none" | "monitor" | "blocker";
};

type PriorProposalRow = {
  caseId: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  proposedFixType:
    | "scoring_weight_adjustment"
    | "module_phase_priority_adjustment"
    | "question_card_metadata_adjustment"
    | "fixture_expectation_adjustment"
    | "adapter_trigger_adjustment";
  riskLevel: RegressionRisk;
};

type SliceTwoAGuardPayload = {
  intendedSliceCaseRows: Array<{
    caseId: string;
    expectedOutcome:
      | "passed_on_accepted_non_generic_question"
      | "red_flag_coverage_gap_after_generic_avoidance";
    remainingMissingRedFlags: string[];
  }>;
  excludedGenericCandidateRows: Array<{
    caseId: string;
    recommendedFixOwner:
      | "fixture"
      | "adapter_trigger"
      | "planner_scoring"
      | "module_phase_priority";
  }>;
  globalGuardrails: {
    genericQuestionEligibleCases: number;
    genericQuestionAvoidanceCount: number;
    repeatedQuestionEligibleCases: number;
    repeatedQuestionAvoidanceCount: number;
    repeatedQuestionAvoidanceRate: number;
    emergencyScreenAlignmentCount: number;
    emergencyScreenAlignmentRelevantCases: number;
    emergencyScreenAlignmentRate: number;
  };
};

type RemainingPlannerCandidateRow = {
  caseId: string;
  recommendedFixLane: RemainingFixLane;
  regressionRisk: RegressionRisk;
  selectedComplaintModule: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  blockingFailureClasses: FailureClass[];
  minimalFutureScope: string[];
  followUpBoundary: string;
};

type ResidualSlice2ARow = {
  caseId: string;
  priorSlice2AFixOwner: "adapter_trigger";
  regressionRisk: "medium";
  selectedComplaintModule: string;
  currentPlannedQuestionId: string;
  currentSelectedBecause: SelectedBecause;
  acceptableTargetQuestionIds: string[];
  missingRequiredRedFlags: string[];
  residualStatus: ResidualStatus;
  residualBoundary: string;
};

type EdgeCaseCoverageBucket = {
  bucket: EdgeCaseCoverageBucketName;
  caseIds: string[];
  edgeCaseRisk: RegressionRisk;
  asserts: string[];
};

type ProposalPackPayload = {
  remainingPlannerCandidateRows: RemainingPlannerCandidateRow[];
  residualSlice2ARows: ResidualSlice2ARow[];
  laneSummary: {
    remainingPlannerCandidateCaseIds: string[];
    residualSlice2ACaseIds: string[];
    excludedRepeatedContextCaseIds: string[];
    passedSlice2ACaseIds: string[];
    fixtureOnlyCaseIds: string[];
    plannerScoringCaseIds: string[];
    phasePriorityCaseIds: string[];
    mixedSymptomRiskCaseIds: string[];
    adapterTriggerCaseIds: string[];
  };
  edgeCaseCoverage: {
    coverageSummary: string;
    edgeCaseBuckets: EdgeCaseCoverageBucket[];
    excludedAsSeparateWork: string[];
  };
  telemetryHygiene: {
    containsRuntimeTelemetry: boolean;
    containsOwnerTelemetry: boolean;
    containsProductionUserData: boolean;
    containsSecretsOrEnvValues: boolean;
    containsDeploymentIdentifiers: boolean;
    allowedEvidence: string[];
  };
  globalGuardrails: {
    plannerImprovementCandidateCount: number;
    remainingSlice2BCaseCount: number;
    remainingHigherRiskPlannerCandidateCount: number;
    residualAfterSlice2ACount: number;
    excludedRepeatedContextCandidateCount: number;
    genericQuestionEligibleCases: number;
    genericQuestionAvoidanceCount: number;
    repeatedQuestionEligibleCases: number;
    repeatedQuestionAvoidanceCount: number;
    repeatedQuestionAvoidanceRate: number;
    emergencyScreenAlignmentCount: number;
    emergencyScreenAlignmentRelevantCases: number;
    emergencyScreenAlignmentRate: number;
    rawFailedCaseCount: number;
    normalizedFailedCaseCount: number;
  };
  requiredValidationCommands: string[];
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2b-proposal-kimi.md"
);
const PRIOR_SLICE_TWO_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2-proposal-kimi.md"
);
const SLICE_TWO_A_GUARD_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2a-guard-qwen.md"
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

const TELEMETRY_EXPOSURE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._-]+/i,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^"'\s]+/i,
  /\b(?:owner|user|patient)[_-]?(?:email|phone|address|ip|id)\s*[:=]\s*["']?[^"'\s]+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:[A-Fa-f0-9]{32,}|eyJ[A-Za-z0-9_-]{20,})\b/,
];

const REMAINING_CASE_IDS = [
  "edge_limping_not_sure_pain_or_weakness",
  "edge_multi_diarrhea_limping_cut",
] as const;

const RESIDUAL_CASE_IDS = [
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
] as const;

const EXCLUDED_REPEATED_CONTEXT_CASE_IDS = [
  "edge_trauma_repeat_bleeding_avoidance",
  "edge_skin_repeat_location_avoidance",
] as const;

const PASSED_SLICE_TWO_A_CASE_IDS = [
  "skin_itching_allergy_02_paws_belly_itching",
  "edge_trauma_small_scrape_vs_steady_bleed",
] as const;

const REQUIRED_VALIDATION_COMMANDS = [
  "npm test -- --runTestsByPath tests/clinical-intelligence/planner-candidate-fix-slice-2b-proposal-pack.test.ts",
  "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
  "node scripts/eval-shadow-planner-scenarios.ts --json",
  "npm run build",
] as const;

const EXPECTED_PAYLOAD: ProposalPackPayload = {
  remainingPlannerCandidateRows: [
    {
      caseId: "edge_limping_not_sure_pain_or_weakness",
      recommendedFixLane: "phase_priority",
      regressionRisk: "high",
      selectedComplaintModule: "collapse_weakness",
      currentPlannedQuestionId: "emergency_global_screen",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "collapse_weakness_check",
        "limping_trauma_onset",
        "gum_color_check",
      ],
      blockingFailureClasses: [
        "generic_metric_setup_gap",
        "red_flag_coverage_gap",
        "fixture_ambiguity",
      ],
      minimalFutureScope: [
        "src/lib/clinical-intelligence/next-question-planner.ts",
        "src/lib/clinical-intelligence/complaint-modules/limping.ts",
        "src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts",
      ],
      followUpBoundary:
        "Keep this in a phase-priority ambiguity lane between limping and weakness cards; do not bundle it with broad mixed-symptom scoring.",
    },
    {
      caseId: "edge_multi_diarrhea_limping_cut",
      recommendedFixLane: "mixed_symptom_planner_scoring",
      regressionRisk: "high",
      selectedComplaintModule: "gi_vomiting_diarrhea",
      currentPlannedQuestionId: "emergency_global_screen",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check",
        "gi_blood_check",
      ],
      blockingFailureClasses: [
        "generic_metric_setup_gap",
        "red_flag_coverage_gap",
        "fixture_ambiguity",
      ],
      minimalFutureScope: [
        "src/lib/clinical-intelligence/next-question-planner.ts",
      ],
      followUpBoundary:
        "Keep this as the only high-risk mixed-symptom scoring lane; do not merge it with single-lane scoring or trigger follow-ups.",
    },
  ],
  residualSlice2ARows: [
    {
      caseId: "limping_mobility_pain_02_sudden_after_jump",
      priorSlice2AFixOwner: "adapter_trigger",
      regressionRisk: "medium",
      selectedComplaintModule: "limping_mobility_pain",
      currentPlannedQuestionId: "limping_weight_bearing",
      currentSelectedBecause: "highest_information_gain",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "trauma_mechanism_check",
      ],
      missingRequiredRedFlags: ["post_trauma_lameness"],
      residualStatus: "accepted_non_generic_question_but_red_flag_gap",
      residualBoundary:
        "Keep this out of a new generic-avoidance planner slice; the remaining work is red-flag coverage on an already accepted limping lane.",
    },
    {
      caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
      priorSlice2AFixOwner: "adapter_trigger",
      regressionRisk: "medium",
      selectedComplaintModule: "limping_mobility_pain",
      currentPlannedQuestionId: "bleeding_volume_check",
      currentSelectedBecause: "emergency_screen",
      acceptableTargetQuestionIds: [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check",
      ],
      missingRequiredRedFlags: [
        "post_trauma_lameness",
        "non_weight_bearing",
      ],
      residualStatus: "accepted_non_generic_question_but_red_flag_gap",
      residualBoundary:
        "Keep this out of a new generic-avoidance planner slice; the remaining work is red-flag coverage after the accepted wound-or-limping move.",
    },
  ],
  laneSummary: {
    remainingPlannerCandidateCaseIds: [...REMAINING_CASE_IDS],
    residualSlice2ACaseIds: [...RESIDUAL_CASE_IDS],
    excludedRepeatedContextCaseIds: [...EXCLUDED_REPEATED_CONTEXT_CASE_IDS],
    passedSlice2ACaseIds: [...PASSED_SLICE_TWO_A_CASE_IDS],
    fixtureOnlyCaseIds: [],
    plannerScoringCaseIds: [],
    phasePriorityCaseIds: ["edge_limping_not_sure_pain_or_weakness"],
    mixedSymptomRiskCaseIds: ["edge_multi_diarrhea_limping_cut"],
    adapterTriggerCaseIds: [],
  },
  edgeCaseCoverage: {
    coverageSummary:
      "Covers all four remaining non-repeated post-Slice-2A planner candidates after fixture normalization and excludes only the two repeated-context rows assigned to a separate avoidance lane.",
    edgeCaseBuckets: [
      {
        bucket: "module_phase_priority",
        caseIds: ["edge_limping_not_sure_pain_or_weakness"],
        edgeCaseRisk: "high",
        asserts: [
          "limping versus collapse weakness ambiguity",
          "current emergency_global_screen selection",
          "phase-priority future scope",
        ],
      },
      {
        bucket: "high_risk_mixed_symptom",
        caseIds: ["edge_multi_diarrhea_limping_cut"],
        edgeCaseRisk: "high",
        asserts: [
          "mixed GI, limping, wound, and bleeding signals",
          "current emergency_global_screen selection",
          "planner-scoring future scope kept separate",
        ],
      },
      {
        bucket: "residual_after_slice_2a",
        caseIds: [...RESIDUAL_CASE_IDS],
        edgeCaseRisk: "medium",
        asserts: [
          "accepted non-generic question already selected",
          "generic avoidance already satisfied",
          "remaining red-flag coverage gap only",
        ],
      },
    ],
    excludedAsSeparateWork: [...EXCLUDED_REPEATED_CONTEXT_CASE_IDS],
  },
  telemetryHygiene: {
    containsRuntimeTelemetry: false,
    containsOwnerTelemetry: false,
    containsProductionUserData: false,
    containsSecretsOrEnvValues: false,
    containsDeploymentIdentifiers: false,
    allowedEvidence: [
      "fixture case IDs",
      "expected question IDs",
      "selected module IDs",
      "failure-class labels",
      "aggregate eval counters",
    ],
  },
  globalGuardrails: {
    plannerImprovementCandidateCount: 6,
    remainingSlice2BCaseCount: 4,
    remainingHigherRiskPlannerCandidateCount: 2,
    residualAfterSlice2ACount: 2,
    excludedRepeatedContextCandidateCount: 2,
    genericQuestionEligibleCases: 10,
    genericQuestionAvoidanceCount: 4,
    repeatedQuestionEligibleCases: 6,
    repeatedQuestionAvoidanceCount: 6,
    repeatedQuestionAvoidanceRate: 1,
    emergencyScreenAlignmentCount: 40,
    emergencyScreenAlignmentRelevantCases: 40,
    emergencyScreenAlignmentRate: 1,
    rawFailedCaseCount: 54,
    normalizedFailedCaseCount: 53,
  },
  requiredValidationCommands: [...REQUIRED_VALIDATION_COMMANDS],
};

function extractJsonBlock<T>(rawDoc: string): T {
  const match = rawDoc.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block");
  }

  return JSON.parse(match[1]) as T;
}

function readDoc(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
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

function getCaseResult(caseId: string): ShadowPlannerScenarioEvalCaseResult {
  const caseResult = buildEvalReport().caseResults.find(
    (result) => result.caseId === caseId
  );

  if (!caseResult) {
    throw new Error(`Missing eval case result for ${caseId}`);
  }

  return caseResult;
}

function getAnnotation(caseId: string): AnnotationRow {
  const row = (annotations as AnnotationRow[]).find(
    (annotation) => annotation.caseId === caseId
  );

  if (!row) {
    throw new Error(`Missing annotation row for ${caseId}`);
  }

  return row;
}

describe("planner candidate fix slice 2B proposal pack", () => {
  it("locks the exact post-VET-1462C slice boundary: three higher-risk planner rows plus two residual slice-2A rows", () => {
    const doc = readDoc(DOC_PATH);
    const payload = extractJsonBlock<ProposalPackPayload>(doc);
    const priorSliceTwoRows =
      extractJsonBlock<PriorProposalRow[]>(readDoc(PRIOR_SLICE_TWO_DOC_PATH));
    const sliceTwoAGuard =
      extractJsonBlock<SliceTwoAGuardPayload>(readDoc(SLICE_TWO_A_GUARD_DOC_PATH));

    expect(payload.remainingPlannerCandidateRows.map((row) => row.caseId)).toEqual(
      REMAINING_CASE_IDS
    );
    expect(payload.residualSlice2ARows.map((row) => row.caseId)).toEqual(
      RESIDUAL_CASE_IDS
    );
    expect(payload.laneSummary).toEqual(EXPECTED_PAYLOAD.laneSummary);

    expect(
      payload.remainingPlannerCandidateRows
        .concat(payload.residualSlice2ARows)
        .map((row) => row.caseId)
    ).toEqual([
      ...REMAINING_CASE_IDS,
      ...RESIDUAL_CASE_IDS,
    ]);

    expect(
      priorSliceTwoRows
        .filter((row) =>
          [
            ...REMAINING_CASE_IDS,
            ...RESIDUAL_CASE_IDS,
          ].includes(
            row.caseId as
              | (typeof REMAINING_CASE_IDS)[number]
              | (typeof RESIDUAL_CASE_IDS)[number]
          )
        )
        .map((row) => row.caseId)
    ).toEqual([
      "limping_mobility_pain_02_sudden_after_jump",
      "limping_mobility_pain_03_limping_with_wound_confuser",
      "edge_limping_not_sure_pain_or_weakness",
      "edge_multi_diarrhea_limping_cut",
    ]);

    expect(
      sliceTwoAGuard.excludedGenericCandidateRows.map((row) => row.caseId)
    ).toEqual(REMAINING_CASE_IDS);
    expect(
      sliceTwoAGuard.intendedSliceCaseRows
        .filter(
          (row) =>
            row.expectedOutcome ===
            "red_flag_coverage_gap_after_generic_avoidance"
        )
        .map((row) => row.caseId)
    ).toEqual(RESIDUAL_CASE_IDS);
  });

  it("matches the live failure-annotation and eval state for every slice-2B case", () => {
    const doc = readDoc(DOC_PATH);
    const payload = extractJsonBlock<ProposalPackPayload>(doc);
    const report = buildEvalReport();

    expect(
      (annotations as AnnotationRow[]).filter(
        (row) => row.primaryFailureClass === "planner_improvement_candidate"
      )
    ).toHaveLength(EXPECTED_PAYLOAD.globalGuardrails.plannerImprovementCandidateCount);

    expect(report.summary.rawFailedCaseCount).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.rawFailedCaseCount
    );
    expect(report.summary.normalizedFailedCaseCount).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.normalizedFailedCaseCount
    );

    for (const row of payload.remainingPlannerCandidateRows) {
      const caseResult = getCaseResult(row.caseId);
      const annotation = getAnnotation(row.caseId);

      expect(caseResult.actual.complaintModuleId).toBe(row.selectedComplaintModule);
      expect(caseResult.actual.plannedQuestionId).toBe(row.currentPlannedQuestionId);
      expect(caseResult.actual.plannedQuestionId).toBe("emergency_global_screen");
      expect(caseResult.acceptableQuestionMatched).toBe(false);
      expect(caseResult.genericQuestionAvoided).toBe(false);
      expect(caseResult.missingRequiredRedFlags.length).toBeGreaterThan(0);
      expect(annotation.primaryFailureClass).toBe(
        "planner_improvement_candidate"
      );
      expect(annotation.secondaryFailureClasses).toEqual(
        row.blockingFailureClasses
      );
      expect(annotation.safetyImpact).toBe("monitor");
      expect(row.acceptableTargetQuestionIds).toEqual(
        caseResult.expected.acceptableQuestionIds
      );
    }

    for (const row of payload.residualSlice2ARows) {
      const caseResult = getCaseResult(row.caseId);
      const annotation = getAnnotation(row.caseId);

      expect(caseResult.actual.complaintModuleId).toBe(row.selectedComplaintModule);
      expect(caseResult.actual.plannedQuestionId).toBe(row.currentPlannedQuestionId);
      expect(caseResult.actual.selectedBecause).toBe(row.currentSelectedBecause);
      expect(caseResult.acceptableQuestionMatched).toBe(true);
      expect(caseResult.genericQuestionAvoided).toBe(true);
      expect(caseResult.missingRequiredRedFlags).toEqual(
        row.missingRequiredRedFlags
      );
      expect(row.acceptableTargetQuestionIds).toEqual(
        caseResult.expected.acceptableQuestionIds
      );
      expect(annotation.primaryFailureClass).toBe(
        "planner_improvement_candidate"
      );
      expect(annotation.safetyImpact).toBe("monitor");
    }
  });

  it("documents explicit edge-case coverage and telemetry hygiene without sensitive evidence", () => {
    const doc = readDoc(DOC_PATH);
    const payload = extractJsonBlock<ProposalPackPayload>(doc);

    expect(payload.edgeCaseCoverage).toEqual(EXPECTED_PAYLOAD.edgeCaseCoverage);
    expect(payload.telemetryHygiene).toEqual(EXPECTED_PAYLOAD.telemetryHygiene);

    const coveredCaseIds = payload.edgeCaseCoverage.edgeCaseBuckets.flatMap(
      (bucket) => bucket.caseIds
    );
    expect(coveredCaseIds).toEqual([
      ...REMAINING_CASE_IDS,
      ...RESIDUAL_CASE_IDS,
    ]);
    expect(payload.edgeCaseCoverage.excludedAsSeparateWork).toEqual(
      EXCLUDED_REPEATED_CONTEXT_CASE_IDS
    );

    const bucketByName = new Map(
      payload.edgeCaseCoverage.edgeCaseBuckets.map((bucket) => [
        bucket.bucket,
        bucket,
      ])
    );

    expect(bucketByName.get("module_phase_priority")?.caseIds).toEqual([
      "edge_limping_not_sure_pain_or_weakness",
    ]);
    expect(bucketByName.get("high_risk_mixed_symptom")?.caseIds).toEqual([
      "edge_multi_diarrhea_limping_cut",
    ]);
    expect(bucketByName.get("residual_after_slice_2a")?.caseIds).toEqual(
      RESIDUAL_CASE_IDS
    );

    for (const bucket of payload.edgeCaseCoverage.edgeCaseBuckets) {
      expect(bucket.asserts.length).toBeGreaterThanOrEqual(3);
      expect(doc).toContain(`"bucket": "${bucket.bucket}"`);
    }

    expect(payload.telemetryHygiene.containsRuntimeTelemetry).toBe(false);
    expect(payload.telemetryHygiene.containsOwnerTelemetry).toBe(false);
    expect(payload.telemetryHygiene.containsProductionUserData).toBe(false);
    expect(payload.telemetryHygiene.containsSecretsOrEnvValues).toBe(false);
    expect(payload.telemetryHygiene.containsDeploymentIdentifiers).toBe(false);
    expect(payload.telemetryHygiene.allowedEvidence).toEqual([
      "fixture case IDs",
      "expected question IDs",
      "selected module IDs",
      "failure-class labels",
      "aggregate eval counters",
    ]);

    expect(doc).toContain("The pack contains no runtime telemetry");
    expect(doc).toContain("production user data");
    expect(doc).toContain("aggregate eval counters");

    for (const pattern of TELEMETRY_EXPOSURE_PATTERNS) {
      expect(doc).not.toMatch(pattern);
    }
  });

  it("keeps the lane separation, guardrails, and proposal-only scope explicit", () => {
    const doc = readDoc(DOC_PATH);
    const payload = extractJsonBlock<ProposalPackPayload>(doc);
    const sliceTwoAGuard =
      extractJsonBlock<SliceTwoAGuardPayload>(readDoc(SLICE_TWO_A_GUARD_DOC_PATH));

    expect(payload).toEqual(EXPECTED_PAYLOAD);
    expect(payload.requiredValidationCommands).toEqual(REQUIRED_VALIDATION_COMMANDS);

    expect(payload.laneSummary.plannerScoringCaseIds).toEqual([]);
    expect(payload.laneSummary.adapterTriggerCaseIds).toEqual([]);
    expect(payload.globalGuardrails.genericQuestionEligibleCases).toBe(
      sliceTwoAGuard.globalGuardrails.genericQuestionEligibleCases
    );
    expect(payload.globalGuardrails.genericQuestionAvoidanceCount).toBe(
      sliceTwoAGuard.globalGuardrails.genericQuestionAvoidanceCount
    );
    expect(payload.globalGuardrails.repeatedQuestionEligibleCases).toBe(
      sliceTwoAGuard.globalGuardrails.repeatedQuestionEligibleCases
    );
    expect(payload.globalGuardrails.repeatedQuestionAvoidanceCount).toBe(
      sliceTwoAGuard.globalGuardrails.repeatedQuestionAvoidanceCount
    );
    expect(payload.globalGuardrails.repeatedQuestionAvoidanceRate).toBe(
      sliceTwoAGuard.globalGuardrails.repeatedQuestionAvoidanceRate
    );
    expect(payload.globalGuardrails.emergencyScreenAlignmentCount).toBe(
      sliceTwoAGuard.globalGuardrails.emergencyScreenAlignmentCount
    );
    expect(payload.globalGuardrails.emergencyScreenAlignmentRelevantCases).toBe(
      sliceTwoAGuard.globalGuardrails.emergencyScreenAlignmentRelevantCases
    );
    expect(payload.globalGuardrails.emergencyScreenAlignmentRate).toBe(
      sliceTwoAGuard.globalGuardrails.emergencyScreenAlignmentRate
    );

    expect(doc).toContain("Proposal pack only.");
    expect(doc).toContain("No runtime files touched.");
    expect(doc).toContain("remaining slice-2B rows: `4`");
    expect(doc).toContain("remaining higher-risk planner rows: `2`");
    expect(doc).toContain("residual after Slice 2A: `2`");
    expect(doc).toContain("standalone planner scoring rows after Slice 2A: `0`");
    expect(doc).toContain("new adapter/trigger rows after Slice 2A: `0`");

    for (const row of payload.remainingPlannerCandidateRows) {
      expect(doc).toContain(`\`${row.caseId}\``);
      expect(doc).toContain(`\`${row.recommendedFixLane}\``);
      expect(doc).toContain(`\`${row.regressionRisk}\``);
    }

    for (const row of payload.residualSlice2ARows) {
      expect(doc).toContain(`\`${row.caseId}\``);
      expect(doc).toContain(`\`${row.priorSlice2AFixOwner}\``);
      expect(doc).toContain(`\`${row.currentPlannedQuestionId}\``);
      expect(doc).toContain(`\`${row.residualStatus}\``);
    }

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(doc).not.toMatch(pattern);
    }
  });
});
