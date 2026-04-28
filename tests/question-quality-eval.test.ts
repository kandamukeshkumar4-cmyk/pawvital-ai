import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const harness = require("../scripts/eval-question-quality.ts");

const SAMPLE_CASES = [
  {
    id: "vomiting-basic",
    symptomKeys: ["vomiting"],
  },
  {
    id: "bloat-risk",
    symptomKeys: ["vomiting", "swollen_abdomen"],
    turnFocusSymptoms: ["swollen_abdomen"],
    redFlags: ["unproductive_retching", "rapid_onset_distension"],
    mustScreenEmergency: true,
  },
  {
    id: "breathing-screen",
    symptomKeys: ["difficulty_breathing"],
    redFlags: ["blue_gums"],
    mustScreenEmergency: true,
  },
  {
    id: "limping-screen",
    symptomKeys: ["limping"],
    redFlags: ["non_weight_bearing"],
    mustScreenEmergency: true,
  },
];

const defaultFixturePath = harness.FIXTURE_PATH;
const hadOriginalFixture = fs.existsSync(defaultFixturePath);
const originalFixtureContents = hadOriginalFixture
  ? fs.readFileSync(defaultFixturePath, "utf8")
  : null;

function restoreDefaultFixture() {
  if (hadOriginalFixture && originalFixtureContents !== null) {
    fs.mkdirSync(path.dirname(defaultFixturePath), { recursive: true });
    fs.writeFileSync(defaultFixturePath, originalFixtureContents);
    return;
  }

  if (fs.existsSync(defaultFixturePath)) {
    fs.rmSync(defaultFixturePath);
  }
}

function writeDefaultFixture(cases = SAMPLE_CASES) {
  fs.mkdirSync(path.dirname(defaultFixturePath), { recursive: true });
  fs.writeFileSync(defaultFixturePath, `${JSON.stringify(cases, null, 2)}\n`);
}

function writeTempFixture(cases = SAMPLE_CASES) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pawvital-question-quality-")
  );
  const fixturePath = path.join(tempDir, "question-quality-cases.json");
  fs.writeFileSync(fixturePath, `${JSON.stringify(cases, null, 2)}\n`);
  return { tempDir, fixturePath };
}

describe("question-quality eval harness", () => {
  afterEach(() => {
    restoreDefaultFixture();
  });

  afterAll(() => {
    restoreDefaultFixture();
  });

  it("loads and scores deterministic question-quality cases", async () => {
    const { fixturePath, tempDir } = writeTempFixture();

    try {
      const report = await harness.runEvaluation({ fixturePath });

      expect(report.fixturePath).toBe(fixturePath);
      expect(report.summary.totalCases).toBe(4);
      expect(report.summary.averageScore).toBeGreaterThan(0);
      expect(report.caseResults).toHaveLength(4);
      expect(Object.keys(report.summary.categoryScores)).toEqual(
        harness.CATEGORY_KEYS
      );
      expect(report.caseResults.every((result: any) => result.questionId)).toBe(true);

      const breathingCase = report.caseResults.find(
        (result: any) => result.caseDefinition.id === "breathing-screen"
      );
      expect(breathingCase).toBeDefined();
      expect(breathingCase.missedRedFlags).toContain("blue_gums");
      expect(breathingCase.emergencyScreened).toBe(true);

      const limpingCase = report.caseResults.find(
        (result: any) => result.caseDefinition.id === "limping-screen"
      );
      expect(limpingCase).toBeDefined();
      expect(limpingCase.repeated).toBe(false);

      expect(
        report.summary.recommendedModules.map((item: any) => item.moduleId)
      ).toContain("red_flag_coverage");
      expect(
        report.summary.missedRedFlags.map((item: any) => item.redFlag)
      ).toContain("blue_gums");

      const summary = harness.formatSummary(report);
      expect(summary).toContain("PAWVITAL QUESTION-QUALITY EVAL");
      expect(summary).toContain("Total cases: 4");
      expect(summary).toContain("Category scores:");
      expect(summary).toContain("Generic rate:");
      expect(summary).toContain("Emergency miss rate:");
      expect(summary).toContain("Emergency-screen rate:");
      expect(summary).toContain("Repeated rate:");
      expect(summary).toContain("Top 20 weak patterns:");
      expect(summary).toContain("Top 20 missed red flags:");
      expect(summary).toContain("Recommended modules:");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails fast when the fixture path is missing", () => {
    const missingFixturePath = path.join(
      os.tmpdir(),
      `missing-question-quality-${Date.now()}.json`
    );

    expect(() => harness.loadCases(missingFixturePath)).toThrow(
      /Question-quality fixture not found/
    );
  });

  it("maps red-flag aliases to screening questions", () => {
    expect(
      harness.__private.questionScreensRedFlag(
        "gum_color",
        "What color are the gums?",
        "blue_gums"
      )
    ).toBe(true);

    expect(
      harness.__private.questionScreensRedFlag(
        "weight_bearing",
        "Can he put weight on that leg?",
        "non_weight_bearing"
      )
    ).toBe(true);

    expect(
      harness.__private.questionScreensRedFlag(
        "vomit_duration",
        "How long has the vomiting been going on?",
        "blue_gums"
      )
    ).toBe(false);
  });

  it("runs from the required repo fixture path with plain node", () => {
    writeDefaultFixture();

    const result = spawnSync(process.execPath, ["scripts/eval-question-quality.ts"], {
      cwd: path.resolve(__dirname, ".."),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PAWVITAL QUESTION-QUALITY EVAL");
    expect(result.stdout).toContain("Total cases: 4");
    expect(result.stdout).toContain("Average score:");
    expect(result.stdout).toContain("Category scores:");
    expect(result.stdout).toContain("Generic rate:");
    expect(result.stdout).toContain("Emergency miss rate:");
    expect(result.stdout).toContain("Emergency-screen rate:");
    expect(result.stdout).toContain("Repeated rate:");
    expect(result.stdout).toContain("Top 20 weak patterns:");
    expect(result.stdout).toContain("Top 20 missed red flags:");
    expect(result.stdout).toContain("Recommended modules:");
  });
});
