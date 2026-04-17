// =============================================================================
// CLINICAL MATRIX — The hardcoded medical brain
// Maps: Symptoms → Linked Diseases → Required Follow-Up Questions → Breed Multipliers
// This is NOT AI-generated at runtime. It's the deterministic backbone.
// =============================================================================

export interface SymptomEntry {
  linked_diseases: string[];
  follow_up_questions: string[];
  red_flags: string[]; // If any of these are true → immediate emergency
  body_systems: string[];
}

export interface DiseaseEntry {
  name: string;
  medical_term: string;
  description: string;
  base_probability: number; // 0-1 baseline
  age_modifier: { puppy: number; adult: number; senior: number }; // multipliers
  urgency: "low" | "moderate" | "high" | "emergency";
  key_differentiators: string[]; // What makes this different from similar conditions
  typical_tests: string[];
  typical_home_care: string[];
}

export interface BreedModifiers {
  [disease: string]: number; // multiplier (1.0 = normal, 2.8 = 2.8x more likely)
}

export interface FollowUpQuestion {
  id: string;
  question_text: string; // Natural language for the LLM to rephrase
  data_type: "boolean" | "string" | "number" | "choice";
  choices?: string[];
  extraction_hint: string; // Helps LLM extract this from free text
  critical: boolean; // Must be answered before diagnosis
}

const DEFAULT_AGE_MODIFIER: DiseaseEntry["age_modifier"] = {
  puppy: 0.8,
  adult: 1.0,
  senior: 1.2,
};

function makeDiseaseEntry({
  name,
  medicalTerm,
  description,
  urgency,
  keyDifferentiators,
  typicalTests,
  typicalHomeCare,
  baseProbability = 0.08,
  ageModifier = DEFAULT_AGE_MODIFIER,
}: {
  name: string;
  medicalTerm: string;
  description: string;
  urgency: DiseaseEntry["urgency"];
  keyDifferentiators: string[];
  typicalTests: string[];
  typicalHomeCare: string[];
  baseProbability?: number;
  ageModifier?: DiseaseEntry["age_modifier"];
}): DiseaseEntry {
  return {
    name,
    medical_term: medicalTerm,
    description,
    base_probability: baseProbability,
    age_modifier: ageModifier,
    urgency,
    key_differentiators: keyDifferentiators,
    typical_tests: typicalTests,
    typical_home_care: typicalHomeCare,
  };
}

function makeSystemicDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Physical exam plus CBC/chemistry and targeted diagnostics"],
    typicalHomeCare: ["Schedule prompt veterinary evaluation and monitor appetite, energy, hydration, and comfort"],
  });
}

function makeRespiratoryDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Respiratory exam with pulse oximetry and thoracic imaging"],
    typicalHomeCare: ["Keep activity low, reduce stress, and seek urgent care if breathing worsens or gums change color"],
  });
}

function makeDermDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Dermatologic exam with cytology, skin scrape, or otoscopic evaluation as indicated"],
    typicalHomeCare: ["Prevent self-trauma, keep the area clean, and avoid new topical products until examined"],
  });
}

function makeNeuroOrOrthoDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Neurologic and orthopedic examination with imaging as needed"],
    typicalHomeCare: ["Restrict activity and seek veterinary care promptly if weakness, pain, or gait changes progress"],
  });
}

function makeOphthalmicDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Ophthalmic examination with fluorescein stain and tonometry as needed"],
    typicalHomeCare: ["Prevent rubbing, avoid human eye medications, and seek urgent eye care if pain or vision loss is present"],
  });
}

// --- SYMPTOM → DISEASE + QUESTION MAP ---

export const SYMPTOM_MAP: Record<string, SymptomEntry> = {
  vomiting: {
    linked_diseases: [
      "gastroenteritis",
      "pancreatitis",
      "foreign_body",
      "ibd",
      "gdv",
      "toxin_ingestion",
      "kidney_disease",
    ],
    follow_up_questions: [
      "vomit_duration",
      "vomit_frequency",
      "vomit_blood",
      "vomit_content",
      "toxin_exposure",
      "dietary_change",
      "appetite_status",
    ],
    red_flags: ["vomit_blood", "unproductive_retching", "toxin_confirmed"],
    body_systems: ["gastrointestinal"],
  },
  not_eating: {
    linked_diseases: [
      "gastroenteritis",
      "pancreatitis",
      "foreign_body",
      "kidney_disease",
      "liver_disease",
      "dental_disease",
      "pain_general",
    ],
    follow_up_questions: [
      "appetite_duration",
      "water_intake",
      "weight_loss",
      "treats_accepted",
    ],
    red_flags: ["no_water_24h"],
    body_systems: ["gastrointestinal", "systemic"],
  },
  diarrhea: {
    linked_diseases: [
      "gastroenteritis",
      "pancreatitis",
      "ibd",
      "parasites",
      "colitis",
      "food_allergy",
    ],
    follow_up_questions: [
      "stool_blood",
      "stool_frequency",
      "stool_consistency",
      "diarrhea_duration",
      "dietary_change",
    ],
    red_flags: ["stool_blood_large", "bloody_diarrhea_puppy"],
    body_systems: ["gastrointestinal"],
  },
  limping: {
    linked_diseases: [
      "ccl_rupture",
      "hip_dysplasia",
      "osteoarthritis",
      "soft_tissue_injury",
      "impa",
      "bone_cancer",
      "ivdd",
      "degenerative_myelopathy",
      "iliopsoas_strain",
      "patellar_luxation",
      "lumbosacral_disease",
      "wobbler_syndrome",
      "obesity_related",
      "histiocytic_sarcoma",
    ],
    follow_up_questions: [
      "which_leg",
      "limping_onset",
      "limping_progression",
      "weight_bearing",
      "pain_on_touch",
      "trauma_history",
      "worse_after_rest",
      "swelling_present",
      "warmth_present",
      "prior_limping",
    ],
    red_flags: ["non_weight_bearing", "visible_fracture", "sudden_paralysis"],
    body_systems: ["musculoskeletal"],
  },
  lethargy: {
    linked_diseases: [
      "pain_general",
      "infection",
      "anemia",
      "hypothyroidism",
      "heart_disease",
      "kidney_disease",
      "liver_disease",
      "addisons_disease",
      "imha",
      "heat_stroke",
      "liver_shunt",
    ],
    follow_up_questions: [
      "lethargy_duration",
      "lethargy_severity",
      "appetite_status",
      "exercise_intolerance",
    ],
    red_flags: ["collapse", "unresponsive"],
    body_systems: ["systemic"],
  },
  coughing: {
    linked_diseases: [
      "kennel_cough",
      "heart_disease",
      "pneumonia",
      "collapsing_trachea",
      "laryngeal_paralysis",
      "lung_cancer",
    ],
    follow_up_questions: [
      "cough_type",
      "cough_duration",
      "cough_timing",
      "exercise_intolerance",
      "breathing_rate",
      "nasal_discharge",
    ],
    red_flags: ["breathing_difficulty", "blue_gums", "cough_blood"],
    body_systems: ["respiratory"],
  },
  difficulty_breathing: {
    linked_diseases: [
      "pneumonia",
      "heart_failure",
      "pleural_effusion",
      "gdv",
      "difficulty_breathing",
      "laryngeal_paralysis",
      "allergic_reaction",
      "trauma_chest",
      "heat_stroke",
    ],
    follow_up_questions: [
      "breathing_onset",
      "breathing_rate",
      "gum_color",
      "position_preference",
    ],
    red_flags: ["blue_gums", "pale_gums", "collapse", "breathing_onset_sudden"],
    body_systems: ["respiratory", "cardiovascular"],
  },
  excessive_scratching: {
    linked_diseases: [
      "allergic_dermatitis",
      "food_allergy",
      "flea_allergy",
      "ear_infection",
      "hot_spots",
      "mange",
      "yeast_infection",
      "zinc_responsive_dermatosis",
    ],
    follow_up_questions: [
      "scratch_location",
      "scratch_duration",
      "skin_changes",
      "flea_prevention",
      "diet_change",
      "seasonal_pattern",
    ],
    red_flags: ["face_swelling", "hives_widespread"],
    body_systems: ["dermatologic"],
  },
  drinking_more: {
    linked_diseases: [
      "diabetes",
      "cushings_disease",
      "kidney_disease",
      "pyometra",
      "liver_disease",
      "hypercalcemia",
    ],
    follow_up_questions: [
      "water_amount_change",
      "urination_frequency",
      "urination_accidents",
      "appetite_change",
      "weight_change",
      "spay_status",
    ],
    red_flags: ["pyometra_signs"],
    body_systems: ["endocrine", "renal"],
  },
  trembling: {
    linked_diseases: [
      "pain_general",
      "toxin_ingestion",
      "hypoglycemia",
      "seizure_disorder",
      "epilepsy",
      "addisons_disease",
      "fever",
      "anxiety",
    ],
    follow_up_questions: [
      "trembling_duration",
      "trembling_timing",
      "toxin_exposure",
      "consciousness_level",
      "temperature_feel",
    ],
    red_flags: ["seizure_activity", "toxin_confirmed", "collapse"],
    body_systems: ["neurologic", "systemic"],
  },
  swollen_abdomen: {
    linked_diseases: [
      "gdv",
      "bloat",
      "ascites",
      "splenic_mass",
      "pyometra",
      "cushings_disease",
      "pregnancy",
    ],
    follow_up_questions: [
      "abdomen_onset",
      "abdomen_pain",
      "unproductive_retching",
      "spay_status",
      "restlessness",
    ],
    red_flags: ["unproductive_retching", "rapid_onset_distension"],
    body_systems: ["gastrointestinal", "reproductive"],
  },
  blood_in_stool: {
    linked_diseases: [
      "hemorrhagic_gastroenteritis",
      "colitis",
      "parasites",
      "foreign_body",
      "coagulopathy",
      "gi_cancer",
      "von_willebrands",
    ],
    follow_up_questions: [
      "blood_color",
      "blood_amount",
      "stool_frequency",
      "toxin_exposure",
      "rat_poison_access",
    ],
    red_flags: ["large_blood_volume", "rat_poison_confirmed", "pale_gums"],
    body_systems: ["gastrointestinal", "hematologic"],
  },
  eye_discharge: {
    linked_diseases: [
      "conjunctivitis",
      "corneal_ulcer",
      "dry_eye",
      "glaucoma",
      "uveitis",
      "entropion",
      "cherry_eye",
      "eye_disorders",
    ],
    follow_up_questions: [
      "discharge_color",
      "discharge_duration",
      "squinting",
      "eye_redness",
      "vision_changes",
      "trauma_history",
    ],
    red_flags: ["eye_swollen_shut", "eye_bulging", "sudden_blindness"],
    body_systems: ["ophthalmologic"],
  },
  ear_scratching: {
    linked_diseases: [
      "ear_infection_bacterial",
      "ear_infection_yeast",
      "ear_mites",
      "allergic_dermatitis",
      "foreign_body_ear",
      "aural_hematoma",
      "syringomyelia",
    ],
    follow_up_questions: [
      "ear_odor",
      "ear_discharge",
      "head_shaking",
      "head_tilt",
      "balance_issues",
      "ear_swelling",
    ],
    red_flags: ["head_tilt_sudden", "balance_loss", "facial_drooping"],
    body_systems: ["dermatologic", "neurologic"],
  },
  weight_loss: {
    linked_diseases: [
      "diabetes",
      "hyperthyroidism",
      "kidney_disease",
      "cancer",
      "ibd",
      "exocrine_pancreatic_insufficiency",
      "parasites",
      "histiocytic_sarcoma",
    ],
    follow_up_questions: [
      "weight_loss_duration",
      "weight_loss_amount",
      "appetite_change",
      "stool_changes",
      "water_intake",
    ],
    red_flags: ["rapid_weight_loss"],
    body_systems: ["systemic", "endocrine"],
  },
  wound_skin_issue: {
    linked_diseases: [
      "wound_infection",
      "abscess",
      "hot_spots",
      "allergic_dermatitis",
      "skin_mass",
      "laceration",
      "autoimmune_skin",
      "mast_cell_tumor",
      "perianal_fistula",
      "alopecia",
      "zinc_responsive_dermatosis",
    ],
    follow_up_questions: [
      "wound_location",
      "wound_size",
      "wound_duration",
      "wound_color",
      "wound_discharge",
      "wound_odor",
      "wound_licking",
      "trauma_history",
    ],
    red_flags: ["wound_deep_bleeding", "wound_bone_visible", "wound_spreading_rapidly"],
    body_systems: ["dermatologic", "musculoskeletal"],
  },
  trauma: {
    linked_diseases: [
      "soft_tissue_injury",
      "laceration",
      "trauma_chest",
      "pain_general",
    ],
    follow_up_questions: [
      "trauma_mechanism",
      "trauma_timeframe",
      "trauma_area",
      "active_bleeding_trauma",
      "visible_fracture",
      "consciousness_level",
      "gum_color",
      "breathing_rate",
      "trauma_mobility",
    ],
    red_flags: [
      "active_bleeding_trauma",
      "visible_fracture",
      "blue_gums",
      "pale_gums",
      "unresponsive",
      "inability_to_stand",
    ],
    body_systems: ["musculoskeletal", "systemic", "respiratory"],
  },

  // --- NEW COMPLAINT FAMILIES (VET-902: Dog Complaint Ontology) ---

  seizure_collapse: {
    linked_diseases: [
      "seizure_disorder",
      "epilepsy",
      "hypoglycemia",
      "toxin_ingestion",
      "heart_disease",
      "imha",
      "addisons_disease",
      "heat_stroke",
      "brain_tumor",
      "vestibular_disease",
    ],
    follow_up_questions: [
      "seizure_duration",
      "consciousness_level",
      "toxin_exposure",
      "prior_seizures",
      "trembling_present",
      "gum_color",
      "breathing_status",
    ],
    red_flags: [
      "seizure_activity",
      "collapse",
      "unresponsive",
      "toxin_confirmed",
      "blue_gums",
      "pale_gums",
    ],
    body_systems: ["neurologic", "cardiovascular"],
  },

  urination_problem: {
    linked_diseases: [
      "urinary_stones",
      "urinary_infection",
      "prostate_disease",
      "bladder_cancer",
      "kidney_disease",
      "diabetes",
      "urethral_obstruction",
    ],
    follow_up_questions: [
      "urination_frequency",
      "straining_present",
      "blood_in_urine",
      "urination_accidents",
      "water_intake",
      "spay_status",
    ],
    red_flags: ["urinary_blockage", "no_urine_24h"],
    body_systems: ["renal", "reproductive", "endocrine"],
  },

  behavior_change: {
    linked_diseases: [
      "cognitive_dysfunction",
      "brain_tumor",
      "liver_shunt",
      "hypothyroidism",
      "pain_general",
      "seizure_disorder",
      "vision_loss",
      "hearing_loss",
    ],
    follow_up_questions: [
      "behavior_change_duration",
      "behavior_change_type",
      "appetite_status",
      "vision_changes",
      "sleep_pattern",
      "recent_events",
    ],
    red_flags: ["sudden_disorientation", "new_aggression", "seizure_activity"],
    body_systems: ["neurologic", "systemic"],
  },

  swelling_lump: {
    linked_diseases: [
      "skin_mass",
      "mast_cell_tumor",
      "abscess",
      "lymphoma",
      "histiocytic_sarcoma",
      "allergic_reaction",
      "lipoma",
      "hemangiosarcoma",
    ],
    follow_up_questions: [
      "lump_location",
      "lump_size",
      "lump_duration",
      "lump_growth_rate",
      "lump_mobility",
      "pain_on_touch",
      "other_lumps_present",
    ],
    red_flags: ["rapid_growing_mass", "face_swelling", "swelling_with_breathing"],
    body_systems: ["systemic", "dermatologic", "musculoskeletal"],
  },

  dental_problem: {
    linked_diseases: [
      "dental_disease",
      "oral_tumor",
      "tooth_root_abscess",
      "stomatitis",
      "foreign_body_mouth",
      "kidney_disease",
    ],
    follow_up_questions: [
      "breath_odor_severity",
      "drooling_present",
      "chewing_difficulty",
      "gum_appearance",
      "tooth_mobility",
      "appetite_status",
    ],
    red_flags: ["facial_swelling_under_eye", "inability_to_drink", "blood_from_mouth"],
    body_systems: ["oral", "systemic"],
  },

  hair_loss: {
    linked_diseases: [
      "allergic_dermatitis",
      "hypothyroidism",
      "cushings_disease",
      "mange",
      "folliculitis",
      "alopecia",
      "zinc_responsive_dermatosis",
      "food_allergy",
    ],
    follow_up_questions: [
      "hair_loss_pattern",
      "skin_appearance",
      "itching_present",
      "hair_loss_duration",
      "diet_quality",
      "flea_prevention",
    ],
    red_flags: ["widespread_hair_loss_skin_breakdown", "hair_loss_with_lethargy"],
    body_systems: ["dermatologic", "endocrine"],
  },

  regurgitation: {
    linked_diseases: [
      "megaesophagus",
      "vascular_ring_anomaly",
      "myasthenia_gravis",
      "esophageal_foreign_body",
      "hiatal_hernia",
    ],
    follow_up_questions: [
      "regurgitation_timing",
      "food_appearance",
      "coughing_present",
      "water_intake",
      "weight_change",
      "appetite_status",
    ],
    red_flags: ["coughing_after_regurgitation", "blue_gums", "inability_to_keep_water"],
    body_systems: ["gastrointestinal", "respiratory"],
  },

  constipation: {
    linked_diseases: [
      "obstipation",
      "prostate_enlargement",
      "perineal_hernia",
      "foreign_body",
      "pelvic_canal_stenosis",
      "hypothyroidism",
    ],
    follow_up_questions: [
      "last_normal_stool",
      "straining_duration",
      "stool_consistency_when_produced",
      "appetite_status",
      "vomiting_present",
      "water_intake",
    ],
    red_flags: ["straining_no_production_vomiting", "bloody_rectal_discharge"],
    body_systems: ["gastrointestinal"],
  },

  generalized_stiffness: {
    linked_diseases: [
      "impa",
      "osteoarthritis",
      "polymyositis",
      "degenerative_myelopathy",
      "lumbosacral_disease",
      "hypothyroidism",
    ],
    follow_up_questions: [
      "stiffness_onset",
      "affected_areas",
      "fever_present",
      "appetite_status",
      "energy_level",
      "worse_after_rest_or_exercise",
    ],
    red_flags: ["fever_with_stiffness", "inability_to_stand", "crying_when_touched"],
    body_systems: ["musculoskeletal", "systemic"],
  },

  nasal_discharge: {
    linked_diseases: [
      "nasal_infection",
      "nasal_tumor",
      "nasal_foreign_body",
      "aspergillosis",
      "dental_disease",
      "allergic_rhinitis",
    ],
    follow_up_questions: [
      "discharge_color",
      "discharge_side",
      "sneezing_frequency",
      "blood_present",
      "appetite_status",
      "nasal_discharge_duration",
    ],
    red_flags: ["bloody_nasal_discharge_one_sided", "facial_deformity"],
    body_systems: ["respiratory"],
  },

  vaginal_discharge: {
    linked_diseases: [
      "pyometra",
      "vaginal_hyperplasia",
      "metritis",
      "vaginal_tumor",
      "urinary_infection",
    ],
    follow_up_questions: [
      "spay_status",
      "vaginal_discharge_color",
      "discharge_odor",
      "heat_cycle_timing",
      "appetite_status",
      "water_intake",
    ],
    red_flags: ["intact_female_lethargy_drinking", "foul_smelling_discharge", "collapse"],
    body_systems: ["reproductive"],
  },

  testicular_prostate: {
    linked_diseases: [
      "prostate_disease",
      "testicular_tumor",
      "prostatitis",
      "perineal_hernia",
      "benign_prostatic_hyperplasia",
    ],
    follow_up_questions: [
      "neuter_status",
      "swelling_location",
      "urination_changes",
      "prostate_stool_changes",
      "pain_on_touch",
      "testicular_prostate_duration",
    ],
    red_flags: ["acute_painful_testicular_swelling", "inability_to_urinate"],
    body_systems: ["reproductive", "renal"],
  },

  exercise_induced_lameness: {
    linked_diseases: [
      "ccl_rupture",
      "iliopsoas_strain",
      "heart_disease",
      "exercise_induced_collapse",
      "myopathy",
      "osteoarthritis",
    ],
    follow_up_questions: [
      "exercise_type",
      "onset_during_exercise",
      "recovery_time",
      "breathing_after_exercise",
      "gum_color",
      "prior_episodes",
    ],
    red_flags: ["collapse_after_exercise", "blue_gums_after_exercise"],
    body_systems: ["musculoskeletal", "cardiovascular"],
  },

  skin_odor_greasy: {
    linked_diseases: [
      "yeast_infection",
      "seborrhea",
      "allergic_dermatitis",
      "hypothyroidism",
      "cushings_disease",
    ],
    follow_up_questions: [
      "odor_location",
      "skin_appearance",
      "itching_present",
      "bath_frequency",
      "ear_involvement",
      "diet_quality",
    ],
    red_flags: ["widespread_skin_breakdown", "fever_with_skin_odor"],
    body_systems: ["dermatologic"],
  },

  recurrent_ear: {
    linked_diseases: [
      "allergic_dermatitis",
      "ear_infection_bacterial",
      "ear_infection_yeast",
      "food_allergy",
      "hypothyroidism",
    ],
    follow_up_questions: [
      "infection_frequency",
      "last_treatment",
      "underlying_allergy_diagnosis",
      "food_trial_done",
      "ear_cleaning_routine",
    ],
    red_flags: ["head_tilt_sudden", "balance_loss", "facial_drooping"],
    body_systems: ["dermatologic", "systemic"],
  },

  recurrent_skin: {
    linked_diseases: [
      "allergic_dermatitis",
      "superficial_pyoderma",
      "demodicosis",
      "hypothyroidism",
      "cushings_disease",
      "immune_deficiency",
    ],
    follow_up_questions: [
      "skin_infection_frequency",
      "antibiotic_history",
      "allergy_testing_done",
      "immune_status",
      "diet_quality",
    ],
    red_flags: ["widespread_deep_infections", "fever", "non_responsive_to_antibiotics"],
    body_systems: ["dermatologic", "systemic", "immune"],
  },

  inappropriate_urination: {
    linked_diseases: [
      "urinary_infection",
      "urinary_stones",
      "diabetes",
      "cushings_disease",
      "kidney_disease",
      "prostate_disease",
      "cognitive_dysfunction",
    ],
    follow_up_questions: [
      "urination_frequency",
      "straining_present",
      "blood_in_urine",
      "water_intake",
      "neuter_status",
      "behavioral_changes",
    ],
    red_flags: ["straining_no_urine", "blood_in_urine", "male_unable_to_urinate"],
    body_systems: ["renal", "reproductive", "behavioral"],
  },

  fecal_incontinence: {
    linked_diseases: [
      "ivdd",
      "lumbosacral_disease",
      "cauda_equina_syndrome",
      "anal_sphincter_incompetence",
      "cognitive_dysfunction",
    ],
    follow_up_questions: [
      "fecal_incontinence_onset",
      "stool_consistency",
      "hind_limb_function",
      "tail_movement",
      "back_pain",
      "perineal_reflex",
    ],
    red_flags: ["sudden_onset_hind_weakness", "tail_paralysis", "inability_to_stand"],
    body_systems: ["gastrointestinal", "neurologic"],
  },

  vomiting_diarrhea_combined: {
    linked_diseases: [
      "gastroenteritis",
      "pancreatitis",
      "parvovirus",
      "toxin_ingestion",
      "foreign_body",
      "hemorrhagic_gastroenteritis",
    ],
    follow_up_questions: [
      "combined_vomiting_duration",
      "combined_diarrhea_duration",
      "blood_in_either",
      "appetite_status",
      "water_intake",
      "toxin_exposure",
    ],
    red_flags: ["puppy_vomiting_diarrhea", "blood_in_both", "not_drinking"],
    body_systems: ["gastrointestinal"],
  },

  coughing_breathing_combined: {
    linked_diseases: [
      "heart_failure",
      "pneumonia",
      "pleural_effusion",
      "laryngeal_paralysis",
      "allergic_reaction",
    ],
    follow_up_questions: [
      "breathing_rate",
      "gum_color",
      "cough_type",
      "coughing_breathing_onset",
      "exercise_intolerance",
      "position_preference",
    ],
    red_flags: ["blue_gums", "collapse", "sudden_onset", "inability_to_lie_down"],
    body_systems: ["respiratory", "cardiovascular"],
  },

  oral_mass: {
    linked_diseases: [
      "oral_tumor",
      "epulis",
      "melanoma",
      "squamous_cell_carcinoma",
      "foreign_body_mouth",
      "dental_disease",
    ],
    follow_up_questions: [
      "oral_mass_location",
      "oral_mass_size",
      "bleeding_present",
      "eating_difficulty",
      "oral_mass_duration",
      "breath_odor_severity",
    ],
    red_flags: ["bleeding_from_mouth", "inability_to_eat_drink", "facial_swelling"],
    body_systems: ["oral"],
  },

  vision_loss: {
    linked_diseases: [
      "sudden_acquired_retinal_degeneration",
      "glaucoma",
      "cataract",
      "optic_neuritis",
      "brain_tumor",
      "hypertension",
    ],
    follow_up_questions: [
      "vision_loss_onset",
      "one_or_both_eyes",
      "pain_present",
      "pupil_appearance",
      "other_neurologic_signs",
      "vision_loss_duration",
    ],
    red_flags: ["sudden_blindness", "painful_eye", "dilated_non_responsive_pupils"],
    body_systems: ["ophthalmologic", "neurologic"],
  },

  hearing_loss: {
    linked_diseases: [
      "ear_infection",
      "vestibular_disease",
      "age_related_deafness",
      "ototoxicity",
      "brain_tumor",
    ],
    follow_up_questions: [
      "hearing_loss_onset",
      "ear_infection_history",
      "head_tilt",
      "balance_issues",
      "response_to_loud_sounds",
      "dog_age_years",
    ],
    red_flags: ["sudden_deafness_head_tilt", "balance_loss", "facial_drooping"],
    body_systems: ["neurologic", "dermatologic"],
  },

  aggression: {
    linked_diseases: [
      "pain_general",
      "ivdd",
      "dental_disease",
      "ear_infection",
      "cognitive_dysfunction",
      "hypothyroidism",
      "brain_tumor",
    ],
    follow_up_questions: [
      "aggression_onset",
      "trigger_situations",
      "pain_on_touch",
      "appetite_status",
      "energy_level",
      "recent_events",
    ],
    red_flags: ["sudden_new_aggression", "aggression_with_trembling", "aggression_with_lethargy"],
    body_systems: ["systemic", "musculoskeletal", "neurologic"],
  },

  pacing_restlessness: {
    linked_diseases: [
      "gdv",
      "pain_general",
      "bloat",
      "cognitive_dysfunction",
      "anxiety",
      "splenic_mass",
    ],
    follow_up_questions: [
      "abdomen_appearance",
      "retching_present",
      "gum_color",
      "pacing_duration",
      "appetite_status",
      "water_intake",
    ],
    red_flags: ["pacing_with_bloated_abdomen", "pacing_with_retching", "pacing_over_2h"],
    body_systems: ["systemic", "neurologic", "gastrointestinal"],
  },

  abnormal_gait: {
    linked_diseases: [
      "ivdd",
      "degenerative_myelopathy",
      "wobbler_syndrome",
      "vestibular_disease",
      "fibrocartilaginous_embolism",
      "brain_tumor",
    ],
    follow_up_questions: [
      "abnormal_gait_onset",
      "affected_limbs",
      "back_pain",
      "bladder_control",
      "trauma_history",
      "abnormal_gait_progression",
    ],
    red_flags: ["inability_to_stand", "paralysis", "loss_bladder_bowel_control"],
    body_systems: ["neurologic", "musculoskeletal"],
  },

  heat_intolerance: {
    linked_diseases: [
      "heat_stroke",
      "difficulty_breathing",
      "heart_disease",
      "obesity_related",
    ],
    follow_up_questions: [
      "temperature_exposure",
      "heat_exposure_duration",
      "gum_color",
      "consciousness_level",
      "vomiting_present",
      "water_intake",
    ],
    red_flags: ["collapse_in_heat", "brick_red_gums", "vomiting_overheating"],
    body_systems: ["respiratory", "systemic"],
  },

  postoperative_concern: {
    linked_diseases: [
      "wound_infection",
      "surgical_complication",
      "seroma",
      "dehiscence",
      "pain_general",
    ],
    follow_up_questions: [
      "surgery_type",
      "days_post_op",
      "incision_appearance",
      "discharge_present",
      "appetite_status",
      "activity_level",
    ],
    red_flags: ["incision_dehiscence", "active_bleeding_incision", "pus_with_fever"],
    body_systems: ["systemic", "dermatologic"],
  },

  medication_reaction: {
    linked_diseases: [
      "allergic_reaction",
      "toxin_ingestion",
      "gastroenteritis",
    ],
    follow_up_questions: [
      "medication_name",
      "medication_dose",
      "medication_timing",
      "reaction_symptoms",
      "prior_reactions",
      "current_medications",
    ],
    red_flags: ["face_swelling", "hives_with_breathing", "collapse"],
    body_systems: ["systemic"],
  },
  post_vaccination_reaction: {
    linked_diseases: [
      "allergic_reaction",
      "gastroenteritis",
      "pain_general",
      "fever",
    ],
    follow_up_questions: [
      "vaccination_timing",
      "vaccination_type",
      "reaction_symptoms",
      "face_swelling",
      "hives_with_breathing",
      "fever_present",
      "appetite_status",
    ],
    red_flags: ["face_swelling", "hives_with_breathing", "unresponsive"],
    body_systems: ["systemic", "dermatologic"],
  },

  pregnancy_birth: {
    linked_diseases: [
      "dystocia",
      "metritis",
      "eclampsia",
      "pregnancy",
      "pyometra",
    ],
    follow_up_questions: [
      "days_pregnant",
      "contraction_status",
      "discharge_color",
      "puppies_delivered",
      "time_since_last_puppy",
      "appetite_status",
    ],
    red_flags: ["dystocia_active", "green_discharge_no_puppy", "eclampsia_signs"],
    body_systems: ["reproductive"],
  },

  puppy_concern: {
    linked_diseases: [
      "hypoglycemia",
      "parasites",
      "parvovirus",
      "fading_puppy_syndrome",
      "congenital_defect",
      "liver_shunt",
    ],
    follow_up_questions: [
      "puppy_age_weeks",
      "nursing_status",
      "puppy_temperature",
      "weight_trend",
      "littermate_status",
      "vaccination_status",
    ],
    red_flags: ["puppy_not_nursing_4h", "puppy_cold_to_touch", "diarrhea_under_12_weeks"],
    body_systems: ["systemic"],
  },

  senior_decline: {
    linked_diseases: [
      "cognitive_dysfunction",
      "osteoarthritis",
      "kidney_disease",
      "heart_disease",
      "cancer",
      "hypothyroidism",
      "dental_disease",
    ],
    follow_up_questions: [
      "senior_decline_duration",
      "specific_changes",
      "appetite_status",
      "water_intake",
      "mobility_level",
      "sleep_pattern",
    ],
    red_flags: ["rapid_decline_weeks", "inability_to_stand", "sudden_blindness"],
    body_systems: ["neurologic", "systemic", "musculoskeletal"],
  },

  multi_system_decline: {
    linked_diseases: [
      "kidney_disease",
      "liver_disease",
      "cancer",
      "addisons_disease",
      "imha",
      "heart_failure",
      "sepsis",
    ],
    follow_up_questions: [
      "each_symptom_duration",
      "appetite_status",
      "water_intake",
      "weight_change",
      "energy_level",
      "vomiting_present",
    ],
    red_flags: ["lethargy_not_eating_not_drinking", "pale_gums_collapse"],
    body_systems: ["systemic"],
  },

  unknown_concern: {
    linked_diseases: ["pain_general", "infection"],
    follow_up_questions: [
      "chief_complaint_guess",
      "appetite_status",
      "water_intake",
      "energy_level",
      "breathing_status",
      "gum_color",
      "last_normal",
    ],
    red_flags: ["unable_to_assess_breathing", "dog_non_responsive"],
    body_systems: ["unknown"],
  },
};

