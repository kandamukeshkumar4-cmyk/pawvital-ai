import { readFileSync } from "node:fs";

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

  it("returns emergency result for confirmed bloat flags", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("bloat_gdv"),
      "gastric_dilatation_volvulus",
      "positive",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("emergency_result");
    if (decision.action === "emergency_result") {
      expect(decision.matchedRedFlags).toEqual(
        expect.arrayContaining(["gastric_dilatation_volvulus"]),
      );
    }
    expect(isEmergencyPositive(state)).toBe(true);
  });

  it("honors positive canonical emergency red flags outside active module rules", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("skin_itching_allergy"),
      "vomit_blood",
      "positive",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("emergency_result");
    if (decision.action === "emergency_result") {
      expect(decision.matchedCategory).toBe("global_red_flag");
      expect(decision.matchedRedFlags).toEqual(expect.arrayContaining(["vomit_blood"]));
    }
    expect(isEmergencyPositive(state)).toBe(true);
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

  it("asks GI blood screening before proceeding through GI complaints", () => {
    const state = createInitialClinicalCaseState("gi_vomiting_diarrhea");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gi_blood_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["hematemesis"]));
    }
  });

  it("asks water-retention screening after GI blood flags resolve negative", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("gi_vomiting_diarrhea"),
      ["hematemesis", "melena", "hematochezia"],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gi_keep_water_down_check");
      expect(decision.missingRedFlags).toEqual(
        expect.arrayContaining(["unable_to_retain_water"]),
      );
    }
  });

  it("asks vomiting-frequency screening when only persistent vomiting remains unresolved", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("gi_vomiting_diarrhea"),
      [
        "hematemesis",
        "melena",
        "hematochezia",
        "unable_to_retain_water",
      ],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gi_vomiting_frequency");
      expect(decision.missingRedFlags).toEqual(
        expect.arrayContaining(["persistent_vomiting"]),
      );
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

  it("keeps shock screening active for urinary complaints after urinary flags resolve", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("urinary_obstruction"),
      ["urinary_blockage", "no_urine_24h"],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("collapse_weakness_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["collapse"]));
    }
  });

  it("keeps shock screening active for toxin exposure cases", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("toxin_poisoning_exposure"),
      [
        "toxin_confirmed",
        "rat_poison_confirmed",
        "toxin_with_symptoms",
      ],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("collapse_weakness_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["collapse"]));
    }
  });

  it("keeps GI blood screening active for toxin exposure cases", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("toxin_poisoning_exposure"),
      [
        "toxin_confirmed",
        "rat_poison_confirmed",
        "toxin_with_symptoms",
        "collapse",
        "unresponsive",
        "pale_gums",
        "blue_gums",
        "unproductive_retching",
        "rapid_onset_distension",
        "bloat_with_restlessness",
        "distended_abdomen_painful",
        "gastric_dilatation_volvulus",
        "seizure_activity",
        "seizure_prolonged",
        "post_ictal_prolonged",
        "sudden_paralysis",
      ],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gi_blood_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["hematemesis"]));
    }
  });

  it("asks limping weight-bearing screening before proceeding through limping complaints", () => {
    const state = createInitialClinicalCaseState("limping_mobility_pain");

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("limping_weight_bearing");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["non_weight_bearing"]));
    }
  });

  it("reports sentinel-only emergency flags as positive", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("limping_mobility_pain"),
      "non_weight_bearing",
      "positive",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(isEmergencyPositive(state)).toBe(true);
    expect(decision.action).toBe("emergency_result");
    if (decision.action === "emergency_result") {
      expect(decision.matchedRedFlags).toEqual(
        expect.arrayContaining(["non_weight_bearing"]),
      );
    }
  });

  it("asks limping trauma-onset screening after weight-bearing risk resolves negative", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("limping_mobility_pain"),
      "non_weight_bearing",
      "negative",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("limping_trauma_onset");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["post_trauma_lameness"]));
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

  it("asks collapse screening when only sudden paralysis remains unresolved", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("seizure_collapse_neuro"),
      [
        "seizure_activity",
        "seizure_prolonged",
        "post_ictal_prolonged",
      ],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("collapse_weakness_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["sudden_paralysis"]));
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

  it("keeps bleeding-volume screening when wound-deep bleeding remains unresolved", () => {
    const state = withRedFlag(
      createInitialClinicalCaseState("trauma_bleeding_wound"),
      "large_blood_volume",
      "negative",
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("bleeding_volume_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["wound_deep_bleeding"]));
    }
  });

  it("keeps trauma mechanism confirmation active for high-risk trauma signals", () => {
    const screensResolved = resolveRedFlags(
      createInitialClinicalCaseState("trauma_bleeding_wound"),
      [
        "large_blood_volume",
        "wound_deep_bleeding",
        "collapse",
        "unresponsive",
        "pale_gums",
        "blue_gums",
        "breathing_difficulty",
        "stridor_present",
      ],
    );
    const state = addClinicalSignal(screensResolved, {
      id: "possible_trauma",
      type: "owner_language",
      severity: "critical",
      evidenceText: "hit by a car but no visible bleeding",
      turnDetected: 1,
    });

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("trauma_mechanism_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["possible_trauma"]));
    }
    expect(state.explicitAnswers).toEqual({});
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

  it("asks brachycephalic breed screening when that heat risk remains unresolved", () => {
    const state = resolveRedFlags(
      createInitialClinicalCaseState("heatstroke_heat_exposure"),
      [
        "heatstroke_signs",
        "collapse",
        "breathing_difficulty",
        "pale_gums",
        "blue_gums",
      ],
    );

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("brachycephalic_breed_check");
      expect(decision.questionId).not.toBe("panting_excess_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["brachycephalic_heat"]));
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
      [
        "breathing_difficulty",
        "blue_gums",
        "stridor_present",
        "collapse",
        "unresponsive",
        "pale_gums",
      ],
    );

    expect(evaluateEmergencySentinel(unresolvedState).action).toBe("ask_emergency_screen");
    expect(evaluateEmergencySentinel(resolvedState).action).toBe("proceed_to_module");
  });

  it("keeps collapse screening active for respiratory complaints after airway flags resolve", () => {
    const withAirwayResolved = resolveRedFlags(
      createInitialClinicalCaseState("respiratory_distress"),
      ["breathing_difficulty", "blue_gums", "stridor_present"],
    );
    const withSignal = addClinicalSignal(withAirwayResolved, {
      id: "possible_collapse_or_weakness",
      type: "owner_language",
      severity: "critical",
      evidenceText: "nearly collapsed while breathing hard",
      turnDetected: 2,
    });

    const decision = evaluateEmergencySentinel(withSignal);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("collapse_weakness_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["collapse"]));
    }
  });

  it("chooses a screen for the remaining unresolved red flags instead of repeating a resolved one", () => {
    const state = withRedFlag(withRedFlag(
      createInitialClinicalCaseState("respiratory_distress"),
      "breathing_difficulty",
      "negative",
    ), "stridor_present", "negative");

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

  it("uses signal-matched rules when no active complaint module is known", () => {
    const baseState: ClinicalCaseState = {
      ...createInitialClinicalCaseState("bloat_gdv"),
      activeComplaintModule: null,
    };
    const state = addClinicalSignal(baseState, {
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
      expect(decision.questionId).not.toBe("breathing_difficulty_check");
    }
    expect(state.explicitAnswers).toEqual({});
  });

  it("prioritizes the question tied to the triggering clinical signal", () => {
    const state = addClinicalSignal(createInitialClinicalCaseState("heatstroke_heat_exposure"), {
      id: "possible_breathing_difficulty",
      type: "owner_language",
      severity: "critical",
      evidenceText: "breathing looks labored after heat exposure",
      turnDetected: 1,
    });

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("breathing_difficulty_check");
      expect(decision.questionId).not.toBe("panting_excess_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["heatstroke_signs"]));
    }
    expect(state.explicitAnswers).toEqual({});
  });

  it("maps gum-color clinical signals directly to gum screening", () => {
    const state = addClinicalSignal(createInitialClinicalCaseState("collapse_weakness"), {
      id: "possible_pale_gums",
      type: "owner_language",
      severity: "critical",
      evidenceText: "gums looked very pale",
      turnDetected: 1,
    });

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("gum_color_check");
      expect(decision.questionId).not.toBe("collapse_weakness_check");
      expect(decision.missingRedFlags).toEqual(expect.arrayContaining(["pale_gums"]));
    }
  });

  it("uses signal-focused selection in the question-only helper", () => {
    const state = addClinicalSignal(createInitialClinicalCaseState("heatstroke_heat_exposure"), {
      id: "possible_breathing_difficulty",
      type: "owner_language",
      severity: "critical",
      evidenceText: "breathing looks labored after heat exposure",
      turnDetected: 1,
    });

    expect(chooseEmergencyScreenQuestion(state, "heatstroke_heat_exposure")).toBe(
      "breathing_difficulty_check",
    );
  });

  it("uses skin systemic signals for targeted confirmation after skin screens resolve", () => {
    const withSkinScreensResolved = resolveRedFlags(
      createInitialClinicalCaseState("skin_itching_allergy"),
      [
        "face_swelling",
        "hives_widespread",
        "allergic_with_breathing",
        "breathing_difficulty",
        "collapse",
        "pale_gums",
        "blue_gums",
        "stridor_present",
        "unresponsive",
      ],
    );
    const state = addClinicalSignal(withSkinScreensResolved, {
      id: "toxin_exposure",
      type: "owner_language",
      severity: "critical",
      evidenceText: "may have gotten into something outside",
      turnDetected: 2,
    });

    const decision = evaluateEmergencySentinel(state);

    expect(decision.action).toBe("ask_emergency_screen");
    if (decision.action === "ask_emergency_screen") {
      expect(decision.questionId).toBe("toxin_exposure_check");
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
      "collapse",
      "unresponsive",
      "pale_gums",
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
      expect(questionId).toMatch(/^[a-z0-9_]+$/);
      expect(getQuestionCardById(questionId!)).toBeDefined();
    }
  });

  it("keeps every configured rule question registered", () => {
    const rules = getEmergencyScreenRules();

    for (const rule of rules) {
      for (const questionId of rule.screenQuestionIds) {
        expect(questionId).toMatch(/^[a-z0-9_]+$/);
        expect(getQuestionCardById(questionId)).toBeDefined();
      }
    }
  });

  it("does not emit prompt or telemetry payload fields", () => {
    const decision = evaluateEmergencySentinel(createInitialClinicalCaseState("gi_vomiting_diarrhea"));
    const serialized = JSON.stringify(decision);

    expect(serialized).not.toMatch(/prompt/i);
    expect(serialized).not.toMatch(/telemetry/i);
    expect(serialized).not.toMatch(/ownerText/);
    expect(serialized).not.toMatch(/sourceIds/);
  });

  it("does not mutate case state while evaluating emergency screens", () => {
    const state = addClinicalSignal(createInitialClinicalCaseState("heatstroke_heat_exposure"), {
      id: "possible_pale_gums",
      type: "owner_language",
      severity: "critical",
      evidenceText: "gums looked very pale after heat exposure",
      turnDetected: 1,
    });
    const before = JSON.stringify(state);

    evaluateEmergencySentinel(state);
    chooseEmergencyScreenQuestion(state, "heatstroke_heat_exposure");
    getMissingEmergencyRedFlags(state, "heatstroke_heat_exposure");

    expect(JSON.stringify(state)).toBe(before);
    expect(state.explicitAnswers).toEqual({});
  });

  it("returns defensive copies of emergency rules", () => {
    const mutableRules = getEmergencyScreenRules() as Array<{
      screenQuestionIds: string[];
      requiredRedFlags: string[];
      clinicalSignalIds: string[];
    }>;
    mutableRules[0].screenQuestionIds.push("__invalid_question_id");
    mutableRules[0].requiredRedFlags.push("__invalid_red_flag");
    mutableRules[0].clinicalSignalIds.push("__invalid_signal");

    const freshRules = getEmergencyScreenRules();

    expect(freshRules[0].screenQuestionIds).not.toContain("__invalid_question_id");
    expect(freshRules[0].requiredRedFlags).not.toContain("__invalid_red_flag");
    expect(freshRules[0].clinicalSignalIds).not.toContain("__invalid_signal");
  });

  it("keeps scaffold source free of prompt, model, RAG, telemetry, and database hooks", () => {
    const sourceFiles = [
      "src/lib/clinical-intelligence/emergency-screen-rules.ts",
      "src/lib/clinical-intelligence/emergency-sentinel.ts",
    ];

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, "utf8");

      expect(source).not.toMatch(
        /\b(sql|select|insert|update|delete|prompt|telemetry|rag|model|fetch|openai|supabase|appendShadow|emit)\b/i,
      );
    }
  });
});
