import {
  createInitialClinicalCaseState,
  type ClinicalCaseState,
} from "@/lib/clinical-intelligence/case-state";
import {
  recordAnsweredQuestion,
  recordAskedQuestion,
} from "@/lib/clinical-intelligence/case-state-update";
import {
  buildShadowPlannerComplaintIntegration,
  detectShadowComplaintModuleId,
} from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";
import { getQuestionCardById, getQuestionCardsByPhase } from "@/lib/clinical-intelligence/question-card-registry";

function markQuestionsAsked(
  state: ClinicalCaseState,
  questionIds: readonly string[]
): ClinicalCaseState {
  return questionIds.reduce(
    (current, questionId) => recordAskedQuestion(current, questionId),
    state
  );
}

function exhaustEmergencyScreens(state: ClinicalCaseState): ClinicalCaseState {
  return markQuestionsAsked(
    state,
    getQuestionCardsByPhase("emergency_screen").map((card) => card.id)
  );
}

describe("shadow planner complaint adapter", () => {
  it("maps heat exposure text to heatstroke_heat_exposure and plans from registered heat cards", () => {
    const detectedModuleId = detectShadowComplaintModuleId(
      "My dog was left in a hot car and is overheating badly."
    );

    expect(detectedModuleId).toBe("heatstroke_heat_exposure");

    const caseState = markQuestionsAsked(
      exhaustEmergencyScreens(createInitialClinicalCaseState()),
      ["heat_exposure_check"]
    );

    const result = buildShadowPlannerComplaintIntegration({
      ownerText: "My dog was left in a hot car and is overheating badly.",
      existingQuestionId: "emergency_global_screen",
      caseState,
    });

    expect(result.activeComplaintModuleId).toBe("heatstroke_heat_exposure");
    expect(result.plannerActiveComplaintModule).toBe("heat");
    expect("type" in result.plannerResult).toBe(false);

    if ("type" in result.plannerResult) {
      throw new Error(`Expected planned question, got fallback: ${result.plannerResult.type}`);
    }

    expect(result.plannerResult.questionId).not.toBe("heat_exposure_check");
    expect(getQuestionCardById(result.plannerResult.questionId)).toBeDefined();
    expect(result.comparison.plannedQuestionId).toBe(
      result.plannerResult.questionId
    );
    expect(result.telemetry.activeComplaintModule).toBe("heatstroke_heat_exposure");
    expect(result.telemetry.ownerFacingImpact).toBe("none");
  });

  it("maps trauma and bleeding text to trauma_bleeding_wound and respects asked question IDs", () => {
    const askedState = markQuestionsAsked(
      exhaustEmergencyScreens(createInitialClinicalCaseState()),
      ["trauma_mechanism_check"]
    );
    const caseState = recordAnsweredQuestion(
      askedState,
      "wound_characterization_check",
      "wound_characterization",
      "Cut / laceration"
    );

    const result = buildShadowPlannerComplaintIntegration({
      ownerText: "My dog has a deep cut and is bleeding after a fight.",
      existingQuestionId: "emergency_global_screen",
      caseState,
    });

    expect(result.activeComplaintModuleId).toBe("trauma_bleeding_wound");
    expect(result.plannerActiveComplaintModule).toBe("trauma");
    expect("type" in result.plannerResult).toBe(false);

    if ("type" in result.plannerResult) {
      throw new Error(`Expected planned question, got fallback: ${result.plannerResult.type}`);
    }

    expect(result.plannerResult.questionId).not.toBe("trauma_mechanism_check");
    expect(result.plannerResult.questionId).not.toBe("wound_characterization_check");
    expect(getQuestionCardById(result.plannerResult.questionId)).toBeDefined();
    expect(caseState.askedQuestionIds).toContain("trauma_mechanism_check");
    expect(caseState.answeredQuestionIds).toContain("wound_characterization_check");
    expect(result.telemetry.ownerFacingImpact).toBe("none");
  });

  it("maps urinary straining text to urinary_obstruction and passes module context to the planner", () => {
    const result = buildShadowPlannerComplaintIntegration({
      ownerText: "He keeps straining to pee and only tiny drops come out.",
      existingQuestionId: "emergency_global_screen",
      caseState: exhaustEmergencyScreens(createInitialClinicalCaseState()),
    });

    expect(result.activeComplaintModuleId).toBe("urinary_obstruction");
    expect(result.plannerActiveComplaintModule).toBe("urinary");
    expect("type" in result.plannerResult).toBe(false);

    if ("type" in result.plannerResult) {
      throw new Error(`Expected planned question, got fallback: ${result.plannerResult.type}`);
    }

    expect(result.plannerResult.questionId).toBe("urinary_straining_output");
    expect(result.comparison.plannedQuestionId).toBe("urinary_straining_output");
    expect(result.telemetry.activeComplaintModule).toBe("urinary_obstruction");
  });

  it("returns emergency handoff behavior without downgrading emergency urgency", () => {
    const emergencyState: ClinicalCaseState = {
      ...createInitialClinicalCaseState(),
      currentUrgency: "emergency",
      urgencyTrajectory: "worsening",
    };

    const result = buildShadowPlannerComplaintIntegration({
      ownerText: "My dog is straining to pee and now looks worse.",
      existingQuestionId: "urinary_blockage_check",
      caseState: emergencyState,
    });

    expect(result.activeComplaintModuleId).toBe("urinary_obstruction");
    expect("type" in result.plannerResult).toBe(true);

    if (!("type" in result.plannerResult)) {
      throw new Error("Expected emergency fallback result");
    }

    expect(result.plannerResult.type).toBe("emergency_handoff");
    expect(result.comparison.plannedQuestionId).toBeNull();
    expect(result.telemetry.ownerFacingImpact).toBe("none");
  });
});