// --- DISEASE DATABASE ---

const SUPPLEMENTAL_DISEASES: Record<string, DiseaseEntry> = {
  liver_disease: makeSystemicDisease("Liver Disease", "Canine Hepatopathy", "Hepatic disease can drive appetite loss, lethargy, vomiting, jaundice, or increased thirst.", "high", 0.08),
  dental_disease: makeSystemicDisease("Dental Disease", "Periodontal Disease / Oral Pain", "Oral pain commonly presents as reduced appetite, drooling, halitosis, or chewing reluctance.", "moderate", 0.12),
  tooth_root_abscess: makeSystemicDisease("Tooth Root Abscess", "Periapical Tooth Root Abscess", "Infected tooth roots can cause oral pain, facial swelling under the eye, bad breath, and chewing difficulty.", "high", 0.05),
  pain_general: makeSystemicDisease("Generalized Pain", "Non-localized Pain Syndrome", "Pain can present as lethargy, trembling, reduced appetite, and behavior change even without an obvious injury.", "high", 0.08),
  parasites: makeSystemicDisease("Parasitism", "Intestinal Parasitic Disease", "Intestinal parasites can cause diarrhea, weight loss, blood in stool, or a poor hair coat.", "moderate", 0.12, { puppy: 2.2, adult: 1.0, senior: 0.9 }),
  colitis: makeSystemicDisease("Colitis", "Large Bowel Colitis", "Colitis often causes frequent small-volume stool, mucus, urgency, and bright red blood.", "moderate", 0.12),
  food_allergy: makeDermDisease("Food Allergy", "Adverse Food Reaction", "Food allergy can cause itching, recurrent ear disease, GI upset, or year-round skin inflammation.", "moderate", 0.1),
  ivdd: makeNeuroOrOrthoDisease("Intervertebral Disc Disease", "Intervertebral Disc Extrusion / Protrusion", "Disc disease can cause back pain, reluctance to move, limb weakness, or sudden neurologic deficits.", "high", 0.09, { puppy: 0.4, adult: 1.0, senior: 1.8 }),
  infection: makeSystemicDisease("Systemic Infection", "Infectious Inflammatory Disease", "Fever, lethargy, poor appetite, and pain can reflect bacterial, viral, or inflammatory infection.", "high", 0.08),
  anemia: makeSystemicDisease("Anemia", "Reduced Red Blood Cell Mass", "Anemia can cause lethargy, pale gums, weakness, rapid breathing, and collapse.", "high", 0.07),
  hypothyroidism: makeSystemicDisease("Hypothyroidism", "Canine Hypothyroidism", "Low thyroid hormone commonly causes lethargy, weight gain, skin disease, and exercise intolerance.", "moderate", 0.08, { puppy: 0.2, adult: 1.0, senior: 1.6 }),
  addisons_disease: makeSystemicDisease("Addison's Disease", "Hypoadrenocorticism", "Addison's disease can cause waxing and waning lethargy, GI upset, weakness, trembling, or collapse.", "high", 0.06),
  pneumonia: makeRespiratoryDisease("Pneumonia", "Pneumonia", "Lower airway infection or inflammation can cause cough, fast breathing, fever, and respiratory distress.", "high", 0.08),
  collapsing_trachea: makeRespiratoryDisease("Collapsing Trachea", "Tracheal Collapse", "A dry honking cough, exercise intolerance, and noisy breathing are classic for collapsing trachea.", "moderate", 0.08),
  laryngeal_paralysis: makeRespiratoryDisease("Laryngeal Paralysis", "Laryngeal Paralysis", "Upper airway obstruction can cause noisy breathing, heat intolerance, and worsening respiratory effort.", "high", 0.06, { puppy: 0.2, adult: 0.8, senior: 1.8 }),
  lung_cancer: makeRespiratoryDisease("Lung Cancer", "Primary or Metastatic Pulmonary Neoplasia", "Pulmonary tumors can cause chronic cough, breathing difficulty, weight loss, and exercise intolerance.", "high", 0.03, { puppy: 0.1, adult: 0.7, senior: 2.0 }),
  heart_failure: makeRespiratoryDisease("Heart Failure", "Congestive Heart Failure", "Fluid buildup from heart disease can cause cough, fast breathing, intolerance to exercise, and weakness.", "emergency", 0.06, { puppy: 0.2, adult: 0.8, senior: 1.9 }),
  pleural_effusion: makeRespiratoryDisease("Pleural Effusion", "Pleural Space Effusion", "Fluid around the lungs causes shallow breathing, orthopnea, and severe respiratory effort.", "emergency", 0.04),
  allergic_reaction: makeRespiratoryDisease("Allergic Reaction", "Acute Hypersensitivity Reaction", "Acute allergy can cause facial swelling, hives, vomiting, and rapid-onset breathing difficulty.", "emergency", 0.05),
  trauma_chest: makeRespiratoryDisease("Chest Trauma", "Thoracic Trauma", "Blunt or penetrating chest trauma can cause pain, shock, internal bleeding, or breathing difficulty.", "emergency", 0.03),
  flea_allergy: makeDermDisease("Flea Allergy Dermatitis", "Flea Allergy Dermatitis", "Even a small flea burden can trigger severe itching, hair loss, and hot spots.", "moderate", 0.09),
  ear_infection: makeDermDisease("Ear Infection", "Otitis Externa", "Ear inflammation can cause odor, discharge, head shaking, and scratching around the ears.", "moderate", 0.08),
  mange: makeDermDisease("Mange", "Demodectic or Sarcoptic Mange", "Mites can cause hair loss, crusting, intense itch, and secondary infection.", "moderate", 0.07),
  yeast_infection: makeDermDisease("Yeast Dermatitis", "Malassezia Dermatitis", "Yeast overgrowth often causes greasy skin, odor, redness, and itch in skin folds or paws.", "moderate", 0.08),
  cushings_disease: makeSystemicDisease("Cushing's Disease", "Hyperadrenocorticism", "Cushing's disease causes increased thirst, panting, recurrent skin issues, and abdominal enlargement.", "moderate", 0.06, { puppy: 0.1, adult: 0.8, senior: 1.8 }),
  pyometra: makeSystemicDisease("Pyometra", "Infected Uterus", "Pyometra in intact females can cause increased drinking, lethargy, abdominal enlargement, or collapse.", "emergency", 0.05, { puppy: 0.0, adult: 1.0, senior: 1.4 }),
  hypercalcemia: makeSystemicDisease("Hypercalcemia", "Elevated Blood Calcium", "High calcium can cause increased drinking, weakness, reduced appetite, and constipation.", "high", 0.03),
  hypoglycemia: makeSystemicDisease("Hypoglycemia", "Low Blood Sugar", "Low blood glucose can cause trembling, weakness, disorientation, seizures, or collapse.", "emergency", 0.05, { puppy: 1.8, adult: 1.0, senior: 0.9 }),
  seizure_disorder: makeNeuroOrOrthoDisease("Seizure Disorder", "Epileptic or Reactive Seizure Disorder", "Seizure disorders can cause trembling, collapse, salivation, paddling, or post-ictal confusion.", "high", 0.06),
  fever: makeSystemicDisease("Fever", "Pyrexia", "Fever can cause lethargy, shivering, reduced appetite, and warm ears or body temperature.", "moderate", 0.08),
  anxiety: makeSystemicDisease("Anxiety", "Anxiety / Stress Response", "Stress can cause trembling, pacing, panting, and restlessness without primary organic disease.", "low", 0.07),
  ascites: makeSystemicDisease("Ascites", "Abdominal Effusion", "Fluid in the abdomen causes progressive distension and can reflect heart, liver, or protein disorders.", "high", 0.05),
  splenic_mass: makeSystemicDisease("Splenic Mass", "Splenic Mass / Hemangiosarcoma Risk", "A splenic mass can cause abdominal enlargement, weakness, collapse, or internal bleeding.", "emergency", 0.04, { puppy: 0.0, adult: 0.8, senior: 1.8 }),
  pregnancy: makeSystemicDisease("Pregnancy", "Canine Pregnancy", "Normal or complicated pregnancy can enlarge the abdomen and change appetite or behavior.", "moderate", 0.03, { puppy: 0.0, adult: 1.0, senior: 0.2 }),
  hemorrhagic_gastroenteritis: makeSystemicDisease("Hemorrhagic Gastroenteritis", "Acute Hemorrhagic Diarrhea Syndrome", "Sudden profuse bloody diarrhea with vomiting can rapidly dehydrate dogs and become critical.", "emergency", 0.05),
  coagulopathy: makeSystemicDisease("Coagulopathy", "Bleeding Disorder / Coagulopathy", "Abnormal clotting can cause GI bleeding, bruising, pale gums, and weakness.", "emergency", 0.04),
  gi_cancer: makeSystemicDisease("Gastrointestinal Cancer", "Gastrointestinal Neoplasia", "GI tumors can cause chronic vomiting, blood in stool, weight loss, and reduced appetite.", "high", 0.03, { puppy: 0.0, adult: 0.6, senior: 1.8 }),
  conjunctivitis: makeOphthalmicDisease("Conjunctivitis", "Conjunctivitis", "Conjunctival inflammation causes redness, discharge, squinting, and periocular irritation.", "moderate", 0.09),
  corneal_ulcer: makeOphthalmicDisease("Corneal Ulcer", "Corneal Ulceration", "Corneal ulcers are painful and often cause squinting, tearing, cloudiness, and discharge.", "high", 0.07),
  dry_eye: makeOphthalmicDisease("Dry Eye", "Keratoconjunctivitis Sicca", "Reduced tear production causes thick discharge, redness, and recurrent eye irritation.", "moderate", 0.06),
  glaucoma: makeOphthalmicDisease("Glaucoma", "Glaucoma", "High intraocular pressure causes severe pain, redness, cloudy cornea, and sudden vision loss.", "emergency", 0.04),
  uveitis: makeOphthalmicDisease("Uveitis", "Uveitis", "Inflammation inside the eye causes pain, redness, squinting, and vision change.", "high", 0.04),
  entropion: makeOphthalmicDisease("Entropion", "Entropion", "Inward-rolling eyelids cause chronic discharge, corneal trauma, and squinting.", "moderate", 0.05),
  ear_infection_yeast: makeDermDisease("Yeast Ear Infection", "Malassezia Otitis Externa", "Yeasty otitis causes dark debris, strong odor, itch, and head shaking.", "moderate", 0.06),
  ear_mites: makeDermDisease("Ear Mites", "Otodectic Otitis", "Ear mites cause dark debris, irritation, and intense head shaking or scratching.", "moderate", 0.04, { puppy: 1.8, adult: 1.0, senior: 0.8 }),
  foreign_body_ear: makeDermDisease("Ear Foreign Body", "Foreign Body in Ear Canal", "Grass awns and other material can trigger sudden pain, head shaking, and unilateral discharge.", "high", 0.04),
  aural_hematoma: makeDermDisease("Aural Hematoma", "Aural Hematoma", "Bleeding within the ear flap causes a swollen, warm, pillow-like ear.", "moderate", 0.05),
  hyperthyroidism: makeSystemicDisease("Hyperthyroidism-like Weight Loss", "Weight Loss with Increased Metabolic Drive", "Although uncommon in dogs, marked metabolic weight loss can resemble hyperthyroid patterns.", "moderate", 0.02, { puppy: 0.0, adult: 0.4, senior: 1.3 }),
  cancer: makeSystemicDisease("Cancer", "Systemic Neoplasia", "Cancer can cause weight loss, lethargy, reduced appetite, bleeding, or masses depending on the site.", "high", 0.06),
  exocrine_pancreatic_insufficiency: makeSystemicDisease("Exocrine Pancreatic Insufficiency", "Exocrine Pancreatic Insufficiency", "EPI causes weight loss, ravenous appetite, poor stool quality, and malabsorption.", "moderate", 0.04),
  degenerative_myelopathy: makeNeuroOrOrthoDisease("Degenerative Myelopathy", "Degenerative Myelopathy", "Progressive hind-end weakness and ataxia in older dogs can mimic orthopedic limping.", "high", 0.04, { puppy: 0.0, adult: 0.6, senior: 1.8 }),
  wobbler_syndrome: makeNeuroOrOrthoDisease("Wobbler Syndrome", "Cervical Spondylomyelopathy", "Neck disease can cause a wobbly gait, weakness, neck pain, and limb deficits.", "high", 0.03, { puppy: 0.1, adult: 0.8, senior: 1.5 }),
  obesity_related: makeSystemicDisease("Obesity-related Mobility Disease", "Obesity-associated Musculoskeletal Strain", "Excess body weight can worsen joint pain, exercise intolerance, and mobility complaints.", "moderate", 0.06),
  histiocytic_sarcoma: makeSystemicDisease("Histiocytic Sarcoma", "Histiocytic Sarcoma", "Aggressive cancer in predisposed breeds can present as lameness, masses, lethargy, or weight loss.", "high", 0.02, { puppy: 0.0, adult: 0.7, senior: 1.7 }),
  imha: makeSystemicDisease("Immune-Mediated Hemolytic Anemia", "Immune-Mediated Hemolytic Anemia", "IMHA can cause sudden lethargy, pale or yellow gums, rapid breathing, and collapse.", "emergency", 0.03),
  liver_shunt: makeSystemicDisease("Liver Shunt", "Portosystemic Shunt", "Abnormal liver blood flow can cause poor growth, vomiting, neurologic signs, and poor appetite.", "high", 0.03, { puppy: 2.0, adult: 0.8, senior: 0.3 }),
  difficulty_breathing: makeRespiratoryDisease("Upper Airway Obstructive Disease", "Brachycephalic / Upper Airway Obstruction", "Chronic upper airway obstruction causes noisy breathing, panting intolerance, and exertional distress.", "high", 0.06),
  heat_stroke: makeRespiratoryDisease("Heat Stroke", "Heat Stroke / Hyperthermia", "Heat illness causes panting, collapse, brick-red or pale gums, vomiting, and shock.", "emergency", 0.04),
  bloat: makeSystemicDisease("Gastric Dilatation", "Gastric Dilatation / Bloat", "Gastric distension can cause a tense abdomen, restlessness, and rapid progression to GDV.", "emergency", 0.04),
  mast_cell_tumor: makeDermDisease("Mast Cell Tumor", "Mast Cell Tumor", "Skin or subcutaneous masses can wax and wane, itch, redden, or ulcerate.", "high", 0.04, { puppy: 0.0, adult: 0.8, senior: 1.6 }),
  perianal_fistula: makeDermDisease("Perianal Fistula", "Perianal Fistula / Anal Furunculosis", "Painful draining tracts near the anus can cause licking, odor, bleeding, and reluctance to sit.", "high", 0.03),
  alopecia: makeDermDisease("Alopecia", "Alopecia", "Hair loss without severe inflammation can reflect endocrine, allergic, or follicular disease.", "low", 0.05),
  zinc_responsive_dermatosis: makeDermDisease("Zinc-Responsive Dermatosis", "Zinc-Responsive Dermatosis", "A crusting dermatosis affecting face, pads, and pressure points in predisposed breeds.", "moderate", 0.02),
  cherry_eye: makeOphthalmicDisease("Cherry Eye", "Prolapsed Gland of the Third Eyelid", "A pink tissue mass at the inner corner of the eye is typical of cherry eye.", "moderate", 0.05, { puppy: 1.4, adult: 1.0, senior: 0.8 }),
  eye_disorders: makeOphthalmicDisease("Inherited Eye Disorders", "Inherited Ocular Disorders", "Breed-related eye disease can present with discharge, irritation, vision change, or recurrent eye pain.", "moderate", 0.03),
  epilepsy: makeNeuroOrOrthoDisease("Epilepsy", "Idiopathic Epilepsy", "Recurrent seizures or episodic tremoring can reflect inherited epilepsy in predisposed breeds.", "high", 0.05, { puppy: 0.8, adult: 1.0, senior: 0.7 }),
  syringomyelia: makeNeuroOrOrthoDisease("Syringomyelia", "Syringomyelia", "Neuropathic pain can cause phantom scratching, neck pain, vocalization, and gait change.", "high", 0.03),
  von_willebrands: makeSystemicDisease("von Willebrand Disease", "von Willebrand Disease", "Inherited clotting disorders can cause bruising, mucosal bleeding, and excessive bleeding with minor trauma.", "high", 0.03),

  // --- VET-902: New diseases for expanded complaint families ---

  urinary_stones: makeSystemicDisease("Urinary Stones", "Urolithiasis / Urinary Calculi", "Mineral stones in the bladder or urethra cause straining, blood in urine, and potential blockage.", "high", 0.08),
  urinary_infection: makeSystemicDisease("Urinary Tract Infection", "Bacterial Cystitis", "Bacterial infection of the bladder causes frequent urination, accidents, straining, and blood.", "moderate", 0.12),
  prostate_disease: makeSystemicDisease("Prostate Disease", "Prostatitis / Benign Prostatic Hyperplasia / Prostatic Neoplasia", "Prostate enlargement causes straining to urinate, ribbon-like stool, and hind limb weakness.", "high", 0.06, { puppy: 0.0, adult: 1.0, senior: 2.2 }),
  bladder_cancer: makeSystemicDisease("Bladder Cancer", "Transitional Cell Carcinoma", "Malignant bladder tumor causes blood in urine, straining, and recurrent infections.", "high", 0.02, { puppy: 0.0, adult: 0.4, senior: 2.0 }),
  urethral_obstruction: makeSystemicDisease("Urethral Obstruction", "Urethral Blockage", "Complete blockage of urine flow is a life-threatening emergency causing bladder rupture and kidney failure.", "emergency", 0.04),

  cognitive_dysfunction: makeNeuroOrOrthoDisease("Cognitive Dysfunction Syndrome", "Canine Cognitive Dysfunction", "Age-related brain changes cause confusion, disorientation, sleep changes, and housetraining loss.", "moderate", 0.08, { puppy: 0.0, adult: 0.3, senior: 2.5 }),
  brain_tumor: makeNeuroOrOrthoDisease("Brain Tumor", "Intracranial Neoplasia", "Brain tumors cause seizures, behavior changes, vision loss, circling, and head pressing.", "high", 0.02, { puppy: 0.0, adult: 0.5, senior: 2.0 }),
  vision_loss: makeSystemicDisease("Vision Loss", "Blindness / Visual Impairment", "Vision loss can be sudden (SARD, glaucoma) or gradual (cataract, retinal degeneration).", "high", 0.05),
  hearing_loss: makeSystemicDisease("Hearing Loss", "Deafness / Hearing Impairment", "Hearing loss can be age-related, infection-related, or congenital in some breeds.", "moderate", 0.04),

  megaesophagus: makeSystemicDisease("Megaesophagus", "Esophageal Dilatation and Hypomotility", "Enlarged esophagus causes regurgitation of undigested food, weight loss, and aspiration risk.", "high", 0.03),
  vascular_ring_anomaly: makeSystemicDisease("Vascular Ring Anomaly", "Persistent Right Aortic Arch", "Congenital blood vessel compresses esophagus causing regurgitation in young dogs.", "high", 0.02, { puppy: 2.0, adult: 0.3, senior: 0.1 }),
  myasthenia_gravis: makeNeuroOrOrthoDisease("Myasthenia Gravis", "Acquired Myasthenia Gravis", "Autoimmune neuromuscular disorder causes weakness, regurgitation, and exercise intolerance.", "high", 0.02),
  esophageal_foreign_body: makeSystemicDisease("Esophageal Foreign Body", "Esophageal Obstruction", "Object lodged in esophagus causes drooling, retching, and inability to swallow.", "emergency", 0.03),
  hiatal_hernia: makeSystemicDisease("Hiatal Hernia", "Sliding Hiatal Hernia", "Stomach protrudes through diaphragm causing regurgitation, especially after eating.", "moderate", 0.02),

  obstipation: makeSystemicDisease("Obstipation", "Severe Refractory Constipation", "Severe, unresponsive constipation requiring medical or surgical intervention.", "high", 0.04),
  prostate_enlargement: makeSystemicDisease("Prostate Enlargement", "Prostatomegaly", "Enlarged prostate compresses colon causing constipation and urination difficulty.", "moderate", 0.06, { puppy: 0.0, adult: 1.0, senior: 2.0 }),
  perineal_hernia: makeSystemicDisease("Perineal Hernia", "Perineal Herniation", "Pelvic diaphragm weakness allows abdominal contents into perineal region causing straining.", "high", 0.03, { puppy: 0.0, adult: 0.6, senior: 2.0 }),
  pelvic_canal_stenosis: makeSystemicDisease("Pelvic Canal Stenosis", "Narrowed Pelvic Canal", "Narrowed pelvic canal from prior fracture causes chronic constipation.", "moderate", 0.02),

  polymyositis: makeNeuroOrOrthoDisease("Polymyositis", "Inflammatory Myopathy", "Immune-mediated muscle inflammation causes stiffness, pain, and weakness.", "high", 0.02),
  exercise_induced_collapse: makeNeuroOrOrthoDisease("Exercise-Induced Collapse", "Exercise-Induced Collapse (EIC)", "Genetic disorder in certain breeds causes collapse after intense exercise.", "moderate", 0.03),
  myopathy: makeNeuroOrOrthoDisease("Myopathy", "Muscle Disease", "Primary muscle disorders cause weakness, stiffness, and exercise intolerance.", "moderate", 0.03),

  nasal_infection: makeRespiratoryDisease("Nasal Infection", "Rhinitis / Sinusitis", "Nasal cavity infection causes discharge, sneezing, and congestion.", "moderate", 0.06),
  nasal_tumor: makeRespiratoryDisease("Nasal Tumor", "Nasal Neoplasia", "Nasal cavity tumors cause one-sided bloody discharge, facial deformity, and sneezing.", "high", 0.02, { puppy: 0.0, adult: 0.5, senior: 2.2 }),
  nasal_foreign_body: makeRespiratoryDisease("Nasal Foreign Body", "Nasal Cavity Foreign Body", "Plant material or object in nasal cavity causes sudden sneezing and discharge.", "moderate", 0.03),
  aspergillosis: makeRespiratoryDisease("Nasal Aspergillosis", "Fungal Rhinitis", "Fungal infection of nasal cavity causes bloody discharge, pain, and depigmentation.", "high", 0.02),
  allergic_rhinitis: makeRespiratoryDisease("Allergic Rhinitis", "Nasal Allergy", "Environmental allergy causes clear nasal discharge and sneezing.", "low", 0.04),

  vaginal_hyperplasia: makeSystemicDisease("Vaginal Hyperplasia", "Vaginal Edema / Hyperplasia", "Estrogen-driven swelling of vaginal tissue during heat cycle.", "moderate", 0.03),
  metritis: makeSystemicDisease("Metritis", "Infected Uterus Post-Partum", "Uterine infection after whelping causes fever, foul discharge, and lethargy.", "emergency", 0.03),
  vaginal_tumor: makeSystemicDisease("Vaginal Tumor", "Vaginal Neoplasia", "Vaginal mass causes discharge, straining, and visible tissue mass.", "moderate", 0.02),

  testicular_tumor: makeSystemicDisease("Testicular Tumor", "Testicular Neoplasia", "Testicular cancer causes swelling, hormone changes, and metastasis risk.", "moderate", 0.04, { puppy: 0.0, adult: 0.8, senior: 1.8 }),
  prostatitis: makeSystemicDisease("Prostatitis", "Bacterial Prostate Infection", "Prostate infection causes fever, pain, and urination/defecation difficulty.", "high", 0.04),
  benign_prostatic_hyperplasia: makeSystemicDisease("Benign Prostatic Hyperplasia", "BPH", "Non-cancerous prostate enlargement common in intact males causes stool and urine changes.", "moderate", 0.08, { puppy: 0.0, adult: 1.0, senior: 1.5 }),

  lymphoma: makeSystemicDisease("Lymphoma", "Multicentric Lymphoma", "Cancer of lymph nodes causing widespread swelling, lethargy, and weight loss.", "high", 0.04),
  lipoma: makeDermDisease("Lipoma", "Benign Fatty Tumor", "Harmless fatty lump common in middle-aged and older dogs.", "low", 0.1, { puppy: 0.0, adult: 0.8, senior: 2.0 }),
  hemangiosarcoma: makeSystemicDisease("Hemangiosarcoma", "Malignant Blood Vessel Tumor", "Aggressive cancer of blood vessels, commonly in spleen or heart, causes internal bleeding.", "emergency", 0.02, { puppy: 0.0, adult: 0.6, senior: 2.2 }),

  seborrhea: makeDermDisease("Seborrhea", "Seborrheic Dermatitis", "Greasy, scaly skin condition causing odor, flaking, and secondary infection.", "moderate", 0.05),
  folliculitis: makeDermDisease("Folliculitis", "Hair Follicle Inflammation / Infection", "Inflamed hair follicles cause bumps, pustules, and hair loss.", "moderate", 0.06),
  immune_deficiency: makeSystemicDisease("Immune Deficiency", "Immunodeficiency Syndrome", "Weakened immune system causes recurrent infections of skin, ears, and respiratory tract.", "high", 0.02),

  cauda_equina_syndrome: makeNeuroOrOrthoDisease("Cauda Equina Syndrome", "Cauda Equina Compression", "Nerve compression at tail end of spine causes fecal/urinary incontinence and hind limb weakness.", "high", 0.02),
  anal_sphincter_incompetence: makeSystemicDisease("Anal Sphincter Incompetence", "Fecal Incontinence", "Loss of anal sphincter control causes passive fecal leakage.", "moderate", 0.02),

  parvovirus: makeSystemicDisease("Parvovirus", "Canine Parvovirus Enteritis", "Highly contagious viral disease causing severe bloody diarrhea, vomiting, and rapid dehydration.", "emergency", 0.1, { puppy: 3.0, adult: 0.5, senior: 0.3 }),

  superficial_pyoderma: makeDermDisease("Superficial Pyoderma", "Bacterial Skin Infection", "Surface bacterial infection causes pustules, crusts, and hair loss.", "moderate", 0.08),
  demodicosis: makeDermDisease("Demodicosis", "Demodectic Mange", "Mite overgrowth causes hair loss, redness, and secondary infection, often in young dogs.", "moderate", 0.05, { puppy: 2.0, adult: 0.8, senior: 0.7 }),

  sudden_acquired_retinal_degeneration: makeOphthalmicDisease("SARD", "Sudden Acquired Retinal Degeneration", "Sudden irreversible blindness with normal-appearing eyes initially.", "high", 0.02, { puppy: 0.0, adult: 0.6, senior: 1.8 }),
  cataract: makeOphthalmicDisease("Cataract", "Lens Opacity", "Cloudy lens causes progressive vision loss, often bilateral.", "moderate", 0.06, { puppy: 0.2, adult: 0.8, senior: 2.0 }),
  optic_neuritis: makeOphthalmicDisease("Optic Neuritis", "Optic Nerve Inflammation", "Optic nerve inflammation causes sudden vision loss and painful eye movement.", "high", 0.02),
  hypertension: makeSystemicDisease("Hypertension", "Systemic Hypertension", "High blood pressure can cause sudden blindness, kidney damage, and neurologic signs.", "high", 0.04, { puppy: 0.0, adult: 0.6, senior: 2.2 }),

  vestibular_disease: makeNeuroOrOrthoDisease("Vestibular Disease", "Idiopathic Vestibular Syndrome", "Inner ear/balance disorder causes head tilt, circling, nystagmus, and falling.", "moderate", 0.06, { puppy: 0.2, adult: 0.8, senior: 2.0 }),
  age_related_deafness: makeSystemicDisease("Age-Related Deafness", "Presbycusis", "Progressive hearing loss in senior dogs.", "low", 0.06, { puppy: 0.0, adult: 0.4, senior: 2.5 }),
  ototoxicity: makeSystemicDisease("Ototoxicity", "Drug-Induced Ear Damage", "Certain medications damage inner ear causing deafness and balance problems.", "high", 0.02),

  oral_tumor: makeSystemicDisease("Oral Tumor", "Oral Neoplasia", "Malignant or benign growths in the mouth causing bleeding, odor, and eating difficulty.", "high", 0.04, { puppy: 0.0, adult: 0.6, senior: 2.0 }),
  epulis: makeSystemicDisease("Epulis", "Gingival Epulis", "Benign gum tumor causing mass effect, bleeding, and eating difficulty.", "moderate", 0.04),
  melanoma: makeSystemicDisease("Oral Melanoma", "Malignant Melanoma", "Aggressive oral cancer causing bleeding, tooth loss, and metastasis.", "emergency", 0.03, { puppy: 0.0, adult: 0.5, senior: 2.2 }),
  squamous_cell_carcinoma: makeSystemicDisease("Squamous Cell Carcinoma", "Oral SCC", "Oral cancer causing ulceration, bleeding, and bone destruction.", "high", 0.03),
  foreign_body_mouth: makeSystemicDisease("Mouth Foreign Body", "Oral Foreign Body", "Stick, bone, or object lodged in mouth or palate causing pain and drooling.", "moderate", 0.04),

  stomatitis: makeSystemicDisease("Stomatitis", "Chronic Gingivostomatitis", "Severe oral inflammation causing pain, drooling, bad breath, and eating difficulty.", "high", 0.03),

  fading_puppy_syndrome: makeSystemicDisease("Fading Puppy Syndrome", "Neonatal Mortality Syndrome", "Puppies that fail to thrive, cry constantly, and decline despite nursing.", "emergency", 0.08, { puppy: 3.0, adult: 0.0, senior: 0.0 }),
  congenital_defect: makeSystemicDisease("Congenital Defect", "Birth Defect", "Structural abnormality present from birth causes failure to thrive or specific organ dysfunction.", "high", 0.04, { puppy: 2.5, adult: 0.2, senior: 0.0 }),

  dystocia: makeSystemicDisease("Dystocia", "Difficult Birth", "Inability to deliver puppies naturally requires emergency intervention.", "emergency", 0.04),
  eclampsia: makeSystemicDisease("Eclampsia", "Postpartum Hypocalcemia", "Life-threatening low calcium in nursing dams causes tremors, seizures, and collapse.", "emergency", 0.03),

  seroma: makeSystemicDisease("Seroma", "Post-Surgical Fluid Accumulation", "Fluid pocket at surgery site, usually benign but can become infected.", "moderate", 0.06),
  dehiscence: makeSystemicDisease("Wound Dehiscence", "Surgical Incision Opening", "Opening of surgical incision exposes internal tissues and risks infection.", "emergency", 0.03),
  surgical_complication: makeSystemicDisease("Surgical Complication", "Post-Operative Complication", "Unexpected issue after surgery including bleeding, infection, or organ dysfunction.", "high", 0.06),

  sepsis: makeSystemicDisease("Sepsis", "Systemic Inflammatory Response to Infection", "Life-threatening body-wide response to infection causing organ failure and shock.", "emergency", 0.03),

  fibrocartilaginous_embolism: makeNeuroOrOrthoDisease("Fibrocartilaginous Embolism", "FCE / Spinal Stroke", "Spinal cord blood vessel blockage causes sudden one-sided paralysis without pain.", "high", 0.02),
};

