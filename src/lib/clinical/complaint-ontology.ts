/**
 * Complaint Ontology Contract for VET-920
 *
 * Defines explicit must-ask logic for each complaint family.
 * Derived from SYMPTOM_MAP, does NOT replace it.
 */

export interface ComplaintFamilyContract {
  key: string;
  name: string;
  emergencyScreen: string[]; // red flags that trigger immediate escalation
  mustAskQuestions: string[]; // ordered question IDs that MUST be asked
  allowedUnknowns: string[]; // question IDs where "I don't know" is acceptable
  alternateObservables: Record<string, string>; // fallback when owner can't assess
  stopRule: {
    condition: "all_must_ask_answered" | "emergency_triggered" | "max_questions_reached";
    maxQuestions?: number;
  };
  readyRule: {
    condition: "minimum_info_met" | "must_ask_complete";
    minimumQuestionsAnswered?: number;
  };
}

// Derived from SYMPTOM_MAP in clinical-matrix.ts
const ONTOLOGY_MAP: Record<string, Omit<ComplaintFamilyContract, "key" | "name">> = {
  difficulty_breathing: {
    emergencyScreen: ["blue_gums", "pale_gums", "breathing_difficulty", "stridor_present"],
    mustAskQuestions: ["breathing_onset", "breathing_rate", "gum_color", "position_preference", "coughing_present"],
    allowedUnknowns: ["breathing_rate_exact"],
    alternateObservables: {
      gum_color: "Check if gums are pink vs blue/white",
      breathing_rate: "Count breaths per minute while resting",
    },
    stopRule: { condition: "emergency_triggered" },
    readyRule: { condition: "minimum_info_met", minimumQuestionsAnswered: 3 },
  },
  swollen_abdomen: {
    emergencyScreen: ["unproductive_retching", "rapid_distension", "pale_gums"],
    mustAskQuestions: ["abdomen_onset", "retching_present", "gum_color", "abdomen_pain", "last_meal"],
    allowedUnknowns: ["abdomen_pain"],
    alternateObservables: {
      gum_color: "Lift lip and check gum color",
      abdomen_pain: "Gently press on belly - does dog react?",
    },
    stopRule: { condition: "emergency_triggered" },
    readyRule: { condition: "minimum_info_met", minimumQuestionsAnswered: 3 },
  },
  seizure_collapse: {
    emergencyScreen: ["seizure_activity", "unresponsive", "collapse"],
    mustAskQuestions: ["seizure_duration", "seizure_count", "consciousness", "recent_trauma"],
    allowedUnknowns: ["seizure_duration_exact"],
    alternateObservables: {
      consciousness: "Try calling name or touching - any response?",
    },
    stopRule: { condition: "emergency_triggered" },
    readyRule: { condition: "minimum_info_met", minimumQuestionsAnswered: 2 },
  },
  vomiting: {
    emergencyScreen: ["blood_in_vomit", "repeated_vomiting", "lethargy_severe"],
    mustAskQuestions: ["vomit_frequency", "vomit_content", "water_retention", "diarrhea_present", "energy_level"],
    allowedUnknowns: ["vomit_content_exact"],
    alternateObservables: {
      vomit_content: "Take a photo of vomit if possible",
      water_retention: "Offer small amount of water - does it stay down?",
    },
    stopRule: { condition: "all_must_ask_answered", maxQuestions: 8 },
    readyRule: { condition: "must_ask_complete" },
  },
  diarrhea: {
    emergencyScreen: ["blood_in_stool", "lethargy_severe", "vomiting_with_diarrhea"],
    mustAskQuestions: ["diarrhea_duration", "stool_consistency", "blood_present", "energy_level", "appetite"],
    allowedUnknowns: ["stool_consistency_exact"],
    alternateObservables: {
      blood_present: "Check stool for red or black color",
    },
    stopRule: { condition: "all_must_ask_answered", maxQuestions: 8 },
    readyRule: { condition: "must_ask_complete" },
  },
  limping: {
    emergencyScreen: ["non_weight_bearing", "visible_deformity", "severe_pain"],
    mustAskQuestions: ["limp_onset", "leg_affected", "weight_bearing", "swelling_present", "recent_activity"],
    allowedUnknowns: ["exact_leg"],
    alternateObservables: {
      swelling_present: "Compare both legs - any visible difference?",
      weight_bearing: "Can dog put any weight on the leg?",
    },
    stopRule: { condition: "all_must_ask_answered", maxQuestions: 8 },
    readyRule: { condition: "must_ask_complete" },
  },
  lethargy: {
    emergencyScreen: ["unresponsive", "not_eating_drinking", "pale_gums"],
    mustAskQuestions: ["lethargy_onset", "appetite", "water_intake", "gum_color", "vomiting_present", "diarrhea_present"],
    allowedUnknowns: ["exact_water_amount"],
    alternateObservables: {
      gum_color: "Lift lip and check gum color",
      appetite: "Offer favorite treat - any interest?",
    },
    stopRule: { condition: "all_must_ask_answered", maxQuestions: 10 },
    readyRule: { condition: "must_ask_complete" },
  },
  unknown_concern: {
    emergencyScreen: [],
    mustAskQuestions: ["what_changed_most_recently", "what_worries_you_most", "energy_level", "appetite", "breathing_normal"],
    allowedUnknowns: ["what_worries_you_most"],
    alternateObservables: {},
    stopRule: { condition: "all_must_ask_answered", maxQuestions: 8 },
    readyRule: { condition: "minimum_info_met", minimumQuestionsAnswered: 3 },
  },
};

export function getOntologyForComplaint(familyKey: string): ComplaintFamilyContract | null {
  const ontology = ONTOLOGY_MAP[familyKey];
  if (!ontology) return null;

  return {
    key: familyKey,
    name: familyKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ...ontology,
  };
}

export function getAllOntologyContracts(): ComplaintFamilyContract[] {
  return Object.keys(ONTOLOGY_MAP).map((key) => getOntologyForComplaint(key)!);
}

export function buildComplaintOntologyFromMatrix(symptomMap: any): ComplaintFamilyContract[] {
  /**
   * Derives ontology contracts from SYMPTOM_MAP in clinical-matrix.ts
   * This ensures ontology stays in sync with the source of truth
   */
  const contracts: ComplaintFamilyContract[] = [];

  for (const [key, family] of Object.entries(symptomMap)) {
    const existing = ONTOLOGY_MAP[key];
    if (existing) {
      contracts.push({
        key,
        name: family.name || key.replace(/_/g, " "),
        ...existing,
      });
    }
  }

  return contracts;
}
