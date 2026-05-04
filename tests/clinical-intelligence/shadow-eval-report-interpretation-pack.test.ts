import fs from "node:fs";
import path from "node:path";

import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "shadow-eval-report-interpretation-kimi.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const REQUIRED_FAILURE_CLASSES = [
  "safety_critical",
  "emergency_screen_gap",
  "repeated_question_regression",
  "acceptable_ambiguity",
  "quality_only",
  "fixture_error",
] as const;

const FAILURE_CLASS_EVIDENCE = [
  {
    name: "safety_critical",
    phrases: ["missingRequiredRedFlags", "redFlagScreenCoverageRate"],
  },
  {
    name: "emergency_screen_gap",
    phrases: [
      "Emergency-screen alignment expectation was not met",
      "emergencyScreenAlignmentRate",
    ],
  },
  {
    name: "repeated_question_regression",
    phrases: [
      "Repeated-question avoidance expectation was not met",
      "repeatedQuestionAvoidanceRate",
    ],
  },
  {
    name: "acceptable_ambiguity",
    phrases: ["confusing multi-symptom", "registry-backed alternative"],
  },
  {
    name: "quality_only",
    phrases: ["selectedBecause", "genericQuestionAvoidanceRate"],
  },
  {
    name: "fixture_error",
    phrases: ["scenario/outcome mismatch", "unregistered", "duplicate case IDs"],
  },
] as const;

const REQUIRED_METRIC_ACTIONS = [
  {
    metric: "complaintModuleMatchRate",
    actionFragment: "adapter routing first",
  },
  {
    metric: "acceptableQuestionRate",
    actionFragment: "fixture ambiguity before patching code",
  },
  {
    metric: "emergencyScreenAlignmentRate",
    actionFragment: "block cutover until resolved",
  },
  {
    metric: "repeatedQuestionAvoidanceRate",
    actionFragment: "inspect asked/answered filtering",
  },
  {
    metric: "genericQuestionAvoidanceRate",
    actionFragment: "quality-only unless they also drop emergency screening",
  },
  {
    metric: "redFlagScreenCoverageRate",
    actionFragment: "safety-critical unless the fixture itself names impossible flags",
  },
  {
    metric: "failedCases",
    actionFragment: "one of the six failure classes",
  },
] as const;

const BANNED_GUIDANCE_PATTERNS = [
  /\bantibiotic\b/i,
  /\bsteroid\b/i,
  /\bmg\b/i,
  /\bdos(?:e|age)\b/i,
  /\bprescri(?:be|bed|ption)\b/i,
  /\bsurgery\b/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFailureClassBlock(failureClass: string): string {
  const match = DOC.match(
    new RegExp(
      `- \`${escapeRegExp(failureClass)}\`\\s*[\\s\\S]*?(?=\\n- \`|\\n## )`
    )
  );

  if (!match) {
    throw new Error(`Missing failure class block for ${failureClass}`);
  }

  return match[0];
}

function getMetricActionRow(metric: string): string {
  const match = DOC.match(
    new RegExp(`^\\|\\s*\`${escapeRegExp(metric)}\`\\s*\\|.*$`, "m")
  );

  if (!match) {
    throw new Error(`Missing metric-to-action row for ${metric}`);
  }

  return match[0];
}

describe("shadow eval report interpretation pack", () => {
  it("documents the required failure classes against the live shadow-eval harness surface", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
    });

    expect(report.summary.emergencyScreenAlignmentRelevantCases).toBeGreaterThanOrEqual(
      12
    );
    expect(
      scenarios.filter((scenario) => scenario.isConfusingMultiSymptom).length
    ).toBeGreaterThanOrEqual(8);

    for (const failureClass of REQUIRED_FAILURE_CLASSES) {
      expect(DOC).toContain(`\`${failureClass}\``);
    }

    for (const evidence of FAILURE_CLASS_EVIDENCE) {
      const classBlock = getFailureClassBlock(evidence.name);

      for (const phrase of evidence.phrases) {
        expect(classBlock).toContain(phrase);
      }
    }
  });

  it("maps every current shadow-eval metric to a reviewer action", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes: outcomes,
    });

    for (const { metric, actionFragment } of REQUIRED_METRIC_ACTIONS) {
      const metricRow = getMetricActionRow(metric);

      expect(report.summary).toHaveProperty(metric);
      expect(metricRow).toContain(actionFragment);
    }
  });

  it("documents patch-routing boundaries and keeps cutover explicitly blocked", () => {
    expect(DOC).toContain("Patch fixtures when");
    expect(DOC).toContain("Patch the adapter when");
    expect(DOC).toContain("Patch question cards when");
    expect(DOC).toContain(
      "Runtime cutover remains blocked until the report-only shadow eval is stable."
    );
  });

  it("states the non-clinical scope and avoids diagnosis or treatment guidance", () => {
    expect(DOC).toContain(
      "This pack does not provide diagnosis or treatment guidance."
    );

    for (const pattern of BANNED_GUIDANCE_PATTERNS) {
      expect(DOC).not.toMatch(pattern);
    }
  });
});
