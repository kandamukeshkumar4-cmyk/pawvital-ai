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
  secondaryFailureClasses: PrimaryFailureClass[];
  safetyImpact: "none" | "monitor" | "blocker";
};

type Slice2ALockedWinRow = {
  caseId: string;
  selectedComplaintModule: string;
  plannedQuestionId: string;
  genericQuestionAvoided: boolean;
  acceptableQuestionMatched: boolean;
};

type PhasePriorityReadinessPayload = {
  targetCase: {
    caseId: string;
    currentSelectedComplaintModule: string;
    currentPlannedQuestionId: string;
    currentSelectedBecause: string;
    acceptableTargetQuestionIds: string[];
    mustScreenRedFlags: string[];
    shouldPreferEmergencyScreen: boolean;
    shouldAvoidGenericQuestion: boolean;
    isConfusingMultiSymptom: boolean;
    hasAmbiguousOwnerAnswer: boolean;
  };
  currentEvalState: {
    primaryFailureClass: PrimaryFailureClass;
    secondaryFailureClasses: PrimaryFailureClass[];
    safetyImpact: "none" | "monitor" | "blocker";
    actualPlannedQuestionId: string;
    actualComplaintModuleId: string;
    acceptableQuestionMatched: boolean;
    genericQuestionAvoided: boolean;
    repeatedQuestionAvoided: boolean;
    emergencyScreenAligned: boolean;
    missingRequiredRedFlags: string[];
  };
  acceptedTargetQuestionCard: string;
  phasePriorityReason: string;
  globalGuardrails: {
    emergencyScreenAlignmentCount: number;
    emergencyScreenAlignmentRelevantCases: number;
    emergencyScreenAlignmentRate: number;
    repeatedQuestionAvoidanceCount: number;
    repeatedQuestionAvoidanceRelevantCases: number;
    repeatedQuestionAvoidanceRate: number;
    safetyBlockerCount: number;
    reportOnlyRowsReclassified: string[];
    slice2ALockedWins: Slice2ALockedWinRow[];
  };
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "slice-2b-phase-priority-readiness-guard-qwen.md"
);

const TARGET_CASE_ID = "edge_limping_not_sure_pain_or_weakness";

const SLICE_2A_LOCKED_WIN_CASE_IDS = [
  "skin_itching_allergy_02_paws_belly_itching",
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
  "edge_trauma_small_scrape_vs_steady_bleed",
] as const;

const ACCEPTED_TARGET_QUESTION_CARD = "limping_weight_bearing";

const PHASE_PRIORITY_REASON =
  "The case `edge_limping_not_sure_pain_or_weakness` is a phase-priority fix because " +
  "the owner's ambiguous wording (\"not sure if his leg hurts or he is weak all over\") " +
  "creates a module-phase ambiguity between `limping_mobility_pain` and `collapse_weakness`. " +
  "The planner currently selects `collapse_weakness` and falls back to `emergency_global_screen`, " +
  "but the acceptable question set includes `limping_weight_bearing` as the preferred discriminator. " +
  "This is not a fixture-only issue: the normalization row expects `question_match_required` with " +
  "`complete` red-flag coverage and `include` for generic-question scoring, meaning the fix must " +
  "adjust phase-priority scoring between the two modules rather than merely updating fixture expectations.";

