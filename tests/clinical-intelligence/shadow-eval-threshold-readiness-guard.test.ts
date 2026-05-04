import * as fs from "node:fs";
import * as path from "node:path";

import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "shadow-eval-threshold-readiness-guard-qwen.md"
);

const WORKFLOW_DIR = path.join(process.cwd(), ".github", "workflows");

const EXPECTED_THRESHOLD_FIELDS = [
  "complaintModuleMatchRate",
  "acceptableQuestionRate",
  "emergencyScreenAlignmentRate",
  "repeatedQuestionAvoidanceRate",
  "genericQuestionAvoidanceRate",
  "redFlagScreenCoverageRate",
] as const;

const REQUIRED_DOC_LINES = [
  "These threshold fields are report-only in this phase.",
  "No workflow file enforces these thresholds yet.",
  "No CI fail-closed behavior is added in this ticket.",
  "Any future fail-closed CI gate must land in a separate ticket.",
  "Threshold review must never downgrade emergency behavior or override emergency_handoff.",
] as const;

function readGuardDoc(): string {
  return fs.readFileSync(DOC_PATH, "utf8");
}

function readWorkflowFiles(): Array<{ name: string; content: string }> {
  return fs
    .readdirSync(WORKFLOW_DIR)
    .filter(
      (entry) => entry.endsWith(".yml") || entry.endsWith(".yaml")
    )
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(WORKFLOW_DIR, name), "utf8"),
    }));
}

describe("shadow eval threshold readiness guard", () => {
  it("keeps planned threshold names aligned with the shadow eval summary metrics", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
    });

    const missingFields = EXPECTED_THRESHOLD_FIELDS.filter(
      (field) => !(field in report.summary)
    );
    const nonNumericFields = EXPECTED_THRESHOLD_FIELDS.filter(
      (field) => typeof report.summary[field] !== "number"
    );

    expect(missingFields).toEqual([]);
    expect(nonNumericFields).toEqual([]);
  });

  it("documents the planned threshold contract as report-only", () => {
    const doc = readGuardDoc();

    for (const field of EXPECTED_THRESHOLD_FIELDS) {
      expect(doc).toContain(`\`${field}\``);
    }

    for (const line of REQUIRED_DOC_LINES) {
      expect(doc).toContain(line);
    }
  });

  it("keeps workflow files free of threshold enforcement wiring", () => {
    const workflowHits = readWorkflowFiles().flatMap(({ name, content }) => {
      const thresholdFieldHits = EXPECTED_THRESHOLD_FIELDS.filter((field) =>
        content.includes(field)
      ).map((field) => `${name}:${field}`);

      const harnessHits = [
        "shadow-planner-scenario-eval",
        "eval-shadow-planner-scenarios",
      ]
        .filter((pattern) => content.includes(pattern))
        .map((pattern) => `${name}:${pattern}`);

      return [...thresholdFieldHits, ...harnessHits];
    });

    expect(workflowHits).toEqual([]);
  });
});
