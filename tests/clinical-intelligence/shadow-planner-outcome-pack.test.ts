import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import type { SelectedBecause } from "@/lib/clinical-intelligence/next-question-planner";
import { getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import {
  getAllQuestionCards,
  getQuestionCardById,
} from "@/lib/clinical-intelligence/question-card-registry";

type ShadowPlannerScenario = {
  caseId: string;
  ownerText: string;
  expectedComplaintModuleId: string;
  acceptableFirstQuestionIds: string[];
  mustScreenRedFlags: string[];
  whyThisCaseMatters: string;
  shouldPreferEmergencyScreen: boolean;
  shouldAvoidGenericQuestion: boolean;
  isConfusingMultiSymptom: boolean;
};

type ShadowPlannerExpectedOutcome = {
  caseId: string;
  expectedComplaintModuleId: string;
  acceptablePlannedQuestionIds: string[];
  expectedSelectedBecause: SelectedBecause[];
  mustScreenRedFlags: string[];
  shouldBeatGenericQuestion: boolean;
  shouldScreenEmergencyEarlier: boolean;
  shouldAvoidRepeatedQuestion: boolean;
  notes: string;
};

const REQUIRED_MODULE_IDS = [
  "heatstroke_heat_exposure",
  "trauma_bleeding_wound",
  "urinary_obstruction",
  "bloat_gdv",
  "respiratory_distress",
  "collapse_weakness",
  "seizure_collapse_neuro",
  "toxin_poisoning_exposure",
  "gi_vomiting_diarrhea",
  "skin_itching_allergy",
  "limping_mobility_pain",
] as const;

const REQUIRED_OUTCOME_KEYS = [
  "acceptablePlannedQuestionIds",
  "caseId",
  "expectedComplaintModuleId",
  "expectedSelectedBecause",
  "mustScreenRedFlags",
  "notes",
  "shouldAvoidRepeatedQuestion",
  "shouldBeatGenericQuestion",
  "shouldScreenEmergencyEarlier",
].sort();

const VALID_SELECTED_BECAUSE: readonly SelectedBecause[] = [
  "emergency_screen",
  "highest_information_gain",
  "urgency_changing",
  "report_value",
  "clarification",
];

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

const fixture = outcomes as ShadowPlannerExpectedOutcome[];
const scenarioFixture = scenarios as ShadowPlannerScenario[];

function countByModule(
  rows: readonly Pick<ShadowPlannerExpectedOutcome, "expectedComplaintModuleId">[]
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(
      row.expectedComplaintModuleId,
      (counts.get(row.expectedComplaintModuleId) ?? 0) + 1
    );
  }
  return counts;
}

function getScenarioByCaseId(caseId: string): ShadowPlannerScenario {
  const scenario = scenarioFixture.find((item) => item.caseId === caseId);
  if (!scenario) {
    throw new Error(`Missing shadow-planner scenario for ${caseId}`);
  }
  return scenario;
}

function deriveExpectedSelectedBecause(
  questionIds: readonly string[]
): SelectedBecause[] {
  const cards = questionIds.map((id) => {
    const card = getQuestionCardById(id);
    if (!card) {
      throw new Error(`Missing question card ${id}`);
    }
    return card;
  });

  const values: SelectedBecause[] = [];

  if (cards.some((card) => card.phase === "emergency_screen")) {
    values.push("emergency_screen");
  }

  if (cards.some((card) => card.phase !== "emergency_screen")) {
    values.push("highest_information_gain");
  }

  return values;
}

