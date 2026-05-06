import fs from "node:fs";
import path from "node:path";

import annotations from "../fixtures/clinical-intelligence/shadow-eval-failure-annotations.json";
import edgeScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import normalizationRows from "../fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

type FailureClass =
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

type SuggestedFixCategory =
  | "gi_targeted_discriminator"
  | "skin_targeted_discriminator"
  | "limping_targeted_discriminator"
  | "trauma_targeted_discriminator"
  | "multi_symptom_planner_choice";

type ShadowEvalFailureAnnotation = {
  caseId: string;
  primaryFailureClass: FailureClass;
  secondaryFailureClasses: FailureClass[];
  patchTarget: PatchTarget;
  reviewerAction: string;
  safetyImpact: SafetyImpact;
  notes: string;
};

type PlannerCandidateGuardRow = {
  caseId: string;
  currentPlannedQuestionId: string | null;
  acceptablePlannedQuestionIds: string[];
  selectedComplaintModule: string | null;
  failedMetricClasses: FailureClass[];
  suggestedFixCategory: SuggestedFixCategory;
  safetyImpact: SafetyImpact;
};

type MetricClassCount = {
  id: FailureClass;
  count: number;
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "shadow-eval-planner-improvement-candidate-guard-qwen.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const annotationFixture = annotations as ShadowEvalFailureAnnotation[];

const EXPECTED_PLANNER_CANDIDATES: readonly PlannerCandidateGuardRow[] = [
  {
    caseId: "gi_vomiting_diarrhea_03_water_comes_back_up",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "gi_keep_water_down_check",
      "gi_vomiting_frequency",
      "gi_blood_check",
    ],
    selectedComplaintModule: "gi_vomiting_diarrhea",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
    ],
    suggestedFixCategory: "gi_targeted_discriminator",
    safetyImpact: "monitor",
  },
  {
    caseId: "skin_itching_allergy_02_paws_belly_itching",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "skin_location_distribution",
      "skin_changes_check",
      "skin_exposure_check",
    ],
    selectedComplaintModule: "skin_itching_allergy",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
    ],
    suggestedFixCategory: "skin_targeted_discriminator",
    safetyImpact: "none",
  },
  {
    caseId: "limping_mobility_pain_02_sudden_after_jump",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "trauma_mechanism_check",
    ],
    selectedComplaintModule: "limping_mobility_pain",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
    ],
    suggestedFixCategory: "limping_targeted_discriminator",
    safetyImpact: "monitor",
  },
  {
    caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
    ],
    selectedComplaintModule: "limping_mobility_pain",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    suggestedFixCategory: "multi_symptom_planner_choice",
    safetyImpact: "monitor",
  },
  {
    caseId: "edge_trauma_small_scrape_vs_steady_bleed",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "bleeding_volume_check",
      "wound_characterization_check",
      "laceration_depth_check",
      "trauma_mechanism_check",
    ],
    selectedComplaintModule: "trauma_bleeding_wound",
    failedMetricClasses: [
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    suggestedFixCategory: "trauma_targeted_discriminator",
    safetyImpact: "monitor",
  },
  {
    caseId: "edge_trauma_repeat_bleeding_avoidance",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "wound_characterization_check",
      "laceration_depth_check",
      "limping_weight_bearing",
      "limping_trauma_onset",
    ],
    selectedComplaintModule: "limping_mobility_pain",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    suggestedFixCategory: "trauma_targeted_discriminator",
    safetyImpact: "monitor",
  },
  {
    caseId: "edge_skin_repeat_location_avoidance",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: ["skin_emergency_allergy_screen"],
    selectedComplaintModule: "skin_itching_allergy",
    failedMetricClasses: [
      "repeated_metric_setup_gap",
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
    ],
    suggestedFixCategory: "skin_targeted_discriminator",
    safetyImpact: "monitor",
  },
  {
    caseId: "edge_limping_not_sure_pain_or_weakness",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check",
    ],
    selectedComplaintModule: "collapse_weakness",
    failedMetricClasses: [
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    suggestedFixCategory: "multi_symptom_planner_choice",
    safetyImpact: "monitor",
  },
  {
    caseId: "edge_multi_diarrhea_limping_cut",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptablePlannedQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
      "gi_blood_check",
    ],
    selectedComplaintModule: "gi_vomiting_diarrhea",
    failedMetricClasses: [
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity",
    ],
    suggestedFixCategory: "multi_symptom_planner_choice",
    safetyImpact: "monitor",
  },
] as const;

const EXPECTED_TOP_FAILED_METRIC_CLASSES: readonly MetricClassCount[] = [
  { id: "generic_metric_setup_gap", count: 9 },
  { id: "red_flag_coverage_gap", count: 8 },
  { id: "repeated_metric_setup_gap", count: 6 },
  { id: "fixture_ambiguity", count: 5 },
] as const;

function buildEvalReport() {
  return evaluateShadowPlannerScenarios({
    scenarios,
    expectedOutcomes,
    edgeScenarios,
    normalizationRows,
  });
}

