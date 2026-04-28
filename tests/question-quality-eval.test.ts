import path from "node:path";
import { spawnSync } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const harness = require("../scripts/eval-question-quality.ts");

type EvalFixtureCase = {
  category: string;
  complaintFamily: string;
  pet: { species: string };
  expectedMustScreen: string[];
  badFirstQuestions: string[];
  idealQuestionCategories: string[];
};

type EvalReport = {
  caseResults: unknown[];
  summary: {
    totalCases: number;
    averageQuestionScore: number;
    genericQuestionRate: number;
    emergencyRedFlagMissRate: number;
    firstQuestionEmergencyScreenRate: number;
    repeatedQuestionRate: number;
    categoryScores: Record<string, number>;
    weakPatterns: Array<{ pattern: string }>;
    missedRedFlagPatterns: Array<{ pattern: string }>;
    recommendedFirstModules: Array<{ moduleId: string }>;
    worstComplaintFamilies: Array<{ complaintFamily: string }>;
  };
};

describe("question intelligence baseline eval harness", () => {
  it("loads the committed 150-case dog-only fixture contract", () => {
    const cases = harness.loadCases() as EvalFixtureCase[];
    const categoryCounts = cases.reduce((counts: Record<string, number>, testCase) => {
      counts[testCase.category] = (counts[testCase.category] ?? 0) + 1;
      return counts;
    }, {});
    const complaintFamilies = new Set(cases.map((testCase) => testCase.complaintFamily));

    expect(cases).toHaveLength(150);
    expect(categoryCounts).toEqual({
      emergency: 45,
      urgent_same_day: 40,
      routine_unclear: 40,
      confusing_multi_symptom: 25,
    });
    expect(cases.every((testCase) => testCase.pet.species === "dog")).toBe(true);
    expect(complaintFamilies.size).toBe(25);
    expect(complaintFamilies.has("collapse_pale_gums")).toBe(true);
    expect(complaintFamilies.has("urinary_blockage")).toBe(true);
    expect(complaintFamilies.has("old_dog_vague_weakness")).toBe(true);
    expect(
      cases.every(
        (testCase) =>
          Array.isArray(testCase.expectedMustScreen) &&
          testCase.expectedMustScreen.length > 0 &&
          Array.isArray(testCase.badFirstQuestions) &&
          testCase.badFirstQuestions.length > 0 &&
          Array.isArray(testCase.idealQuestionCategories) &&
          testCase.idealQuestionCategories.length > 0
      )
    ).toBe(true);
  });

  it("scores the real fixture and returns the required summary surfaces", async () => {
    const report = (await harness.runEvaluation()) as EvalReport;

    expect(report.summary.totalCases).toBe(150);
    expect(report.caseResults).toHaveLength(150);
    expect(report.summary.averageQuestionScore).toBeGreaterThanOrEqual(0);
    expect(report.summary.averageQuestionScore).toBeLessThanOrEqual(3);
    expect(report.summary.genericQuestionRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.genericQuestionRate).toBeLessThanOrEqual(1);
    expect(report.summary.emergencyRedFlagMissRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.emergencyRedFlagMissRate).toBeLessThanOrEqual(1);
    expect(report.summary.firstQuestionEmergencyScreenRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.firstQuestionEmergencyScreenRate).toBeLessThanOrEqual(1);
    expect(report.summary.repeatedQuestionRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.repeatedQuestionRate).toBeLessThanOrEqual(1);
    expect(Object.keys(report.summary.categoryScores)).toEqual(harness.CATEGORY_KEYS);
    expect(report.summary.weakPatterns.length).toBeGreaterThan(0);
    expect(report.summary.missedRedFlagPatterns.length).toBeGreaterThan(0);
    expect(report.summary.recommendedFirstModules.length).toBeGreaterThan(0);
    expect(report.summary.worstComplaintFamilies.length).toBeGreaterThan(0);

    const summary = harness.formatSummary(report);
    expect(summary).toContain("PAWVITAL QUESTION INTELLIGENCE BASELINE");
    expect(summary).toContain("Total cases: 150");
    expect(summary).toContain("Average question score:");
    expect(summary).toContain("Generic question rate:");
    expect(summary).toContain("Emergency red-flag miss rate:");
    expect(summary).toContain("First-question emergency-screen rate:");
    expect(summary).toContain("Repeated-question rate:");
    expect(summary).toContain("Per-category scores:");
    expect(summary).toContain("Top 20 generic or weak question patterns:");
    expect(summary).toContain("Top 20 missed red-flag patterns:");
    expect(summary).toContain("Recommended first complaint modules:");
  });

  it("runs from the CLI and prints the baseline report", () => {
    const result = spawnSync(process.execPath, ["scripts/eval-question-quality.ts"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PAWVITAL QUESTION INTELLIGENCE BASELINE");
    expect(result.stdout).toContain("Total cases: 150");
    expect(result.stdout).toContain("Average question score:");
    expect(result.stdout).toContain("Generic question rate:");
    expect(result.stdout).toContain("Emergency red-flag miss rate:");
    expect(result.stdout).toContain("First-question emergency-screen rate:");
    expect(result.stdout).toContain("Repeated-question rate:");
    expect(result.stdout).toContain("Per-category scores:");
    expect(result.stdout).toContain("Worst complaint families:");
    expect(result.stdout).toContain("Top 20 generic or weak question patterns:");
    expect(result.stdout).toContain("Top 20 missed red-flag patterns:");
    expect(result.stdout).toContain("Recommended first complaint modules:");
  });
});
