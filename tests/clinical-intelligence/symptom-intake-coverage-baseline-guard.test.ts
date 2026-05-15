import fs from "node:fs";
import path from "node:path";

type ExpectedClassification =
  | "mapped_symptom"
  | "unknown_concern_fallback_needed"
  | "clarification_needed"
  | "missing_family";

type SafetyConcern =
  | "none"
  | "emergency_screen_needed"
  | "clarification_needed";

type SymptomIntakeCoverageCase = {
  id: string;
  ownerPhrase: string;
  expectedClassification: ExpectedClassification;
  expectedCanonicalSymptom: string | null;
  proposedFamilyId: string | null;
  safetyConcern: SafetyConcern;
  notes: string;
  noOpUnsafeBecause?: string;
  safetyReason?: string;
};

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "clinical-intelligence",
  "symptom-intake-coverage-baseline-cases.json"
);
const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "symptom-intake-coverage-baseline-guard-qwen.md"
);
const TEST_SOURCE_PATH = __filename;

const ALLOWED_CLASSIFICATIONS: readonly ExpectedClassification[] = [
  "mapped_symptom",
  "unknown_concern_fallback_needed",
  "clarification_needed",
  "missing_family",
];
const ALLOWED_SAFETY_CONCERNS: readonly SafetyConcern[] = [
  "none",
  "emergency_screen_needed",
  "clarification_needed",
];
const REQUIRED_PHRASES = [
  "scooting on carpet",
  "butt licking",
  "foul smell near rear end",
  "drooling a lot",
  "eating rocks",
  "ate a sock",
  "eating dirt",
  "head pressing",
  "circling",
  "staring at wall",
  "arched back",
  "reluctant to move",
  "appetite increased",
  "always hungry",
  "weight gain",
  "trouble swallowing",
  "gagging when swallowing",
  "paw pad cut",
  "limping after stepping on something",
  "broken nail",
  "tail limp",
  "tail base pain",
  "voice changed",
  "noisy breathing / stridor",
  "acute deafness",
] as const;
const BLOCKED_RUNTIME_SURFACES = [
  "clinical-matrix",
  "triage-engine",
  "symptom-memory",
  "route",
  "model-router",
  "question-card registry",
] as const;
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
const RUNTIME_SUPPORT_CLAIM_PATTERNS = [
  /\badds? runtime support\b/i,
  /\bruntime support (?:was|is|has been) added\b/i,
  /\bnow supports\b/i,
  /\bwired into runtime\b/i,
  /\bregistered (?:a )?(?:new )?symptom famil/i,
];

function loadCases(): SymptomIntakeCoverageCase[] {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

function loadDoc(): string {
  return fs.readFileSync(DOC_PATH, "utf8");
}

function countByClassification(cases: SymptomIntakeCoverageCase[]) {
  return cases.reduce<Record<ExpectedClassification, number>>(
    (counts, coverageCase) => {
      counts[coverageCase.expectedClassification] += 1;
      return counts;
    },
    {
      mapped_symptom: 0,
      unknown_concern_fallback_needed: 0,
      clarification_needed: 0,
      missing_family: 0,
    }
  );
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }

  return [];
}

describe("symptom intake coverage baseline guard", () => {
  it("locks at least 25 stable owner-language fixture cases and all required phrases", () => {
    const cases = loadCases();
    const ids = cases.map((coverageCase) => coverageCase.id);
    const joinedPhrases = cases
      .map((coverageCase) => coverageCase.ownerPhrase.toLowerCase())
      .join("\n");

    expect(cases.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ids).size).toBe(ids.length);

    for (const coverageCase of cases) {
      expect(coverageCase.id).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(coverageCase.ownerPhrase.trim().length).toBeGreaterThan(0);
      expect(ALLOWED_CLASSIFICATIONS).toContain(
        coverageCase.expectedClassification
      );
      expect(ALLOWED_SAFETY_CONCERNS).toContain(coverageCase.safetyConcern);
    }

    for (const phrase of REQUIRED_PHRASES) {
      expect(joinedPhrases).toContain(phrase);
    }
  });

  it("locks required classification and safety-count floors", () => {
    const cases = loadCases();
    const counts = countByClassification(cases);
    const safetyWatchCases = cases.filter(
      (coverageCase) => coverageCase.safetyConcern !== "none"
    );

    expect(counts.missing_family).toBeGreaterThanOrEqual(10);
    expect(counts.unknown_concern_fallback_needed).toBeGreaterThanOrEqual(5);
    expect(safetyWatchCases.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps proposed families clearly proposed and not treated as registered symptoms", () => {
    const cases = loadCases();

    for (const coverageCase of cases) {
      if (coverageCase.expectedClassification === "missing_family") {
        expect(coverageCase.proposedFamilyId).toMatch(/^proposed_/);
        expect(coverageCase.expectedCanonicalSymptom).toBeNull();
        expect(coverageCase.notes).toContain(
          "does not claim current runtime support"
        );
        continue;
      }

      expect(coverageCase.proposedFamilyId).toBeNull();
    }
  });

  it("does not import runtime registries to validate proposed families", () => {
    const source = fs.readFileSync(TEST_SOURCE_PATH, "utf8");
    const importLines = source
      .split(/\r?\n/)
      .filter((line) => line.startsWith("import "))
      .join("\n");

    expect(importLines).not.toContain("@/lib/");
    expect(importLines).not.toContain("clinical-matrix");
    expect(importLines).not.toContain("triage-engine");
    expect(importLines).not.toContain("symptom-memory");
    expect(importLines).not.toContain("question-card-registry");
  });

  it("defines why fallback and emergency or clarification rows cannot be silent no-ops", () => {
    for (const coverageCase of loadCases()) {
      if (
        coverageCase.expectedClassification ===
        "unknown_concern_fallback_needed"
      ) {
        expect(coverageCase.noOpUnsafeBecause?.trim()).toBeTruthy();
      }

      if (coverageCase.safetyConcern !== "none") {
        expect(coverageCase.safetyReason?.trim()).toBeTruthy();
      }
    }
  });

  it("keeps fixture text free of diagnosis or treatment claims", () => {
    const fixtureText = collectStrings(loadCases()).join("\n");

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(fixtureText).not.toMatch(pattern);
    }
  });

  it("locks the doc as a measurement-only guard with blocked runtime surfaces", () => {
    const doc = loadDoc();
    const cases = loadCases();
    const counts = countByClassification(cases);
    const safetyWatchCount = cases.filter(
      (coverageCase) => coverageCase.safetyConcern !== "none"
    ).length;

    expect(doc).toContain("measurement guard only");
    expect(doc).toContain("Validation-only.");
    expect(doc).toContain(`Total cases: ${cases.length}`);
    expect(doc).toContain(`mapped_symptom: ${counts.mapped_symptom}`);
    expect(doc).toContain(
      `unknown_concern_fallback_needed: ${counts.unknown_concern_fallback_needed}`
    );
    expect(doc).toContain(`clarification_needed: ${counts.clarification_needed}`);
    expect(doc).toContain(`missing_family: ${counts.missing_family}`);
    expect(doc).toContain(`emergency/clarification watch cases: ${safetyWatchCount}`);

    for (const blockedSurface of BLOCKED_RUNTIME_SURFACES) {
      expect(doc).toContain(blockedSurface);
    }

    for (const pattern of RUNTIME_SUPPORT_CLAIM_PATTERNS) {
      expect(doc).not.toMatch(pattern);
    }

    expect(doc).toContain(
      "VET-1495C - Unknown Concern Never-Drop Runtime Patch"
    );
  });
});
