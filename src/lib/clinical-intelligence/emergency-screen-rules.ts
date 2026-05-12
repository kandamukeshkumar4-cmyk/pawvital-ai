export type EmergencySentinelCategory =
  | "airway_breathing"
  | "circulation_shock"
  | "gi_blood"
  | "gi_water_retention"
  | "bloat_gdv"
  | "toxin"
  | "urinary_obstruction"
  | "neurologic"
  | "trauma_bleeding"
  | "heat_stroke"
  | "allergic_reaction";

export interface EmergencyScreenRule {
  category: EmergencySentinelCategory;
  requiredRedFlags: readonly string[];
  clinicalSignalIds: readonly string[];
  screenQuestionIds: readonly string[];
  reason: string;
}

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
    reason:
      "Breathing difficulty or blue gums can change urgency immediately.",
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
    reason:
      "Collapse, unresponsiveness, or abnormal gum color can indicate emergency risk.",
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
    reason:
      "Blood in vomit or stool can change urgency quickly.",
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
      "emergency_global_screen",
    ],
    reason:
      "Repeated vomiting or inability to keep water down can change urgency quickly.",
  },
  {
    category: "bloat_gdv",
    requiredRedFlags: [
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
    reason:
      "Unproductive retching with a swollen or painful abdomen can become urgent quickly.",
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
    reason:
      "Known or suspected toxin exposure can change urgency immediately.",
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
    reason:
      "Straining with little or no urine can become an emergency within hours.",
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
    reason:
      "Seizures, failure to return to normal, or sudden paralysis require emergency screening.",
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
    reason:
      "Trauma with bleeding, collapse, breathing difficulty, or abnormal gums requires emergency screening.",
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
      "breathing_difficulty_check",
      "collapse_weakness_check",
      "gum_color_check",
      "emergency_global_screen",
    ],
    reason:
      "Heat exposure with heavy panting, collapse, breathing difficulty, or abnormal gums needs emergency screening.",
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
    reason:
      "Rapid swelling, hives, breathing difficulty, or collapse needs emergency screening.",
  },
];

const MODULE_RULE_CATEGORIES: Record<string, readonly EmergencySentinelCategory[]> = {
  skin_itching_allergy: ["allergic_reaction", "airway_breathing", "circulation_shock"],
  gi_vomiting_diarrhea: [
    "gi_blood",
    "gi_water_retention",
    "bloat_gdv",
    "toxin",
    "circulation_shock",
  ],
  limping_mobility_pain: ["trauma_bleeding", "circulation_shock"],
  respiratory_distress: ["airway_breathing", "circulation_shock"],
  seizure_collapse_neuro: ["neurologic", "circulation_shock"],
  urinary_obstruction: ["urinary_obstruction"],
  toxin_poisoning_exposure: ["toxin", "neurologic"],
  bloat_gdv: ["bloat_gdv", "circulation_shock"],
  collapse_weakness: ["circulation_shock", "airway_breathing", "neurologic"],
  heatstroke_heat_exposure: ["heat_stroke", "airway_breathing", "circulation_shock"],
  trauma_bleeding_wound: ["trauma_bleeding", "airway_breathing", "circulation_shock"],
};

export function getEmergencyScreenRules(): readonly EmergencyScreenRule[] {
  return EMERGENCY_SCREEN_RULES.map((rule) => ({
    ...rule,
    requiredRedFlags: [...rule.requiredRedFlags],
    clinicalSignalIds: [...rule.clinicalSignalIds],
    screenQuestionIds: [...rule.screenQuestionIds],
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
