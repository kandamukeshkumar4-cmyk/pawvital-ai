import edgeCaseScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";
import {
  triageShadowPlannerEvalFailures,
  type ShadowPlannerEvalFailureClassification,
  type ShadowPlannerEdgeCaseScenarioFixture,
} from "@/lib/clinical-intelligence/shadow-planner-eval-triage";
import type {
  ShadowPlannerExpectedOutcomeFixture,
  ShadowPlannerScenarioEvalCaseResult,
  ShadowPlannerScenarioEvalReport,
  ShadowPlannerScenarioFixture,
} from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

function expectClassifications(
  classifications: readonly ShadowPlannerEvalFailureClassification[],
  expected: readonly ShadowPlannerEvalFailureClassification[]
): void {
  expect(classifications).toEqual(expect.arrayContaining(expected));
}

function buildScenarioFixture(
  overrides: Partial<ShadowPlannerScenarioFixture> = {}
): ShadowPlannerScenarioFixture {
  return {
    caseId: "synthetic_case",
    ownerText: "My dog seems off.",
    expectedComplaintModuleId: "heatstroke_heat_exposure",
    acceptableFirstQuestionIds: ["panting_excess_check", "emergency_global_screen"],
    mustScreenRedFlags: ["heatstroke_signs"],
    whyThisCaseMatters: "Synthetic triage case",
    shouldPreferEmergencyScreen: false,
    shouldAvoidGenericQuestion: false,
    isConfusingMultiSymptom: false,
    ...overrides,
  };
}

function buildExpectedOutcomeFixture(
  overrides: Partial<ShadowPlannerExpectedOutcomeFixture> = {}
): ShadowPlannerExpectedOutcomeFixture {
  return {
    caseId: "synthetic_case",
    expectedComplaintModuleId: "heatstroke_heat_exposure",
    acceptablePlannedQuestionIds: [
      "panting_excess_check",
      "emergency_global_screen",
    ],
    expectedSelectedBecause: ["urgency_changing"],
    mustScreenRedFlags: ["heatstroke_signs"],
    shouldBeatGenericQuestion: false,
    shouldScreenEmergencyEarlier: false,
    shouldAvoidRepeatedQuestion: false,
    notes: "Synthetic expected outcome",
    ...overrides,
  };
}

function buildCaseResult(
  overrides: Partial<ShadowPlannerScenarioEvalCaseResult> & {
    expected?: Partial<ShadowPlannerScenarioEvalCaseResult["expected"]>;
    actual?: Partial<ShadowPlannerScenarioEvalCaseResult["actual"]>;
  } = {}
): ShadowPlannerScenarioEvalCaseResult {
  const { expected: expectedOverrides, actual: actualOverrides, ...rest } =
    overrides;

  return {
    caseId: "synthetic_case",
    expected: {
      complaintModuleId: "heatstroke_heat_exposure",
      acceptableQuestionIds: ["panting_excess_check", "emergency_global_screen"],
      acceptableSelectedBecause: ["urgency_changing"],
      mustScreenRedFlags: ["heatstroke_signs"],
      shouldBeatGenericQuestion: false,
      shouldScreenEmergencyEarlier: false,
      shouldAvoidRepeatedQuestion: false,
      ...expectedOverrides,
    },
    actual: {
      complaintModuleId: "heatstroke_heat_exposure",
      plannerComplaintFamily: "heatstroke",
      plannedQuestionId: "panting_excess_check",
      selectedBecause: "urgency_changing",
      screenedRedFlags: ["heatstroke_signs"],
      fallbackType: null,
      comparisonReady: true,
      telemetryOwnerFacingImpact: "none",
      genericQuestion: false,
      emergencyScreenQuestion: false,
      ...actualOverrides,
    },
    complaintModuleMatched: true,
    acceptableQuestionMatched: true,
    selectedBecauseMatched: true,
    emergencyScreenAligned: true,
    repeatedQuestionAvoided: true,
    genericQuestionAvoided: true,
    matchedRequiredRedFlags: ["heatstroke_signs"],
    missingRequiredRedFlags: [],
    requiredRedFlagCount: 1,
    failures: ["synthetic failure"],
    passed: false,
    ...rest,
  };
}

