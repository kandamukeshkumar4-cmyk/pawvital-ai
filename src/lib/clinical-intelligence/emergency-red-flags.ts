export const EMERGENCY_RED_FLAG_IDS = [
  "blue_gums",
  "pale_gums",
  "breathing_difficulty",
  "breathing_onset_sudden",
  "stridor_present",
  "collapse",
  "unresponsive",
  "sudden_paralysis",
  "seizure_activity",
  "seizure_prolonged",
  "post_ictal_prolonged",
  "unproductive_retching",
  "rapid_onset_distension",
  "bloat_with_restlessness",
  "distended_abdomen_painful",
  "toxin_confirmed",
  "rat_poison_confirmed",
  "toxin_with_symptoms",
  "large_blood_volume",
  "wound_deep_bleeding",
  "vomit_blood",
  "cough_blood",
  "stool_blood_large",
  "bloody_diarrhea_puppy",
  "heatstroke_signs",
  "brachycephalic_heat",
  "face_swelling",
  "hives_widespread",
  "allergic_with_breathing",
  "urinary_blockage",
  "no_urine_24h",
  "dystocia_active",
  "dystocia_interval",
  "green_discharge_no_puppy",
  "eclampsia",
] as const;

const EMERGENCY_RED_FLAG_SET = new Set<string>(EMERGENCY_RED_FLAG_IDS);

export function isEmergencyRedFlagId(redFlagId: string): boolean {
  return EMERGENCY_RED_FLAG_SET.has(redFlagId);
}
