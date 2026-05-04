import normalizationRows from "../fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json";
import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";

type AmbiguityDisposition =
  | "strict_primary"
  | "same_module_only"
  | "allow_module_alternatives";

type EmergencyAlignmentDisposition =
  | "question_match_required"
  | "alignment_only_ok";

type RedFlagCoverageExpectation = "complete" | "partial";

type GenericQuestionScoring = "include" | "exclude_for_now";

type ShadowPlannerScenario = {
  caseId: string;
  expectedComplaintModuleId: string;
  acceptableFirstQuestionIds: string[];
  isConfusingMultiSymptom: boolean;
};

type ShadowPlannerExpectedOutcome = {
  caseId: string;
  expectedComplaintModuleId: string;
  acceptablePlannedQuestionIds: string[];
  shouldScreenEmergencyEarlier: boolean;
};

type ShadowPlannerExpectedOutcomeNormalization = {
  caseId: string;
  acceptableModuleIds: string[];
  ambiguityDisposition: AmbiguityDisposition;
  emergencyAlignmentDisposition: EmergencyAlignmentDisposition;
  redFlagCoverageExpectation: RedFlagCoverageExpectation;
  genericQuestionScoring: GenericQuestionScoring;
  notes: string;
};

const REQUIRED_KEYS = [
  "acceptableModuleIds",
  "ambiguityDisposition",
  "caseId",
  "emergencyAlignmentDisposition",
  "genericQuestionScoring",
  "notes",
  "redFlagCoverageExpectation",
].sort();

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

const scenarioFixture = scenarios as ShadowPlannerScenario[];
const outcomeFixture = outcomes as ShadowPlannerExpectedOutcome[];
const normalizationFixture =
  normalizationRows as ShadowPlannerExpectedOutcomeNormalization[];

function getScenarioByCaseId(caseId: string): ShadowPlannerScenario {
  const scenario = scenarioFixture.find((row) => row.caseId === caseId);
  if (!scenario) {
    throw new Error(`Missing scenario for ${caseId}`);
  }
  return scenario;
}

function getOutcomeByCaseId(caseId: string): ShadowPlannerExpectedOutcome {
  const outcome = outcomeFixture.find((row) => row.caseId === caseId);
  if (!outcome) {
    throw new Error(`Missing expected outcome for ${caseId}`);
  }
  return outcome;
}

function getNormalizationRow(
  caseId: string
): ShadowPlannerExpectedOutcomeNormalization {
  const row = normalizationFixture.find((item) => item.caseId === caseId);
  if (!row) {
    throw new Error(`Missing normalization row for ${caseId}`);
  }
  return row;
}

