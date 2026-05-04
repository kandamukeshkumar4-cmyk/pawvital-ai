import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { createInitialClinicalCaseState } from "@/lib/clinical-intelligence/case-state";
import {
  recordAnsweredQuestion,
  recordAskedQuestion,
} from "@/lib/clinical-intelligence/case-state-update";
import { getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import {
  buildShadowPlannerComplaintIntegration,
  detectShadowComplaintModuleId,
} from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";
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

const fixture = scenarios as ShadowPlannerScenario[];

const DIAGNOSIS_TREATMENT_INSTRUCTION_PATTERNS = [
  /\bdiagnos(?:e|is|ed|ing)\b/i,
  /\btreat(?:ment|ed|ing|s)?\b/i,
  /\bcure(?:d|s)?\b/i,
  /\bprescri(?:be|bed|ption)\b/i,
  /\bmedicat(?:e|ed|ion|ions)\b/i,
  /\bantibiotic\b/i,
  /\bsteroid\b/i,
  /\bsurgery\b/i,
  /\boperate\b/i,
  /\bprocedure\b/i,
  /\bdos(?:e|age)\b/i,
  /\bgive (?:him|her|them|your dog)\b/i,
  /\badminister\b/i,
];

function assertPlannedQuestion(
  result: ReturnType<typeof buildShadowPlannerComplaintIntegration>,
  caseId: string
) {
  if ("type" in result.plannerResult) {
    throw new Error(
      `Expected ${caseId} to plan a question, got ${result.plannerResult.type}`
    );
  }

  return result.plannerResult;
}

describe("shadow planner fixture alignment guard", () => {
  it("keeps fixture module IDs aligned with registered complaint modules", () => {
    const registeredModuleIds = new Set(
      getComplaintModules().map((complaintModule) => complaintModule.id)
    );

    const missingModuleIds = fixture
      .filter(
        (scenario) =>
          !registeredModuleIds.has(scenario.expectedComplaintModuleId)
      )
      .map((scenario) => scenario.expectedComplaintModuleId);

    expect(missingModuleIds).toEqual([]);
  });

  it("keeps acceptable first-question IDs aligned with the question-card registry", () => {
    const registeredQuestionIds = new Set(
      getAllQuestionCards().map((card) => card.id)
    );

    const missingQuestionIds = fixture.flatMap((scenario) =>
      scenario.acceptableFirstQuestionIds
        .filter((questionId) => !registeredQuestionIds.has(questionId))
        .map((questionId) => `${scenario.caseId}:${questionId}`)
    );

    expect(missingQuestionIds).toEqual([]);
  });

  it("maps every fixture ownerText to the expected complaint module through the adapter", () => {
    const mismatches = fixture
      .map((scenario) => ({
        caseId: scenario.caseId,
        expected: scenario.expectedComplaintModuleId,
        actual: detectShadowComplaintModuleId(scenario.ownerText),
      }))
      .filter(({ actual, expected }) => actual !== expected);

    expect(mismatches).toEqual([]);
  });

  it("prefers emergency-screen questions for emergency fixtures when one is available", () => {
    const mismatches: string[] = [];

    for (const scenario of fixture) {
      if (!scenario.shouldPreferEmergencyScreen) {
        continue;
      }

      const hasEmergencyCandidate = scenario.acceptableFirstQuestionIds.some(
        (questionId) => getQuestionCardById(questionId)?.phase === "emergency_screen"
      );

      if (!hasEmergencyCandidate) {
        continue;
      }

      const result = buildShadowPlannerComplaintIntegration({
        ownerText: scenario.ownerText,
        existingQuestionId: null,
        caseState: createInitialClinicalCaseState(),
      });
      const plannedQuestion = assertPlannedQuestion(result, scenario.caseId);
      const plannedCard = getQuestionCardById(plannedQuestion.questionId);

      if (plannedCard?.phase !== "emergency_screen") {
        mismatches.push(`${scenario.caseId}:${plannedQuestion.questionId}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it("does not select question IDs already asked or answered", () => {
    const repeatedSelections: string[] = [];

    for (const scenario of fixture) {
      const [askedQuestionId, answeredQuestionId] =
        scenario.acceptableFirstQuestionIds;
      const seenQuestionIds = [askedQuestionId, answeredQuestionId].filter(
        Boolean
      );

      let caseState = createInitialClinicalCaseState();
      caseState = recordAskedQuestion(caseState, askedQuestionId);
      caseState = recordAnsweredQuestion(
        caseState,
        answeredQuestionId,
        answeredQuestionId,
        "fixture guard answered"
      );

      const result = buildShadowPlannerComplaintIntegration({
        ownerText: scenario.ownerText,
        existingQuestionId: askedQuestionId,
        caseState,
      });

      if ("type" in result.plannerResult) {
        continue;
      }

      if (seenQuestionIds.includes(result.plannerResult.questionId)) {
        repeatedSelections.push(
          `${scenario.caseId}:${result.plannerResult.questionId}`
        );
      }
    }

    expect(repeatedSelections).toEqual([]);
  });

  it("keeps shadow telemetry ownerFacingImpact at none for every fixture", () => {
    const impacts = fixture.map((scenario) => {
      const result = buildShadowPlannerComplaintIntegration({
        ownerText: scenario.ownerText,
        existingQuestionId: null,
        caseState: createInitialClinicalCaseState(),
      });

      return {
        caseId: scenario.caseId,
        ownerFacingImpact: result.telemetry.ownerFacingImpact,
      };
    });

    expect(
      impacts.filter((impact) => impact.ownerFacingImpact !== "none")
    ).toEqual([]);
  });

  it("keeps fixture text free of diagnosis or treatment instructions", () => {
    const violations = fixture.flatMap((scenario) => {
      const ownerVisibleText = `${scenario.ownerText} ${scenario.whyThisCaseMatters}`;

      return DIAGNOSIS_TREATMENT_INSTRUCTION_PATTERNS
        .filter((pattern) => pattern.test(ownerVisibleText))
        .map((pattern) => `${scenario.caseId}:${pattern.source}`);
    });

    expect(violations).toEqual([]);
  });
});
