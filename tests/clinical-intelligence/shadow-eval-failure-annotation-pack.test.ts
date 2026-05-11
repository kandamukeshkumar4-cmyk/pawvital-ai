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

type PatchTarget =
  | "fixture"
  | "normalization"
  | "adapter"
  | "planner"
  | "question_card"
  | "no_patch_report_only";

type SafetyImpact = "none" | "monitor" | "blocker";

type ShadowEvalFailureAnnotation = {
  caseId: string;
  primaryFailureClass: PrimaryFailureClass;
  secondaryFailureClasses: PrimaryFailureClass[];
  patchTarget: PatchTarget;
  reviewerAction: string;
  safetyImpact: SafetyImpact;
  notes: string;
};

const REQUIRED_KEYS = [
  "caseId",
  "notes",
  "patchTarget",
  "primaryFailureClass",
  "reviewerAction",
  "safetyImpact",
  "secondaryFailureClasses",
].sort();

const PRIMARY_FAILURE_CLASSES: PrimaryFailureClass[] = [
  "fixture_ambiguity",
  "report_only_quality_gap",
  "adapter_selection_gap",
  "red_flag_coverage_gap",
  "repeated_metric_setup_gap",
  "generic_metric_setup_gap",
  "planner_improvement_candidate",
];

const PATCH_TARGETS: PatchTarget[] = [
  "fixture",
  "normalization",
  "adapter",
  "planner",
  "question_card",
  "no_patch_report_only",
];

const SAFETY_IMPACTS: SafetyImpact[] = ["none", "monitor", "blocker"];

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

const annotationFixture = annotations as ShadowEvalFailureAnnotation[];
const scenarioFixture = scenarios as ShadowPlannerScenarioFixture[];
const outcomeFixture = outcomes as ShadowPlannerExpectedOutcomeFixture[];
const edgeScenarioFixture =
  edgeCases as ShadowPlannerEdgeCaseScenarioFixture[];
const normalizationFixture =
  normalizationRows as ShadowPlannerExpectedOutcomeNormalizationFixture[];

const evalReport = evaluateShadowPlannerScenarios({
  scenarios: scenarioFixture,
  expectedOutcomes: outcomeFixture,
  edgeScenarios: edgeScenarioFixture,
  normalizationRows: normalizationFixture,
});

function getAnnotation(caseId: string): ShadowEvalFailureAnnotation {
  const row = annotationFixture.find((annotation) => annotation.caseId === caseId);
  if (!row) {
    throw new Error(`Missing annotation row for ${caseId}`);
  }
  return row;
}

function countByPrimaryFailureClass(
  failureClass: PrimaryFailureClass
): number {
  return annotationFixture.filter(
    (annotation) => annotation.primaryFailureClass === failureClass
  ).length;
}

function countBySecondaryFailureClass(
  failureClass: PrimaryFailureClass
): number {
  return annotationFixture.filter((annotation) =>
    annotation.secondaryFailureClasses.includes(failureClass)
  ).length;
}

