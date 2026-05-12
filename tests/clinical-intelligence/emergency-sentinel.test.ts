import {
  evaluateEmergencySentinel,
  getEmergencyScreenRules,
  getMissingEmergencyRedFlags,
  chooseEmergencyScreenQuestion,
  isEmergencyPositive,
} from "../../src/lib/clinical-intelligence/emergency-sentinel";
import { createInitialClinicalCaseState, type ClinicalCaseState } from "../../src/lib/clinical-intelligence/case-state";
import { updateRedFlagStatus, addClinicalSignal } from "../../src/lib/clinical-intelligence/case-state-update";
import { getQuestionCardById } from "../../src/lib/clinical-intelligence/question-card-registry";

function withRedFlag(
  state: ClinicalCaseState,
  redFlagId: string,
  status: "positive" | "negative" | "unknown" | "not_sure",
): ClinicalCaseState {
  return updateRedFlagStatus(state, redFlagId, {
    status,
    source: "explicit_answer",
    evidenceText: `test evidence for ${redFlagId}`,
    turn: 1,
  });
}

function resolveRedFlags(
  state: ClinicalCaseState,
  redFlagIds: readonly string[],
): ClinicalCaseState {
  return redFlagIds.reduce(
    (current, redFlagId) => withRedFlag(current, redFlagId, "negative"),
    state,
  );
}