function determineSuggestedFixCategory(caseId: string): SuggestedFixCategory {
  switch (caseId) {
    case "gi_vomiting_diarrhea_03_water_comes_back_up":
      return "gi_targeted_discriminator";
    case "skin_itching_allergy_02_paws_belly_itching":
    case "edge_skin_repeat_location_avoidance":
      return "skin_targeted_discriminator";
    case "limping_mobility_pain_02_sudden_after_jump":
      return "limping_targeted_discriminator";
    case "edge_trauma_small_scrape_vs_steady_bleed":
    case "edge_trauma_repeat_bleeding_avoidance":
      return "trauma_targeted_discriminator";
    case "limping_mobility_pain_03_limping_with_wound_confuser":
    case "edge_limping_not_sure_pain_or_weakness":
    case "edge_multi_diarrhea_limping_cut":
      return "multi_symptom_planner_choice";
    default:
      throw new Error(`Unexpected planner candidate "${caseId}"`);
  }
}

function buildPlannerCandidateRows(): PlannerCandidateGuardRow[] {
  const report = buildEvalReport();
  const failedCaseMap = new Map(
    report.summary.failedCases.map((failedCase) => [failedCase.caseId, failedCase])
  );

  return annotationFixture
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "planner_improvement_candidate"
    )
    .map((annotation) => {
      const failedCase = failedCaseMap.get(annotation.caseId);

      if (!failedCase) {
        throw new Error(`Missing failed-case row for ${annotation.caseId}`);
      }

      return {
        caseId: annotation.caseId,
        currentPlannedQuestionId: failedCase.actual.plannedQuestionId,
        acceptablePlannedQuestionIds: [
          ...failedCase.expected.acceptableQuestionIds,
        ],
        selectedComplaintModule: failedCase.actual.complaintModuleId,
        failedMetricClasses: [...annotation.secondaryFailureClasses],
        suggestedFixCategory: determineSuggestedFixCategory(annotation.caseId),
        safetyImpact: annotation.safetyImpact,
      };
    });
}

function buildTopFailedMetricClasses(
  rows: readonly PlannerCandidateGuardRow[]
): MetricClassCount[] {
  const counts = new Map<FailureClass, number>();

  for (const row of rows) {
    for (const metricClass of row.failedMetricClasses) {
      counts.set(metricClass, (counts.get(metricClass) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.id.localeCompare(right.id);
    });
}

function getReportOnlyRowsMislabeledAsPlannerCandidates(): string[] {
  return annotationFixture
    .filter(
      (annotation) =>
        annotation.primaryFailureClass === "report_only_quality_gap" &&
        annotation.patchTarget === "planner"
    )
    .map((annotation) => annotation.caseId);
}

describe("shadow eval planner improvement candidate guard", () => {
  it("loads the failure annotation fixture and locks the exact 9 planner candidate rows", () => {
    const plannerCandidates = buildPlannerCandidateRows();

    expect(plannerCandidates).toHaveLength(9);
    expect(plannerCandidates).toEqual(EXPECTED_PLANNER_CANDIDATES);
  });

  it("keeps all planner candidates non-blocking and keeps report-only rows out of the planner candidate lane", () => {
    const plannerCandidates = buildPlannerCandidateRows();

    expect(
      plannerCandidates.every(
        (candidate) => candidate.safetyImpact !== "blocker"
      )
    ).toBe(true);
    expect(getReportOnlyRowsMislabeledAsPlannerCandidates()).toEqual([]);
  });

  it("locks the candidate-only failed metric class mix and keeps the eval surface at 57 cases", () => {
    const plannerCandidates = buildPlannerCandidateRows();
    const report = buildEvalReport();

    expect(buildTopFailedMetricClasses(plannerCandidates)).toEqual(
      EXPECTED_TOP_FAILED_METRIC_CLASSES
    );
    expect(report.summary.totalCases).toBe(57);
  });

  it("keeps the guard doc aligned to the candidate table, non-blocker safety, and report-only boundary", () => {
    for (const candidate of EXPECTED_PLANNER_CANDIDATES) {
      expect(DOC).toContain(`\`${candidate.caseId}\``);
      expect(DOC).toContain(
        `\`${candidate.currentPlannedQuestionId ?? "none"}\``
      );
      expect(DOC).toContain(
        `\`${candidate.selectedComplaintModule ?? "none"}\``
      );
      expect(DOC).toContain(`\`${candidate.suggestedFixCategory}\``);

      for (const questionId of candidate.acceptablePlannedQuestionIds) {
        expect(DOC).toContain(`\`${questionId}\``);
      }

      for (const metricClass of candidate.failedMetricClasses) {
        expect(DOC).toContain(`\`${metricClass}\``);
      }
    }

    expect(DOC).toContain("No candidate has `safetyImpact = blocker`.");
    expect(DOC).toContain(
      "No `report_only_quality_gap` row is mislabeled as a planner candidate."
    );
    expect(DOC).toContain("The eval CLI still reports `57` total cases.");
    expect(DOC).toContain("Validation-only guard.");
    expect(DOC).toContain("No runtime files touched.");

    for (const row of EXPECTED_TOP_FAILED_METRIC_CLASSES) {
      expect(DOC).toContain(`\`${row.id}\`: \`${row.count}\``);
    }
  });
});