export const DISEASE_DB: Record<string, DiseaseEntry> = {
  ccl_rupture: {
    name: "Cranial Cruciate Ligament (CCL) Rupture",
    medical_term: "Cranial Cruciate Ligament Rupture - Partial or Complete",
    description:
      "Tear of the cranial cruciate ligament in the stifle joint, analogous to ACL in humans.",
    base_probability: 0.15,
    age_modifier: { puppy: 0.3, adult: 1.0, senior: 1.8 },
    urgency: "high",
    key_differentiators: [
      "Sudden onset lameness after activity",
      "Weight-bearing but favoring leg",
      "Stifle joint instability on drawer test",
      "Effusion in stifle joint",
    ],
    typical_tests: [
      "Orthopedic examination with cranial drawer test and tibial compression test",
      "Orthogonal radiographs of stifle (lateral and craniocaudal views)",
      "Sedated palpation for subtle partial tears",
    ],
    typical_home_care: [
      "Strict exercise restriction — leash walks only for elimination",
      "Anti-inflammatory protocol as prescribed by vet",
      "Cold therapy 15 min every 4-6 hours for first 48 hours",
    ],
  },
  hip_dysplasia: {
    name: "Hip Dysplasia with Secondary Osteoarthritis",
    medical_term: "Coxofemoral Dysplasia with Secondary Degenerative Joint Disease",
    description:
      "Malformation of the hip joint leading to progressive arthritis. Often subclinical until triggered.",
    base_probability: 0.12,
    age_modifier: { puppy: 0.5, adult: 1.0, senior: 2.2 },
    urgency: "moderate",
    key_differentiators: [
      "Stiffness worse after rest, improves with movement",
      "Pain on hip extension",
      "Bilateral symptoms common",
      "Bunny-hopping gait",
    ],
    typical_tests: [
      "Extended hip radiographs (ventrodorsal hip-extended view)",
      "PennHIP distraction index measurement",
      "OFA hip evaluation",
    ],
    typical_home_care: [
      "Weight management — maintain lean body condition score 4-5/9",
      "Joint supplement: glucosamine 500mg + chondroitin 400mg daily",
      "Low-impact exercise — swimming, controlled leash walks",
    ],
  },
  soft_tissue_injury: {
    name: "Soft Tissue Strain / Muscle Contusion",
    medical_term: "Acute Musculotendinous Strain with Localized Inflammation",
    description: "Muscle or tendon strain from sudden activity. Usually self-limiting.",
    base_probability: 0.25,
    age_modifier: { puppy: 0.8, adult: 1.0, senior: 0.7 },
    urgency: "low",
    key_differentiators: [
      "Acute onset after vigorous activity",
      "Localized pain and warmth",
      "Resolves within 5-7 days with rest",
      "No joint instability",
    ],
    typical_tests: [
      "Physical examination with palpation",
      "Radiographs to rule out fracture if warranted",
    ],
    typical_home_care: [
      "Rest and restricted activity for 5-7 days",
      "Cold therapy for acute phase (first 48 hours)",
      "Gradual return to activity",
    ],
  },
  iliopsoas_strain: {
    name: "Iliopsoas Muscle Strain",
    medical_term: "Iliopsoas Myotendinopathy",
    description:
      "Deep hip flexor injury common in athletic dogs during sudden acceleration/deceleration.",
    base_probability: 0.08,
    age_modifier: { puppy: 0.4, adult: 1.2, senior: 0.6 },
    urgency: "moderate",
    key_differentiators: [
      "Pain on hip extension and internal rotation",
      "Often mistaken for hip joint pathology",
      "Common in active/athletic dogs",
      "Worsens with activity vs improves (opposite of OA)",
    ],
    typical_tests: [
      "Specific iliopsoas palpation under sedation",
      "Musculoskeletal ultrasound of iliopsoas",
      "MRI for chronic cases",
    ],
    typical_home_care: [
      "Strict rest for 2-4 weeks",
      "Physical rehabilitation exercises when cleared",
      "Controlled leash walks only",
    ],
  },
  osteoarthritis: {
    name: "Osteoarthritis",
    medical_term: "Degenerative Joint Disease (DJD)",
    description: "Progressive joint degeneration causing chronic pain and stiffness.",
    base_probability: 0.1,
    age_modifier: { puppy: 0.1, adult: 0.8, senior: 3.0 },
    urgency: "moderate",
    key_differentiators: [
      "Gradual onset over weeks/months",
      "Morning stiffness",
      "Worsens in cold/damp weather",
      "Muscle wasting over affected limb",
    ],
    typical_tests: [
      "Orthogonal joint radiographs",
      "Joint fluid analysis if effusion present",
    ],
    typical_home_care: [
      "Weight management",
      "Omega-3 fatty acid supplementation (EPA/DHA)",
      "Gentle daily exercise",
      "Orthopedic bedding",
    ],
  },
  impa: {
    name: "Immune-Mediated Polyarthritis (IMPA)",
    medical_term: "Immune-Mediated Polyarthritis",
    description:
      "Autoimmune condition causing inflammation in multiple joints simultaneously.",
    base_probability: 0.03,
    age_modifier: { puppy: 0.5, adult: 1.5, senior: 1.0 },
    urgency: "high",
    key_differentiators: [
      "Multiple joints affected simultaneously",
      "Fever, lethargy, appetite loss",
      "Shifting leg lameness",
      "Joint swelling and warmth in multiple locations",
    ],
    typical_tests: [
      "Joint fluid analysis (arthrocentesis) from multiple joints",
      "Complete blood count with differential",
      "ANA titer and rheumatoid factor",
      "Tick-borne disease panel (4Dx)",
    ],
    typical_home_care: [
      "Rest and activity restriction",
      "Monitor temperature twice daily",
      "Track which joints appear affected",
    ],
  },
  bone_cancer: {
    name: "Osteosarcoma",
    medical_term: "Appendicular Osteosarcoma",
    description:
      "Aggressive bone cancer most common in large/giant breeds. Usually affects long bones.",
    base_probability: 0.02,
    age_modifier: { puppy: 0.1, adult: 0.5, senior: 2.5 },
    urgency: "high",
    key_differentiators: [
      "Progressive lameness not improving with rest",
      "Firm swelling at bone site",
      "Pain increasing over weeks",
      "Large/giant breed predisposition",
    ],
    typical_tests: [
      "Orthogonal radiographs of affected limb",
      "Thoracic radiographs (3 views) for metastasis screening",
      "Bone biopsy for definitive diagnosis",
      "Alkaline phosphatase levels",
    ],
    typical_home_care: [
      "Pain management as prescribed",
      "Activity restriction to comfort level",
      "Monitor for pathologic fracture risk",
    ],
  },
  lumbosacral_disease: {
    name: "Lumbosacral Stenosis",
    medical_term: "Degenerative Lumbosacral Stenosis with L7-S1 Nerve Root Compression",
    description: "Compression of nerves at the lumbosacral junction causing hindlimb pain.",
    base_probability: 0.04,
    age_modifier: { puppy: 0.1, adult: 0.6, senior: 2.0 },
    urgency: "moderate",
    key_differentiators: [
      "Pain on lumbosacral palpation and tail elevation",
      "Difficulty rising",
      "Hindlimb weakness bilateral",
      "Fecal/urinary incontinence in advanced cases",
    ],
    typical_tests: [
      "Lumbosacral radiographs",
      "MRI of lumbosacral spine",
      "Neurologic examination",
    ],
    typical_home_care: [
      "Weight management",
      "Avoid jumping and stairs",
      "Ramp access for vehicles/furniture",
    ],
  },
  patellar_luxation: {
    name: "Patellar Luxation",
    medical_term: "Medial or Lateral Patellar Luxation",
    description: "Kneecap slips out of its groove, causing intermittent lameness.",
    base_probability: 0.08,
    age_modifier: { puppy: 1.5, adult: 1.0, senior: 0.8 },
    urgency: "moderate",
    key_differentiators: [
      "Intermittent 'skipping' gait",
      "Sudden non-weight-bearing then spontaneous resolution",
      "More common in small breeds",
      "Palpable luxation on exam",
    ],
    typical_tests: [
      "Orthopedic exam with patellar palpation",
      "Stifle radiographs",
    ],
    typical_home_care: [
      "Weight management",
      "Moderate consistent exercise",
      "Joint supplements",
    ],
  },
  gastroenteritis: {
    name: "Acute Gastroenteritis",
    medical_term: "Acute Gastroenteritis — Dietary Indiscretion vs Infectious",
    description: "Inflammation of stomach/intestines from dietary indiscretion or infection.",
    base_probability: 0.3,
    age_modifier: { puppy: 1.5, adult: 1.0, senior: 0.8 },
    urgency: "moderate",
    key_differentiators: [
      "Vomiting and/or diarrhea",
      "Recent dietary change or garbage access",
      "Self-limiting within 24-48 hours",
      "No abdominal pain on palpation",
    ],
    typical_tests: [
      "Fecal analysis (flotation + direct smear)",
      "CBC and chemistry panel if persists >48h",
      "Abdominal radiographs if foreign body suspected",
    ],
    typical_home_care: [
      "Withhold food 12 hours, then bland diet (boiled chicken + rice, 2:1 ratio)",
      "Small frequent meals — 1/4 portion 4x daily",
      "Ensure hydration — offer Pedialyte or low-sodium broth",
    ],
  },
  pancreatitis: {
    name: "Acute Pancreatitis",
    medical_term: "Acute Pancreatitis",
    description: "Inflammation of the pancreas causing severe abdominal pain and vomiting.",
    base_probability: 0.1,
    age_modifier: { puppy: 0.3, adult: 1.0, senior: 1.8 },
    urgency: "high",
    key_differentiators: [
      "Severe abdominal pain — prayer position",
      "Persistent vomiting",
      "Anorexia",
      "History of fatty food or garbage ingestion",
    ],
    typical_tests: [
      "Canine pancreatic lipase immunoreactivity (cPLI/Spec cPL)",
      "Abdominal ultrasound",
      "CBC and comprehensive chemistry panel",
    ],
    typical_home_care: [
      "NPO (nothing by mouth) until vet evaluation",
      "Low-fat diet long-term once recovered",
      "Monitor for dehydration — check skin turgor and gum moisture",
    ],
  },
  foreign_body: {
    name: "Gastrointestinal Foreign Body",
    medical_term: "Gastrointestinal Foreign Body Obstruction",
    description: "Ingested object blocking the GI tract — surgical emergency if complete obstruction.",
    base_probability: 0.08,
    age_modifier: { puppy: 2.5, adult: 1.0, senior: 0.4 },
    urgency: "emergency",
    key_differentiators: [
      "Persistent vomiting — especially projectile",
      "History of chewing/ingesting objects",
      "Progressive lethargy and anorexia",
      "Abdominal pain on palpation",
    ],
    typical_tests: [
      "Abdominal radiographs (right lateral + VD)",
      "Abdominal ultrasound",
      "Barium contrast study if radiographs inconclusive",
    ],
    typical_home_care: [
      "DO NOT attempt to induce vomiting without veterinary guidance",
      "NPO — nothing by mouth",
      "Seek emergency care immediately if suspected",
    ],
  },
  ibd: {
    name: "Inflammatory Bowel Disease (IBD)",
    medical_term: "Inflammatory Bowel Disease — Lymphoplasmacytic or Eosinophilic",
    description: "Chronic inflammatory condition of the GI tract causing intermittent symptoms.",
    base_probability: 0.06,
    age_modifier: { puppy: 0.3, adult: 1.2, senior: 1.5 },
    urgency: "moderate",
    key_differentiators: [
      "Chronic intermittent vomiting/diarrhea (weeks to months)",
      "Weight loss despite adequate food intake",
      "Fluctuating appetite",
      "Symptoms wax and wane",
    ],
    typical_tests: [
      "GI endoscopy with mucosal biopsies",
      "Cobalamin (B12) and folate levels",
      "Fecal analysis to rule out parasites",
      "Hypoallergenic diet trial (8-12 weeks)",
    ],
    typical_home_care: [
      "Novel protein or hydrolyzed diet trial",
      "Food diary tracking symptoms vs diet",
      "Probiotic supplementation",
    ],
  },
  gdv: {
    name: "Gastric Dilatation-Volvulus (GDV/Bloat)",
    medical_term: "Gastric Dilatation-Volvulus (GDV)",
    description: "Life-threatening twisting of the stomach. Minutes matter.",
    base_probability: 0.02,
    age_modifier: { puppy: 0.2, adult: 1.0, senior: 1.5 },
    urgency: "emergency",
    key_differentiators: [
      "Distended/bloated abdomen",
      "Unproductive retching — trying to vomit but nothing comes up",
      "Restlessness and pacing",
      "Rapid decline — pale gums, weak pulse, collapse",
    ],
    typical_tests: [
      "Right lateral abdominal radiograph — double bubble sign",
      "Emergency stabilization — IV fluids, gastric decompression",
    ],
    typical_home_care: [
      "THIS IS AN EMERGENCY — go to nearest ER vet NOW",
      "Do not wait, do not try home treatment",
      "Call ahead so ER can prepare for surgery",
    ],
  },
  toxin_ingestion: {
    name: "Toxin Ingestion / Poisoning",
    medical_term: "Acute Toxicosis",
    description: "Ingestion of toxic substance — treatment depends on toxin type and timing.",
    base_probability: 0.05,
    age_modifier: { puppy: 2.0, adult: 1.0, senior: 0.6 },
    urgency: "emergency",
    key_differentiators: [
      "Known or suspected access to toxic substance",
      "Acute onset vomiting, trembling, or neurologic signs",
      "Chocolate, xylitol, grapes, rodenticides, medications",
    ],
    typical_tests: [
      "Toxicology screening based on suspected agent",
      "CBC, chemistry, coagulation panel",
      "Activated charcoal if within ingestion window",
    ],
    typical_home_care: [
      "Call ASPCA Poison Control: (888) 426-4435",
      "Do NOT induce vomiting unless directed by vet/poison control",
      "Bring any packaging of suspected toxin to the ER",
    ],
  },
  kidney_disease: {
    name: "Chronic Kidney Disease",
    medical_term: "Chronic Kidney Disease (CKD) — IRIS Staging",
    description: "Progressive loss of kidney function.",
    base_probability: 0.04,
    age_modifier: { puppy: 0.2, adult: 0.5, senior: 3.0 },
    urgency: "high",
    key_differentiators: [
      "Increased water intake and urination",
      "Weight loss and decreased appetite",
      "Vomiting and lethargy in advanced stages",
      "Bad breath (uremic halitosis)",
    ],
    typical_tests: [
      "BUN, creatinine, SDMA",
      "Urinalysis with urine specific gravity",
      "Urine protein:creatinine ratio",
      "Abdominal ultrasound — kidney size and architecture",
    ],
    typical_home_care: [
      "Ensure constant access to fresh water",
      "Renal-specific diet (reduced phosphorus, moderate protein)",
      "Monitor water intake — measure daily",
    ],
  },
  diabetes: {
    name: "Diabetes Mellitus",
    medical_term: "Diabetes Mellitus — Type I (Insulin-Dependent)",
    description: "Inability to regulate blood sugar due to insufficient insulin production.",
    base_probability: 0.03,
    age_modifier: { puppy: 0.1, adult: 1.0, senior: 2.0 },
    urgency: "high",
    key_differentiators: [
      "Increased thirst and urination (PU/PD)",
      "Weight loss despite good appetite",
      "Cataracts (diabetic dogs)",
      "Recurrent urinary tract infections",
    ],
    typical_tests: [
      "Fasting blood glucose",
      "Fructosamine level",
      "Urinalysis — glucosuria and ketonuria",
      "Complete chemistry panel",
    ],
    typical_home_care: [
      "Monitor water intake",
      "Consistent feeding schedule — same time, same amount",
      "Monitor for signs of hypoglycemia or ketoacidosis",
    ],
  },
  allergic_dermatitis: {
    name: "Atopic Dermatitis / Allergic Skin Disease",
    medical_term: "Canine Atopic Dermatitis (CAD)",
    description: "Allergic skin condition causing chronic itching. Environmental or food-triggered.",
    base_probability: 0.15,
    age_modifier: { puppy: 1.5, adult: 1.0, senior: 0.7 },
    urgency: "low",
    key_differentiators: [
      "Chronic itching — face, feet, ears, armpits, groin",
      "Recurrent ear infections",
      "Seasonal pattern (environmental) or constant (food)",
      "Skin redness and secondary infections",
    ],
    typical_tests: [
      "Skin scraping and cytology",
      "Intradermal allergy testing",
      "Elimination diet trial (8-12 weeks)",
    ],
    typical_home_care: [
      "Medicated baths (chlorhexidine or oatmeal-based) 2x weekly",
      "Omega-3 fatty acid supplementation",
      "Flea prevention — consistent monthly application",
      "Food diary if food allergy suspected",
    ],
  },
  ear_infection_bacterial: {
    name: "Bacterial Ear Infection (Otitis Externa)",
    medical_term: "Otitis Externa — Bacterial",
    description: "Infection of the external ear canal. Common secondary to allergies or moisture.",
    base_probability: 0.2,
    age_modifier: { puppy: 0.8, adult: 1.0, senior: 1.2 },
    urgency: "moderate",
    key_differentiators: [
      "Ear odor — foul or yeasty",
      "Brown/yellow/green discharge",
      "Head shaking and ear scratching",
      "Pain on ear manipulation",
    ],
    typical_tests: [
      "Otoscopic examination",
      "Ear cytology — stain and microscopy",
      "Culture and sensitivity if recurrent",
    ],
    typical_home_care: [
      "Do not clean ears until vet evaluates — may have ruptured eardrum",
      "Prevent water entry — no swimming, careful bathing",
      "Complete full course of prescribed medication",
    ],
  },
  heart_disease: {
    name: "Cardiac Disease",
    medical_term:
      "Degenerative Mitral Valve Disease (DMVD) or Dilated Cardiomyopathy (DCM)",
    description: "Heart disease causing reduced cardiac output. Progressive.",
    base_probability: 0.04,
    age_modifier: { puppy: 0.2, adult: 0.5, senior: 2.5 },
    urgency: "high",
    key_differentiators: [
      "Exercise intolerance — tires quickly",
      "Coughing — especially at night or after exercise",
      "Rapid breathing at rest (>30 breaths/min)",
      "Fainting episodes (syncope)",
    ],
    typical_tests: [
      "Thoracic radiographs — heart size (VHS)",
      "Echocardiogram",
      "ProBNP blood test",
      "ECG/Holter monitoring",
    ],
    typical_home_care: [
      "Monitor resting respiratory rate — count breaths for 15 sec × 4, normal <30/min",
      "Restrict strenuous exercise",
      "Low-sodium diet",
    ],
  },
  kennel_cough: {
    name: "Kennel Cough (Infectious Tracheobronchitis)",
    medical_term: "Canine Infectious Respiratory Disease Complex (CIRDC)",
    description: "Highly contagious respiratory infection. Usually self-limiting.",
    base_probability: 0.15,
    age_modifier: { puppy: 2.0, adult: 1.0, senior: 1.3 },
    urgency: "low",
    key_differentiators: [
      "Honking/goose-like dry cough",
      "Recent boarding, grooming, or dog park exposure",
      "Gagging or retching after coughing",
      "Usually eating/drinking normally",
    ],
    typical_tests: [
      "Usually clinical diagnosis based on history",
      "Respiratory PCR panel if severe or not improving",
      "Thoracic radiographs if pneumonia suspected",
    ],
    typical_home_care: [
      "Isolate from other dogs for 10-14 days",
      "Use harness instead of collar — avoid tracheal pressure",
      "Humidifier in resting area",
      "Honey (1 tsp for medium dog) to soothe throat — NOT for puppies <1yr",
    ],
  },
  wound_infection: {
    name: "Wound Infection",
    medical_term: "Infected Traumatic Wound with Secondary Bacterial Contamination",
    description: "Open wound with bacterial infection causing inflammation, pain, discharge, and potential systemic illness.",
    base_probability: 0.25,
    age_modifier: { puppy: 1.2, adult: 1.0, senior: 1.5 },
    urgency: "high",
    key_differentiators: [
      "Purulent discharge — yellow/green pus",
      "Foul odor from wound site",
      "Surrounding erythema and warmth extending beyond wound margins",
      "Pain disproportionate to wound size",
      "Fever, lethargy, or appetite loss in systemic cases",
    ],
    typical_tests: [
      "Wound culture and sensitivity — aerobic and anaerobic",
      "Cytology of wound exudate — stain for bacteria and inflammatory cells",
      "CBC with differential — look for neutrophilia/left shift",
      "Blood glucose if diabetic or immunocompromised",
    ],
    typical_home_care: [
      "Keep wound clean — gentle saline flush (1 tsp salt per 1 cup warm water) 2-3x daily",
      "Prevent licking — E-collar (cone) mandatory 24/7",
      "Monitor for spreading redness — mark the border with a pen to track progression",
      "Do NOT apply hydrogen peroxide or alcohol — these damage healing tissue",
    ],
  },
  abscess: {
    name: "Subcutaneous Abscess",
    medical_term: "Subcutaneous Abscess with Localized Bacterial Infection",
    description: "Pocket of pus under the skin, often from bite wounds or foreign body penetration.",
    base_probability: 0.15,
    age_modifier: { puppy: 0.8, adult: 1.0, senior: 1.2 },
    urgency: "moderate",
    key_differentiators: [
      "Firm, warm, painful swelling that may rupture and drain",
      "Often preceded by a bite wound or puncture",
      "Foul-smelling purulent drainage if ruptured",
      "May cause fever and regional lymph node enlargement",
    ],
    typical_tests: [
      "Fine needle aspirate of mass — cytology",
      "Culture and sensitivity of aspirated material",
      "Ultrasound if deep abscess suspected",
    ],
    typical_home_care: [
      "Warm compress 10-15 min 3-4x daily to encourage drainage",
      "Keep draining abscess clean with saline flush",
      "E-collar to prevent licking",
      "Complete full antibiotic course as prescribed",
    ],
  },
  hot_spots: {
    name: "Acute Moist Dermatitis (Hot Spot)",
    medical_term: "Acute Moist Dermatitis — Pyotraumatic Dermatitis",
    description: "Rapidly developing area of inflamed, infected skin from self-trauma (licking/scratching).",
    base_probability: 0.2,
    age_modifier: { puppy: 0.8, adult: 1.0, senior: 0.9 },
    urgency: "moderate",
    key_differentiators: [
      "Rapidly developing (hours) moist, red, painful lesion",
      "Often under matted fur — may be larger than visible",
      "Self-trauma driven — dog constantly licking/chewing the area",
      "Common in thick-coated breeds especially in warm/humid weather",
    ],
    typical_tests: [
      "Skin scraping to rule out demodex mites",
      "Impression cytology — bacteria and yeast",
      "Flea comb and skin inspection for underlying cause",
    ],
    typical_home_care: [
      "Clip fur around the lesion — 1 inch margin for air exposure",
      "Clean with dilute chlorhexidine solution 2x daily",
      "E-collar is mandatory — self-trauma is the #1 reason they worsen",
      "Keep area dry — no swimming, careful bathing",
    ],
  },
  laceration: {
    name: "Traumatic Laceration",
    medical_term: "Traumatic Laceration with Possible Subcutaneous Tissue Involvement",
    description: "Cut or tear in the skin from trauma. Depth determines whether sutures or surgery are needed.",
    base_probability: 0.2,
    age_modifier: { puppy: 1.3, adult: 1.0, senior: 0.8 },
    urgency: "high",
    key_differentiators: [
      "Visible break in skin continuity",
      "Bleeding (active or recent)",
      "Visible subcutaneous fat or deeper tissues if full-thickness",
      "Clean edges (sharp object) vs ragged edges (bite/tear)",
    ],
    typical_tests: [
      "Wound exploration under sedation to assess depth",
      "Radiographs if penetrating wound or foreign body suspected",
      "Culture if wound is contaminated or old (>6 hours)",
    ],
    typical_home_care: [
      "Apply direct pressure with clean cloth for active bleeding — hold 5+ minutes",
      "Cover loosely with clean bandage — do NOT apply tight tourniquets",
      "Wounds >1cm deep, >2cm long, or on joints need veterinary closure",
      "Do NOT attempt to close or glue wounds at home",
    ],
  },
  skin_mass: {
    name: "Skin Mass / Tumor",
    medical_term: "Cutaneous or Subcutaneous Neoplasia — Type Pending Histopathology",
    description: "Lump or mass on/under the skin. Can be benign (lipoma) or malignant (mast cell tumor, soft tissue sarcoma).",
    base_probability: 0.08,
    age_modifier: { puppy: 0.2, adult: 0.6, senior: 2.5 },
    urgency: "moderate",
    key_differentiators: [
      "New lump/bump that persists >2 weeks",
      "Rapid growth, irregular borders, or color change",
      "Fixed to underlying tissue (concerning) vs freely movable (often benign)",
      "Ulceration or bleeding from mass surface",
    ],
    typical_tests: [
      "Fine needle aspirate with cytology — first-line for ALL skin masses",
      "Incisional or excisional biopsy with histopathology",
      "Staging: thoracic radiographs, abdominal ultrasound, regional lymph node aspirate",
    ],
    typical_home_care: [
      "Measure and photograph the mass weekly to track growth",
      "ANY new mass should be aspirated by a vet — do not wait and watch",
      "Prevent licking/scratching if ulcerated",
    ],
  },
  autoimmune_skin: {
    name: "Autoimmune Skin Disease",
    medical_term: "Pemphigus Foliaceus or Discoid Lupus Erythematosus",
    description: "Immune system attacks the skin causing crusting, ulceration, and depigmentation.",
    base_probability: 0.02,
    age_modifier: { puppy: 0.3, adult: 1.0, senior: 1.3 },
    urgency: "moderate",
    key_differentiators: [
      "Crusting and ulceration on nose, ear tips, footpads",
      "Symmetrical distribution",
      "Depigmentation of nasal planum",
      "Not responsive to antibiotics alone",
    ],
    typical_tests: [
      "Skin biopsy — punch biopsy from lesion margin",
      "Direct immunofluorescence",
      "ANA titer",
      "CBC and chemistry panel",
    ],
    typical_home_care: [
      "Avoid sun exposure — UV worsens many autoimmune skin conditions",
      "Gentle cleaning of crusted areas with saline",
      "Do not attempt to pick or remove crusts forcefully",
    ],
  },
  ...SUPPLEMENTAL_DISEASES,
};

