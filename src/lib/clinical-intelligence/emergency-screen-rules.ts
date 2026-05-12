export type EmergencySentinelCategory =
  | "airway_breathing"
  | "circulation_shock"
  | "gi_blood"
  | "gi_water_retention"
  | "bloat_gdv"
  | "toxin"
  | "skin_toxin_signal"
  | "skin_gi_blood_signal"
  | "skin_bloat_signal"
  | "urinary_obstruction"
  | "neurologic"
  | "limping_weight_bearing"
  | "limping_trauma"
  | "trauma_mechanism"
  | "trauma_bleeding"
  | "heat_stroke"
  | "allergic_reaction";

export interface EmergencyScreenRule {
  category: EmergencySentinelCategory;
  requiredRedFlags: readonly string[];
  clinicalSignalIds: readonly string[];
  screenQuestionIds: readonly string[];
  reasonCode: string;
  triggerOnlyOnClinicalSignal?: boolean;
}

const QUESTION_ID_PATTERN = /^[a-z0-9_]+$/;

const EMERGENCY_SCREEN_RULES: readonly EmergencyScreenRule[] = [
  {
    category: "airway_breathing",
    requiredRedFlags: [
      "breathing_difficulty",
      "blue_gums",
      "stridor_present",
    ],
    clinicalSignalIds: [
      "possible_breathing_difficulty",
      "possible_blue_gums",
    ],
    screenQuestionIds: [
      "breathing_difficulty_check",
      "gum_color_check",
      "emergency_global_screen",
    ],
    reasonCode: "airway_breathing_screen_required",
  },
  {
    category: "circulation_shock",
    requiredRedFlags: [
      "collapse",
      "unresponsive",
      "pale_gums",
      "blue_gums",
    ],
    clinicalSignalIds: [
      "possible_collapse_or_weakness",
      "possible_pale_gums",
      "possible_blue_gums",
    ],
    screenQuestionIds: [
      "collapse_weakness_check",
      "gum_color_check",
      "emergency_global_screen",
    ],
    reasonCode: "circulation_shock_screen_required",
  },
  {
    category: "gi_blood",
    requiredRedFlags: [
      "hematemesis",
      "melena",
      "hematochezia",
    ],
    clinicalSignalIds: [
      "possible_bloody_vomit",
      "possible_bloody_diarrhea",
    ],
    screenQuestionIds: [
      "gi_blood_check",
      "emergency_global_screen",
    ],
    reasonCode: "gi_blood_screen_required",
  },
  {
    category: "gi_water_retention",
    requiredRedFlags: [
      "unable_to_retain_water",
      "persistent_vomiting",
    ],
    clinicalSignalIds: [],
    screenQuestionIds: [
      "gi_keep_water_down_check",
      "gi_vomiting_frequency",
      "emergency_global_screen",
    ],
    reasonCode: "gi_water_retention_screen_required",
  },
  {
    category: "bloat_gdv",
    requiredRedFlags: [
      "gastric_dilatation_volvulus",
      "unproductive_retching",
      "rapid_onset_distension",
      "bloat_with_restlessness",
      "distended_abdomen_painful",
    ],
    clinicalSignalIds: [
      "possible_nonproductive_retching",
      "possible_bloat_gdv",
      "possible_abdominal_pain",
    ],
    screenQuestionIds: [
      "bloat_retching_abdomen_check",
      "emergency_global_screen",
    ],
    reasonCode: "bloat_gdv_screen_required",
  },
  {
    category: "toxin",
    requiredRedFlags: [
      "toxin_confirmed",
      "rat_poison_confirmed",
      "toxin_with_symptoms",
    ],
    clinicalSignalIds: [
      "toxin_exposure",
    ],
    screenQuestionIds: [
      "toxin_exposure_check",
      "emergency_global_screen",
    ],
    reasonCode: "toxin_screen_required",
  },
  {
    category: "skin_toxin_signal",
    requiredRedFlags: [
      "toxin_confirmed",
      "toxin_with_symptoms",
    ],
    clinicalSignalIds: [
      "toxin_exposure",
    ],
    screenQuestionIds: [
      "toxin_exposure_check",
      "emergency_global_screen",
    ],
    reasonCode: "skin_toxin_signal_confirmation_required",
    triggerOnlyOnClinicalSignal: true,
  },
  {
    category: "skin_gi_blood_signal",
    requiredRedFlags: [
      "hematemesis",
      "hematochezia",
    ],
    clinicalSignalIds: [
      "possible_bloody_vomit",
    ],
    screenQuestionIds: [
      "gi_blood_check",
      "emergency_global_screen",
    ],
    reasonCode: "skin_gi_blood_signal_confirmation_required",
    triggerOnlyOnClinicalSignal: true,
  },
  {
    category: "skin_bloat_signal",
    requiredRedFlags: [
      "unproductive_retching",
    ],
    clinicalSignalIds: [
      "possible_nonproductive_retching",
    ],
    screenQuestionIds: [
      "bloat_retching_abdomen_check",
      "emergency_global_screen",
    ],
    reasonCode: "skin_bloat_signal_confirmation_required",
    triggerOnlyOnClinicalSignal: true,
  },
  {
    category: "urinary_obstruction",
    requiredRedFlags: [
      "urinary_blockage",
      "no_urine_24h",
    ],
    clinicalSignalIds: [
      "possible_urinary_obstruction",
    ],
    screenQuestionIds: [
      "urinary_blockage_check",
      "emergency_global_screen",
    ],
    reasonCode: "urinary_obstruction_screen_required",
  },
  {
    category: "neurologic",
    requiredRedFlags: [
      "seizure_activity",
      "seizure_prolonged",
      "post_ictal_prolonged",
      "sudden_paralysis",
    ],
    clinicalSignalIds: [
      "possible_neuro_emergency",
      "possible_collapse_or_weakness",
    ],
    screenQuestionIds: [
      "seizure_neuro_check",
      "collapse_weakness_check",
      "emergency_global_screen",
    ],
    reasonCode: "neurologic_screen_required",
  },
  {
    category: "limping_weight_bearing",
    requiredRedFlags: [
      "non_weight_bearing",
    ],
    clinicalSignalIds: [],
    screenQuestionIds: [
      "limping_weight_bearing",
      "emergency_global_screen",
    ],
    reasonCode: "limping_weight_bearing_screen_required",
  },
  {
    category: "limping_trauma",
    requiredRedFlags: [
      "post_trauma_lameness",
    ],
    clinicalSignalIds: [],
    screenQuestionIds: [
      "limping_trauma_onset",
      "emergency_global_screen",
    ],
    reasonCode: "limping_trauma_screen_required",
  },
  {
    category: "trauma_mechanism",
    requiredRedFlags: [
      "possible_trauma",
    ],
    clinicalSignalIds: [
      "possible_trauma",
    ],
    screenQuestionIds: [
      "trauma_mechanism_check",
      "emergency_global_screen",
    ],
    triggerOnlyOnClinicalSignal: true,
    reasonCode: "trauma_mechanism_screen_required",
  },
  {
    category: "trauma_bleeding",
    requiredRedFlags: [
      "large_blood_volume",
      "wound_deep_bleeding",
      "collapse",
      "unresponsive",
      "pale_gums",
      "blue_gums",
      "breathing_difficulty",
    ],
    clinicalSignalIds: [
      "possible_trauma",
      "possible_collapse_or_weakness",
      "possible_pale_gums",
      "possible_blue_gums",
      "possible_breathing_difficulty",
    ],
    screenQuestionIds: [
      "bleeding_volume_check",
      "laceration_depth_check",
      "gum_color_check",
      "collapse_weakness_check",
      "breathing_difficulty_check",
      "emergency_global_screen",
    ],
    reasonCode: "trauma_bleeding_screen_required",
  },
  {
    category: "heat_stroke",
    requiredRedFlags: [
      "heatstroke_signs",
      "brachycephalic_heat",
      "collapse",
      "breathing_difficulty",
      "pale_gums",
      "blue_gums",
    ],
    clinicalSignalIds: [
      "possible_heat_stroke",
      "possible_collapse_or_weakness",
      "possible_breathing_difficulty",
    ],
    screenQuestionIds: [
      "panting_excess_check",
      "brachycephalic_breed_check",
      "breathing_difficulty_check",
      "collapse_weakness_check",
      "gum_color_check",
      "emergency_global_screen",
    ],
    reasonCode: "heat_stroke_screen_required",
  },
  {
    category: "allergic_reaction",
    requiredRedFlags: [
      "face_swelling",
      "hives_widespread",
      "allergic_with_breathing",
      "breathing_difficulty",
      "collapse",
      "pale_gums",
      "blue_gums",
    ],
    clinicalSignalIds: [
      "possible_breathing_difficulty",
      "possible_collapse_or_weakness",
    ],
    screenQuestionIds: [
      "skin_emergency_allergy_screen",
      "breathing_difficulty_check",
      "collapse_weakness_check",
      "gum_color_check",
      "emergency_global_screen",
    ],
    reasonCode: "allergic_reaction_screen_required",
  },
];

