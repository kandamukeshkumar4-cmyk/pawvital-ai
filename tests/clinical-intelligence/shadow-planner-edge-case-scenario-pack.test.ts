import edgeCases from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";

import type { ClinicalCaseState } from "@/lib/clinical-intelligence/case-state";
import { getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import {
  filterAnsweredOrAskedQuestions,
} from "@/lib/clinical-intelligence/next-question-planner";
import {
  getAllQuestionCards,
  getQuestionCardById,
} from "@/lib/clinical-intelligence/question-card-registry";

type RepeatedQuestionSetup = {
  askedQuestionIds: string[];
  answeredQuestionIds: string[];
};

type ShadowPlannerEdgeCaseScenario = {
  caseId: string;
  ownerText: string;
  expectedPrimaryComplaintModuleIds: string[];
  acceptablePlannedQuestionIds: string[];
  mustScreenRedFlags: string[];
  shouldPreferEmergencyScreen: boolean;
  shouldAvoidGenericQuestion: boolean;
  repeatedQuestionSetup: RepeatedQuestionSetup | null;
  isConfusingMultiSymptom: boolean;
  isEmergencyVsMildContrast: boolean;
  hasAmbiguousOwnerAnswer: boolean;
  whyThisCaseMatters: string;
};

const REQUIRED_CASE_KEYS = [
  "acceptablePlannedQuestionIds",
  "caseId",
  "expectedPrimaryComplaintModuleIds",
  "hasAmbiguousOwnerAnswer",
  "isConfusingMultiSymptom",
  "isEmergencyVsMildContrast",
  "mustScreenRedFlags",
  "ownerText",
  "repeatedQuestionSetup",
  "shouldAvoidGenericQuestion",
  "shouldPreferEmergencyScreen",
  "whyThisCaseMatters",
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

const fixture = edgeCases as ShadowPlannerEdgeCaseScenario[];

function buildCaseState(
  scenario: ShadowPlannerEdgeCaseScenario
): ClinicalCaseState {
  return {
    caseId: scenario.caseId,
    species: "dog",
    activeComplaintModule:
      scenario.expectedPrimaryComplaintModuleIds[0] ?? null,
    currentUrgency: scenario.shouldPreferEmergencyScreen
      ? "urgent"
      : "routine",
    urgencyTrajectory: "stable",
    askedQuestionIds: scenario.repeatedQuestionSetup?.askedQuestionIds ?? [],
    answeredQuestionIds:
      scenario.repeatedQuestionSetup?.answeredQuestionIds ?? [],
    skippedQuestionIds: [],
    explicitAnswers: {},
    redFlagStatus: {},
    ownerTextHistory: [scenario.ownerText],
  };
}

describe("shadow planner edge-case scenario fixture pack", () => {
  it("packages the required dog-only edge-case volume", () => {
    expect(fixture).toHaveLength(24);

    expect(
      fixture.filter((scenario) => scenario.isConfusingMultiSymptom).length
    ).toBeGreaterThanOrEqual(8);
    expect(
      fixture.filter((scenario) => scenario.isEmergencyVsMildContrast).length
    ).toBeGreaterThanOrEqual(8);
    expect(
      fixture.filter((scenario) => scenario.repeatedQuestionSetup !== null)
        .length
    ).toBeGreaterThanOrEqual(4);
    expect(
      fixture.filter((scenario) => scenario.hasAmbiguousOwnerAnswer).length
    ).toBeGreaterThanOrEqual(4);
  });

  it("uses the required schema with unique stable case ids", () => {
    const caseIds = new Set<string>();

    for (const scenario of fixture) {
      expect(Object.keys(scenario).sort()).toEqual(REQUIRED_CASE_KEYS);
      expect(scenario.caseId).toMatch(/^edge_[a-z0-9_]+$/);
      expect(caseIds.has(scenario.caseId)).toBe(false);
      caseIds.add(scenario.caseId);

      expect(scenario.ownerText.trim()).toBe(scenario.ownerText);
      expect(scenario.ownerText).toMatch(/\b(dog|puppy|bulldog)\b/i);
      expect(scenario.ownerText).not.toMatch(
        /\b(cat|kitten|horse|rabbit|bird)\b/i
      );
      expect(scenario.expectedPrimaryComplaintModuleIds.length).toBeGreaterThan(
        0
      );
      expect(scenario.acceptablePlannedQuestionIds.length).toBeGreaterThan(0);
      expect(scenario.whyThisCaseMatters.trim()).toBe(
        scenario.whyThisCaseMatters
      );
      expect(typeof scenario.shouldPreferEmergencyScreen).toBe("boolean");
      expect(typeof scenario.shouldAvoidGenericQuestion).toBe("boolean");
      expect(typeof scenario.isConfusingMultiSymptom).toBe("boolean");
      expect(typeof scenario.isEmergencyVsMildContrast).toBe("boolean");
      expect(typeof scenario.hasAmbiguousOwnerAnswer).toBe("boolean");
    }
  });

  it("references only registered complaint modules and question cards", () => {
    const registeredModuleIds = new Set(
      getComplaintModules().map((module) => module.id)
    );
    const registeredQuestionIds = new Set(
      getAllQuestionCards().map((card) => card.id)
    );

    for (const scenario of fixture) {
      for (const moduleId of scenario.expectedPrimaryComplaintModuleIds) {
        expect(registeredModuleIds.has(moduleId)).toBe(true);
      }

      for (const questionId of scenario.acceptablePlannedQuestionIds) {
        expect(registeredQuestionIds.has(questionId)).toBe(true);
      }
    }
  });

  it("keeps emergency-preferred cases anchored to emergency-screen candidates", () => {
    for (const scenario of fixture) {
      if (!scenario.shouldPreferEmergencyScreen) {
        continue;
      }

      const acceptableCards = scenario.acceptablePlannedQuestionIds.map((id) => {
        const card = getQuestionCardById(id);
        if (!card) {
          throw new Error(`Missing question card ${id}`);
        }
        return card;
      });

      expect(acceptableCards.some((card) => card.phase === "emergency_screen"))
        .toBe(true);
    }
  });

  it("keeps red-flag expectations tied to existing card screens or module stop conditions", () => {
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
      for (const questionId of scenario.acceptablePlannedQuestionIds) {
        const card = getQuestionCardById(questionId);
        for (const redFlag of card?.screensRedFlags ?? []) {
          acceptableCardFlags.add(redFlag);
        }
      }

      const expectedModuleFlags = new Set<string>();
      for (const moduleId of scenario.expectedPrimaryComplaintModuleIds) {
        for (const redFlag of moduleRedFlags.get(moduleId) ?? new Set()) {
          expectedModuleFlags.add(redFlag);
        }
      }

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

  it("proves repeated-question setup excludes already asked or answered candidates", () => {
    const repeatedScenarios = fixture.filter(
      (scenario) => scenario.repeatedQuestionSetup !== null
    );

    expect(repeatedScenarios.length).toBeGreaterThanOrEqual(4);

    const registryCards = getAllQuestionCards();
    const registeredQuestionIds = new Set(registryCards.map((card) => card.id));

    for (const scenario of repeatedScenarios) {
      const setup = scenario.repeatedQuestionSetup;
      if (!setup) {
        throw new Error(`Missing repeated setup for ${scenario.caseId}`);
      }

      const blockedIds = new Set([
        ...setup.askedQuestionIds,
        ...setup.answeredQuestionIds,
      ]);

      for (const questionId of blockedIds) {
        expect(registeredQuestionIds.has(questionId)).toBe(true);
        expect(scenario.acceptablePlannedQuestionIds).not.toContain(questionId);
      }

      const availableCards = filterAnsweredOrAskedQuestions(
        registryCards,
        buildCaseState(scenario)
      );
      const availableIds = new Set(availableCards.map((card) => card.id));

      for (const questionId of scenario.acceptablePlannedQuestionIds) {
        expect(availableIds.has(questionId)).toBe(true);
      }
    }
  });

  it("keeps generic-question avoidance cases anchored to specific high-value candidates", () => {
    for (const scenario of fixture) {
      if (!scenario.shouldAvoidGenericQuestion) {
        continue;
      }

      const acceptableCards = scenario.acceptablePlannedQuestionIds.map((id) => {
        const card = getQuestionCardById(id);
        if (!card) {
          throw new Error(`Missing question card ${id}`);
        }
        return card;
      });

      expect(
        acceptableCards.some((card) =>
          card.phase === "emergency_screen" ||
          card.phase === "characterize" ||
          card.phase === "discriminate"
        )
      ).toBe(true);
    }
  });

  it("keeps fixture text free of diagnosis or treatment instructions", () => {
    for (const scenario of fixture) {
      const ownerFacingText = `${scenario.ownerText} ${scenario.whyThisCaseMatters}`;

      for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
        expect(ownerFacingText).not.toMatch(pattern);
      }
    }
  });
});