describe("shadow eval failure annotation pack", () => {
  it("annotates every live failed eval case exactly once with the required schema", () => {
    const failedCaseIds = new Set(
      evalReport.summary.failedCases.map((failedCase) => failedCase.caseId)
    );
    const annotationCaseIds = new Set<string>();

    expect(annotationFixture).toHaveLength(54);
    expect(annotationFixture).toHaveLength(evalReport.summary.failedCases.length);

    for (const annotation of annotationFixture) {
      expect(Object.keys(annotation).sort()).toEqual(REQUIRED_KEYS);
      expect(annotation.caseId).toMatch(/^[a-z0-9_]+$/);
      expect(annotationCaseIds.has(annotation.caseId)).toBe(false);
      annotationCaseIds.add(annotation.caseId);

      expect(failedCaseIds.has(annotation.caseId)).toBe(true);
      expect(PRIMARY_FAILURE_CLASSES).toContain(annotation.primaryFailureClass);
      expect(PATCH_TARGETS).toContain(annotation.patchTarget);
      expect(SAFETY_IMPACTS).toContain(annotation.safetyImpact);
      expect(new Set(annotation.secondaryFailureClasses).size).toBe(
        annotation.secondaryFailureClasses.length
      );
      expect(annotation.secondaryFailureClasses).not.toContain(
        annotation.primaryFailureClass
      );
      expect(annotation.reviewerAction.trim()).toBe(annotation.reviewerAction);
      expect(annotation.reviewerAction.length).toBeGreaterThan(20);
      expect(annotation.notes.trim()).toBe(annotation.notes);
      expect(annotation.notes.length).toBeGreaterThan(40);

      for (const failureClass of annotation.secondaryFailureClasses) {
        expect(PRIMARY_FAILURE_CLASSES).toContain(failureClass);
      }
    }
  });

  it("tracks the live failed-case order from the current 54-case summary", () => {
    expect(annotationFixture.map((annotation) => annotation.caseId)).toEqual(
      evalReport.summary.failedCases.map((failedCase) => failedCase.caseId)
    );
  });

  it("preserves the deterministic primary split with zero adapter or blocker rows", () => {
    expect(countByPrimaryFailureClass("report_only_quality_gap")).toBe(46);
    expect(countByPrimaryFailureClass("planner_improvement_candidate")).toBe(6);
    expect(countByPrimaryFailureClass("red_flag_coverage_gap")).toBe(1);
    expect(countByPrimaryFailureClass("fixture_ambiguity")).toBe(1);
    expect(countByPrimaryFailureClass("adapter_selection_gap")).toBe(0);
    expect(countByPrimaryFailureClass("repeated_metric_setup_gap")).toBe(0);
    expect(countByPrimaryFailureClass("generic_metric_setup_gap")).toBe(0);

    expect(
      annotationFixture.filter(
        (annotation) => annotation.safetyImpact === "monitor"
      )
    ).toHaveLength(7);
    expect(
      annotationFixture.filter(
        (annotation) => annotation.safetyImpact === "blocker"
      )
    ).toHaveLength(0);
  });

  it("keeps repeat and generic setup debt visible as secondary classifications", () => {
    expect(countBySecondaryFailureClass("repeated_metric_setup_gap")).toBe(37);
    expect(countBySecondaryFailureClass("generic_metric_setup_gap")).toBe(24);
    expect(countBySecondaryFailureClass("red_flag_coverage_gap")).toBe(27);
    expect(countBySecondaryFailureClass("fixture_ambiguity")).toBe(30);
  });

  it("routes representative cases into the expected reviewer lanes", () => {
    const heatCollapse = getAnnotation(
      "heatstroke_heat_exposure_01_hot_car_collapse"
    );
    expect(heatCollapse).toMatchObject({
      primaryFailureClass: "report_only_quality_gap",
      patchTarget: "no_patch_report_only",
      safetyImpact: "none",
    });
    expect(heatCollapse.secondaryFailureClasses).toEqual(
      expect.arrayContaining(["repeated_metric_setup_gap"])
    );

    expect(getAnnotation("heatstroke_heat_exposure_02_brachy_panting_after_walk")).toMatchObject({
      primaryFailureClass: "red_flag_coverage_gap",
      patchTarget: "planner",
      safetyImpact: "monitor",
    });

    expect(
      getAnnotation("gi_vomiting_diarrhea_03_water_comes_back_up")
    ).toMatchObject({
      primaryFailureClass: "report_only_quality_gap",
      patchTarget: "no_patch_report_only",
      safetyImpact: "none",
    });

    expect(
      getAnnotation("edge_heat_mild_after_walk_vs_hard_panting")
    ).toMatchObject({
      primaryFailureClass: "fixture_ambiguity",
      patchTarget: "normalization",
      safetyImpact: "none",
    });

    const edgeUrinaryRepeat = getAnnotation(
      "edge_urinary_repeat_straining_avoidance"
    );
    expect(edgeUrinaryRepeat).toMatchObject({
      primaryFailureClass: "report_only_quality_gap",
      patchTarget: "normalization",
      safetyImpact: "none",
    });
    expect(edgeUrinaryRepeat.secondaryFailureClasses).toEqual(
      expect.arrayContaining([
        "repeated_metric_setup_gap",
        "generic_metric_setup_gap",
        "red_flag_coverage_gap",
      ])
    );
  });

  it("keeps reviewer-facing annotation text free of diagnosis or treatment language", () => {
    for (const annotation of annotationFixture) {
      const reviewerFacingText = `${annotation.reviewerAction} ${annotation.notes}`;

      for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
        expect(reviewerFacingText).not.toMatch(pattern);
      }
    }
  });
});
