import edgeCaseScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";
import {
  triageShadowPlannerEvalFailures,
  type ShadowPlannerEvalFailureClassification,
} from "@/lib/clinical-intelligence/shadow-planner-eval-triage";

function expectClassifications(
  classifications: readonly ShadowPlannerEvalFailureClassification[],
  expected: readonly ShadowPlannerEvalFailureClassification[]
): void {
  expect(classifications).toEqual(expect.arrayContaining(expected));
}

describe("shadow planner eval failure triage", () => {
  it("classifies the VET-1442C report-only failures into deterministic buckets", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes,
    });

    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios,
      expectedOutcomes,
      edgeCaseScenarios,
    });

    expect(triage.totalFailedCases).toBe(33);
    expect(triage.countByClassification.adapter_module_mismatch).toBe(0);
    expect(triage.countByClassification.fixture_expectation_mismatch).toBe(1);
    expect(triage.countByClassification.missing_question_card_coverage).toBe(2);
    expect(triage.countByClassification.off_topic_question_selected).toBe(4);
    expect(triage.countByClassification.repeated_question_setup_gap).toBe(33);
    expect(triage.countByClassification.generic_question_metric_setup_gap).toBe(33);
    expect(triage.countByClassification.red_flag_screen_coverage_gap).toBe(31);
    expect(triage.countByClassification.acceptable_report_only_failure).toBe(28);
    expect(triage.countByClassification.emergency_alignment_ok_quality_gap).toBe(23);

    expect(triage.safetyBlockers).toHaveLength(0);
    expect(triage.qualityReportOnlyGaps).toHaveLength(33);
    expect(triage.context.standardScenarioRepeatedSetupCount).toBe(0);
    expect(triage.context.edgeCaseScenarioRepeatedSetupCount).toBe(6);

    const heatMismatch = triage.failedCaseTriage.find(
      (caseTriage) =>
        caseTriage.caseId ===
        "heatstroke_heat_exposure_02_brachy_panting_after_walk"
    );
    expect(heatMismatch).toBeDefined();
    expectClassifications(heatMismatch!.classifications, [
      "fixture_expectation_mismatch",
      "emergency_alignment_ok_quality_gap",
      "red_flag_screen_coverage_gap",
    ]);

    const traumaCoverageGap = triage.failedCaseTriage.find(
      (caseTriage) =>
        caseTriage.caseId === "trauma_bleeding_wound_01_hit_by_car_pale"
    );
    expect(traumaCoverageGap).toBeDefined();
    expectClassifications(traumaCoverageGap!.classifications, [
      "missing_question_card_coverage",
      "acceptable_report_only_failure",
    ]);

    const routineSkinCase = triage.failedCaseTriage.find(
      (caseTriage) =>
        caseTriage.caseId === "skin_itching_allergy_02_paws_belly_itching"
    );
    expect(routineSkinCase).toBeDefined();
    expectClassifications(routineSkinCase!.classifications, [
      "off_topic_question_selected",
    ]);

    const alignedRespiratoryCase = triage.failedCaseTriage.find(
      (caseTriage) =>
        caseTriage.caseId === "respiratory_distress_02_cough_and_blue_tongue"
    );
    expect(alignedRespiratoryCase).toBeDefined();
    expectClassifications(alignedRespiratoryCase!.classifications, [
      "acceptable_report_only_failure",
      "emergency_alignment_ok_quality_gap",
    ]);

    expect(triage.topComplaintModulesAffected[0]?.count).toBe(3);
    expect(triage.topUnderScreenedRedFlags[0]?.count).toBeGreaterThanOrEqual(
      triage.topUnderScreenedRedFlags[1]?.count ?? 0
    );
    expect(triage.recommendedNextTickets.map((ticket) => ticket.id)).toEqual([
      "shadow-planner-repeated-question-eval-setup",
      "shadow-planner-generic-question-metric-baseline",
      "shadow-planner-red-flag-coverage-audit",
      "shadow-planner-routine-emergency-overselection-triage",
      "shadow-planner-expected-outcome-normalization",
    ]);
  });
});
