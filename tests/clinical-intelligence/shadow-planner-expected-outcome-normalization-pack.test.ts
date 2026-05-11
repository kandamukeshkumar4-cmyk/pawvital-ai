import edgeCases from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
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

type ShadowPlannerEdgeCaseScenario = {
  caseId: string;
  expectedPrimaryComplaintModuleIds: string[];
  acceptablePlannedQuestionIds: string[];
  shouldPreferEmergencyScreen: boolean;
  repeatedQuestionSetup: {
    askedQuestionIds: string[];
    answeredQuestionIds: string[];
  } | null;
  isConfusingMultiSymptom: boolean;
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
const edgeScenarioFixture = edgeCases as ShadowPlannerEdgeCaseScenario[];
const normalizationFixture =
  normalizationRows as ShadowPlannerExpectedOutcomeNormalization[];

function getScenarioByCaseId(caseId: string): ShadowPlannerScenario | null {
  return scenarioFixture.find((row) => row.caseId === caseId) ?? null;
}

function getOutcomeByCaseId(caseId: string): ShadowPlannerExpectedOutcome | null {
  return outcomeFixture.find((row) => row.caseId === caseId) ?? null;
}

function getEdgeScenarioByCaseId(
  caseId: string
): ShadowPlannerEdgeCaseScenario | null {
  return edgeScenarioFixture.find((row) => row.caseId === caseId) ?? null;
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

function getExpectedModuleIds(caseId: string): string[] {
  const outcome = getOutcomeByCaseId(caseId);
  if (outcome) {
    return [outcome.expectedComplaintModuleId];
  }

  const edgeScenario = getEdgeScenarioByCaseId(caseId);
  if (edgeScenario) {
    return edgeScenario.expectedPrimaryComplaintModuleIds;
  }

  throw new Error(`Missing source fixture row for ${caseId}`);
}

function getAcceptableQuestionIds(caseId: string): string[] {
  const outcome = getOutcomeByCaseId(caseId);
  if (outcome) {
    return outcome.acceptablePlannedQuestionIds;
  }

  const edgeScenario = getEdgeScenarioByCaseId(caseId);
  if (edgeScenario) {
    return edgeScenario.acceptablePlannedQuestionIds;
  }

  throw new Error(`Missing source fixture row for ${caseId}`);
}

function shouldPreferEmergency(caseId: string): boolean {
  const outcome = getOutcomeByCaseId(caseId);
  if (outcome) {
    return outcome.shouldScreenEmergencyEarlier;
  }

  const edgeScenario = getEdgeScenarioByCaseId(caseId);
  if (edgeScenario) {
    return edgeScenario.shouldPreferEmergencyScreen;
  }

  throw new Error(`Missing source fixture row for ${caseId}`);
}

function isConfusingMultiSymptom(caseId: string): boolean {
  const scenario = getScenarioByCaseId(caseId);
  if (scenario) {
    return scenario.isConfusingMultiSymptom;
  }

  const edgeScenario = getEdgeScenarioByCaseId(caseId);
  if (edgeScenario) {
    return edgeScenario.isConfusingMultiSymptom;
  }

  throw new Error(`Missing source fixture row for ${caseId}`);
}

describe("shadow planner expected outcome normalization pack", () => {
  it("packages one normalization row for every base expected outcome row and edge-case scenario row", () => {
    expect(normalizationFixture).toHaveLength(57);
    expect(normalizationFixture).toHaveLength(
      outcomeFixture.length + edgeScenarioFixture.length
    );

    const caseIds = new Set<string>();
    const registeredModuleIds = new Set(
      getComplaintModules().map((complaintModule) => complaintModule.id)
    );

    for (const row of normalizationFixture) {
      expect(Object.keys(row).sort()).toEqual(REQUIRED_KEYS);
      expect(row.caseId).toMatch(/^[a-z0-9_]+$/);
      expect(caseIds.has(row.caseId)).toBe(false);
      caseIds.add(row.caseId);

      const expectedModuleIds = getExpectedModuleIds(row.caseId);

      expect(row.acceptableModuleIds.length).toBeGreaterThan(0);
      expect(row.acceptableModuleIds).toEqual(
        expect.arrayContaining(expectedModuleIds)
      );
      expect(row.notes.trim()).toBe(row.notes);
      expect(row.notes.length).toBeGreaterThan(20);

      if (row.caseId.startsWith("edge_")) {
        expect(row.acceptableModuleIds).toEqual(expectedModuleIds);
      }

      for (const moduleId of row.acceptableModuleIds) {
        expect(registeredModuleIds.has(moduleId)).toBe(true);
      }
    }
  });

  it("normalizes ambiguity across the merged 57-case eval surface without collapsing valid edge-case alternatives", () => {
    const confuserRows = normalizationFixture.filter((row) =>
      isConfusingMultiSymptom(row.caseId)
    );
    const strictPrimaryRows = normalizationFixture.filter(
      (row) => row.ambiguityDisposition === "strict_primary"
    );
    const allowAlternativeRows = normalizationFixture.filter(
      (row) => row.ambiguityDisposition === "allow_module_alternatives"
    );

    expect(confuserRows).toHaveLength(31);
    expect(allowAlternativeRows).toHaveLength(29);

    for (const row of confuserRows) {
      expect(row.ambiguityDisposition).not.toBe("strict_primary");
    }

    for (const row of strictPrimaryRows) {
      expect(isConfusingMultiSymptom(row.caseId)).toBe(false);
      expect(row.acceptableModuleIds).toEqual(getExpectedModuleIds(row.caseId));
    }

    expect(
      getNormalizationRow("heatstroke_heat_exposure_03_heat_plus_vomit_confuser")
        .acceptableModuleIds
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
      getNormalizationRow("urinary_obstruction_02_accidents_blood_straining")
        .ambiguityDisposition
    ).toBe("same_module_only");
    expect(
      getNormalizationRow("respiratory_distress_02_cough_and_blue_tongue")
        .ambiguityDisposition
    ).toBe("same_module_only");
    expect(
      getNormalizationRow("gi_vomiting_diarrhea_02_bloody_diarrhea")
        .ambiguityDisposition
    ).toBe("same_module_only");

    expect(
      getNormalizationRow("edge_heat_not_sure_breathing_or_panting")
        .acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "heatstroke_heat_exposure",
        "respiratory_distress",
      ])
    );
    expect(
      getNormalizationRow("edge_multi_vomit_weak_heat_toxin")
        .acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "toxin_poisoning_exposure",
        "collapse_weakness",
        "heatstroke_heat_exposure",
        "gi_vomiting_diarrhea",
      ])
    );

    const limpingEdgeScenario = getEdgeScenarioByCaseId(
      "edge_limping_sore_vs_no_weight"
    );
    if (!limpingEdgeScenario) {
      throw new Error("Missing edge_limping_sore_vs_no_weight");
    }

    expect(limpingEdgeScenario.isConfusingMultiSymptom).toBe(false);
    expect(
      getNormalizationRow("edge_limping_sore_vs_no_weight")
        .ambiguityDisposition
    ).toBe("allow_module_alternatives");
    expect(
      getNormalizationRow("edge_limping_sore_vs_no_weight")
        .acceptableModuleIds
    ).toEqual(
      expect.arrayContaining([
        "limping_mobility_pain",
        "trauma_bleeding_wound",
      ])
    );
  });

  it("marks emergency-alignment-only rows directly from the merged emergency preference signal", () => {
    const alignmentOnlyRows = normalizationFixture.filter(
      (row) => row.emergencyAlignmentDisposition === "alignment_only_ok"
    );

    expect(alignmentOnlyRows).toHaveLength(39);

    for (const row of normalizationFixture) {
      expect(row.emergencyAlignmentDisposition).toBe(
        shouldPreferEmergency(row.caseId)
          ? "alignment_only_ok"
          : "question_match_required"
      );
    }
  });

  it("marks partial red-flag coverage and generic scoring exclusions only where the merged source already accepts the global emergency screen", () => {
    const partialRows = normalizationFixture.filter(
      (row) => row.redFlagCoverageExpectation === "partial"
    );
    const excludedGenericRows = normalizationFixture.filter(
      (row) => row.genericQuestionScoring === "exclude_for_now"
    );

    expect(partialRows).toHaveLength(47);
    expect(excludedGenericRows).toHaveLength(47);

    for (const row of normalizationFixture) {
      const acceptsGlobalEmergencyScreen =
        getAcceptableQuestionIds(row.caseId).includes("emergency_global_screen");

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