// --- BREED RISK MULTIPLIERS ---

export const BREED_MODIFIERS: Record<string, BreedModifiers> = {
  "Golden Retriever": {
    hip_dysplasia: 2.2,
    ccl_rupture: 1.6,
    ibd: 2.8,
    foreign_body: 3.0,
    allergic_dermatitis: 2.0,
    hypothyroidism: 2.5,
    bone_cancer: 2.0,
    ear_infection_bacterial: 2.0,
    heart_disease: 1.5,
    hot_spots: 3.0,
    skin_mass: 1.8,
  },
  "Labrador Retriever": {
    hip_dysplasia: 2.0,
    ccl_rupture: 1.8,
    osteoarthritis: 1.8,
    foreign_body: 3.5,
    allergic_dermatitis: 1.8,
    ear_infection_bacterial: 2.2,
    obesity_related: 2.5,
    hot_spots: 2.8,
    skin_mass: 1.5,
  },
  "German Shepherd": {
    hip_dysplasia: 2.5,
    lumbosacral_disease: 2.8,
    ibd: 2.0,
    impa: 1.5,
    pancreatitis: 1.8,
    degenerative_myelopathy: 3.0,
    perianal_fistula: 4.0,
    wound_infection: 1.3,
    autoimmune_skin: 2.0,
  },
  Bulldog: {
    difficulty_breathing: 4.0,
    allergic_dermatitis: 3.0,
    hip_dysplasia: 2.8,
    patellar_luxation: 2.0,
    ear_infection_bacterial: 2.5,
    cherry_eye: 3.0,
    heat_stroke: 3.5,
    hot_spots: 2.5,
    wound_infection: 1.5,
    autoimmune_skin: 1.8,
  },
  "French Bulldog": {
    difficulty_breathing: 4.5,
    ivdd: 3.0,
    allergic_dermatitis: 3.0,
    ear_infection_bacterial: 2.0,
    heat_stroke: 4.0,
    hot_spots: 2.0,
    wound_infection: 1.8,
    autoimmune_skin: 1.5,
  },
  Pug: {
    difficulty_breathing: 4.2,
    heat_stroke: 3.8,
    eye_disorders: 2.0,
    allergic_dermatitis: 1.8,
  },
  Dachshund: {
    ivdd: 12.0,
    patellar_luxation: 1.5,
    diabetes: 2.0,
    cushings_disease: 2.0,
    obesity_related: 2.0,
  },
  "Miniature Schnauzer": {
    pancreatitis: 3.5,
    diabetes: 2.2,
  },
  Poodle: {
    allergic_dermatitis: 2.0,
    ear_infection_bacterial: 2.5,
    addisons_disease: 3.0,
    bloat: 1.8,
    diabetes: 1.5,
  },
  Boxer: {
    heart_disease: 3.0,
    bone_cancer: 2.5,
    allergic_dermatitis: 2.0,
    bloat: 2.0,
    mast_cell_tumor: 3.5,
    skin_mass: 3.0,
    hot_spots: 1.5,
  },
  "Great Dane": {
    gdv: 5.0,
    bone_cancer: 3.0,
    heart_disease: 2.5,
    hip_dysplasia: 2.0,
    wobbler_syndrome: 3.0,
  },
  "Irish Wolfhound": {
    gdv: 4.5,
    heart_disease: 2.8,
    bone_cancer: 2.0,
  },
  Rottweiler: {
    ccl_rupture: 2.5,
    bone_cancer: 3.0,
    hip_dysplasia: 2.0,
    heart_disease: 1.8,
    pancreatitis: 1.5,
  },
  "Yorkshire Terrier": {
    patellar_luxation: 3.0,
    collapsing_trachea: 3.5,
    hypoglycemia: 3.0,
    liver_shunt: 3.0,
    dental_disease: 2.5,
  },
  Beagle: {
    ear_infection_bacterial: 2.5,
    ibd: 1.8,
    hypothyroidism: 2.0,
    epilepsy: 2.5,
    obesity_related: 2.0,
  },
  Chihuahua: {
    patellar_luxation: 3.5,
    collapsing_trachea: 2.5,
    heart_disease: 2.0,
    hypoglycemia: 3.0,
    dental_disease: 3.0,
  },
  "Cavalier King Charles Spaniel": {
    heart_disease: 5.0,
    syringomyelia: 4.0,
    ear_infection_bacterial: 2.0,
    allergic_dermatitis: 1.5,
  },
  "Doberman Pinscher": {
    heart_disease: 4.0,
    wobbler_syndrome: 3.0,
    hypothyroidism: 2.5,
    von_willebrands: 3.0,
  },
  "Cocker Spaniel": {
    ear_infection_bacterial: 4.0,
    allergic_dermatitis: 2.5,
    hypothyroidism: 2.0,
    imha: 3.0,
    glaucoma: 2.5,
  },
  "Bernese Mountain Dog": {
    bone_cancer: 4.0,
    hip_dysplasia: 2.0,
    ccl_rupture: 1.5,
    bloat: 2.0,
    histiocytic_sarcoma: 5.0,
  },
  Newfoundland: {
    heart_disease: 3.5,
    hip_dysplasia: 2.2,
    bloat: 2.0,
  },
  "Siberian Husky": {
    hip_dysplasia: 1.5,
    hypothyroidism: 2.0,
    eye_disorders: 2.5,
    zinc_responsive_dermatosis: 3.0,
  },
  "Shih Tzu": {
    eye_disorders: 3.0,
    ear_infection_bacterial: 2.0,
    dental_disease: 2.5,
    kidney_disease: 1.5,
    allergic_dermatitis: 1.8,
  },
  "Pit Bull": {
    allergic_dermatitis: 3.5,
    hot_spots: 2.0,
    wound_infection: 1.5,
    skin_mass: 1.8,
    ccl_rupture: 2.0,
    hip_dysplasia: 1.5,
    autoimmune_skin: 1.5,
  },
  "Australian Shepherd": {
    hip_dysplasia: 1.8,
    epilepsy: 2.0,
    eye_disorders: 2.5,
    allergic_dermatitis: 1.5,
    autoimmune_skin: 1.5,
  },
  "Border Collie": {
    hip_dysplasia: 1.5,
    epilepsy: 2.5,
    eye_disorders: 2.0,
    allergic_dermatitis: 1.3,
  },
  Pomeranian: {
    patellar_luxation: 3.0,
    collapsing_trachea: 2.5,
    dental_disease: 2.5,
    alopecia: 2.0,
    heart_disease: 1.5,
  },
  Maltese: {
    patellar_luxation: 2.5,
    dental_disease: 3.0,
    liver_shunt: 2.5,
    collapsing_trachea: 2.0,
    allergic_dermatitis: 1.5,
  },
  "Shar Pei": {
    allergic_dermatitis: 4.0,
    hot_spots: 3.0,
    wound_infection: 2.5,
    autoimmune_skin: 2.5,
    ear_infection_bacterial: 3.0,
    eye_disorders: 2.5,
  },
  "West Highland White Terrier": {
    allergic_dermatitis: 4.0,
    hot_spots: 2.5,
    autoimmune_skin: 2.0,
    skin_mass: 1.5,
    liver_disease: 2.0,
  },
  "Pembroke Welsh Corgi": {
    ivdd: 4.0,
    obesity_related: 2.2,
    hip_dysplasia: 1.8,
  },
};