describe("shadow planner expected outcome normalization pack", () => {
  it("packages one normalization row for every expected outcome row", () => {
    expect(normalizationFixture).toHaveLength(33);
    expect(normalizationFixture).toHaveLength(outcomeFixture.length);

    const caseIds = new Set<string>();
    const registeredModuleIds = new Set(
      getComplaintModules().map((complaintModule) => complaintModule.id)
    );

    for (const row of normalizationFixture) {
      expect(Object.keys(row).sort()).toEqual(REQUIRED_KEYS);
      expect(row.caseId).toMatch(/^[a-z0-9_]+$/);
      expect(caseIds.has(row.caseId)).toBe(false);
      caseIds.add(row.caseId);

      const outcome = getOutcomeByCaseId(row.caseId);

      expect(row.acceptableModuleIds.length).toBeGreaterThan(0);
      expect(row.acceptableModuleIds).toContain(outcome.expectedComplaintModuleId);
      expect(row.notes.trim()).toBe(row.notes);
      expect(row.notes.length).toBeGreaterThan(20);

      for (const moduleId of row.acceptableModuleIds) {
        expect(registeredModuleIds.has(moduleId)).toBe(true);
      }
    }
  });

  it("normalizes every confusing multi-symptom row and preserves strict primary handling for non-confusers", () => {
    const confuserRows = normalizationFixture.filter((row) => {
      const scenario = getScenarioByCaseId(row.caseId);
      return scenario.isConfusingMultiSymptom;
    });
    const strictPrimaryRows = normalizationFixture.filter(
      (row) => row.ambiguityDisposition === "strict_primary"
    );

    expect(confuserRows).toHaveLength(15);

    for (const row of confuserRows) {
      expect(row.ambiguityDisposition).not.toBe("strict_primary");
    }

    for (const row of strictPrimaryRows) {
      const scenario = getScenarioByCaseId(row.caseId);
      expect(scenario.isConfusingMultiSymptom).toBe(false);
      expect(row.acceptableModuleIds).toEqual([
        getOutcomeByCaseId(row.caseId).expectedComplaintModuleId,
      ]);
    }

    expect(
      normalizationFixture.filter(
        (row) => row.ambiguityDisposition === "allow_module_alternatives"
      )
    ).toHaveLength(12);

    expect(
      getNormalizationRow(
        "heatstroke_heat_exposure_03_heat_plus_vomit_confuser"
      ).acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "heatstroke_heat_exposure",
        "gi_vomiting_diarrhea",
      ])
    );
    expect(
      getNormalizationRow(
        "trauma_bleeding_wound_03_limping_after_fall_confuser"
      ).acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "trauma_bleeding_wound",
        "limping_mobility_pain",
      ])
    );
    expect(
      getNormalizationRow(
        "respiratory_distress_03_fast_breathing_after_heat_confuser"
      ).acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "respiratory_distress",
        "heatstroke_heat_exposure",
      ])
    );
    expect(
      getNormalizationRow(
        "skin_itching_allergy_03_face_swelling_and_vomit_confuser"
      ).acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "skin_itching_allergy",
        "respiratory_distress",
        "gi_vomiting_diarrhea",
      ])
    );

    expect(
      getNormalizationRow(
        "urinary_obstruction_02_accidents_blood_straining"
      ).ambiguityDisposition
    ).toBe("same_module_only");
    expect(
      getNormalizationRow("respiratory_distress_02_cough_and_blue_tongue")
        .ambiguityDisposition
    ).toBe("same_module_only");
    expect(
      getNormalizationRow("gi_vomiting_diarrhea_02_bloody_diarrhea")
        .ambiguityDisposition
    ).toBe("same_module_only");
  });

  it("marks emergency-alignment-only rows directly from the expected outcome emergency signal", () => {
    const alignmentOnlyRows = normalizationFixture.filter(
      (row) => row.emergencyAlignmentDisposition === "alignment_only_ok"
    );

    expect(alignmentOnlyRows).toHaveLength(23);

    for (const row of normalizationFixture) {
      const outcome = getOutcomeByCaseId(row.caseId);
      expect(row.emergencyAlignmentDisposition).toBe(
        outcome.shouldScreenEmergencyEarlier
          ? "alignment_only_ok"
          : "question_match_required"
      );
    }
  });

  it("marks partial red-flag coverage and generic scoring exclusions only where the canonical global emergency screen is already acceptable", () => {
    const partialRows = normalizationFixture.filter(
      (row) => row.redFlagCoverageExpectation === "partial"
    );
    const excludedGenericRows = normalizationFixture.filter(
      (row) => row.genericQuestionScoring === "exclude_for_now"
    );

    expect(partialRows).toHaveLength(28);
    expect(excludedGenericRows).toHaveLength(28);

    for (const row of normalizationFixture) {
      const outcome = getOutcomeByCaseId(row.caseId);
      const acceptsGlobalEmergencyScreen =
        outcome.acceptablePlannedQuestionIds.includes("emergency_global_screen");

      expect(row.redFlagCoverageExpectation).toBe(
        acceptsGlobalEmergencyScreen ? "partial" : "complete"
      );
      expect(row.genericQuestionScoring).toBe(
        acceptsGlobalEmergencyScreen ? "exclude_for_now" : "include"
      );
    }
  });

  it("keeps normalization notes free of diagnosis or treatment instructions", () => {
    for (const row of normalizationFixture) {
      for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
        expect(row.notes).not.toMatch(pattern);
      }
    }
  });
});
