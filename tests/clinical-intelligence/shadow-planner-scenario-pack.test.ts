import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

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

const REQUIRED_CASE_KEYS = [
  "caseId",
  "ownerText",
  "expectedComplaintModuleId",
  "acceptableFirstQuestionIds",
  "mustScreenRedFlags",
  "whyThisCaseMatters",
  "shouldPreferEmergencyScreen",
  "shouldAvoidGenericQuestion",
  "isConfusingMultiSymptom",
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

const fixture = scenarios as ShadowPlannerScenario[];

function countByModule(cases: readonly ShadowPlannerScenario[]) {
  const counts = new Map<string, number>();
  for (const scenario of cases) {
    counts.set(
      scenario.expectedComplaintModuleId,
      (counts.get(scenario.expectedComplaintModuleId) ?? 0) + 1
    );
  }
  return counts;
}

describe("shadow planner scenario fixture pack", () => {
  it("packages exactly the required dog-only case volume", () => {
    expect(fixture).toHaveLength(33);

    const emergencyCases = fixture.filter(
      (scenario) => scenario.shouldPreferEmergencyScreen
    );
    const confusingCases = fixture.filter(
      (scenario) => scenario.isConfusingMultiSymptom
    );

    expect(emergencyCases.length).toBeGreaterThanOrEqual(12);
    expect(confusingCases.length).toBeGreaterThanOrEqual(8);
  });

  it("covers every required complaint module at least three times", () => {
    const moduleCounts = countByModule(fixture);

    expect([...moduleCounts.keys()].sort()).toEqual([...REQUIRED_MODULE_IDS].sort());

    for (const moduleId of REQUIRED_MODULE_IDS) {
      expect(moduleCounts.get(moduleId)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the required schema with unique case ids", () => {
    const caseIds = new Set<string>();

    for (const scenario of fixture) {
      expect(Object.keys(scenario).sort()).toEqual(REQUIRED_CASE_KEYS);
      expect(scenario.caseId).toMatch(/^[a-z0-9_]+$/);
      expect(caseIds.has(scenario.caseId)).toBe(false);
      caseIds.add(scenario.caseId);

      expect(scenario.ownerText.trim()).toBe(scenario.ownerText);
      expect(scenario.ownerText).toMatch(/\b(dog|puppy|bulldog)\b/i);
      expect(scenario.ownerText).not.toMatch(/\b(cat|kitten|horse|rabbit|bird)\b/i);
      expect(scenario.whyThisCaseMatters.trim()).toBe(
        scenario.whyThisCaseMatters
      );
      expect(scenario.acceptableFirstQuestionIds.length).toBeGreaterThan(0);
      expect(typeof scenario.shouldPreferEmergencyScreen).toBe("boolean");
      expect(typeof scenario.shouldAvoidGenericQuestion).toBe("boolean");
      expect(typeof scenario.isConfusingMultiSymptom).toBe("boolean");
    }
  });

  it("references only registered modules and question cards", () => {
    const registeredModuleIds = new Set(
      getComplaintModules().map((module) => module.id)
    );
    const registeredQuestionIds = new Set(
      getAllQuestionCards().map((card) => card.id)
    );

    for (const scenario of fixture) {
      expect(registeredModuleIds.has(scenario.expectedComplaintModuleId)).toBe(
        true
      );

      for (const questionId of scenario.acceptableFirstQuestionIds) {
        expect(registeredQuestionIds.has(questionId)).toBe(true);
      }
    }
  });

  it("keeps emergency-preferred cases anchored to emergency-screen cards", () => {
    for (const scenario of fixture) {
      if (!scenario.shouldPreferEmergencyScreen) {
        continue;
      }

      const acceptableCards = scenario.acceptableFirstQuestionIds.map((id) => {
        const card = getQuestionCardById(id);
        if (!card) {
          throw new Error(`Missing question card ${id}`);
        }
        return card;
      });

      expect(acceptableCards.some((card) => card.phase === "emergency_screen")).toBe(
        true
      );
    }
  });

  it("keeps red-flag expectations tied to module stop conditions or card screens", () => {
    const moduleRedFlags = new Map<string, Set<string>>();
    for (const complaintModule of getComplaintModules()) {
      const flags = new Set<string>();
      for (const stopCondition of complaintModule.stopConditions) {
        for (const flag of stopCondition.ifRedFlagPositive ?? []) {
          flags.add(flag);
        }
        for (const signal of stopCondition.ifAnySignalPresent ?? []) {
          flags.add(signal);
        }
      }
      moduleRedFlags.set(complaintModule.id, flags);
    }

    const unknownRedFlags: string[] = [];

    for (const scenario of fixture) {
      const acceptableCardFlags = new Set<string>();
      for (const questionId of scenario.acceptableFirstQuestionIds) {
        const card = getQuestionCardById(questionId);
        for (const redFlag of card?.screensRedFlags ?? []) {
          acceptableCardFlags.add(redFlag);
        }
      }

      const expectedModuleFlags =
        moduleRedFlags.get(scenario.expectedComplaintModuleId) ?? new Set();

      for (const redFlag of scenario.mustScreenRedFlags) {
        const isKnown =
          acceptableCardFlags.has(redFlag) || expectedModuleFlags.has(redFlag);
        if (!isKnown) {
          unknownRedFlags.push(`${scenario.caseId}:${redFlag}`);
        }
      }
    }

    expect(unknownRedFlags).toEqual([]);
  });

  it("keeps owner-facing fixture text free of diagnosis or treatment claims", () => {
    for (const scenario of fixture) {
      const ownerFacingText = `${scenario.ownerText} ${scenario.whyThisCaseMatters}`;

      for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
        expect(ownerFacingText).not.toMatch(pattern);
      }
    }
  });
});
