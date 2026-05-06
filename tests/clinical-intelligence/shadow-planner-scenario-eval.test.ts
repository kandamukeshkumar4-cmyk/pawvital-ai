import edgeCases from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import normalizationRows from "../fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json";
import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { createInitialClinicalCaseState } from "@/lib/clinical-intelligence/case-state";
import {
  evaluateShadowPlannerScenarioCase,
  evaluateShadowPlannerScenarios,
  renderShadowPlannerScenarioEvalSummary,
} from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

describe("shadow planner scenario eval harness", () => {
  it("evaluates the merged scenario and outcome packs into the required metric shape without mutating fixtures", () => {
    const scenarioClone = structuredClone(scenarios);
    const outcomeClone = structuredClone(outcomes);
    const edgeCaseClone = structuredClone(edgeCases);
    const normalizationClone = structuredClone(normalizationRows);

    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
      edgeScenarios: edgeCases,
      normalizationRows,
    });

    expect(report.summary.totalCases).toBe(57);
    expect(report.summary.baseCaseCount).toBe(33);
    expect(report.summary.edgeCaseCount).toBe(24);
    expect(report.caseResults).toHaveLength(57);
    expect(report.summary.rawFailedCaseCount).toBe(report.summary.failedCases.length);
    expect(report.summary.failedCases).toEqual(
      report.caseResults.filter((result) => !result.passed).map((result) => ({
        caseId: result.caseId,
        fixtureKind: result.fixtureKind,
        expected: result.expected,
        actual: result.actual,
        reason: result.failures.join("; "),
        rawReason: result.failures.join("; "),
        normalizedReason: result.normalizedFailures?.join("; ") ?? "",
        repeatedQuestionMetricStatus: result.repeatedQuestionMetricStatus,
        genericQuestionMetricStatus: result.genericQuestionMetricStatus,
      }))
    );
    expect(report.summary.repeatedQuestionEligibleCases).toBe(6);
    expect(report.summary.repeatedQuestionAvoidanceRelevantCases).toBe(6);
    expect(report.summary.repeatedQuestionAvoidanceCount).toBe(0);
    expect(report.summary.repeatedQuestionAvoidanceRate).toBe(0);
    expect(report.summary.genericQuestionEligibleCases).toBe(11);
    expect(report.summary.genericQuestionAvoidanceRelevantCases).toBe(11);
    expect(report.summary.genericQuestionAvoidanceCount).toBe(0);
    expect(report.summary.genericQuestionAvoidanceRate).toBe(0);
    expect(report.summary.rawMetrics).toBeDefined();
    expect(report.summary.normalizedMetrics).toBeDefined();
    expect(report.summary.rawMetrics?.repeatedQuestionAvoidanceRelevantCases).toBe(
      39
    );
    expect(report.summary.rawMetrics?.genericQuestionAvoidanceRelevantCases).toBe(
      57
    );
    expect(
      report.summary.normalizedMetrics?.genericQuestionAvoidanceRelevantCases
    ).toBe(29);
    expect(
      report.summary.normalizedMetrics?.totalRequiredRedFlagCount
    ).toBe(
      outcomes
        .filter((outcome) => {
          const normalizationRow = normalizationRows.find(
            (row) => row.caseId === outcome.caseId
          );
          return normalizationRow?.redFlagCoverageExpectation === "complete";
        })
        .reduce((total, outcome) => total + outcome.mustScreenRedFlags.length, 0) +
        edgeCases.reduce(
          (total, scenario) => total + scenario.mustScreenRedFlags.length,
          0
        )
    );

    const normalizedHeatCase = report.caseResults.find(
      (result) =>
        result.caseId === "heatstroke_heat_exposure_02_brachy_panting_after_walk"
    );

    expect(normalizedHeatCase?.acceptableQuestionMatched).toBe(false);
    expect(normalizedHeatCase?.normalizedAcceptableQuestionMatched).toBe(true);
    expect(
      normalizedHeatCase?.normalizedExpected?.redFlagCoverageExpectation
    ).toBe("complete");
    expect(normalizedHeatCase?.rawReason).toContain(
      "Planned question \"emergency_global_screen\" is outside the acceptable set"
    );
    expect(normalizedHeatCase?.normalizedReason).not.toContain(
      "Planned question \"emergency_global_screen\" is outside the acceptable set"
    );

    const genericExcludedCase = report.caseResults.find(
      (result) =>
        result.caseId === "heatstroke_heat_exposure_01_hot_car_collapse"
    );

    expect(genericExcludedCase?.normalizedExpected?.genericQuestionScoring).toBe(
      "exclude_for_now"
    );
    expect(
      genericExcludedCase?.normalizedExpected?.redFlagCoverageExpectation
    ).toBe("partial");
    expect(genericExcludedCase?.rawReason).toContain(
      "Generic-question avoidance expectation was not met"
    );
    expect(genericExcludedCase?.normalizedReason).not.toContain(
      "Generic-question avoidance expectation was not met"
    );
    expect(genericExcludedCase?.repeatedQuestionMetricStatus).toBe(
      "no_metric_setup"
    );
    expect(genericExcludedCase?.genericQuestionMetricStatus).toBe(
      "no_metric_setup"
    );

    const genericFailureCase = report.summary.failedCases.find(
      (result) =>
        result.caseId === "heatstroke_heat_exposure_02_brachy_panting_after_walk"
    );

    expect(genericFailureCase?.repeatedQuestionMetricStatus).toBe(
      "no_metric_setup"
    );
    expect(genericFailureCase?.genericQuestionMetricStatus).toBe(
      "actual_generic_question_failure"
    );

    const repeatedFailureCase = report.summary.failedCases.find(
      (result) => result.caseId === "edge_urinary_repeat_straining_avoidance"
    );

    expect(repeatedFailureCase?.repeatedQuestionMetricStatus).toBe(
      "actual_repeated_question_failure"
    );
    expect(repeatedFailureCase?.genericQuestionMetricStatus).toBe(
      "no_metric_setup"
    );

    expect(report.summary.complaintModuleMatchRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.complaintModuleMatchRate).toBeLessThanOrEqual(1);
    expect(report.summary.acceptableQuestionRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.acceptableQuestionRate).toBeLessThanOrEqual(1);
    expect(report.summary.emergencyScreenAlignmentRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.emergencyScreenAlignmentRate).toBeLessThanOrEqual(1);
    expect(report.summary.repeatedQuestionAvoidanceRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.repeatedQuestionAvoidanceRate).toBeLessThanOrEqual(1);
    expect(report.summary.genericQuestionAvoidanceRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.genericQuestionAvoidanceRate).toBeLessThanOrEqual(1);
    expect(report.summary.redFlagScreenCoverageRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.redFlagScreenCoverageRate).toBeLessThanOrEqual(1);

    expect(scenarios).toEqual(scenarioClone);
    expect(outcomes).toEqual(outcomeClone);
    expect(edgeCases).toEqual(edgeCaseClone);
    expect(normalizationRows).toEqual(normalizationClone);
    expect(JSON.stringify(report)).not.toContain(
      "My dog was in a hot car for a short time"
    );
  });

  it("renders a readable summary without leaking raw owner text", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
      edgeScenarios: edgeCases,
      normalizationRows,
    });

    const rendered = renderShadowPlannerScenarioEvalSummary(report.summary);

    expect(rendered).toContain("Shadow Planner Scenario Eval");
    expect(rendered).toContain("Total cases:");
    expect(rendered).toContain("Base cases:");
    expect(rendered).toContain("Edge cases:");
    expect(rendered).toContain("Setup-aware metrics");
    expect(rendered).toContain("Repeated eligible cases:");
    expect(rendered).toContain("Generic eligible cases:");
    expect(rendered).toContain("Raw metrics");
    expect(rendered).toContain("Normalized metrics");
    expect(rendered).toContain("Complaint module match rate:");
    expect(rendered).toContain("metrics: repeated=");
    expect(rendered).toContain("Failed cases:");
    expect(rendered).not.toContain(
      "My dog was in a hot car for a short time"
    );
  });

  it("preserves emergency handoff behavior when an emergency case state is supplied", () => {
    const report = evaluateShadowPlannerScenarioCase({
      scenario: scenarios[0],
      expectedOutcome: outcomes[0],
      buildCaseState: () => ({
        ...createInitialClinicalCaseState(),
        currentUrgency: "emergency",
        urgencyTrajectory: "worsening",
      }),
    });

    expect(report.actual.fallbackType).toBe("emergency_handoff");
    expect(report.actual.telemetryOwnerFacingImpact).toBe("none");
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("emergency_handoff"),
      ])
    );
  });
});
