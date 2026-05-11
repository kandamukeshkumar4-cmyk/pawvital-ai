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
  patchTarget: string;
  reviewerAction: string;
  safetyImpact: "none" | "monitor" | "blocker";
  notes: string;
};

const NORMALIZED_CASE_ID = "gi_vomiting_diarrhea_03_water_comes_back_up";

const SLICE_2A_LOCKED_WIN_CASE_IDS = [
  "skin_itching_allergy_02_paws_belly_itching",
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
  "edge_trauma_small_scrape_vs_steady_bleed",
] as const;

const LOCKED_BASELINE = {
  totalCases: 57,
  plannerCandidateCount: 6,
  safetyBlockerCount: 0,
  emergencyAlignmentCount: 40,
  emergencyAlignmentRelevantCases: 40,
  repeatedAvoidanceCount: 6,
  repeatedAvoidanceRelevantCases: 6,
  genericAvoidanceCount: 4,
  genericAvoidanceRelevantCases: 10,
  normalizedAcceptableCount: 52,
  normalizedAcceptableRate: 52 / 57,
  slice2ALockedWinCount: 4,
} as const;

const annotationFixture = annotations as AnnotationRow[];

function buildEvalReport() {
  return evaluateShadowPlannerScenarios({
    scenarios: scenarios as ShadowPlannerScenarioFixture[],
    expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
    edgeScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    normalizationRows:
      normalizationRows as ShadowPlannerExpectedOutcomeNormalizationFixture[],
  });
}

function countByPrimaryFailureClass(
  primaryFailureClass: PrimaryFailureClass
): number {
  return annotationFixture.filter(
    (annotation) => annotation.primaryFailureClass === primaryFailureClass
  ).length;
}

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "slice-2b-fixture-normalization-metric-guard-qwen.md"
);

function readGuardDoc(): string {
  if (!fs.existsSync(DOC_PATH)) {
    throw new Error(`Missing guard doc at ${DOC_PATH}`);
  }

  return fs.readFileSync(DOC_PATH, "utf8");
}

function extractJsonBlock<T>(rawDoc: string): T {
  const match = rawDoc.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block");
  }

  return JSON.parse(match[1]) as T;
}

type GuardDocPayload = {
  normalizedCase: {
    caseId: string;
    previousPrimaryFailureClass: string;
    currentPrimaryFailureClass: string;
    genericQuestionScoring: string;
    redFlagCoverageExpectation: string;
    emergencyAlignmentDisposition: string;
  };
  globalGuardrails: {
    totalCases: number;
    plannerCandidateCount: number;
    safetyBlockerCount: number;
    emergencyScreenAlignmentCount: number;
    emergencyScreenAlignmentRelevantCases: number;
    emergencyScreenAlignmentRate: number;
    repeatedQuestionEligibleCases: number;
    repeatedQuestionAvoidanceCount: number;
    repeatedQuestionAvoidanceRate: number;
    genericQuestionEligibleCases: number;
    genericQuestionAvoidanceCount: number;
    genericQuestionAvoidanceRate: number;
    normalizedAcceptableQuestionCount: number;
    normalizedAcceptableQuestionRate: number;
    slice2ALockedWinCaseIds: string[];
    reportOnlyRowsReclassifiedAsSafetyBlockers: string[];
  };
  requiredValidationCommands: string[];
};

const EXPECTED_GUARD_PAYLOAD: GuardDocPayload = {
  normalizedCase: {
    caseId: NORMALIZED_CASE_ID,
    previousPrimaryFailureClass: "planner_improvement_candidate",
    currentPrimaryFailureClass: "report_only_quality_gap",
    genericQuestionScoring: "exclude_for_now",
    redFlagCoverageExpectation: "partial",
    emergencyAlignmentDisposition: "alignment_only_ok",
  },
  globalGuardrails: {
    totalCases: LOCKED_BASELINE.totalCases,
    plannerCandidateCount: LOCKED_BASELINE.plannerCandidateCount,
    safetyBlockerCount: LOCKED_BASELINE.safetyBlockerCount,
    emergencyScreenAlignmentCount: LOCKED_BASELINE.emergencyAlignmentCount,
    emergencyScreenAlignmentRelevantCases:
      LOCKED_BASELINE.emergencyAlignmentRelevantCases,
    emergencyScreenAlignmentRate: 1,
    repeatedQuestionEligibleCases: LOCKED_BASELINE.repeatedAvoidanceRelevantCases,
    repeatedQuestionAvoidanceCount: LOCKED_BASELINE.repeatedAvoidanceCount,
    repeatedQuestionAvoidanceRate: 1,
    genericQuestionEligibleCases: LOCKED_BASELINE.genericAvoidanceRelevantCases,
    genericQuestionAvoidanceCount: LOCKED_BASELINE.genericAvoidanceCount,
    genericQuestionAvoidanceRate:
      LOCKED_BASELINE.genericAvoidanceCount / LOCKED_BASELINE.genericAvoidanceRelevantCases,
    normalizedAcceptableQuestionCount: LOCKED_BASELINE.normalizedAcceptableCount,
    normalizedAcceptableQuestionRate: LOCKED_BASELINE.normalizedAcceptableRate,
    slice2ALockedWinCaseIds: [...SLICE_2A_LOCKED_WIN_CASE_IDS],
    reportOnlyRowsReclassifiedAsSafetyBlockers: [],
  },
  requiredValidationCommands: [
    "npm test -- --runTestsByPath tests/clinical-intelligence/slice-2b-fixture-normalization-metric-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/post-slice-2a-shadow-eval-baseline-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/planner-candidate-fix-slice-2a-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
    "node scripts/eval-shadow-planner-scenarios.ts --json",
    "npm run build",
  ],
};

