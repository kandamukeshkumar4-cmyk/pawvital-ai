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

    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
    });

    expect(report.summary.totalCases).toBe(33);
    expect(report.caseResults).toHaveLength(33);
    expect(report.summary.failedCases).toEqual(
      report.caseResults.filter((result) => !result.passed).map((result) => ({
        caseId: result.caseId,
        expected: result.expected,
        actual: result.actual,
        reason: result.failures.join("; "),
      }))
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
    expect(JSON.stringify(report)).not.toContain(
      "My dog was in a hot car for a short time"
    );
  });

  it("renders a readable summary without leaking raw owner text", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
    });

    const rendered = renderShadowPlannerScenarioEvalSummary(report.summary);

    expect(rendered).toContain("Shadow Planner Scenario Eval");
    expect(rendered).toContain("Total cases:");
    expect(rendered).toContain("Complaint module match rate:");
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