const EXPECTED_PAYLOAD: PhasePriorityReadinessPayload = {
  targetCase: {
    caseId: TARGET_CASE_ID,
    currentSelectedComplaintModule: "collapse_weakness",
    currentPlannedQuestionId: "emergency_global_screen",
    currentSelectedBecause: "emergency_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check",
    ],
    mustScreenRedFlags: [
      "non_weight_bearing",
      "acute_weakness",
      "pale_gums",
      "post_trauma_lameness",
    ],
    shouldPreferEmergencyScreen: false,
    shouldAvoidGenericQuestion: true,
    isConfusingMultiSymptom: true,
    hasAmbiguousOwnerAnswer: true,
  },
  currentEvalState: {
    primaryFailureClass: "planner_improvement_candidate",
    secondaryFailureClasses: [
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    safetyImpact: "monitor",
    actualPlannedQuestionId: "emergency_global_screen",
    actualComplaintModuleId: "collapse_weakness",
    acceptableQuestionMatched: false,
    genericQuestionAvoided: false,
    repeatedQuestionAvoided: true,
    emergencyScreenAligned: true,
    missingRequiredRedFlags: [
      "non_weight_bearing",
      "acute_weakness",
      "pale_gums",
      "post_trauma_lameness",
    ],
  },
  acceptedTargetQuestionCard: ACCEPTED_TARGET_QUESTION_CARD,
  phasePriorityReason: PHASE_PRIORITY_REASON,
  globalGuardrails: {
    emergencyScreenAlignmentCount: 39,
    emergencyScreenAlignmentRelevantCases: 39,
    emergencyScreenAlignmentRate: 1,
    repeatedQuestionAvoidanceCount: 6,
    repeatedQuestionAvoidanceRelevantCases: 6,
    repeatedQuestionAvoidanceRate: 1,
    safetyBlockerCount: 0,
    reportOnlyRowsReclassified: [],
    slice2ALockedWins: [
      {
        caseId: "skin_itching_allergy_02_paws_belly_itching",
        selectedComplaintModule: "skin_itching_allergy",
        plannedQuestionId: "skin_location_distribution",
        genericQuestionAvoided: true,
        acceptableQuestionMatched: true,
      },
      {
        caseId: "limping_mobility_pain_02_sudden_after_jump",
        selectedComplaintModule: "limping_mobility_pain",
        plannedQuestionId: "limping_weight_bearing",
        genericQuestionAvoided: true,
        acceptableQuestionMatched: true,
      },
      {
        caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
        selectedComplaintModule: "limping_mobility_pain",
        plannedQuestionId: "bleeding_volume_check",
        genericQuestionAvoided: true,
        acceptableQuestionMatched: true,
      },
      {
        caseId: "edge_trauma_small_scrape_vs_steady_bleed",
        selectedComplaintModule: "trauma_bleeding_wound",
        plannedQuestionId: "bleeding_volume_check",
        genericQuestionAvoided: true,
        acceptableQuestionMatched: true,
      },
    ],
  },
};

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
  const report = buildEvalReport();
  const caseResult = report.caseResults.find((result) => result.caseId === caseId);

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

function getEdgeScenario(caseId: string): ShadowPlannerEdgeCaseScenarioFixture {
  const scenario = (edgeCases as ShadowPlannerEdgeCaseScenarioFixture[]).find(
    (s) => s.caseId === caseId
  );

  if (!scenario) {
    throw new Error(`Missing edge scenario for ${caseId}`);
  }

  return scenario;
}

function buildGlobalGuardrails() {
  const report = buildEvalReport();
  const triage = triageShadowPlannerEvalFailures({
    report,
    scenarios: scenarios as ShadowPlannerScenarioFixture[],
    expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
    edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
  });

  const slice2ALockedWins = SLICE_2A_LOCKED_WIN_CASE_IDS.map((caseId) => {
    const result = getCaseResult(caseId);
    return {
      caseId,
      selectedComplaintModule: result.actual.complaintModuleId,
      plannedQuestionId: result.actual.plannedQuestionId ?? "",
      genericQuestionAvoided: result.genericQuestionAvoided,
      acceptableQuestionMatched: result.acceptableQuestionMatched,
    };
  });

  const reportOnlyCaseIds = new Set(
    (annotations as AnnotationRow[])
      .filter((a) => a.primaryFailureClass === "report_only_quality_gap")
      .map((a) => a.caseId)
  );

  const safetyBlockerCaseIds = new Set(
    triage.safetyBlockers.map((b) => b.caseId)
  );

  const reportOnlyRowsReclassified = [...reportOnlyCaseIds]
    .filter((caseId) => safetyBlockerCaseIds.has(caseId))
    .sort();

  return {
    emergencyScreenAlignmentCount: report.summary.emergencyScreenAlignmentCount,
    emergencyScreenAlignmentRelevantCases:
      report.summary.emergencyScreenAlignmentRelevantCases,
    emergencyScreenAlignmentRate: report.summary.emergencyScreenAlignmentRate,
    repeatedQuestionAvoidanceCount: report.summary.repeatedQuestionAvoidanceCount,
    repeatedQuestionAvoidanceRelevantCases:
      report.summary.repeatedQuestionAvoidanceRelevantCases,
    repeatedQuestionAvoidanceRate: report.summary.repeatedQuestionAvoidanceRate,
    safetyBlockerCount: triage.safetyBlockers.length,
    reportOnlyRowsReclassified,
    slice2ALockedWins,
  };
}

