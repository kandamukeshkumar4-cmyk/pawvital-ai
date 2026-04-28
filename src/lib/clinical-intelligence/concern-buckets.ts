export interface ConcernBucketDefinition {
  id: string;
  labelForLogs: string;
  mustNotMiss: boolean;
  redFlagIds: string[];
  signalIds: string[];
  answerKeys: string[];
  suggestedQuestionIds: string[];
}

export interface ScoredConcernBucket {
  id: string;
  score: number;
  evidence: string[];
  mustNotMiss: boolean;
  suggestedQuestionIds: string[];
}

const BUCKET_DEFINITIONS: readonly ConcernBucketDefinition[] = [
  {
    id: "emergency_airway_breathing",
    labelForLogs: "Emergency — Airway / Breathing",
    mustNotMiss: true,
    redFlagIds: [
      "blue_gums",
      "pale_gums",
      "breathing_difficulty",
      "breathing_onset_sudden",
      "stridor_present",
    ],
    signalIds: [
      "possible_blue_gums",
      "possible_pale_gums",
      "possible_breathing_difficulty",
    ],
    answerKeys: ["gum_color", "difficulty_breathing", "breathing_onset", "breathing_rate"],
    suggestedQuestionIds: ["breathing_difficulty_check", "gum_color_check"],
  },
  {
    id: "emergency_circulation_shock",
    labelForLogs: "Emergency — Circulation / Shock",
    mustNotMiss: true,
    redFlagIds: [
      "collapse",
      "unresponsive",
      "pale_gums",
      "large_blood_volume",
      "wound_deep_bleeding",
    ],
    signalIds: [
      "possible_collapse_or_weakness",
      "possible_pale_gums",
      "possible_blue_gums",
      "possible_heat_stroke",
    ],
    answerKeys: ["consciousness_level", "gum_color", "blood_amount", "wound_discharge"],
    suggestedQuestionIds: ["collapse_weakness_check", "gum_color_check"],
  },
  {
    id: "bloat_gdv_pattern",
    labelForLogs: "Emergency — Bloat / GDV Pattern",
    mustNotMiss: true,
    redFlagIds: [
      "unproductive_retching",
      "rapid_onset_distension",
      "bloat_with_restlessness",
      "distended_abdomen_painful",
    ],
    signalIds: [
      "possible_nonproductive_retching",
      "possible_bloat_gdv",
      "possible_abdominal_pain",
    ],
    answerKeys: ["unproductive_retching", "swollen_abdomen", "abdomen_onset", "restlessness", "abdomen_pain"],
    suggestedQuestionIds: ["bloat_retching_abdomen_check"],
  },
  {
    id: "toxin_exposure_pattern",
    labelForLogs: "Emergency — Toxin Exposure Pattern",
    mustNotMiss: true,
    redFlagIds: [
      "toxin_confirmed",
      "rat_poison_confirmed",
      "toxin_with_symptoms",
    ],
    signalIds: ["toxin_exposure"],
    answerKeys: ["toxin_exposure", "rat_poison_access", "vomiting", "trembling"],
    suggestedQuestionIds: ["toxin_exposure_check"],
  },
  {
    id: "urinary_obstruction_pattern",
    labelForLogs: "Emergency — Urinary Obstruction Pattern",
    mustNotMiss: true,
    redFlagIds: [
      "urinary_blockage",
      "no_urine_24h",
    ],
    signalIds: ["possible_urinary_obstruction"],
    answerKeys: ["straining_to_urinate", "no_urine_output", "male_dog"],
    suggestedQuestionIds: ["urinary_blockage_check", "urinary_straining_output"],
  },
  {
    id: "seizure_neuro_pattern",
    labelForLogs: "Emergency — Seizure / Neuro Pattern",
    mustNotMiss: true,
    redFlagIds: [
      "seizure_activity",
      "seizure_prolonged",
      "post_ictal_prolonged",
      "sudden_paralysis",
    ],
    signalIds: ["possible_neuro_emergency"],
    answerKeys: ["seizure_duration", "consciousness_level", "balance_issues", "head_tilt"],
    suggestedQuestionIds: ["seizure_neuro_check", "neuro_seizure_duration"],
  },
  {
    id: "trauma_severe_pain",
    labelForLogs: "Emergency — Trauma / Severe Pain",
    mustNotMiss: true,
    redFlagIds: [
      "wound_deep_bleeding",
      "wound_bone_visible",
    ],
    signalIds: ["possible_trauma"],
    answerKeys: ["trauma_onset", "wound_depth", "wound_discharge", "pain_level"],
    suggestedQuestionIds: ["limping_trauma_onset"],
  },
  {
    id: "gi_dehydration_or_blood",
    labelForLogs: "Concern — GI Dehydration or Blood",
    mustNotMiss: false,
    redFlagIds: [
      "vomit_blood",
      "stool_blood_large",
      "bloody_diarrhea_puppy",
    ],
    signalIds: ["possible_bloody_vomit", "possible_bloody_diarrhea"],
    answerKeys: ["vomiting_frequency", "blood_in_stool", "blood_amount", "water_intake", "keeping_water_down"],
    suggestedQuestionIds: ["gi_vomiting_frequency", "gi_blood_check", "gi_keep_water_down_check"],
  },
  {
    id: "skin_allergy_emergency",
    labelForLogs: "Emergency — Skin Allergy Emergency",
    mustNotMiss: true,
    redFlagIds: [
      "face_swelling",
      "hives_widespread",
      "allergic_with_breathing",
    ],
    signalIds: [],
    answerKeys: ["facial_swelling", "hives", "difficulty_breathing", "medication_reaction"],
    suggestedQuestionIds: ["skin_emergency_allergy_screen"],
  },
  {
    id: "skin_irritation_or_parasite",
    labelForLogs: "Concern — Skin Irritation or Parasite",
    mustNotMiss: false,
    redFlagIds: [],
    signalIds: [],
    answerKeys: ["excessive_scratching", "skin_changes", "skin_exposure", "wound_discharge"],
    suggestedQuestionIds: ["skin_location_distribution", "skin_changes_check", "skin_exposure_check"],
  },
  {
    id: "routine_mild_skin",
    labelForLogs: "Routine — Mild Skin Issue",
    mustNotMiss: false,
    redFlagIds: [],
    signalIds: [],
    answerKeys: ["excessive_scratching", "skin_changes"],
    suggestedQuestionIds: ["skin_location_distribution"],
  },
  {
    id: "routine_mild_limp",
    labelForLogs: "Routine — Mild Limp",
    mustNotMiss: false,
    redFlagIds: [],
    signalIds: [],
    answerKeys: ["limping", "weight_bearing", "abnormal_gait"],
    suggestedQuestionIds: ["limping_weight_bearing"],
  },
  {
    id: "unclear_needs_more_info",
    labelForLogs: "Unclear — Needs More Information",
    mustNotMiss: false,
    redFlagIds: [],
    signalIds: [],
    answerKeys: [],
    suggestedQuestionIds: ["emergency_global_screen"],
  },
];

export function getConcernBucketDefinitions(): readonly ConcernBucketDefinition[] {
  return BUCKET_DEFINITIONS;
}

export function getConcernBucketDefinitionById(
  id: string
): ConcernBucketDefinition | undefined {
  return BUCKET_DEFINITIONS.find((def) => def.id === id);
}

export function getAllMustNotMissBucketIds(): string[] {
  return BUCKET_DEFINITIONS.filter((def) => def.mustNotMiss).map((def) => def.id);
}