describe("Emergency sentinel scaffold", () => {
  it("returns an emergency result for collapse plus pale gums", () => {
    const state = withRedFlag(
      withRedFlag(createInitialClinicalCaseState("collapse_weakness"), "collapse", "positive"),
      "pale_gums",
      "positive",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("emergency_result");
    if (decision.action === "emergency_result") {
      expect(decision.urgency).toBe("emergency");
      expect(decision.matchedRedFlags).toEqual(
        expect.arrayContaining(["collapse", "pale_gums"]),
      );
    }
  });

  it("returns an emergency result for breathing difficulty", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("respiratory_distress"),
      "breathing_difficulty",
      "positive",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("emergency_result");
    if (decision.action === "emergency_result") {
      expect(decision.matchedCategory).toBe("airway_breathing");
    }
  });

  it("asks the bloat emergency screen for unresolved retching and swollen abdomen risk", () => {
    const state = createInitialClinicalCaseState("bloat_gdv");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("bloat_retching_abdomen_check");
      expect(decision.missingRedFlags).toEqual(
        expect.arrayContaining(["unproductive_retching", "rapid_onset_distension"]),
      );
    }
  });

  it("asks the toxin screen for unresolved toxin exposure risk", () => {
    const state = createInitialClinicalCaseState("toxin_poisoning_exposure");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("toxin_exposure_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["toxin_confirmed"]));
    }
  });

  it("asks the urinary obstruction screen for little or no urine risk", () => {
    const state = createInitialClinicalCaseState("urinary_obstruction");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("urinary_blockage_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["urinary_blockage"]));
    }
  });

  it("asks the neuro screen for unresolved seizure risk", () => {
    const state = createInitialClinicalCaseState("seizure_collapse_neuro");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("seizure_neuro_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["seizure_activity"]));
    }
  });

  it("asks the bleeding screen for trauma or deep wound risk", () => {
    const state = createInitialClinicalCaseState("trauma_bleeding_wound");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("bleeding_volume_check");
      expect(decision.missingRedFlags).toEqual(
        expect.arrayContaining(["large_blood_volume", "wound_deep_bleeding"]),
      );
    }
  });

  it("uses panting_excess_check instead of heat_exposure_check for heat emergency screening", () => {
    const state = createInitialClinicalCaseState("heatstroke_heat_exposure");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("panting_excess_check");
      expect(decision.questionId).not.toBe("heat_exposure_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["heatstroke_signs"]));
    }
  });

  it("keeps unknown and not_sure critical red flags unresolved", () => {
    const state = withRedFlag(
      withRedFlag(createInitialClinicalCaseState("respiratory_distress"), "breathing_difficulty", "not_sure"),
      "blue_gums",
      "unknown",
    );

    const missing = getMissingEmergencyRedFlags(state, "respiratory_distress");
    const decision = evaluateEmergencySentinel(state);

    expect(missing).toEqual(expect.arrayContaining(["breathing_difficulty", "blue_gums"]));
    expect(decision.action).toBe("ask_emergency_screen");
  });

  it("proceeds only when all required active-complaint sentinel red flags are resolved negative", () => {
    const unresolvedState = resolveRedFlags(
      createInitialClinicalCaseState("respiratory_distress"),
      ["breathing_difficulty"],
    );
    const resolvedState = resolveRedFlags(
      createInitialClinicalCaseState("respiratory_distress"),
      ["breathing_difficulty", "blue_gums", "stridor_present"],
    );

    expect(evaluateEmergencySentinel(unresolvedState).action).toBe("ask_emergency_screen");
    expect(evaluateEmergencySentinel(resolvedState).action).toBe("proceed_to_module");
  });

  it("chooses a screen for the remaining unresolved red flags instead of repeating a resolved one", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("respiratory_distress"),
      "breathing_difficulty",
      "negative",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gum_color_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["blue_gums"]));
    }
  });

  it("never downgrades current emergency urgency", () => {
    const state: ClinicalCaseState = {
      ...createInitialClinicalCaseState("skin_itching_allergy"),
      currentUrgency: "emergency",
    };

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("emergency_result");
    expect(isEmergencyPositive(state)).toBe(true);
  });

  it("uses clinical signals for confirmation without writing explicit answers", () => {
    const original = createInitialClinicalCaseState("bloat_gdv");
    const state = addClinicalSignal(original, {
      id: "possible_nonproductive_retching",
      type: "owner_language",
      severity: "critical",
      evidenceText: "tries to vomit but nothing comes up",
      turnDetected: 1,
    });

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("bloat_retching_abdomen_check");
    }
    expect(state.explicitAnswers).toEqual({});
  });

  it("ignores stale clinical signals after required red flags are resolved negative", () => {
    const withSignal = addClinicalSignal(createInitialClinicalCaseState("respiratory_distress"), {
      id: "possible_breathing_difficulty",
      type: "owner_language",
      severity: "critical",
      evidenceText: "breathing sounded scary earlier",
      turnDetected: 1,
    });
    const resolvedState = resolveRedFlags(withSignal, [
      "breathing_difficulty",
      "blue_gums",
      "stridor_present",
    ]);

    expect(evaluateEmergencySentinel(resolvedState).action).toBe("proceed_to_module");
  });

  it("does not emit forbidden clinical claim wording", () => {
    const decisions = [
      evaluateEmergencySentinel(withRedFlag(createInitialClinicalCaseState("collapse_weakness"), "collapse", "positive")),
      evaluateEmergencySentinel(createInitialClinicalCaseState("bloat_gdv")),
      evaluateEmergencySentinel(resolveRedFlags(
        createInitialClinicalCaseState("respiratory_distress"),
        ["breathing_difficulty", "blue_gums", "stridor_present"],
      )),
    ];

    const forbidden = new RegExp(
      `\\b(${[
        ["dia", "gnos"].join(""),
        ["tr", "eat"].join(""),
        ["pres", "cri"].join(""),
        ["medi", "cat"].join(""),
        ["sur", "gery"].join(""),
        ["cu", "re"].join(""),
        ["dos", "age"].join(""),
      ].join("|")})\\w*`,
      "i",
    );
    for (const decision of decisions) {
      expect(JSON.stringify(decision)).not.toMatch(forbidden);
    }
  });

  it("requires no model or RAG dependency to make a decision", () => {
    const decision = evaluateEmergencySentinel(createInitialClinicalCaseState("urinary_obstruction"));

    expect(decision).toMatchObject({
      action: "ask_emergency_screen",
      questionId: "urinary_blockage_check",
    });
  });

  it("returns only question IDs that exist in the question-card registry", () => {
    const moduleIds = [
      "skin_itching_allergy",
      "gi_vomiting_diarrhea",
      "limping_mobility_pain",
      "respiratory_distress",
      "seizure_collapse_neuro",
      "urinary_obstruction",
      "toxin_poisoning_exposure",
      "bloat_gdv",
      "collapse_weakness",
      "heatstroke_heat_exposure",
      "trauma_bleeding_wound",
    ];

    for (const moduleId of moduleIds) {
      const questionId = chooseEmergencyScreenQuestion(
        createInitialClinicalCaseState(moduleId),
        moduleId,
      );
      expect(questionId).toBeDefined();
      expect(getQuestionCardById(questionId!)).toBeDefined();
    }
  });

  it("keeps every configured rule question registered", () => {
    const rules = getEmergencyScreenRules();

    for (const rule of rules) {
      for (const questionId of rule.screenQuestionIds) {
        expect(getQuestionCardById(questionId)).toBeDefined();
      }
    }
  });
});