describe("slice 2B fixture normalization metric guard", () => {
  it("locks total cases at 57", () => {
    const report = buildEvalReport();
    expect(report.summary.totalCases).toBe(LOCKED_BASELINE.totalCases);
  });

  it("locks the normalized case gi_vomiting_diarrhea_03_water_comes_back_up as report_only_quality_gap", () => {
    const annotation = annotationFixture.find(
      (a) => a.caseId === NORMALIZED_CASE_ID
    );
    expect(annotation).toBeDefined();
    expect(annotation?.primaryFailureClass).toBe("report_only_quality_gap");
    expect(annotation?.safetyImpact).toBe("none");
    expect(annotation?.patchTarget).toBe("no_patch_report_only");
  });

  it("locks planner candidates at 6", () => {
    expect(countByPrimaryFailureClass("planner_improvement_candidate")).toBe(
      LOCKED_BASELINE.plannerCandidateCount
    );
  });

  it("locks safety blockers at 0", () => {
    const report = buildEvalReport();
    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: scenarios as ShadowPlannerScenarioFixture[],
      expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
      edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    });
    expect(triage.safetyBlockers.length).toBe(LOCKED_BASELINE.safetyBlockerCount);
  });

  it("locks emergency alignment at 39/39", () => {
    const report = buildEvalReport();
    expect(report.summary.emergencyScreenAlignmentCount).toBe(
      LOCKED_BASELINE.emergencyAlignmentCount
    );
    expect(report.summary.emergencyScreenAlignmentRelevantCases).toBe(
      LOCKED_BASELINE.emergencyAlignmentRelevantCases
    );
    expect(report.summary.emergencyScreenAlignmentRate).toBe(1);
  });

  it("locks repeated avoidance at 6/6", () => {
    const report = buildEvalReport();
    expect(report.summary.repeatedQuestionAvoidanceCount).toBe(
      LOCKED_BASELINE.repeatedAvoidanceCount
    );
    expect(report.summary.repeatedQuestionAvoidanceRelevantCases).toBe(
      LOCKED_BASELINE.repeatedAvoidanceRelevantCases
    );
    expect(report.summary.repeatedQuestionAvoidanceRate).toBe(1);
  });

  it("locks generic avoidance at 4/10", () => {
    const report = buildEvalReport();
    expect(report.summary.genericQuestionAvoidanceCount).toBe(
      LOCKED_BASELINE.genericAvoidanceCount
    );
    expect(report.summary.genericQuestionAvoidanceRelevantCases).toBe(
      LOCKED_BASELINE.genericAvoidanceRelevantCases
    );
    expect(report.summary.genericQuestionAvoidanceRate).toBe(4 / 10);
  });

  it("locks normalized acceptable questions at 52/57", () => {
    const report = buildEvalReport();
    expect(report.summary.normalizedMetrics?.acceptableQuestionCount).toBe(
      LOCKED_BASELINE.normalizedAcceptableCount
    );
    expect(report.summary.normalizedMetrics?.acceptableQuestionRate).toBe(
      LOCKED_BASELINE.normalizedAcceptableRate
    );
  });

  it("ensures no Slice 2A locked wins regressed", () => {
    const report = buildEvalReport();
    const slice2AResults = report.caseResults.filter((result) =>
      SLICE_2A_LOCKED_WIN_CASE_IDS.includes(
        result.caseId as (typeof SLICE_2A_LOCKED_WIN_CASE_IDS)[number]
      )
    );

    expect(slice2AResults).toHaveLength(LOCKED_BASELINE.slice2ALockedWinCount);

    for (const result of slice2AResults) {
      expect(result.actual.plannedQuestionId).not.toBe("emergency_global_screen");
      expect(result.genericQuestionAvoided).toBe(true);
      expect(result.acceptableQuestionMatched).toBe(true);
    }
  });

  it("ensures no report-only rows reclassified as safety blockers", () => {
    const report = buildEvalReport();
    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: scenarios as ShadowPlannerScenarioFixture[],
      expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
      edgeCaseScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    });

    const reportOnlyCaseIds = new Set(
      annotationFixture
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

  it("keeps the guard doc aligned to the locked baseline", () => {
    const doc = readGuardDoc();
    const payload = extractJsonBlock<GuardDocPayload>(doc);

    expect(payload).toEqual(EXPECTED_GUARD_PAYLOAD);

    expect(doc).toContain("Validation-only guard.");
    expect(doc).toContain("No runtime files touched.");
    expect(doc).toContain("`total cases`: `57`");
    expect(doc).toContain("`planner candidates`: `6`");
    expect(doc).toContain("`safety blockers`: `0`");
    expect(doc).toContain("`emergency alignment`: `40/40`");
    expect(doc).toContain("`repeated avoidance`: `6/6`");
    expect(doc).toContain("`generic avoidance`: `4/10`");
    expect(doc).toContain("`normalized acceptable`: `52/57`");
  });
});
