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

const SLICE_2A_LOCKED_WIN_CASE_IDS = [
  "skin_itching_allergy_02_paws_belly_itching",
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
  "edge_trauma_small_scrape_vs_steady_bleed",
] as const;

const LOCKED_BASELINE = {
  totalCases: 57,
  emergencyAlignmentCount: 39,
  emergencyAlignmentRelevantCases: 39,
  repeatedAvoidanceCount: 6,
  repeatedAvoidanceRelevantCases: 6,
  genericAvoidanceCount: 4,
  genericAvoidanceRelevantCases: 10,
  safetyBlockerCount: 0,
  slice2ALockedWinCount: 4,
} as const;

function buildEvalReport() {
  return evaluateShadowPlannerScenarios({
    scenarios: scenarios as ShadowPlannerScenarioFixture[],
    expectedOutcomes: outcomes as ShadowPlannerExpectedOutcomeFixture[],
    edgeScenarios: edgeCases as ShadowPlannerEdgeCaseScenarioFixture[],
    normalizationRows:
      normalizationRows as ShadowPlannerExpectedOutcomeNormalizationFixture[],
  });
}

describe("post-slice-2a shadow eval baseline guard", () => {
  it("locks total cases at 57", () => {
    const report = buildEvalReport();
    expect(report.summary.totalCases).toBe(LOCKED_BASELINE.totalCases);
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

  it("locks Slice 2A wins as exactly the 4 known rows", () => {
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

  it("ensures no report-only rows are reclassified as safety blockers", () => {
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

    const reportOnlyReclassifiedAsBlockers = (
      annotations as AnnotationRow[]
    )
      .filter(
        (annotation) =>
          annotation.primaryFailureClass === "report_only_quality_gap" &&
          annotation.safetyImpact === "blocker"
      )
      .map((annotation) => annotation.caseId);

    expect(reportOnlyReclassifiedAsBlockers).toHaveLength(0);

    const reportOnlyReclassifiedAsPlannerSuccesses = (
      annotations as AnnotationRow[]
    )
      .filter(
        (annotation) =>
          annotation.primaryFailureClass === "report_only_quality_gap" &&
          !failedCaseIds.has(annotation.caseId)
      )
      .map((annotation) => annotation.caseId);

    expect(reportOnlyReclassifiedAsPlannerSuccesses).toHaveLength(0);
  });

  it("guards the guard doc exists and declares validation-only scope", () => {
    const docPath = path.join(
      process.cwd(),
      "docs",
      "clinical-intelligence",
      "post-slice-2a-shadow-eval-baseline-guard-qwen.md"
    );

    expect(fs.existsSync(docPath)).toBe(true);

    const doc = fs.readFileSync(docPath, "utf8");
    expect(doc).toContain("Validation-only guard.");
    expect(doc).toContain("No runtime files touched.");
    expect(doc).toContain("`total cases`: `57`");
    expect(doc).toContain("`emergency alignment`: `39/39`");
    expect(doc).toContain("`repeated avoidance`: `6/6`");
    expect(doc).toContain("`generic avoidance`: `4/10`");
    expect(doc).toContain("`safety blockers`: `0`");
    expect(doc).toContain("`Slice 2A locked wins`: `4`");
    expect(doc).toContain("`report-only rows reclassified`: `0`");
  });
});