describe("shadow planner outcome pack", () => {
  it("packages one expected outcome row for every merged shadow-planner scenario", () => {
    expect(fixture).toHaveLength(33);
    expect(fixture).toHaveLength(scenarioFixture.length);

    const moduleCounts = countByModule(fixture);
    expect([...moduleCounts.keys()].sort()).toEqual([...REQUIRED_MODULE_IDS].sort());

    for (const moduleId of REQUIRED_MODULE_IDS) {
      expect(moduleCounts.get(moduleId)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the required schema with unique case ids and non-empty comparison notes", () => {
    const caseIds = new Set<string>();

    for (const outcome of fixture) {
      expect(Object.keys(outcome).sort()).toEqual(REQUIRED_OUTCOME_KEYS);
      expect(outcome.caseId).toMatch(/^[a-z0-9_]+$/);
      expect(caseIds.has(outcome.caseId)).toBe(false);
      caseIds.add(outcome.caseId);

      expect(outcome.acceptablePlannedQuestionIds.length).toBeGreaterThan(0);
      expect(outcome.expectedSelectedBecause.length).toBeGreaterThan(0);
      expect(outcome.notes.trim()).toBe(outcome.notes);
      expect(outcome.notes.length).toBeGreaterThan(20);
      expect(typeof outcome.shouldBeatGenericQuestion).toBe("boolean");
      expect(typeof outcome.shouldScreenEmergencyEarlier).toBe("boolean");
      expect(typeof outcome.shouldAvoidRepeatedQuestion).toBe("boolean");
    }
  });

  it("stays locked to the merged scenario-pack expectations", () => {
    for (const outcome of fixture) {
      const scenario = getScenarioByCaseId(outcome.caseId);

      expect(outcome.expectedComplaintModuleId).toBe(
        scenario.expectedComplaintModuleId
      );
      expect(outcome.acceptablePlannedQuestionIds).toEqual(
        scenario.acceptableFirstQuestionIds
      );
      expect(outcome.mustScreenRedFlags).toEqual(scenario.mustScreenRedFlags);
      expect(outcome.shouldBeatGenericQuestion).toBe(
        scenario.shouldAvoidGenericQuestion
      );
      expect(outcome.shouldScreenEmergencyEarlier).toBe(
        scenario.shouldPreferEmergencyScreen
      );
    }
  });

  it("references only registered complaint modules and question cards", () => {
    const registeredModuleIds = new Set(
      getComplaintModules().map((module) => module.id)
    );
    const registeredQuestionIds = new Set(
      getAllQuestionCards().map((card) => card.id)
    );

    for (const outcome of fixture) {
      expect(registeredModuleIds.has(outcome.expectedComplaintModuleId)).toBe(
        true
      );

      for (const questionId of outcome.acceptablePlannedQuestionIds) {
        expect(registeredQuestionIds.has(questionId)).toBe(true);
      }
    }
  });

  it("keeps expected selectedBecause values aligned to first-turn shadow-planner reachability", () => {
    for (const outcome of fixture) {
      expect(outcome.expectedSelectedBecause).toEqual(
        deriveExpectedSelectedBecause(outcome.acceptablePlannedQuestionIds)
      );

      for (const value of outcome.expectedSelectedBecause) {
        expect(VALID_SELECTED_BECAUSE).toContain(value);
      }

      expect(outcome.expectedSelectedBecause).not.toContain("clarification");
      expect(outcome.expectedSelectedBecause).not.toContain("urgency_changing");
      expect(outcome.expectedSelectedBecause).not.toContain("report_value");
    }
  });

  it("clearly marks emergency or must-not-miss cases and keeps emergency candidates reachable", () => {
    const emergencyRows = fixture.filter(
      (outcome) => outcome.shouldScreenEmergencyEarlier
    );

    expect(emergencyRows.length).toBeGreaterThanOrEqual(12);

    for (const outcome of emergencyRows) {
      expect(outcome.notes).toMatch(/^Emergency or must-not-miss:/);
      expect(outcome.expectedSelectedBecause).toContain("emergency_screen");

      const acceptableCards = outcome.acceptablePlannedQuestionIds.map((id) => {
        const card = getQuestionCardById(id);
        if (!card) {
          throw new Error(`Missing question card ${id}`);
        }
        return card;
      });

      expect(
        acceptableCards.some((card) => card.phase === "emergency_screen")
      ).toBe(true);
    }
  });

  it("flags multi-symptom ambiguity only on the confusing scenario set and expects repeat avoidance everywhere", () => {
    const confusingCaseIds = new Set(
      scenarioFixture
        .filter((scenario) => scenario.isConfusingMultiSymptom)
        .map((scenario) => scenario.caseId)
    );

    expect(confusingCaseIds.size).toBeGreaterThanOrEqual(8);

    for (const outcome of fixture) {
      expect(outcome.shouldAvoidRepeatedQuestion).toBe(true);

      const hasAmbiguityMarker = outcome.notes.includes("Acceptable ambiguity:");
      expect(hasAmbiguityMarker).toBe(confusingCaseIds.has(outcome.caseId));
    }
  });

  it("keeps evaluator notes free of diagnosis or treatment claims", () => {
    for (const outcome of fixture) {
      for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
        expect(outcome.notes).not.toMatch(pattern);
      }
    }
  });
});