// --- FOLLOW-UP QUESTION DEFINITIONS ---

export const FOLLOW_UP_QUESTIONS: Record<string, FollowUpQuestion> = {
  // Limping questions
  which_leg: {
    id: "which_leg",
    question_text: "Which leg is affected? Front or back? Left or right?",
    data_type: "string",
    extraction_hint: "leg affected: front/back, left/right",
    critical: true,
  },
  limping_onset: {
    id: "limping_onset",
    question_text:
      "When did the limping start? Was it sudden or gradual?",
    data_type: "string",
    extraction_hint: "onset: sudden/gradual, timeframe",
    critical: true,
  },
  limping_progression: {
    id: "limping_progression",
    question_text:
      "Is the limping getting better, worse, or staying the same since it started?",
    data_type: "choice",
    choices: ["better", "worse", "same", "unknown"],
    extraction_hint: "progression: better/worse/same",
    critical: true,
  },
  weight_bearing: {
    id: "weight_bearing",
    question_text:
      "Is your dog putting weight on the affected leg, or completely avoiding it?",
    data_type: "choice",
    choices: ["weight_bearing", "partial", "non_weight_bearing", "unknown"],
    extraction_hint: "weight bearing status on affected leg",
    critical: true,
  },
  pain_on_touch: {
    id: "pain_on_touch",
    question_text:
      "Does your dog react (yelp, pull away, growl) when you touch the affected area?",
    data_type: "boolean",
    extraction_hint: "pain response when area is touched",
    critical: false,
  },
  trauma_history: {
    id: "trauma_history",
    question_text:
      "Was there any specific incident? A fall, jump, rough play, or getting hit?",
    data_type: "choice",
    choices: ["yes_trauma", "no_trauma", "unknown"],
    extraction_hint: "trauma incident: yes_trauma, no_trauma, or unknown",
    critical: true,
  },
  worse_after_rest: {
    id: "worse_after_rest",
    question_text:
      "Is the limping worse when your dog first gets up from resting?",
    data_type: "boolean",
    extraction_hint: "stiffness after rest that improves with movement",
    critical: false,
  },
  swelling_present: {
    id: "swelling_present",
    question_text: "Is there any visible swelling around the affected area?",
    data_type: "boolean",
    extraction_hint: "visible swelling or enlargement",
    critical: false,
  },
  warmth_present: {
    id: "warmth_present",
    question_text:
      "Does the area feel warm or hot compared to the same area on the other side?",
    data_type: "boolean",
    extraction_hint: "warmth or heat at the affected site",
    critical: false,
  },
  prior_limping: {
    id: "prior_limping",
    question_text:
      "Has your dog had any previous episodes of limping or stiffness?",
    data_type: "boolean",
    extraction_hint: "history of prior lameness or stiffness episodes",
    critical: false,
  },
  trauma_mechanism: {
    id: "trauma_mechanism",
    question_text:
      "What kind of incident happened? A fall, hit by car, bite, rough play, or something else?",
    data_type: "choice",
    choices: [
      "fall_jump",
      "hit_by_car",
      "bite_attack",
      "rough_play",
      "unknown",
      "other",
    ],
    extraction_hint: "type of traumatic event",
    critical: true,
  },
  trauma_timeframe: {
    id: "trauma_timeframe",
    question_text: "When did the injury happen? Just now, today, or earlier?",
    data_type: "string",
    extraction_hint: "time since trauma or injury occurred",
    critical: true,
  },
  trauma_area: {
    id: "trauma_area",
    question_text:
      "Where is your dog injured? Chest, belly, leg, head, back, or skin?",
    data_type: "string",
    extraction_hint: "body area involved in trauma",
    critical: true,
  },
  active_bleeding_trauma: {
    id: "active_bleeding_trauma",
    question_text:
      "Is there active bleeding that is soaking through towels or not slowing down with pressure?",
    data_type: "boolean",
    extraction_hint: "ongoing significant bleeding after trauma",
    critical: true,
  },
  visible_fracture: {
    id: "visible_fracture",
    question_text:
      "Do you see a bone sticking out or a limb that looks obviously broken or deformed?",
    data_type: "boolean",
    extraction_hint: "obvious fracture or exposed bone",
    critical: true,
  },
  trauma_mobility: {
    id: "trauma_mobility",
    question_text:
      "Can your dog stand and walk, or are they unable to get up?",
    data_type: "choice",
    choices: ["walking", "limping", "inability_to_stand", "unknown"],
    extraction_hint: "mobility after trauma",
    critical: true,
  },

  // Vomiting questions
  vomit_duration: {
    id: "vomit_duration",
    question_text: "How long has the vomiting been going on?",
    data_type: "string",
    extraction_hint: "duration of vomiting in hours or days",
    critical: true,
  },
  vomit_frequency: {
    id: "vomit_frequency",
    question_text: "How many times has your dog vomited?",
    data_type: "string",
    extraction_hint: "number of vomiting episodes",
    critical: true,
  },
  vomit_blood: {
    id: "vomit_blood",
    question_text:
      "Is there any blood in the vomit? It can look red or like coffee grounds.",
    data_type: "boolean",
    extraction_hint: "blood or coffee-ground material in vomit",
    critical: true,
  },
  vomit_content: {
    id: "vomit_content",
    question_text: "What does the vomit look like? Food, bile (yellow), foam, or something else?",
    data_type: "string",
    extraction_hint: "vomit content: food/bile/foam/other",
    critical: false,
  },
  toxin_exposure: {
    id: "toxin_exposure",
    question_text:
      "Could your dog have eaten anything unusual — trash, human food, plants, medications, or chemicals?",
    data_type: "string",
    extraction_hint: "possible toxin or foreign substance exposure",
    critical: true,
  },
  dietary_change: {
    id: "dietary_change",
    question_text: "Any recent food changes, new treats, or table scraps?",
    data_type: "string",
    extraction_hint: "recent diet changes or unusual food",
    critical: false,
  },

  // General questions
  appetite_status: {
    id: "appetite_status",
    question_text: "How is your dog's appetite? Eating normally, less, or not at all?",
    data_type: "choice",
    choices: ["normal", "decreased", "none", "unknown"],
    extraction_hint: "appetite status: normal/decreased/absent",
    critical: false,
  },
  appetite_duration: {
    id: "appetite_duration",
    question_text: "How long has the appetite been reduced?",
    data_type: "string",
    extraction_hint: "duration of appetite loss",
    critical: true,
  },
  water_intake: {
    id: "water_intake",
    question_text: "Is your dog drinking water normally?",
    data_type: "choice",
    choices: ["normal", "more_than_usual", "less_than_usual", "not_drinking", "unknown"],
    extraction_hint: "water intake status",
    critical: true,
  },
  lethargy_duration: {
    id: "lethargy_duration",
    question_text: "How long has your dog been lethargic?",
    data_type: "string",
    extraction_hint: "duration of lethargy",
    critical: true,
  },
  lethargy_severity: {
    id: "lethargy_severity",
    question_text:
      "Is your dog slightly less active, or barely moving at all?",
    data_type: "choice",
    choices: ["mild", "moderate", "severe"],
    extraction_hint: "severity of lethargy: mild/moderate/severe",
    critical: true,
  },

  // Stool questions
  stool_blood: {
    id: "stool_blood",
    question_text:
      "Is there blood in the stool? Is it bright red or dark/tarry?",
    data_type: "string",
    extraction_hint: "blood in stool: red/dark/none",
    critical: true,
  },
  stool_frequency: {
    id: "stool_frequency",
    question_text: "How many bowel movements per day?",
    data_type: "string",
    extraction_hint: "frequency of bowel movements",
    critical: false,
  },
  stool_consistency: {
    id: "stool_consistency",
    question_text: "What's the stool consistency? Formed, soft, watery?",
    data_type: "choice",
    choices: ["formed", "soft", "watery", "mucus", "unknown"],
    extraction_hint: "stool consistency",
    critical: false,
  },
  diarrhea_duration: {
    id: "diarrhea_duration",
    question_text: "How long has the diarrhea been going on?",
    data_type: "string",
    extraction_hint: "duration of diarrhea",
    critical: true,
  },

  // Respiratory questions
  cough_type: {
    id: "cough_type",
    question_text:
      "What does the cough sound like? Dry/honking, wet/productive, or gagging?",
    data_type: "choice",
    choices: ["dry_honking", "wet_productive", "gagging"],
    extraction_hint: "cough type",
    critical: true,
  },
  cough_duration: {
    id: "cough_duration",
    question_text: "How long has the coughing been going on?",
    data_type: "string",
    extraction_hint: "duration of cough",
    critical: true,
  },
  cough_timing: {
    id: "cough_timing",
    question_text: "When does the coughing happen? At rest, after exercise, at night?",
    data_type: "string",
    extraction_hint: "timing pattern of cough",
    critical: false,
  },
  breathing_rate: {
    id: "breathing_rate",
    question_text:
      "Can you count your dog's breaths for 15 seconds while resting? Multiply by 4. Normal is 15-30 per minute.",
    data_type: "number",
    extraction_hint: "respiratory rate at rest",
    critical: false,
  },
  exercise_intolerance: {
    id: "exercise_intolerance",
    question_text:
      "Does your dog tire more easily than usual during walks or play?",
    data_type: "boolean",
    extraction_hint: "exercise intolerance or tiring easily",
    critical: false,
  },
  breathing_onset: {
    id: "breathing_onset",
    question_text: "Did the breathing difficulty start suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of breathing difficulty",
    critical: true,
  },
  gum_color: {
    id: "gum_color",
    question_text:
      "What color are your dog's gums? Pink is normal. Blue, white, or bright red is concerning.",
    data_type: "choice",
    choices: ["pink_normal", "pale_white", "blue", "bright_red", "yellow"],
    extraction_hint: "gum/mucous membrane color",
    critical: true,
  },

  // Skin questions
  scratch_location: {
    id: "scratch_location",
    question_text:
      "Where is the scratching focused? Face, ears, paws, belly, all over?",
    data_type: "string",
    extraction_hint: "location of scratching/itching",
    critical: true,
  },
  scratch_duration: {
    id: "scratch_duration",
    question_text: "How long has the scratching been going on?",
    data_type: "string",
    extraction_hint: "duration of scratching",
    critical: true,
  },
  skin_changes: {
    id: "skin_changes",
    question_text:
      "Are there any visible skin changes? Redness, bumps, scabs, hair loss, or hot spots?",
    data_type: "string",
    extraction_hint: "visible skin changes",
    critical: false,
  },
  flea_prevention: {
    id: "flea_prevention",
    question_text: "Is your dog on monthly flea prevention?",
    data_type: "boolean",
    extraction_hint: "flea prevention status",
    critical: false,
  },
  seasonal_pattern: {
    id: "seasonal_pattern",
    question_text: "Does the itching seem seasonal or year-round?",
    data_type: "choice",
    choices: ["seasonal", "year_round", "unknown"],
    extraction_hint: "seasonal vs year-round pattern",
    critical: false,
  },

  // Drinking questions
  water_amount_change: {
    id: "water_amount_change",
    question_text: "Roughly how much more water is your dog drinking? Double? Triple?",
    data_type: "string",
    extraction_hint: "estimated increase in water consumption",
    critical: true,
  },
  urination_frequency: {
    id: "urination_frequency",
    question_text: "Is your dog urinating more often than usual?",
    data_type: "boolean",
    extraction_hint: "increased urination frequency",
    critical: true,
  },
  urination_accidents: {
    id: "urination_accidents",
    question_text: "Any urinary accidents in the house (previously housetrained)?",
    data_type: "boolean",
    extraction_hint: "urinary accidents or incontinence",
    critical: false,
  },
  weight_change: {
    id: "weight_change",
    question_text: "Has your dog gained or lost weight recently?",
    data_type: "string",
    extraction_hint: "recent weight change",
    critical: false,
  },
  spay_status: {
    id: "spay_status",
    question_text: "Is your dog spayed/neutered?",
    data_type: "boolean",
    extraction_hint: "spay/neuter status",
    critical: true,
  },

  // Ear questions
  ear_odor: {
    id: "ear_odor",
    question_text: "Is there a smell coming from the ears? Sweet, foul, or yeasty?",
    data_type: "string",
    extraction_hint: "ear odor type",
    critical: false,
  },
  ear_discharge: {
    id: "ear_discharge",
    question_text: "Is there any discharge from the ears? What color?",
    data_type: "string",
    extraction_hint: "ear discharge presence and color",
    critical: true,
  },
  head_shaking: {
    id: "head_shaking",
    question_text: "Is your dog shaking their head frequently?",
    data_type: "boolean",
    extraction_hint: "head shaking behavior",
    critical: false,
  },
  head_tilt: {
    id: "head_tilt",
    question_text: "Is there a head tilt — where the head stays tilted to one side?",
    data_type: "boolean",
    extraction_hint: "persistent head tilt",
    critical: true,
  },
  balance_issues: {
    id: "balance_issues",
    question_text: "Any loss of balance, stumbling, or walking in circles?",
    data_type: "boolean",
    extraction_hint: "vestibular signs: imbalance, circling",
    critical: true,
  },

  // General systemic
  weight_loss: {
    id: "weight_loss",
    question_text: "Have you noticed any weight loss recently?",
    data_type: "boolean",
    extraction_hint: "whether the pet has lost weight",
    critical: false,
  },
  weight_loss_duration: {
    id: "weight_loss_duration",
    question_text: "Over what time period has the weight loss occurred?",
    data_type: "string",
    extraction_hint: "timeframe of weight loss",
    critical: true,
  },
  weight_loss_amount: {
    id: "weight_loss_amount",
    question_text: "Roughly how much weight has been lost?",
    data_type: "string",
    extraction_hint: "estimated weight loss amount",
    critical: false,
  },
  appetite_change: {
    id: "appetite_change",
    question_text: "Has appetite increased, decreased, or stayed normal with the weight loss?",
    data_type: "choice",
    choices: ["increased", "decreased", "normal", "unknown"],
    extraction_hint: "appetite change with weight loss",
    critical: true,
  },
  nasal_discharge: {
    id: "nasal_discharge",
    question_text: "Is there any nasal discharge? Clear, colored, or bloody?",
    data_type: "string",
    extraction_hint: "nasal discharge type",
    critical: false,
  },
  trembling_duration: {
    id: "trembling_duration",
    question_text: "How long has the trembling been going on?",
    data_type: "string",
    extraction_hint: "duration of trembling",
    critical: true,
  },
  trembling_timing: {
    id: "trembling_timing",
    question_text: "Is the trembling constant or does it come and go?",
    data_type: "choice",
    choices: ["constant", "intermittent", "unknown"],
    extraction_hint: "trembling pattern",
    critical: false,
  },
  consciousness_level: {
    id: "consciousness_level",
    question_text: "Is your dog alert and responsive, or dull/unresponsive?",
    data_type: "choice",
    choices: ["alert", "dull", "unresponsive"],
    extraction_hint: "level of consciousness",
    critical: true,
  },
  temperature_feel: {
    id: "temperature_feel",
    question_text: "Do your dog's ears feel warmer than usual? This can indicate a fever.",
    data_type: "boolean",
    extraction_hint: "subjective fever assessment",
    critical: false,
  },
  abdomen_onset: {
    id: "abdomen_onset",
    question_text: "When did you first notice the abdominal swelling?",
    data_type: "string",
    extraction_hint: "onset of abdominal distension",
    critical: true,
  },
  abdomen_pain: {
    id: "abdomen_pain",
    question_text: "Does your dog seem painful when you touch the belly area?",
    data_type: "boolean",
    extraction_hint: "abdominal pain on palpation",
    critical: true,
  },
  unproductive_retching: {
    id: "unproductive_retching",
    question_text:
      "Is your dog trying to vomit but nothing comes up? This is a potential emergency sign.",
    data_type: "boolean",
    extraction_hint: "unproductive retching — trying to vomit with no output",
    critical: true,
  },
  restlessness: {
    id: "restlessness",
    question_text: "Is your dog restless — pacing, unable to settle, or looking at their belly?",
    data_type: "boolean",
    extraction_hint: "restlessness or inability to get comfortable",
    critical: false,
  },
  treats_accepted: {
    id: "treats_accepted",
    question_text: "Will your dog take treats or favorite foods even if refusing regular meals?",
    data_type: "boolean",
    extraction_hint: "whether dog accepts treats despite reduced appetite",
    critical: false,
  },
  stool_changes: {
    id: "stool_changes",
    question_text: "Any changes in stool — color, consistency, or frequency?",
    data_type: "string",
    extraction_hint: "stool changes",
    critical: false,
  },

  // Eye questions
  discharge_color: {
    id: "discharge_color",
    question_text: "What color is the eye discharge? Clear, white, yellow, or green?",
    data_type: "string",
    extraction_hint: "eye discharge color",
    critical: true,
  },
  discharge_duration: {
    id: "discharge_duration",
    question_text: "How long has the eye discharge been present?",
    data_type: "string",
    extraction_hint: "duration of eye discharge",
    critical: true,
  },
  squinting: {
    id: "squinting",
    question_text: "Is your dog squinting or holding the eye shut?",
    data_type: "boolean",
    extraction_hint: "squinting or blepharospasm",
    critical: true,
  },
  eye_redness: {
    id: "eye_redness",
    question_text: "Is the white part of the eye red or bloodshot?",
    data_type: "boolean",
    extraction_hint: "conjunctival redness",
    critical: false,
  },
  vision_changes: {
    id: "vision_changes",
    question_text: "Have you noticed any changes in vision — bumping into things or hesitating?",
    data_type: "boolean",
    extraction_hint: "signs of vision impairment",
    critical: false,
  },

  // Blood in stool
  blood_color: {
    id: "blood_color",
    question_text: "Is the blood bright red or dark/tarry? Bright red = lower GI, dark = upper GI.",
    data_type: "choice",
    choices: ["bright_red", "dark_tarry", "unknown"],
    extraction_hint: "color of blood in stool",
    critical: true,
  },
  blood_amount: {
    id: "blood_amount",
    question_text: "How much blood? Streaks on surface, mixed in, or mostly blood?",
    data_type: "choice",
    choices: ["streaks", "mixed_in", "mostly_blood", "unknown"],
    extraction_hint: "amount of blood in stool",
    critical: true,
  },
  rat_poison_access: {
    id: "rat_poison_access",
    question_text: "Could your dog have had access to rat poison or rodent bait stations?",
    data_type: "boolean",
    extraction_hint: "rodenticide access",
    critical: true,
  },

  // Abdomen
  ear_swelling: {
    id: "ear_swelling",
    question_text: "Is the ear flap puffy or swollen like a pillow?",
    data_type: "boolean",
    extraction_hint: "aural hematoma - ear flap swelling",
    critical: false,
  },
  position_preference: {
    id: "position_preference",
    question_text:
      "Is your dog preferring a specific position — sitting upright, neck extended, or refusing to lie down?",
    data_type: "string",
    extraction_hint: "positional preference indicating orthopnea",
    critical: false,
  },
  diet_change: {
    id: "diet_change",
    question_text: "Any recent changes to diet or new foods introduced?",
    data_type: "string",
    extraction_hint: "recent dietary changes",
    critical: false,
  },

  // Wound / skin issue questions
  wound_location: {
    id: "wound_location",
    question_text: "Where exactly on the body is the wound or skin issue? Which leg, side, or area?",
    data_type: "string",
    extraction_hint: "body location of wound or skin lesion",
    critical: true,
  },
  wound_size: {
    id: "wound_size",
    question_text: "How big is the affected area? Compare to a coin, golf ball, or your palm.",
    data_type: "string",
    extraction_hint: "approximate size of wound or lesion",
    critical: true,
  },
  wound_duration: {
    id: "wound_duration",
    question_text: "How long has this wound or skin issue been present? Is it getting bigger or staying the same?",
    data_type: "string",
    extraction_hint: "duration and progression of the wound",
    critical: true,
  },
  wound_color: {
    id: "wound_color",
    question_text: "What color is the wound or surrounding skin? Red, pink, dark, yellowish, or any unusual color?",
    data_type: "string",
    extraction_hint: "color of wound or affected skin area",
    critical: false,
  },
  wound_discharge: {
    id: "wound_discharge",
    question_text: "Is there any discharge from the wound — pus, clear fluid, or blood?",
    data_type: "choice",
    choices: ["none", "clear_fluid", "pus", "blood", "mixed", "unknown"],
    extraction_hint: "type of wound discharge",
    critical: true,
  },
  wound_odor: {
    id: "wound_odor",
    question_text: "Does the wound have any smell? A bad odor can indicate infection.",
    data_type: "boolean",
    extraction_hint: "presence of wound odor suggesting infection",
    critical: false,
  },
  wound_licking: {
    id: "wound_licking",
    question_text: "Is your pet constantly licking, biting, or scratching at the area?",
    data_type: "boolean",
    extraction_hint: "self-trauma behavior - licking or chewing at wound",
    critical: true,
  },

  // --- VET-902: New questions for expanded complaint families ---

  // Seizure/collapse questions
  seizure_duration: {
    id: "seizure_duration",
    question_text: "How long did the seizure or collapse episode last?",
    data_type: "string",
    extraction_hint: "duration of seizure or collapse in seconds or minutes",
    critical: true,
  },
  prior_seizures: {
    id: "prior_seizures",
    question_text: "Has your dog ever had a seizure or collapse episode before?",
    data_type: "boolean",
    extraction_hint: "history of prior seizure or collapse events",
    critical: true,
  },
  trembling_present: {
    id: "trembling_present",
    question_text: "Is your dog trembling or shaking now?",
    data_type: "boolean",
    extraction_hint: "current trembling or shaking behavior",
    critical: false,
  },
  breathing_status: {
    id: "breathing_status",
    question_text: "How is your dog breathing right now? Normal, fast, labored, or noisy?",
    data_type: "choice",
    choices: ["normal", "fast", "labored", "noisy"],
    extraction_hint: "current breathing status",
    critical: true,
  },

  // Urination questions
  straining_present: {
    id: "straining_present",
    question_text: "Is your dog straining to urinate — trying but producing little or nothing?",
    data_type: "boolean",
    extraction_hint: "straining or difficulty during urination",
    critical: true,
  },
  blood_in_urine: {
    id: "blood_in_urine",
    question_text: "Is there any blood in the urine? Pink, red, or brown color?",
    data_type: "boolean",
    extraction_hint: "visible blood in urine",
    critical: true,
  },

  // Behavior questions
  behavior_change_duration: {
    id: "behavior_change_duration",
    question_text: "How long have you noticed the behavior change?",
    data_type: "string",
    extraction_hint: "duration of behavior change",
    critical: true,
  },
  behavior_change_type: {
    id: "behavior_change_type",
    question_text: "What type of behavior change — aggression, confusion, hiding, clinginess, wandering?",
    data_type: "string",
    extraction_hint: "specific type of behavior change",
    critical: true,
  },
  sleep_pattern: {
    id: "sleep_pattern",
    question_text: "Has your dog's sleep pattern changed — sleeping more, restlessness at night, confused waking?",
    data_type: "string",
    extraction_hint: "changes in sleep or rest pattern",
    critical: false,
  },
  recent_events: {
    id: "recent_events",
    question_text: "Any recent changes in environment, routine, medication, or family?",
    data_type: "string",
    extraction_hint: "recent changes in dog's environment or routine",
    critical: false,
  },

  // Lump questions
  lump_location: {
    id: "lump_location",
    question_text: "Where exactly is the lump? Which body area?",
    data_type: "string",
    extraction_hint: "body location of lump or swelling",
    critical: true,
  },
  lump_size: {
    id: "lump_size",
    question_text: "How big is the lump? Compare it to a pea, grape, golf ball, or larger.",
    data_type: "string",
    extraction_hint: "approximate size of lump or swelling",
    critical: true,
  },
  lump_duration: {
    id: "lump_duration",
    question_text: "How long has the lump been present?",
    data_type: "string",
    extraction_hint: "duration of lump or swelling",
    critical: true,
  },
  lump_growth_rate: {
    id: "lump_growth_rate",
    question_text: "Is the lump growing? How fast — days, weeks, months?",
    data_type: "string",
    extraction_hint: "growth rate of lump",
    critical: true,
  },
  lump_mobility: {
    id: "lump_mobility",
    question_text: "Does the lump move under the skin when you push it, or is it fixed in place?",
    data_type: "choice",
    choices: ["freely_movable", "slightly_mobile", "fixed"],
    extraction_hint: "mobility of lump under skin",
    critical: true,
  },
  other_lumps_present: {
    id: "other_lumps_present",
    question_text: "Have you found any other lumps or bumps elsewhere on your dog?",
    data_type: "boolean",
    extraction_hint: "presence of additional lumps",
    critical: false,
  },

  // Dental questions
  breath_odor_severity: {
    id: "breath_odor_severity",
    question_text: "How bad is your dog's breath? Mild, noticeably bad, or very foul?",
    data_type: "choice",
    choices: ["mild", "noticeable", "very_foul"],
    extraction_hint: "severity of breath odor",
    critical: false,
  },
  drooling_present: {
    id: "drooling_present",
    question_text: "Is your dog drooling more than usual?",
    data_type: "boolean",
    extraction_hint: "excessive drooling",
    critical: true,
  },
  chewing_difficulty: {
    id: "chewing_difficulty",
    question_text: "Is your dog having trouble chewing — dropping food, chewing on one side, or refusing to chew?",
    data_type: "boolean",
    extraction_hint: "difficulty or reluctance to chew",
    critical: true,
  },
  gum_appearance: {
    id: "gum_appearance",
    question_text: "What do your dog's gums look like? Pink, red, swollen, bleeding, or receding?",
    data_type: "string",
    extraction_hint: "appearance of gums",
    critical: true,
  },
  tooth_mobility: {
    id: "tooth_mobility",
    question_text: "Are any teeth loose or missing?",
    data_type: "boolean",
    extraction_hint: "loose or missing teeth",
    critical: false,
  },

  // Hair loss questions
  hair_loss_pattern: {
    id: "hair_loss_pattern",
    question_text: "Where is the hair loss? Symmetrical (both sides) or patchy?",
    data_type: "string",
    extraction_hint: "pattern and location of hair loss",
    critical: true,
  },
  skin_appearance: {
    id: "skin_appearance",
    question_text: "What does the skin look like where the hair is lost? Normal, red, flaky, thickened?",
    data_type: "string",
    extraction_hint: "appearance of skin in hair loss areas",
    critical: true,
  },
  itching_present: {
    id: "itching_present",
    question_text: "Is your dog itchy or scratching, licking, or chewing at the area?",
    data_type: "boolean",
    extraction_hint: "whether itching, scratching, licking, or chewing is present",
    critical: false,
  },
  hair_loss_duration: {
    id: "hair_loss_duration",
    question_text: "How long has the hair loss been going on?",
    data_type: "string",
    extraction_hint: "duration of hair loss",
    critical: true,
  },
  diet_quality: {
    id: "diet_quality",
    question_text: "What type of food does your dog eat? Brand name, homemade, or mixed?",
    data_type: "string",
    extraction_hint: "type and quality of dog's diet",
    critical: false,
  },

  // Regurgitation questions
  regurgitation_timing: {
    id: "regurgitation_timing",
    question_text: "How soon after eating does the regurgitation happen? Immediately, within minutes, or hours later?",
    data_type: "string",
    extraction_hint: "timing of regurgitation relative to eating",
    critical: true,
  },
  food_appearance: {
    id: "food_appearance",
    question_text: "What does the regurgitated material look like? Undigested food, tubular shape, or liquid?",
    data_type: "string",
    extraction_hint: "appearance of regurgitated material",
    critical: true,
  },
  coughing_present: {
    id: "coughing_present",
    question_text: "Is your dog also coughing?",
    data_type: "boolean",
    extraction_hint: "presence of coughing",
    critical: false,
  },

  // Constipation questions
  last_normal_stool: {
    id: "last_normal_stool",
    question_text: "When was the last time your dog had a normal bowel movement?",
    data_type: "string",
    extraction_hint: "time since last normal bowel movement",
    critical: true,
  },
  straining_duration: {
    id: "straining_duration",
    question_text: "How long has your dog been straining?",
    data_type: "string",
    extraction_hint: "duration of straining to defecate or urinate",
    critical: true,
  },
  stool_consistency_when_produced: {
    id: "stool_consistency_when_produced",
    question_text: "When your dog does manage to poop, what is the stool like? Hard pellets, soft, or normal?",
    data_type: "choice",
    choices: ["hard_pellets", "soft", "normal", "nothing_produced"],
    extraction_hint: "consistency of stool when produced during constipation",
    critical: true,
  },

  // Stiffness questions
  stiffness_onset: {
    id: "stiffness_onset",
    question_text: "When did the stiffness start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset pattern of stiffness",
    critical: true,
  },
  affected_areas: {
    id: "affected_areas",
    question_text: "Which areas seem stiff or sore? Legs, back, neck, or all over?",
    data_type: "string",
    extraction_hint: "body areas affected by stiffness",
    critical: true,
  },
  fever_present: {
    id: "fever_present",
    question_text: "Does your dog feel warm? Have you checked temperature?",
    data_type: "boolean",
    extraction_hint: "presence of fever or elevated temperature",
    critical: true,
  },
  worse_after_rest_or_exercise: {
    id: "worse_after_rest_or_exercise",
    question_text: "Is the stiffness worse after resting, after exercise, or constant?",
    data_type: "choice",
    choices: ["after_rest", "after_exercise", "constant"],
    extraction_hint: "when stiffness is worse",
    critical: true,
  },

  // Nasal questions
  discharge_side: {
    id: "discharge_side",
    question_text: "Is the nasal discharge from one nostril or both?",
    data_type: "choice",
    choices: ["one_side", "both_sides"],
    extraction_hint: "whether nasal discharge is unilateral or bilateral",
    critical: true,
  },
  sneezing_frequency: {
    id: "sneezing_frequency",
    question_text: "How often is your dog sneezing? Occasional, frequent, or constant?",
    data_type: "choice",
    choices: ["occasional", "frequent", "constant"],
    extraction_hint: "frequency of sneezing",
    critical: false,
  },
  blood_present: {
    id: "blood_present",
    question_text: "Is there any blood in the discharge?",
    data_type: "boolean",
    extraction_hint: "presence of blood in discharge",
    critical: true,
  },
  nasal_discharge_duration: {
    id: "nasal_discharge_duration",
    question_text: "How long has the nasal discharge been present?",
    data_type: "string",
    extraction_hint: "duration of nasal discharge",
    critical: true,
  },

  // Reproductive questions
  vaginal_discharge_color: {
    id: "vaginal_discharge_color",
    question_text: "What color is the discharge? Clear, bloody, yellow/green, or dark?",
    data_type: "choice",
    choices: ["clear", "bloody", "yellow_green", "dark"],
    extraction_hint: "color of vaginal or other discharge",
    critical: true,
  },
  discharge_odor: {
    id: "discharge_odor",
    question_text: "Does the discharge have a smell? Normal, foul, or very bad?",
    data_type: "choice",
    choices: ["none", "foul", "very_bad"],
    extraction_hint: "odor of discharge",
    critical: false,
  },
  heat_cycle_timing: {
    id: "heat_cycle_timing",
    question_text: "When was your dog's last heat cycle? Is she currently in heat?",
    data_type: "string",
    extraction_hint: "timing of last heat cycle",
    critical: true,
  },

  // Testicular/prostate questions
  neuter_status: {
    id: "neuter_status",
    question_text: "Is your dog neutered?",
    data_type: "boolean",
    extraction_hint: "neuter status",
    critical: true,
  },
  swelling_location: {
    id: "swelling_location",
    question_text: "Where is the swelling — testicle, scrotum, around the anus, or another area?",
    data_type: "string",
    extraction_hint: "location of reproductive or prostate-region swelling",
    critical: true,
  },
  urination_changes: {
    id: "urination_changes",
    question_text: "Any changes in urination — frequency, difficulty, or accidents?",
    data_type: "boolean",
    extraction_hint: "changes in urination pattern",
    critical: true,
  },
  prostate_stool_changes: {
    id: "prostate_stool_changes",
    question_text: "Any changes in stool — ribbon-like, difficulty passing, or constipation?",
    data_type: "boolean",
    extraction_hint: "changes in stool appearance or passing",
    critical: false,
  },
  testicular_prostate_duration: {
    id: "testicular_prostate_duration",
    question_text: "How long have you noticed the swelling or changes?",
    data_type: "string",
    extraction_hint: "duration of testicular or prostate changes",
    critical: true,
  },

  // Exercise-induced lameness questions
  exercise_type: {
    id: "exercise_type",
    question_text: "What type of exercise triggers the lameness? Walking, running, playing, or all activity?",
    data_type: "string",
    extraction_hint: "type of exercise that triggers lameness",
    critical: true,
  },
  onset_during_exercise: {
    id: "onset_during_exercise",
    question_text: "Does the lameness start during exercise or after?",
    data_type: "choice",
    choices: ["during", "after"],
    extraction_hint: "when lameness starts relative to exercise",
    critical: true,
  },
  recovery_time: {
    id: "recovery_time",
    question_text: "How long does it take your dog to recover after the lameness starts?",
    data_type: "string",
    extraction_hint: "recovery time after exercise-induced lameness",
    critical: true,
  },
  breathing_after_exercise: {
    id: "breathing_after_exercise",
    question_text: "How is your dog's breathing after exercise? Normal, fast, or labored?",
    data_type: "choice",
    choices: ["normal", "fast", "labored"],
    extraction_hint: "breathing status after exercise",
    critical: false,
  },
  prior_episodes: {
    id: "prior_episodes",
    question_text: "Has this happened before?",
    data_type: "boolean",
    extraction_hint: "history of prior similar episodes",
    critical: true,
  },

  // Skin odor questions
  odor_location: {
    id: "odor_location",
    question_text: "Where is the odor worst? All over, specific area, ears, paws, or skin folds?",
    data_type: "string",
    extraction_hint: "location of worst skin odor",
    critical: true,
  },
  bath_frequency: {
    id: "bath_frequency",
    question_text: "How often do you bathe your dog?",
    data_type: "string",
    extraction_hint: "frequency of bathing",
    critical: false,
  },
  ear_involvement: {
    id: "ear_involvement",
    question_text: "Are the ears also affected — smelly, red, or discharging?",
    data_type: "boolean",
    extraction_hint: "whether ears are also involved in skin issue",
    critical: false,
  },

  // Recurrent ear/skin questions
  infection_frequency: {
    id: "infection_frequency",
    question_text: "How often does your dog get these infections? Monthly, every few months, or rarely?",
    data_type: "string",
    extraction_hint: "frequency of recurrent infections",
    critical: true,
  },
  last_treatment: {
    id: "last_treatment",
    question_text: "What was the last treatment your dog received for this? How long ago?",
    data_type: "string",
    extraction_hint: "most recent treatment and timing",
    critical: true,
  },
  underlying_allergy_diagnosis: {
    id: "underlying_allergy_diagnosis",
    question_text: "Has your dog been diagnosed with allergies?",
    data_type: "boolean",
    extraction_hint: "whether dog has diagnosed allergies",
    critical: false,
  },
  food_trial_done: {
    id: "food_trial_done",
    question_text: "Has your dog ever done a hypoallergenic food trial?",
    data_type: "boolean",
    extraction_hint: "whether hypoallergenic food trial has been attempted",
    critical: false,
  },
  ear_cleaning_routine: {
    id: "ear_cleaning_routine",
    question_text: "Do you clean your dog's ears regularly? How often and with what product?",
    data_type: "string",
    extraction_hint: "ear cleaning routine",
    critical: false,
  },
  skin_infection_frequency: {
    id: "skin_infection_frequency",
    question_text: "How often does your dog get skin infections?",
    data_type: "string",
    extraction_hint: "frequency of skin infections",
    critical: true,
  },
  antibiotic_history: {
    id: "antibiotic_history",
    question_text: "What antibiotics has your dog been on for skin issues? How effective were they?",
    data_type: "string",
    extraction_hint: "history of antibiotic treatments for skin",
    critical: true,
  },
  allergy_testing_done: {
    id: "allergy_testing_done",
    question_text: "Has your dog had allergy testing?",
    data_type: "boolean",
    extraction_hint: "whether allergy testing has been performed",
    critical: false,
  },
  immune_status: {
    id: "immune_status",
    question_text: "Does your dog have any known immune system issues or take immune-suppressing medications?",
    data_type: "boolean",
    extraction_hint: "known immune system problems or immunosuppressive medications",
    critical: false,
  },

  // Inappropriate urination questions
  behavioral_changes: {
    id: "behavioral_changes",
    question_text: "Any other behavior changes — aggression, confusion, anxiety, or clinginess?",
    data_type: "boolean",
    extraction_hint: "presence of other behavior changes",
    critical: false,
  },

  // Fecal incontinence questions
  fecal_incontinence_onset: {
    id: "fecal_incontinence_onset",
    question_text: "When did the fecal incontinence start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of fecal incontinence",
    critical: true,
  },
  hind_limb_function: {
    id: "hind_limb_function",
    question_text: "Is your dog's hind limb strength normal? Any weakness, dragging, or wobbling?",
    data_type: "boolean",
    extraction_hint: "hind limb weakness or dysfunction",
    critical: true,
  },
  tail_movement: {
    id: "tail_movement",
    question_text: "Can your dog move their tail normally? Lift it, wag it?",
    data_type: "boolean",
    extraction_hint: "tail mobility",
    critical: false,
  },
  back_pain: {
    id: "back_pain",
    question_text: "Does your dog seem painful in the back — crying when picked up or reluctant to jump?",
    data_type: "boolean",
    extraction_hint: "back pain",
    critical: true,
  },
  perineal_reflex: {
    id: "perineal_reflex",
    question_text: "Does your dog's anus squeeze when you gently touch the area? (This is a neurologic reflex.)",
    data_type: "boolean",
    extraction_hint: "presence of perineal reflex (veterinary assessment)",
    critical: false,
  },

  // Combined vomiting/diarrhea questions
  combined_vomiting_duration: {
    id: "combined_vomiting_duration",
    question_text: "How long has the vomiting been going on?",
    data_type: "string",
    extraction_hint: "duration of vomiting in combined GI presentation",
    critical: true,
  },
  combined_diarrhea_duration: {
    id: "combined_diarrhea_duration",
    question_text: "How long has the diarrhea been going on?",
    data_type: "string",
    extraction_hint: "duration of diarrhea in combined GI presentation",
    critical: true,
  },
  blood_in_either: {
    id: "blood_in_either",
    question_text: "Have you seen blood in the vomit or diarrhea?",
    data_type: "boolean",
    extraction_hint: "blood present in either vomit or diarrhea",
    critical: true,
  },

  // Coughing + breathing combined questions
  coughing_breathing_onset: {
    id: "coughing_breathing_onset",
    question_text: "When did the coughing and breathing difficulty start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of combined coughing and breathing difficulty",
    critical: true,
  },

  // Oral mass questions
  oral_mass_location: {
    id: "oral_mass_location",
    question_text: "Where in the mouth is the mass? Gums, tongue, palate, or throat?",
    data_type: "string",
    extraction_hint: "location of oral mass",
    critical: true,
  },
  oral_mass_size: {
    id: "oral_mass_size",
    question_text: "How big is the mass? Compare to a pea, marble, or larger.",
    data_type: "string",
    extraction_hint: "size of oral mass",
    critical: true,
  },
  bleeding_present: {
    id: "bleeding_present",
    question_text: "Is the area bleeding or has there been blood from the mouth?",
    data_type: "boolean",
    extraction_hint: "bleeding associated with the oral mass or affected area",
    critical: true,
  },
  eating_difficulty: {
    id: "eating_difficulty",
    question_text: "Is your dog having difficulty eating — dropping food, chewing on one side, or refusing?",
    data_type: "boolean",
    extraction_hint: "difficulty eating due to oral mass",
    critical: true,
  },
  oral_mass_duration: {
    id: "oral_mass_duration",
    question_text: "How long have you noticed the mass?",
    data_type: "string",
    extraction_hint: "duration of oral mass",
    critical: true,
  },

  // Vision questions
  vision_loss_onset: {
    id: "vision_loss_onset",
    question_text: "Did the vision loss happen suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of vision loss",
    critical: true,
  },
  one_or_both_eyes: {
    id: "one_or_both_eyes",
    question_text: "Is the vision loss in one eye or both?",
    data_type: "choice",
    choices: ["one", "both"],
    extraction_hint: "whether vision loss is unilateral or bilateral",
    critical: true,
  },
  pain_present: {
    id: "pain_present",
    question_text: "Does the eye or affected area seem painful — squinting, pawing, yelping, or avoiding touch?",
    data_type: "boolean",
    extraction_hint: "pain signs such as squinting, pawing, yelping, or avoiding touch",
    critical: true,
  },
  pupil_appearance: {
    id: "pupil_appearance",
    question_text: "Do the pupils look normal? Are they dilated, unequal, or not reacting to light?",
    data_type: "string",
    extraction_hint: "appearance of pupils",
    critical: true,
  },
  other_neurologic_signs: {
    id: "other_neurologic_signs",
    question_text: "Any other neurologic signs — head tilt, circling, weakness, or seizures?",
    data_type: "boolean",
    extraction_hint: "presence of other neurologic signs",
    critical: true,
  },
  vision_loss_duration: {
    id: "vision_loss_duration",
    question_text: "How long have you noticed the vision changes?",
    data_type: "string",
    extraction_hint: "duration of vision loss",
    critical: true,
  },

  // Hearing questions
  hearing_loss_onset: {
    id: "hearing_loss_onset",
    question_text: "Did the hearing loss happen suddenly or gradually?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of hearing loss",
    critical: true,
  },
  ear_infection_history: {
    id: "ear_infection_history",
    question_text: "Has your dog had ear infections before, or any recent ear odor, redness, or discharge?",
    data_type: "boolean",
    extraction_hint: "history of ear infection or current ear odor, redness, or discharge",
    critical: false,
  },
  response_to_loud_sounds: {
    id: "response_to_loud_sounds",
    question_text: "Does your dog respond to loud noises like clapping or door slams?",
    data_type: "boolean",
    extraction_hint: "response to loud sounds",
    critical: true,
  },
  dog_age_years: {
    id: "dog_age_years",
    question_text: "How old is your dog in years?",
    data_type: "number",
    extraction_hint: "age of dog in years",
    critical: true,
  },

  // Aggression questions
  aggression_onset: {
    id: "aggression_onset",
    question_text: "When did the aggressive behavior start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of aggressive behavior",
    critical: true,
  },
  trigger_situations: {
    id: "trigger_situations",
    question_text: "What triggers the aggression? Being touched, eating, guarding, or random?",
    data_type: "string",
    extraction_hint: "situations that trigger aggression",
    critical: true,
  },

  // Pacing questions
  abdomen_appearance: {
    id: "abdomen_appearance",
    question_text: "Does your dog's belly look swollen, tight, or distended?",
    data_type: "boolean",
    extraction_hint: "abdominal distension",
    critical: true,
  },
  retching_present: {
    id: "retching_present",
    question_text: "Is your dog trying to vomit but nothing is coming up?",
    data_type: "boolean",
    extraction_hint: "unproductive retching",
    critical: true,
  },
  pacing_duration: {
    id: "pacing_duration",
    question_text: "How long has your dog been pacing or restless?",
    data_type: "string",
    extraction_hint: "duration of pacing or restlessness",
    critical: true,
  },

  // Abnormal gait questions
  abnormal_gait_onset: {
    id: "abnormal_gait_onset",
    question_text: "When did the abnormal gait start? Sudden or gradual?",
    data_type: "choice",
    choices: ["sudden", "gradual"],
    extraction_hint: "onset of abnormal gait",
    critical: true,
  },
  affected_limbs: {
    id: "affected_limbs",
    question_text: "Which limbs are affected? Front, back, one side, or all four?",
    data_type: "string",
    extraction_hint: "which limbs are affected by abnormal gait",
    critical: true,
  },
  bladder_control: {
    id: "bladder_control",
    question_text: "Has your dog lost bladder control — leaking urine or unable to urinate?",
    data_type: "boolean",
    extraction_hint: "loss of bladder control",
    critical: true,
  },
  abnormal_gait_progression: {
    id: "abnormal_gait_progression",
    question_text: "Is the gait getting better, worse, or staying the same?",
    data_type: "choice",
    choices: ["better", "worse", "same"],
    extraction_hint: "progression of abnormal gait",
    critical: true,
  },

  // Heat intolerance questions
  temperature_exposure: {
    id: "temperature_exposure",
    question_text: "What was the temperature? Was your dog in a hot car, direct sun, or unventilated area?",
    data_type: "string",
    extraction_hint: "temperature and exposure conditions",
    critical: true,
  },
  heat_exposure_duration: {
    id: "heat_exposure_duration",
    question_text: "How long was your dog exposed to the heat?",
    data_type: "string",
    extraction_hint: "duration of heat exposure",
    critical: true,
  },

  // Post-operative questions
  surgery_type: {
    id: "surgery_type",
    question_text: "What type of surgery did your dog have?",
    data_type: "string",
    extraction_hint: "type of surgery performed",
    critical: true,
  },
  days_post_op: {
    id: "days_post_op",
    question_text: "How many days ago was the surgery?",
    data_type: "number",
    extraction_hint: "number of days since surgery",
    critical: true,
  },
  incision_appearance: {
    id: "incision_appearance",
    question_text: "What does the incision look like? Clean, red, swollen, open, or oozing?",
    data_type: "string",
    extraction_hint: "appearance of surgical incision",
    critical: true,
  },
  discharge_present: {
    id: "discharge_present",
    question_text: "Is there any discharge from the incision?",
    data_type: "boolean",
    extraction_hint: "discharge from surgical site",
    critical: true,
  },
  activity_level: {
    id: "activity_level",
    question_text: "How active has your dog been since surgery? Resting, walking normally, or running/playing?",
    data_type: "string",
    extraction_hint: "activity level since surgery",
    critical: false,
  },

  // Medication reaction questions
  medication_name: {
    id: "medication_name",
    question_text: "What medication did your dog receive?",
    data_type: "string",
    extraction_hint: "name of medication",
    critical: true,
  },
  medication_dose: {
    id: "medication_dose",
    question_text: "What dose was given? How many pills or ml?",
    data_type: "string",
    extraction_hint: "dose of medication",
    critical: true,
  },
  medication_timing: {
    id: "medication_timing",
    question_text: "How long ago was the medication given?",
    data_type: "string",
    extraction_hint: "time since medication was given",
    critical: true,
  },
  reaction_symptoms: {
    id: "reaction_symptoms",
    question_text: "What symptoms did your dog develop after the medication?",
    data_type: "string",
    extraction_hint: "symptoms of medication reaction",
    critical: true,
  },
  prior_reactions: {
    id: "prior_reactions",
    question_text: "Has your dog ever had a reaction to medication before?",
    data_type: "boolean",
    extraction_hint: "history of prior medication reactions",
    critical: false,
  },
  current_medications: {
    id: "current_medications",
    question_text: "What other medications or supplements is your dog currently taking?",
    data_type: "string",
    extraction_hint: "list of current medications and supplements",
    critical: false,
  },
  vaccination_timing: {
    id: "vaccination_timing",
    question_text:
      "How long after the vaccine did the symptoms start? Within hours, later the same day, or the next day?",
    data_type: "choice",
    choices: ["within_hours", "same_day", "next_day", "longer_ago", "unknown"],
    extraction_hint: "timing of symptoms relative to vaccination",
    critical: true,
  },
  vaccination_type: {
    id: "vaccination_type",
    question_text:
      "What vaccine or booster did your dog receive, if you know?",
    data_type: "string",
    extraction_hint: "type of recent vaccine or booster",
    critical: false,
  },
  face_swelling: {
    id: "face_swelling",
    question_text:
      "Has your dog's face, muzzle, or eyelids become swollen after the vaccine?",
    data_type: "boolean",
    extraction_hint: "facial swelling after vaccination",
    critical: true,
  },
  hives_with_breathing: {
    id: "hives_with_breathing",
    question_text:
      "Are there hives or a rash together with breathing trouble after the vaccine?",
    data_type: "boolean",
    extraction_hint: "hives or rash with breathing difficulty after vaccination",
    critical: true,
  },

  // Pregnancy/birth questions
  days_pregnant: {
    id: "days_pregnant",
    question_text: "How many days pregnant is your dog? (Normal is 63 days from ovulation.)",
    data_type: "number",
    extraction_hint: "number of days pregnant",
    critical: true,
  },
  contraction_status: {
    id: "contraction_status",
    question_text: "Is your dog having contractions? Visible straining?",
    data_type: "boolean",
    extraction_hint: "presence of contractions",
    critical: true,
  },
  puppies_delivered: {
    id: "puppies_delivered",
    question_text: "How many puppies have been delivered so far?",
    data_type: "number",
    extraction_hint: "number of puppies delivered",
    critical: true,
  },
  time_since_last_puppy: {
    id: "time_since_last_puppy",
    question_text: "How long since the last puppy was delivered?",
    data_type: "string",
    extraction_hint: "time since last puppy delivery",
    critical: true,
  },

  // Puppy questions
  puppy_age_weeks: {
    id: "puppy_age_weeks",
    question_text: "How old is the puppy in weeks?",
    data_type: "number",
    extraction_hint: "age of puppy in weeks",
    critical: true,
  },
  nursing_status: {
    id: "nursing_status",
    question_text: "Is the puppy nursing? When was the last feed?",
    data_type: "string",
    extraction_hint: "nursing status of puppy",
    critical: true,
  },
  puppy_temperature: {
    id: "puppy_temperature",
    question_text: "Does the puppy feel warm or cold to touch?",
    data_type: "choice",
    choices: ["warm", "cool", "cold"],
    extraction_hint: "body temperature of puppy by touch",
    critical: true,
  },
  weight_trend: {
    id: "weight_trend",
    question_text: "Is the puppy gaining, maintaining, or losing weight?",
    data_type: "choice",
    choices: ["gaining", "maintaining", "losing"],
    extraction_hint: "weight trend of puppy",
    critical: true,
  },
  littermate_status: {
    id: "littermate_status",
    question_text: "Are the other puppies in the litter doing okay?",
    data_type: "string",
    extraction_hint: "health status of littermates",
    critical: false,
  },
  vaccination_status: {
    id: "vaccination_status",
    question_text: "Has the puppy started vaccinations? Which ones?",
    data_type: "string",
    extraction_hint: "vaccination status of puppy",
    critical: false,
  },

  // Senior decline questions
  senior_decline_duration: {
    id: "senior_decline_duration",
    question_text: "Over what time period have you noticed the decline? Weeks, months, or years?",
    data_type: "string",
    extraction_hint: "duration of senior decline",
    critical: true,
  },
  specific_changes: {
    id: "specific_changes",
    question_text: "What specific changes have you noticed? Sleeping more, slower, confused, not eating?",
    data_type: "string",
    extraction_hint: "specific changes noticed in senior dog",
    critical: true,
  },
  mobility_level: {
    id: "mobility_level",
    question_text: "How is your dog's mobility? Walking normally, stiff, or struggling to stand?",
    data_type: "choice",
    choices: ["normal", "stiff", "struggling"],
    extraction_hint: "mobility level",
    critical: true,
  },

  // Multi-system decline questions
  each_symptom_duration: {
    id: "each_symptom_duration",
    question_text: "How long has each symptom been going on?",
    data_type: "string",
    extraction_hint: "duration of each symptom",
    critical: true,
  },
  energy_level: {
    id: "energy_level",
    question_text: "How is your dog's energy? Normal, slightly reduced, very low, or barely moving?",
    data_type: "choice",
    choices: ["normal", "slightly_reduced", "very_low", "barely_moving"],
    extraction_hint: "overall energy level",
    critical: true,
  },
  vomiting_present: {
    id: "vomiting_present",
    question_text: "Is your dog vomiting?",
    data_type: "boolean",
    extraction_hint: "presence of vomiting",
    critical: false,
  },

  // Unknown concern questions
  chief_complaint_guess: {
    id: "chief_complaint_guess",
    question_text: "What is your best guess about what's wrong? Even if you're not sure.",
    data_type: "string",
    extraction_hint: "owner's best guess about the problem",
    critical: true,
  },
  last_normal: {
    id: "last_normal",
    question_text: "When was the last time your dog seemed completely normal?",
    data_type: "string",
    extraction_hint: "last time dog seemed normal",
    critical: true,
  },
};