const MODULE_RULE_CATEGORIES: Record<string, readonly EmergencySentinelCategory[]> = {
  skin_itching_allergy: [
    "allergic_reaction",
    "airway_breathing",
    "circulation_shock",
    "skin_toxin_signal",
    "skin_gi_blood_signal",
    "skin_bloat_signal",
  ],
  gi_vomiting_diarrhea: [
    "gi_blood",
    "gi_water_retention",
    "bloat_gdv",
    "toxin",
    "circulation_shock",
  ],
  limping_mobility_pain: [
    "limping_weight_bearing",
    "limping_trauma",
    "circulation_shock",
  ],
  respiratory_distress: ["airway_breathing", "circulation_shock"],
  seizure_collapse_neuro: ["neurologic", "circulation_shock"],
  urinary_obstruction: ["urinary_obstruction", "circulation_shock"],
  toxin_poisoning_exposure: ["toxin", "circulation_shock", "bloat_gdv", "neurologic", "gi_blood"],
  bloat_gdv: ["bloat_gdv", "circulation_shock"],
  collapse_weakness: ["circulation_shock", "airway_breathing", "neurologic"],
  heatstroke_heat_exposure: ["heat_stroke", "airway_breathing", "circulation_shock"],
  trauma_bleeding_wound: [
    "trauma_mechanism",
    "trauma_bleeding",
    "airway_breathing",
    "circulation_shock",
  ],
};

export function getEmergencyScreenRules(): readonly EmergencyScreenRule[] {
  return EMERGENCY_SCREEN_RULES.map((rule) => ({
    ...rule,
    requiredRedFlags: [...rule.requiredRedFlags],
    clinicalSignalIds: [...rule.clinicalSignalIds],
    screenQuestionIds: rule.screenQuestionIds.map((questionId) => {
      if (!QUESTION_ID_PATTERN.test(questionId)) {
        throw new Error(`Unsafe emergency sentinel question ID: ${questionId}`);
      }

      return questionId;
    }),
  }));
}

export function getRuleCategoriesForModule(
  moduleId?: string | null,
): readonly EmergencySentinelCategory[] {
  if (!moduleId) {
    return ["airway_breathing", "circulation_shock"];
  }

  return MODULE_RULE_CATEGORIES[moduleId] ?? ["airway_breathing", "circulation_shock"];
}

export function hasRuleCategoriesForModule(moduleId?: string | null): boolean {
  return Boolean(moduleId && Object.prototype.hasOwnProperty.call(MODULE_RULE_CATEGORIES, moduleId));
}