describe("slice 2B phase-priority readiness guard", () => {
  it("locks the target case edge_limping_not_sure_pain_or_weakness pre-fix state", () => {
    const caseResult = getCaseResult(TARGET_CASE_ID);
    const annotation = getAnnotation(TARGET_CASE_ID);
    const edgeScenario = getEdgeScenario(TARGET_CASE_ID);

    expect(caseResult.actual.complaintModuleId).toBe(
      EXPECTED_PAYLOAD.targetCase.currentSelectedComplaintModule
    );
    expect(caseResult.actual.plannedQuestionId).toBe(
      EXPECTED_PAYLOAD.targetCase.currentPlannedQuestionId
    );
    expect(caseResult.acceptableQuestionMatched).toBe(
      EXPECTED_PAYLOAD.currentEvalState.acceptableQuestionMatched
    );
    expect(caseResult.genericQuestionAvoided).toBe(
      EXPECTED_PAYLOAD.currentEvalState.genericQuestionAvoided
    );
    expect(caseResult.emergencyScreenAligned).toBe(
      EXPECTED_PAYLOAD.currentEvalState.emergencyScreenAligned
    );
    expect(caseResult.missingRequiredRedFlags).toEqual(
      EXPECTED_PAYLOAD.currentEvalState.missingRequiredRedFlags
    );

    expect(annotation.primaryFailureClass).toBe(
      EXPECTED_PAYLOAD.currentEvalState.primaryFailureClass
    );
    expect(annotation.secondaryFailureClasses).toEqual(
      EXPECTED_PAYLOAD.currentEvalState.secondaryFailureClasses
    );
    expect(annotation.safetyImpact).toBe(
      EXPECTED_PAYLOAD.currentEvalState.safetyImpact
    );

    expect(edgeScenario.acceptablePlannedQuestionIds).toEqual(
      EXPECTED_PAYLOAD.targetCase.acceptableTargetQuestionIds
    );
    expect(edgeScenario.mustScreenRedFlags).toEqual(
      EXPECTED_PAYLOAD.targetCase.mustScreenRedFlags
    );
    expect(edgeScenario.shouldPreferEmergencyScreen).toBe(
      EXPECTED_PAYLOAD.targetCase.shouldPreferEmergencyScreen
    );
    expect(edgeScenario.shouldAvoidGenericQuestion).toBe(
      EXPECTED_PAYLOAD.targetCase.shouldAvoidGenericQuestion
    );
    expect(edgeScenario.isConfusingMultiSymptom).toBe(
      EXPECTED_PAYLOAD.targetCase.isConfusingMultiSymptom
    );
    expect(edgeScenario.hasAmbiguousOwnerAnswer).toBe(
      EXPECTED_PAYLOAD.targetCase.hasAmbiguousOwnerAnswer
    );
  });

  it("documents why this is phase-priority and not fixture-only", () => {
    const normalizationRow = (
      normalizationRows as ShadowPlannerExpectedOutcomeNormalizationFixture[]
    ).find((row) => row.caseId === TARGET_CASE_ID);

    expect(normalizationRow).toBeDefined();
    expect(normalizationRow?.ambiguityDisposition).toBe("allow_module_alternatives");
    expect(normalizationRow?.emergencyAlignmentDisposition).toBe("question_match_required");
    expect(normalizationRow?.redFlagCoverageExpectation).toBe("complete");
    expect(normalizationRow?.genericQuestionScoring).toBe("include");

    const annotation = getAnnotation(TARGET_CASE_ID);
    expect(annotation.primaryFailureClass).toBe("planner_improvement_candidate");
    expect(annotation.safetyImpact).toBe("monitor");
    expect(annotation.patchTarget).toBe("planner");
  });

  it("confirms no emergency alignment regression", () => {
    const report = buildEvalReport();

    expect(report.summary.emergencyScreenAlignmentCount).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.emergencyScreenAlignmentCount
    );
    expect(report.summary.emergencyScreenAlignmentRelevantCases).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.emergencyScreenAlignmentRelevantCases
    );
    expect(report.summary.emergencyScreenAlignmentRate).toBe(1);

    const caseResult = getCaseResult(TARGET_CASE_ID);
    expect(caseResult.emergencyScreenAligned).toBe(true);
  });

  it("confirms no repeated-question regression", () => {
    const report = buildEvalReport();

    expect(report.summary.repeatedQuestionAvoidanceCount).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.repeatedQuestionAvoidanceCount
    );
    expect(report.summary.repeatedQuestionAvoidanceRelevantCases).toBe(
      EXPECTED_PAYLOAD.globalGuardrails.repeatedQuestionAvoidanceRelevantCases
    );
    expect(report.summary.repeatedQuestionAvoidanceRate).toBe(1);

    const caseResult = getCaseResult(TARGET_CASE_ID);
    expect(caseResult.repeatedQuestionAvoided).toBe(true);
  });

  it("confirms no safety blockers", () => {
    const report = buildEvalReport();
    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: scenarios as ShadowPlannerScenarioFixture[],
      expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
      edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    });

    expect(triage.safetyBlockers.length).toBe(0);

    const annotation = getAnnotation(TARGET_CASE_ID);
    expect(annotation.safetyImpact).not.toBe("blocker");
  });

  it("confirms no report-only rows reclassified", () => {
    const report = buildEvalReport();
    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: scenarios as ShadowPlannerScenarioFixture[],
      expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
      edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    });

    const reportOnlyCaseIds = new Set(
      (annotations as AnnotationRow[])
        .filter((a) => a.primaryFailureClass === "report_only_quality_gap")
        .map((a) => a.caseId)
    );

    const safetyBlockerCaseIds = new Set(
      triage.safetyBlockers.map((b) => b.caseId)
    );

    for (const caseId of reportOnlyCaseIds) {
      expect(safetyBlockerCaseIds.has(caseId)).toBe(false);
    }
  });

  it("confirms Slice 2A locked wins remain intact", () => {
    const report = buildEvalReport();

    for (const caseId of SLICE_2A_LOCKED_WIN_CASE_IDS) {
      const caseResult = getCaseResult(caseId);

      expect(caseResult.actual.plannedQuestionId).not.toBe("emergency_global_screen");
      expect(caseResult.genericQuestionAvoided).toBe(true);
      expect(caseResult.acceptableQuestionMatched).toBe(true);
    }
  });

  it("matches the guard doc payload to the locked pre-fix state", () => {
    const doc = readGuardDoc();
    const payload = extractJsonBlock<PhasePriorityReadinessPayload>(doc);

    expect(payload.targetCase.caseId).toBe(TARGET_CASE_ID);
    expect(payload.targetCase.currentSelectedComplaintModule).toBe(
      EXPECTED_PAYLOAD.targetCase.currentSelectedComplaintModule
    );
    expect(payload.targetCase.currentPlannedQuestionId).toBe(
      EXPECTED_PAYLOAD.targetCase.currentPlannedQuestionId
    );
    expect(payload.targetCase.acceptableTargetQuestionIds).toEqual(
      EXPECTED_PAYLOAD.targetCase.acceptableTargetQuestionIds
    );
    expect(payload.acceptedTargetQuestionCard).toBe(ACCEPTED_TARGET_QUESTION_CARD);
    expect(payload.phasePriorityReason).toContain("phase-priority");
    expect(payload.phasePriorityReason).toContain("limping_mobility_pain");
    expect(payload.phasePriorityReason).toContain("collapse_weakness");

    expect(payload.currentEvalState.primaryFailureClass).toBe(
      EXPECTED_PAYLOAD.currentEvalState.primaryFailureClass
    );
    expect(payload.currentEvalState.safetyImpact).toBe("monitor");
    expect(payload.currentEvalState.acceptableQuestionMatched).toBe(false);
    expect(payload.currentEvalState.genericQuestionAvoided).toBe(false);

    expect(payload.globalGuardrails.emergencyScreenAlignmentCount).toBe(39);
    expect(payload.globalGuardrails.emergencyScreenAlignmentRate).toBe(1);
    expect(payload.globalGuardrails.repeatedQuestionAvoidanceCount).toBe(6);
    expect(payload.globalGuardrails.repeatedQuestionAvoidanceRate).toBe(1);
    expect(payload.globalGuardrails.safetyBlockerCount).toBe(0);
    expect(payload.globalGuardrails.reportOnlyRowsReclassified).toEqual([]);
    expect(payload.globalGuardrails.slice2ALockedWins).toHaveLength(4);
  });

  it("keeps the guard doc aligned to the validation-only scope", () => {
    const doc = readGuardDoc();

    expect(doc).toContain("Validation-only guard.");
    expect(doc).toContain("No runtime files touched.");
    expect(doc).toContain("No planner logic changed.");
    expect(doc).toContain("No complaint adapter logic changed.");
    expect(doc).toContain("No question cards changed.");
    expect(doc).toContain("No complaint modules changed.");

    expect(doc).toContain("`edge_limping_not_sure_pain_or_weakness`");
    expect(doc).toContain("`collapse_weakness`");
    expect(doc).toContain("`emergency_global_screen`");
    expect(doc).toContain("`limping_weight_bearing`");
    expect(doc).toContain("`limping_mobility_pain`");
    expect(doc).toContain("phase-priority");

    expect(doc).toContain("emergency alignment: `39/39 = 100%`");
    expect(doc).toContain("repeated avoidance: `6/6 = 100%`");
    expect(doc).toContain("safety blockers: `0`");
    expect(doc).toContain("report-only rows reclassified: `0`");
    expect(doc).toContain("Slice 2A locked wins: `4/4`");

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(doc).not.toMatch(pattern);
    }
  });
});