function buildReport(
  caseResults: readonly ShadowPlannerScenarioEvalCaseResult[]
): ShadowPlannerScenarioEvalReport {
  return {
    summary: {
      totalCases: caseResults.length,
      complaintModuleMatchCount: 0,
      complaintModuleMatchRate: 0,
      acceptableQuestionCount: 0,
      acceptableQuestionRate: 0,
      emergencyScreenAlignmentCount: 0,
      emergencyScreenAlignmentRelevantCases: 0,
      emergencyScreenAlignmentRate: 0,
      repeatedQuestionAvoidanceCount: 0,
      repeatedQuestionAvoidanceRelevantCases: 0,
      repeatedQuestionAvoidanceRate: 0,
      genericQuestionAvoidanceCount: 0,
      genericQuestionAvoidanceRelevantCases: 0,
      genericQuestionAvoidanceRate: 0,
      screenedRequiredRedFlagCount: 0,
      totalRequiredRedFlagCount: 0,
      redFlagScreenCoverageRate: 0,
      failedCases: [],
    },
    caseResults: [...caseResults],
  };
}

describe("shadow planner eval failure triage", () => {
  it("treats adapter drift as the top safety classification", () => {
    const report = buildReport([
      buildCaseResult({
        complaintModuleMatched: false,
        actual: {
          complaintModuleId: "urinary_obstruction",
          plannerComplaintFamily: "urinary",
        },
      }),
    ]);

    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: [buildScenarioFixture()],
      expectedOutcomes: [buildExpectedOutcomeFixture()],
      edgeCaseScenarios: [],
    });

    expect(triage.totalFailedCases).toBe(1);
    expect(triage.safetyBlockers).toHaveLength(1);
    expect(triage.qualityReportOnlyGaps).toHaveLength(0);
    expect(triage.failedCaseTriage[0]?.primaryClassification).toBe(
      "adapter_module_mismatch"
    );
    expect(triage.failedCaseTriage[0]!.classifications).toEqual([
      "adapter_module_mismatch",
    ]);
  });

  it("distinguishes fixture mismatches from true off-topic selection", () => {
    const report = buildReport([
      buildCaseResult({
        acceptableQuestionMatched: false,
        emergencyScreenAligned: true,
        expected: {
          acceptableQuestionIds: ["panting_excess_check"],
          acceptableSelectedBecause: ["emergency_screen", "urgency_changing"],
          shouldScreenEmergencyEarlier: true,
        },
        actual: {
          plannedQuestionId: "emergency_global_screen",
          selectedBecause: "emergency_screen",
          emergencyScreenQuestion: true,
        },
      }),
    ]);

    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: [
        buildScenarioFixture({
          shouldPreferEmergencyScreen: true,
        }),
      ],
      expectedOutcomes: [
        buildExpectedOutcomeFixture({
          acceptablePlannedQuestionIds: ["panting_excess_check"],
          expectedSelectedBecause: ["emergency_screen", "urgency_changing"],
          shouldScreenEmergencyEarlier: true,
        }),
      ],
      edgeCaseScenarios: [],
    });

    expect(triage.failedCaseTriage[0]?.primaryClassification).toBe(
      "fixture_expectation_mismatch"
    );
    expectClassifications(triage.failedCaseTriage[0]!.classifications, [
      "fixture_expectation_mismatch",
      "emergency_alignment_ok_quality_gap",
    ]);
    expect(triage.failedCaseTriage[0]!.classifications).not.toContain(
      "off_topic_question_selected"
    );
    expect(triage.safetyBlockers).toHaveLength(0);
    expect(triage.qualityReportOnlyGaps).toHaveLength(1);
  });

  it("flags harness-driven repeat and generic gaps without escalating them to safety", () => {
    const report = buildReport([
      buildCaseResult({
        repeatedQuestionAvoided: false,
        genericQuestionAvoided: false,
        expected: {
          acceptableQuestionIds: ["emergency_global_screen"],
          acceptableSelectedBecause: ["emergency_screen"],
          shouldBeatGenericQuestion: true,
          shouldAvoidRepeatedQuestion: true,
        },
        actual: {
          plannedQuestionId: "emergency_global_screen",
          selectedBecause: "emergency_screen",
          emergencyScreenQuestion: true,
          genericQuestion: true,
        },
      }),
    ]);

    const standardScenario = buildScenarioFixture({
      caseId: "repeat_setup_gap_case",
      acceptableFirstQuestionIds: ["emergency_global_screen"],
      shouldAvoidGenericQuestion: true,
    });
    const expectedOutcome = buildExpectedOutcomeFixture({
      caseId: "repeat_setup_gap_case",
      acceptablePlannedQuestionIds: ["emergency_global_screen"],
      expectedSelectedBecause: ["emergency_screen"],
      shouldBeatGenericQuestion: true,
      shouldAvoidRepeatedQuestion: true,
    });
    const edgeCaseScenario: ShadowPlannerEdgeCaseScenarioFixture = {
      caseId: "edge_repeat_setup_context",
      repeatedQuestionSetup: {
        askedQuestionIds: ["urinary_straining_output"],
        answeredQuestionIds: ["urinary_straining_output"],
      },
    };

    report.caseResults[0] = buildCaseResult({
      caseId: "repeat_setup_gap_case",
      repeatedQuestionAvoided: false,
      genericQuestionAvoided: false,
      expected: {
        complaintModuleId: "heatstroke_heat_exposure",
        acceptableQuestionIds: ["emergency_global_screen"],
        acceptableSelectedBecause: ["emergency_screen"],
        shouldBeatGenericQuestion: true,
        shouldAvoidRepeatedQuestion: true,
      },
      actual: {
        plannedQuestionId: "emergency_global_screen",
        selectedBecause: "emergency_screen",
        emergencyScreenQuestion: true,
        genericQuestion: true,
      },
    });

    const triage = triageShadowPlannerEvalFailures({
      report,
      scenarios: [standardScenario],
      expectedOutcomes: [expectedOutcome],
      edgeCaseScenarios: [edgeCaseScenario],
    });

    expectClassifications(triage.failedCaseTriage[0]!.classifications, [
      "repeated_question_setup_gap",
      "generic_question_metric_setup_gap",
      "acceptable_report_only_failure",
    ]);
    expect(triage.safetyBlockers).toHaveLength(0);
    expect(triage.recommendedNextTickets.map((ticket) => ticket.id)).toEqual([
      "shadow-planner-repeated-question-eval-setup",
      "shadow-planner-generic-question-metric-baseline",
      "shadow-planner-red-flag-coverage-audit",
    ]);
  });

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

    expect(triage.totalFailedCases).toBe(31);
    expect(triage.countByClassification.adapter_module_mismatch).toBe(0);
    expect(triage.countByClassification.fixture_expectation_mismatch).toBe(1);
    expect(triage.countByClassification.missing_question_card_coverage).toBe(2);
    expect(triage.countByClassification.off_topic_question_selected).toBe(1);
    expect(triage.countByClassification.repeated_question_setup_gap).toBe(28);
    expect(triage.countByClassification.generic_question_metric_setup_gap).toBe(28);
    expect(triage.countByClassification.red_flag_screen_coverage_gap).toBe(30);
    expect(triage.countByClassification.acceptable_report_only_failure).toBe(29);
    expect(triage.countByClassification.emergency_alignment_ok_quality_gap).toBe(23);

    expect(triage.safetyBlockers).toHaveLength(0);
    expect(triage.qualityReportOnlyGaps).toHaveLength(31);
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

    const giWaterMismatch = triage.failedCaseTriage.find(
      (caseTriage) =>
        caseTriage.caseId === "gi_vomiting_diarrhea_03_water_comes_back_up"
    );
    expect(giWaterMismatch).toBeDefined();
    expectClassifications(giWaterMismatch!.classifications, [
      "off_topic_question_selected",
      "repeated_question_setup_gap",
      "generic_question_metric_setup_gap",
      "red_flag_screen_coverage_gap",
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
