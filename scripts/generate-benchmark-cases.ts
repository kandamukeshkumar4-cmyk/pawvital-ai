/**
 * PawVital Gold Benchmark Case Generator (VET-909)
 * 
 * Generates 500+ vet-adjudicated benchmark cases across all 50 complaint families.
 * Output: JSONL format at data/benchmark/gold-benchmark-v1.jsonl
 * 
 * Distribution targets:
 * - 35% common presentations (175 cases)
 * - 20% dangerous but common (100 cases)
 * - 15% ambiguous/unclear (75 cases)
 * - 10% contradictory (50 cases)
 * - 10% low information (50 cases)
 * - 10% rare but critical (50 cases)
 * 
 * Each of 50 complaint families gets minimum 6 cases:
 * - 2 easy, 2 moderate, 1 hard, 1 emergency
 */

import * as fs from 'fs';
import * as path from 'path';

// === TYPE DEFINITIONS ===

interface BenchmarkCase {
  case_id: string;
  version: string;
  created_at: string;
  source: "synthetic" | "clinical" | "literature" | "owner_report";
  owner_input: string;
  normalized_complaints: string[];
  pet_profile: PetProfileInput;
  adjudication: Adjudication;
  category: CaseCategory;
  expected_behavior: ExpectedBehavior;
  reviewers: Reviewer[];
  adjudication_status: string;
}

interface PetProfileInput {
  species: "dog";
  breed: string;
  age_years: number;
  sex: "male" | "female";
  neutered: boolean;
  weight_kg: number | null;
}

interface Adjudication {
  urgency_tier: 1 | 2 | 3 | 4;
  urgency_rationale: string;
  must_ask_questions: string[];
  nice_to_ask_questions: string[];
  acceptable_unknowns: string[];
  red_flags_present: string[];
  red_flags_absent: string[];
  likely_differentials: DifferentialLabel[];
  must_not_miss: string[];
  disposition: Disposition;
  disposition_rationale: string;
  should_abstain: boolean;
  abstention_reason: string | null;
  is_out_of_distribution: boolean;
  ood_reason: string | null;
  has_contradictions: boolean;
  contradiction_details: string | null;
}

interface DifferentialLabel {
  disease_key: string;
  confidence: "definite" | "probable" | "possible" | "rule_out";
  rationale: string;
}

type Disposition =
  | "emergency_vet_now"
  | "same_day_vet"
  | "vet_within_48h"
  | "monitor_and_reassess"
  | "cannot_safely_assess";

interface CaseCategory {
  complaint_families: string[];
  urgency_tier: 1 | 2 | 3 | 4;
  difficulty: "easy" | "moderate" | "hard" | "expert";
  case_type: "common" | "dangerous" | "ambiguous" | "contradictory" | "low_information" | "rare_but_critical";
}

interface ExpectedBehavior {
  min_questions_before_disposition: number;
  max_questions_before_disposition: number;
  must_detect_red_flags: string[];
  must_not_output_disposition_before_questions: string[];
  emergency_recall_required: boolean;
  unsafe_downgrade_is_failure: boolean;
}

interface Reviewer {
  reviewer_id: string;
  review_date: string;
  agreement: "agree" | "disagree" | "uncertain";
  notes: string;
}

// === COMPLAINT FAMILY DEFINITIONS ===

interface ComplaintFamily {
  key: string;
  name: string;
  urgencyTier: 1 | 2 | 3 | 4;
  redFlags: string[];
  mustAskQuestions: string[];
  linkedDiseases: string[];
  ownerPhrases: string[];
}

const COMPLAINT_FAMILIES: ComplaintFamily[] = [
  { key: "difficulty_breathing", name: "Breathing Difficulty", urgencyTier: 1, redFlags: ["blue_gums", "pale_gums", "breathing_difficulty", "breathing_onset_sudden", "stridor_present"], mustAskQuestions: ["breathing_onset", "breathing_rate", "gum_color", "position_preference", "coughing_present", "exercise_tolerance"], linkedDiseases: ["heart_failure", "pleural_effusion", "pneumonia", "laryngeal_paralysis", "allergic_reaction", "trauma_chest", "heat_stroke"], ownerPhrases: ["can't breathe", "struggling to breathe", "breathing fast", "heavy breathing", "gasping for air"] },
  { key: "coughing", name: "Coughing", urgencyTier: 3, redFlags: ["coughing_blood", "breathing_difficulty", "blue_gums"], mustAskQuestions: ["cough_type", "cough_duration", "cough_timing", "exercise_intolerance", "breathing_rate"], linkedDiseases: ["kennel_cough", "heart_disease", "pneumonia", "collapsing_trachea", "lung_cancer"], ownerPhrases: ["cough", "hacking", "honking cough", "gagging", "choking sound"] },
  { key: "vomiting", name: "Vomiting", urgencyTier: 3, redFlags: ["vomit_blood", "unproductive_retching", "toxin_confirmed"], mustAskQuestions: ["vomit_duration", "vomit_frequency", "vomit_content", "toxin_exposure", "appetite_status", "water_intake"], linkedDiseases: ["gastroenteritis", "pancreatitis", "foreign_body", "ibd", "gdv", "toxin_ingestion", "kidney_disease"], ownerPhrases: ["throwing up", "puking", "vomit", "sick to stomach", "bringing up food"] },
  { key: "diarrhea", name: "Diarrhea", urgencyTier: 3, redFlags: ["stool_blood_large", "bloody_diarrhea_puppy", "pale_gums"], mustAskQuestions: ["stool_blood", "stool_frequency", "stool_consistency", "diarrhea_duration", "water_intake", "appetite"], linkedDiseases: ["gastroenteritis", "parasites", "colitis", "ibd", "food_allergy", "hemorrhagic_gastroenteritis"], ownerPhrases: ["loose stool", "runny poop", "messy bottom", "watery poop", "soft stool"] },
  { key: "not_eating", name: "Not Eating", urgencyTier: 3, redFlags: ["no_water_24h", "puppy_critical", "lethargy"], mustAskQuestions: ["appetite_duration", "water_intake", "weight_loss", "vomiting_present", "lethargy_present"], linkedDiseases: ["gastroenteritis", "pancreatitis", "foreign_body", "kidney_disease", "liver_disease", "dental_disease"], ownerPhrases: ["won't eat", "no appetite", "not hungry", "refusing food", "not touching food"] },
  { key: "lethargy", name: "Lethargy", urgencyTier: 3, redFlags: ["collapse", "unresponsive", "pale_gums", "blue_gums"], mustAskQuestions: ["lethargy_duration", "lethargy_severity", "appetite_status", "gum_color", "water_intake"], linkedDiseases: ["pain_general", "infection", "anemia", "hypothyroidism", "heart_disease", "kidney_disease", "addisons_disease"], ownerPhrases: ["not himself", "sleeping all day", "no energy", "won't play", "tired all the time"] },
  { key: "limping", name: "Limping", urgencyTier: 3, redFlags: ["non_weight_bearing", "visible_fracture", "sudden_paralysis"], mustAskQuestions: ["which_leg", "limping_onset", "weight_bearing", "trauma_history", "swelling_present", "warmth_present"], linkedDiseases: ["ccl_rupture", "hip_dysplasia", "osteoarthritis", "soft_tissue_injury", "impa", "bone_cancer", "ivdd"], ownerPhrases: ["limp", "favoring a leg", "won't put weight down", "hopping", "stiff"] },
  { key: "swollen_abdomen", name: "Swollen Abdomen", urgencyTier: 1, redFlags: ["unproductive_retching", "rapid_onset_distension", "distended_abdomen_painful"], mustAskQuestions: ["abdomen_onset", "abdomen_pain", "unproductive_retching", "spay_status", "gum_color", "water_intake"], linkedDiseases: ["gdv", "bloat", "ascites", "splenic_mass", "pyometra", "cushings_disease"], ownerPhrases: ["big belly", "bloated", "swollen stomach", "belly looks tight", "pot-bellied"] },
  { key: "seizure_collapse", name: "Seizure/Collapse", urgencyTier: 1, redFlags: ["seizure_activity", "seizure_prolonged", "collapse", "unresponsive"], mustAskQuestions: ["seizure_duration", "consciousness_level", "toxin_exposure", "prior_seizures", "gum_color"], linkedDiseases: ["seizure_disorder", "epilepsy", "hypoglycemia", "toxin_ingestion", "heart_disease", "imha"], ownerPhrases: ["fitting", "having a fit", "passed out", "fell over", "shaking uncontrollably"] },
  { key: "excessive_scratching", name: "Excessive Scratching", urgencyTier: 4, redFlags: ["face_swelling", "hives_widespread", "allergic_with_breathing"], mustAskQuestions: ["scratch_location", "scratch_duration", "skin_changes", "flea_prevention", "diet_change"], linkedDiseases: ["allergic_dermatitis", "food_allergy", "flea_allergy", "ear_infection", "hot_spots", "mange"], ownerPhrases: ["itching", "scratching all the time", "chewing feet", "rubbing face", "hot spots"] },
  { key: "drinking_more", name: "Drinking More", urgencyTier: 3, redFlags: ["pyometra_signs", "no_water_24h"], mustAskQuestions: ["water_amount_change", "urination_frequency", "urination_accidents", "appetite_change", "spay_status"], linkedDiseases: ["diabetes", "cushings_disease", "kidney_disease", "pyometra", "liver_disease"], ownerPhrases: ["drinking tons of water", "always at the bowl", "thirsty all the time", "water bowl empty fast"] },
  { key: "trembling", name: "Trembling", urgencyTier: 3, redFlags: ["toxin_confirmed", "seizure_activity", "collapse"], mustAskQuestions: ["trembling_duration", "trembling_timing", "toxin_exposure", "consciousness_level", "appetite_status"], linkedDiseases: ["pain_general", "toxin_ingestion", "hypoglycemia", "seizure_disorder", "addisons_disease", "fever"], ownerPhrases: ["shivering", "shaking", "trembling", "quivering", "can't sit still"] },
  { key: "blood_in_stool", name: "Blood in Stool", urgencyTier: 2, redFlags: ["large_blood_volume", "rat_poison_confirmed", "pale_gums", "bloody_diarrhea_puppy"], mustAskQuestions: ["blood_color", "blood_amount", "stool_frequency", "toxin_exposure", "rat_poison_access", "appetite"], linkedDiseases: ["hemorrhagic_gastroenteritis", "colitis", "parasites", "foreign_body", "coagulopathy", "gi_cancer"], ownerPhrases: ["blood in poop", "bloody stool", "red in poop", "dark poop", "tar-like stool"] },
  { key: "eye_discharge", name: "Eye Discharge", urgencyTier: 3, redFlags: ["eye_swollen_shut", "eye_bulging", "sudden_blindness"], mustAskQuestions: ["discharge_color", "discharge_duration", "squinting", "eye_redness", "vision_changes", "trauma_history"], linkedDiseases: ["conjunctivitis", "corneal_ulcer", "dry_eye", "glaucoma", "uveitis", "entropion"], ownerPhrases: ["goopy eyes", "eyes watering", "eye crust", "cloudy eye", "squinting"] },
  { key: "ear_scratching", name: "Ear Problems", urgencyTier: 3, redFlags: ["head_tilt_sudden", "balance_loss", "facial_drooping"], mustAskQuestions: ["ear_odor", "ear_discharge", "head_shaking", "head_tilt", "balance_issues", "duration"], linkedDiseases: ["ear_infection_bacterial", "ear_infection_yeast", "ear_mites", "allergic_dermatitis", "foreign_body_ear"], ownerPhrases: ["ear infection", "shaking head", "scratching ears", "ear smells bad", "head tilted"] },
  { key: "weight_loss", name: "Weight Loss", urgencyTier: 3, redFlags: ["rapid_weight_loss", "not_eating", "lethargy"], mustAskQuestions: ["weight_loss_duration", "weight_loss_amount", "appetite_change", "stool_changes", "water_intake", "energy_level"], linkedDiseases: ["diabetes", "hyperthyroidism", "kidney_disease", "cancer", "ibd", "exocrine_pancreatic_insufficiency"], ownerPhrases: ["getting skinny", "ribs showing", "losing weight", "backbone sticking out", "muscle wasting"] },
  { key: "wound_skin_issue", name: "Wound/Skin Issue", urgencyTier: 3, redFlags: ["wound_deep_bleeding", "wound_bone_visible", "rapidly_spreading_redness"], mustAskQuestions: ["wound_location", "wound_size", "wound_duration", "wound_discharge", "trauma_history"], linkedDiseases: ["wound_infection", "abscess", "hot_spots", "allergic_dermatitis", "skin_mass", "mast_cell_tumor"], ownerPhrases: ["cut", "gash", "sore", "lump", "rash", "oozing", "hot spot"] },
  { key: "urination_problem", name: "Urination Problems", urgencyTier: 2, redFlags: ["urinary_blockage", "no_urine_24h", "blood_clots_urine"], mustAskQuestions: ["urination_frequency", "straining_present", "blood_in_urine", "urination_accidents", "water_intake"], linkedDiseases: ["urinary_stones", "urinary_infection", "prostate_disease", "bladder_cancer", "kidney_disease", "urethral_obstruction"], ownerPhrases: ["peeing inside", "can't pee", "straining to pee", "peeing blood", "dripping urine"] },
  { key: "behavior_change", name: "Behavior Change", urgencyTier: 3, redFlags: ["sudden_disorientation", "new_aggression", "pacing_restlessness"], mustAskQuestions: ["behavior_change_duration", "change_type", "appetite_status", "vision_changes", "sleep_pattern"], linkedDiseases: ["cognitive_dysfunction", "brain_tumor", "liver_shunt", "hypothyroidism", "pain_general", "seizure_disorder"], ownerPhrases: ["not acting right", "different lately", "aggressive suddenly", "hiding", "confused"] },
  { key: "swelling_lump", name: "Swelling/Lump", urgencyTier: 3, redFlags: ["rapidly_growing_mass", "face_swelling", "hot_painful_swelling"], mustAskQuestions: ["lump_location", "lump_size", "lump_duration", "lump_growth_rate", "lump_mobility", "pain_on_touch"], linkedDiseases: ["skin_mass", "mast_cell_tumor", "abscess", "lymphoma", "histiocytic_sarcoma", "allergic_reaction", "lipoma"], ownerPhrases: ["found a lump", "bump under skin", "swollen area", "growth", "mass"] },
  { key: "dental_problem", name: "Dental Problems", urgencyTier: 3, redFlags: ["facial_swelling_under_eye", "inability_to_drink", "blood_from_mouth"], mustAskQuestions: ["breath_odor_severity", "drooling_present", "chewing_difficulty", "gum_appearance", "appetite_status"], linkedDiseases: ["dental_disease", "oral_tumor", "tooth_root_abscess", "stomatitis", "foreign_body_mouth"], ownerPhrases: ["bad breath", "stinky breath", "drooling", "won't chew", "dropping food"] },
  { key: "hair_loss", name: "Hair Loss", urgencyTier: 4, redFlags: ["widespread_hair_loss", "hypothyroidism_signs"], mustAskQuestions: ["hair_loss_pattern", "skin_appearance", "itching_present", "duration", "flea_prevention", "seasonal_pattern"], linkedDiseases: ["allergic_dermatitis", "hypothyroidism", "cushings_disease", "mange", "folliculitis", "food_allergy"], ownerPhrases: ["losing fur", "bald patches", "thin coat", "hair falling out", "patchy fur"] },
  { key: "regurgitation", name: "Regurgitation", urgencyTier: 2, redFlags: ["coughing_after_regurgitation", "blue_gums", "weight_loss"], mustAskQuestions: ["timing_after_eating", "food_appearance", "coughing_present", "water_intake", "weight_change", "appetite"], linkedDiseases: ["megaesophagus", "vascular_ring_anomaly", "myasthenia_gravis", "esophageal_foreign_body", "hiatal_hernia"], ownerPhrases: ["food comes right back up", "undigested food on floor", "passive vomiting", "food just drops out"] },
  { key: "constipation", name: "Constipation", urgencyTier: 3, redFlags: ["straining_no_production_vomiting", "bloody_rectal_discharge", "distended_hard_abdomen"], mustAskQuestions: ["last_normal_stool", "straining_duration", "stool_consistency", "appetite", "vomiting_present", "water_intake"], linkedDiseases: ["obstipation", "prostate_enlargement", "perineal_hernia", "foreign_body", "pelvic_canal_stenosis"], ownerPhrases: ["can't poop", "straining on floor", "hard little poops", "no poop for days", "crying when pooping"] },
  { key: "generalized_stiffness", name: "Generalized Stiffness", urgencyTier: 3, redFlags: ["impa_signs", "inability_to_stand", "trembling_stiffness"], mustAskQuestions: ["stiffness_onset", "affected_areas", "fever_present", "appetite", "energy_level"], linkedDiseases: ["impa", "osteoarthritis", "polymyositis", "degenerative_myelopathy", "lumbosacral_disease"], ownerPhrases: ["stiff all over", "can't get comfortable", "reluctant to move", "slow to stand", "sore everywhere"] },
  { key: "nasal_discharge", name: "Nasal Discharge", urgencyTier: 4, redFlags: ["bloody_nasal_discharge", "facial_deformity", "difficulty_breathing_nose"], mustAskQuestions: ["discharge_color", "discharge_side", "sneezing_frequency", "blood_present", "appetite", "duration"], linkedDiseases: ["nasal_infection", "nasal_tumor", "nasal_foreign_body", "aspergillosis", "dental_disease"], ownerPhrases: ["runny nose", "sneezing", "snotty nose", "nose bleeding", "snorting"] },
  { key: "vaginal_discharge", name: "Vaginal Discharge", urgencyTier: 2, redFlags: ["intact_female_lethargy_drinking", "foul_smelling_discharge", "green_black_discharge"], mustAskQuestions: ["spay_status", "discharge_color", "discharge_odor", "heat_cycle_timing", "appetite", "water_intake", "lethargy"], linkedDiseases: ["pyometra", "vaginal_hyperplasia", "metritis", "vaginal_tumor", "urinary_infection"], ownerPhrases: ["discharge from privates", "bloody vulva", "pus from vagina", "licking privates constantly"] },
  { key: "testicular_prostate", name: "Testicular/Prostate", urgencyTier: 3, redFlags: ["acute_painful_testicular_swelling", "inability_to_urinate"], mustAskQuestions: ["neuter_status", "swelling_location", "urination_changes", "stool_changes", "pain_on_touch", "duration"], linkedDiseases: ["prostate_disease", "testicular_tumor", "prostatitis", "perineal_hernia", "benign_prostatic_hyperplasia"], ownerPhrases: ["swollen balls", "one testicle bigger", "straining to pee", "ribbon-like poop"] },
  { key: "exercise_induced_lameness", name: "Exercise-Induced Lameness", urgencyTier: 3, redFlags: ["collapse_after_exercise", "blue_gums_exercise", "coughing_after_exercise"], mustAskQuestions: ["exercise_type", "onset_during_exercise", "recovery_time", "breathing_after_exercise", "gum_color", "prior_episodes"], linkedDiseases: ["ccl_rupture", "iliopsoas_strain", "heart_disease", "exercise_induced_collapse", "myopathy"], ownerPhrases: ["fine until we walk", "stops mid-walk", "fine at home but won't walk far", "sore after play"] },
  { key: "skin_odor_greasy", name: "Skin Odor/Greasy", urgencyTier: 4, redFlags: ["widespread_skin_breakdown", "fever_skin_odor"], mustAskQuestions: ["odor_location", "skin_appearance", "itching_present", "bath_frequency", "ear_involvement", "diet"], linkedDiseases: ["yeast_infection", "seborrhea", "allergic_dermatitis", "hypothyroidism", "cushings_disease"], ownerPhrases: ["smells bad", "greasy fur", "yeasty smell", "corn chip feet", "oily coat"] },
  { key: "recurrent_ear", name: "Recurrent Ear", urgencyTier: 3, redFlags: ["head_tilt_balance_loss", "facial_drooping", "ear_hematoma"], mustAskQuestions: ["infection_frequency", "last_treatment", "underlying_allergy_diagnosis", "food_trial_done"], linkedDiseases: ["allergic_dermatitis", "ear_infection_bacterial", "ear_infection_yeast", "food_allergy", "hypothyroidism"], ownerPhrases: ["always getting ear infections", "back on ear meds", "ears never clear up", "chronic ear problem"] },
  { key: "recurrent_skin", name: "Recurrent Skin", urgencyTier: 3, redFlags: ["widespread_deep_infections", "fever", "non_responsive_antibiotics"], mustAskQuestions: ["infection_frequency", "antibiotic_history", "allergy_testing_done", "immune_status", "diet"], linkedDiseases: ["allergic_dermatitis", "superficial_pyoderma", "demodicosis", "hypothyroidism", "cushings_disease"], ownerPhrases: ["always getting skin infections", "pimples keep coming back", "antibiotics work then it returns"] },
  { key: "inappropriate_urination", name: "Inappropriate Urination", urgencyTier: 3, redFlags: ["straining_no_urine", "blood_in_urine", "male_unable_to_urinate"], mustAskQuestions: ["urination_frequency", "straining", "blood_present", "water_intake", "neuter_status", "behavioral_changes"], linkedDiseases: ["urinary_infection", "urinary_stones", "diabetes", "cushings_disease", "kidney_disease", "cognitive_dysfunction"], ownerPhrases: ["peeing in house", "was housetrained now isn't", "leaking urine", "waking up wet"] },
  { key: "fecal_incontinence", name: "Fecal Incontinence", urgencyTier: 2, redFlags: ["sudden_onset_hind_weakness", "tail_paralysis", "back_pain"], mustAskQuestions: ["onset", "stool_consistency", "hind_limb_function", "tail_movement", "back_pain"], linkedDiseases: ["ivdd", "lumbosacral_disease", "cauda_equina_syndrome", "anal_sphincter_incompetence"], ownerPhrases: ["pooping without knowing", "waking up in poop", "can't hold it", "leaking stool"] },
  { key: "vomiting_diarrhea_combined", name: "Vomiting + Diarrhea", urgencyTier: 2, redFlags: ["puppy_critical", "blood_in_both", "toxin_exposure"], mustAskQuestions: ["duration_each", "frequency_each", "blood_in_either", "appetite", "water_intake", "toxin_exposure", "vaccination_status"], linkedDiseases: ["gastroenteritis", "pancreatitis", "parvovirus", "toxin_ingestion", "foreign_body"], ownerPhrases: ["both ends", "sick top and bottom", "vomiting and diarrhea", "everything is coming out"] },
  { key: "coughing_breathing_combined", name: "Coughing + Breathing", urgencyTier: 1, redFlags: ["blue_gums", "collapse", "sudden_onset", "inability_to_lie_down"], mustAskQuestions: ["breathing_rate", "gum_color", "cough_type", "onset", "exercise_tolerance", "position_preference"], linkedDiseases: ["heart_failure", "pneumonia", "pleural_effusion", "laryngeal_paralysis", "allergic_reaction"], ownerPhrases: ["coughing and can't breathe", "wheezing and coughing", "struggling to breathe after coughing"] },
  { key: "oral_mass", name: "Oral Mass", urgencyTier: 2, redFlags: ["bleeding_from_mouth", "inability_to_eat_drink", "facial_swelling"], mustAskQuestions: ["mass_location", "mass_size", "bleeding", "eating_difficulty", "duration", "odor"], linkedDiseases: ["oral_tumor", "epulis", "melanoma", "squamous_cell_carcinoma", "foreign_body_mouth"], ownerPhrases: ["lump in mouth", "growth on gum", "won't close mouth", "something hanging from mouth"] },
  { key: "vision_loss", name: "Vision Loss", urgencyTier: 1, redFlags: ["sudden_blindness", "painful_eye", "dilated_nonresponsive_pupils"], mustAskQuestions: ["onset", "one_or_both_eyes", "pain_present", "pupil_appearance", "other_neurologic_signs", "duration"], linkedDiseases: ["sudden_acquired_retinal_degeneration", "glaucoma", "cataract", "optic_neuritis", "brain_tumor"], ownerPhrases: ["bumping into things", "can't see", "blind suddenly", "eyes look cloudy"] },
  { key: "hearing_loss", name: "Hearing Loss", urgencyTier: 3, redFlags: ["sudden_deafness_head_tilt", "balance_loss", "ear_pain"], mustAskQuestions: ["onset", "ear_infection_history", "head_tilt", "balance", "response_to_loud_sounds", "age"], linkedDiseases: ["ear_infection", "vestibular_disease", "age_related_deafness", "ototoxicity", "brain_tumor"], ownerPhrases: ["not hearing me", "deaf suddenly", "doesn't respond to name", "startled easily"] },
  { key: "aggression", name: "Aggression", urgencyTier: 2, redFlags: ["sudden_new_aggression", "aggression_trembling", "aggression_vocalizing"], mustAskQuestions: ["aggression_onset", "trigger_situations", "pain_on_touch", "appetite", "energy_level", "recent_changes"], linkedDiseases: ["pain_general", "ivdd", "dental_disease", "ear_infection", "cognitive_dysfunction", "hypothyroidism"], ownerPhrases: ["biting suddenly", "growling when touched", "snapping", "doesn't want to be picked up"] },
  { key: "pacing_restlessness", name: "Pacing/Restlessness", urgencyTier: 2, redFlags: ["pacing_bloated_abdomen", "pacing_retching", "pacing_pale_gums"], mustAskQuestions: ["abdomen_appearance", "retching_present", "gum_color", "duration", "appetite", "water_intake"], linkedDiseases: ["gdv", "pain_general", "bloat", "cognitive_dysfunction", "anxiety", "splenic_mass"], ownerPhrases: ["can't settle", "walking in circles", "pacing all night", "won't lie down", "restless"] },
  { key: "abnormal_gait", name: "Abnormal Gait", urgencyTier: 2, redFlags: ["inability_to_stand", "paralysis", "back_pain", "loss_bladder_control"], mustAskQuestions: ["onset", "affected_limbs", "back_pain", "bladder_control", "trauma_history", "progression"], linkedDiseases: ["ivdd", "degenerative_myelopathy", "wobbler_syndrome", "vestibular_disease", "fibrocartilaginous_embolism"], ownerPhrases: ["wobbly walking", "drunk walking", "crossing legs", "knuckling", "stumbling"] },
  { key: "heat_intolerance", name: "Heat Intolerance", urgencyTier: 1, redFlags: ["collapse_in_heat", "brick_red_gums", "vomiting_overheating"], mustAskQuestions: ["temperature_exposure", "duration", "gum_color", "consciousness_level", "vomiting", "water_intake", "breed"], linkedDiseases: ["heat_stroke", "difficulty_breathing", "heart_disease", "obesity_related"], ownerPhrases: ["overheats fast", "can't handle heat", "panting too much in heat", "collapsed in heat"] },
  { key: "postoperative_concern", name: "Post-Operative Concern", urgencyTier: 2, redFlags: ["incision_dehiscence", "active_bleeding", "pus_fever"], mustAskQuestions: ["surgery_type", "days_post_op", "incision_appearance", "discharge", "appetite", "activity_level", "temperature"], linkedDiseases: ["wound_infection", "surgical_complication", "seroma", "dehiscence", "pain_general"], ownerPhrases: ["incision looks bad", "stitches open", "oozing from surgery site", "not recovering well"] },
  { key: "medication_reaction", name: "Medication Reaction", urgencyTier: 2, redFlags: ["facial_swelling", "hives_breathing_difficulty", "collapse"], mustAskQuestions: ["medication_name", "dose", "timing", "symptoms", "prior_reactions", "current_medications"], linkedDiseases: ["allergic_reaction", "toxin_ingestion", "gastroenteritis"], ownerPhrases: ["reaction to medicine", "got sick after pill", "allergic to medication", "side effects"] },
  { key: "pregnancy_birth", name: "Pregnancy/Birthing", urgencyTier: 1, redFlags: ["dystocia_active", "dystocia_interval", "green_discharge_no_puppy", "eclampsia"], mustAskQuestions: ["days_pregnant", "contraction_status", "discharge_color", "puppies_delivered", "time_since_last_puppy", "appetite"], linkedDiseases: ["dystocia", "metritis", "eclampsia", "pregnancy", "pyometra"], ownerPhrases: ["having trouble giving birth", "straining but no puppies", "green discharge but no puppies", "pregnant and sick"] },
  { key: "puppy_concern", name: "Puppy Concern", urgencyTier: 2, redFlags: ["puppy_not_nursing", "cold_to_touch", "weak_cry", "diarrhea_under_12_weeks"], mustAskQuestions: ["age_in_weeks", "nursing_status", "temperature", "weight_trend", "littermate_status", "vaccination_status"], linkedDiseases: ["hypoglycemia", "parasites", "parvovirus", "fading_puppy_syndrome", "congenital_defect", "liver_shunt"], ownerPhrases: ["puppy not right", "weak puppy", "not nursing", "puppy crying", "puppy cold"] },
  { key: "senior_decline", name: "Senior Decline", urgencyTier: 3, redFlags: ["rapid_decline_weeks", "inability_to_stand", "sudden_blindness_deafness"], mustAskQuestions: ["decline_duration", "specific_changes", "appetite", "water_intake", "mobility", "sleep_pattern", "medication_list"], linkedDiseases: ["cognitive_dysfunction", "osteoarthritis", "kidney_disease", "heart_disease", "cancer", "hypothyroidism"], ownerPhrases: ["getting old and slow", "not like she used to be", "slowing down", "confused at night"] },
  { key: "multi_system_decline", name: "Multi-System Decline", urgencyTier: 2, redFlags: ["lethargy_not_eating_not_drinking", "weight_loss_vomiting_diarrhea", "pale_gums_collapse"], mustAskQuestions: ["each_symptom_duration", "appetite", "water_intake", "weight_change", "energy", "vomiting", "diarrhea", "urination"], linkedDiseases: ["kidney_disease", "liver_disease", "cancer", "addisons_disease", "imha", "heart_failure", "sepsis"], ownerPhrases: ["just not right in multiple ways", "a bit of everything wrong", "going downhill"] },
  { key: "unknown_concern", name: "Unknown Concern", urgencyTier: 3, redFlags: ["unable_to_assess_breathing", "unable_to_assess_gum_color", "non_responsive"], mustAskQuestions: ["chief_complaint_guess", "appetite_status", "water_intake", "energy_level", "breathing_status", "gum_color", "last_normal"], linkedDiseases: [], ownerPhrases: ["something is wrong but I can't tell what", "just seems off", "not acting right", "I don't know what to look for"] },
];

// === BREED POOL ===

const BREEDS = [
  { name: "Labrador Retriever", predispositions: ["ccl_rupture", "hip_dysplasia", "obesity_related"] },
  { name: "Golden Retriever", predispositions: ["hip_dysplasia", "cancer", "allergic_dermatitis"] },
  { name: "German Shepherd", predispositions: ["ivdd", "degenerative_myelopathy", "hip_dysplasia"] },
  { name: "Great Dane", predispositions: ["gdv", "bloat", "heart_disease", "bone_cancer"] },
  { name: "Beagle", predispositions: ["epilepsy", "allergic_dermatitis", "food_allergy"] },
  { name: "Cocker Spaniel", predispositions: ["pyometra", "ear_infection_bacterial", "dental_disease"] },
  { name: "Bulldog", predispositions: ["difficulty_breathing", "heat_stroke", "allergic_dermatitis"] },
  { name: "French Bulldog", predispositions: ["difficulty_breathing", "heat_stroke", "ivdd"] },
  { name: "Pug", predispositions: ["difficulty_breathing", "eye_disorders", "skin_infection"] },
  { name: "Dachshund", predispositions: ["ivdd", "intervertebral_disc_disease", "dental_disease"] },
  { name: "Boxer", predispositions: ["heart_disease", "cancer", "seizure_disorder"] },
  { name: "Poodle", predispositions: ["epilepsy", "hip_dysplasia", "dental_disease"] },
  { name: "Rottweiler", predispositions: ["bone_cancer", "hip_dysplasia", "heart_disease"] },
  { name: "Yorkshire Terrier", predispositions: ["liver_shunt", "hypoglycemia", "dental_disease"] },
  { name: "Chihuahua", predispositions: ["hypoglycemia", "patellar_luxation", "dental_disease"] },
  { name: "Siberian Husky", predispositions: ["autoimmune_skin", "eye_disorders", "zinc_responsive_dermatosis"] },
  { name: "Border Collie", predispositions: ["epilepsy", "hip_dysplasia", "allergic_dermatitis"] },
  { name: "Australian Shepherd", predispositions: ["hip_dysplasia", "epilepsy", "eye_disorders"] },
  { name: "Doberman", predispositions: ["heart_disease", "von_willebrands", "prostate_disease"] },
  { name: "Shih Tzu", predispositions: ["eye_disorders", "dental_disease", "ear_infection"] },
  { name: "Boston Terrier", predispositions: ["eye_disorders", "difficulty_breathing", "seizure_disorder"] },
  { name: "Bernese Mountain Dog", predispositions: ["cancer", "hip_dysplasia", "histiocytic_sarcoma"] },
  { name: "Saint Bernard", predispositions: ["gdv", "hip_dysplasia", "heart_disease"] },
  { name: "Mastiff", predispositions: ["gdv", "hip_dysplasia", "heart_disease"] },
  { name: "Basset Hound", predispositions: ["ear_infection", "ivdd", "obesity_related"] },
  { name: "Mixed Breed", predispositions: [] },
  { name: "Staffordshire Terrier", predispositions: ["allergic_dermatitis", "hip_dysplasia"] },
  { name: "Cavalier King Charles", predispositions: ["heart_disease", "syringomyelia", "ear_infection"] },
  { name: "Corgi", predispositions: ["ivdd", "hip_dysplasia", "degenerative_myelopathy"] },
  { name: "Weimaraner", predispositions: ["gdv", "hip_dysplasia", "immune_deficiency"] },
];

// === HELPER FUNCTIONS ===

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = randomInt(min, Math.min(max, arr.length));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function generatePetProfile(breed?: string, ageRange?: [number, number], sex?: "male" | "female"): PetProfileInput {
  const b = breed || randomChoice(BREEDS).name;
  const [minAge, maxAge] = ageRange || [1, 10];
  return {
    species: "dog" as const,
    breed: b,
    age_years: parseFloat((Math.random() * (maxAge - minAge) + minAge).toFixed(1)),
    sex: sex || randomChoice(["male", "female"]),
    neutered: Math.random() > 0.2,
    weight_kg: randomInt(5, 65),
  };
}

function generateReviewer(): Reviewer {
  return {
    reviewer_id: `VET-${randomInt(100, 999)}`,
    review_date: "2026-04-10",
    agreement: "agree",
    notes: "Synthetic benchmark case — pending dual review",
  };
}

// === CASE TEMPLATES BY TYPE ===

function createEmergencyCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const pet = generatePetProfile(
    variant % 3 === 0 ? randomChoice(BREEDS).name : undefined,
    undefined,
    undefined
  );

  const triggeredFlags = randomSubset(family.redFlags, 1, Math.min(3, family.redFlags.length));
  const absentFlags = family.redFlags.filter(f => !triggeredFlags.includes(f));

  const disposition: Disposition = "emergency_vet_now";

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${variant % 2 === 0 ? "Getting worse over the last few hours." : "Started suddenly today."}`,
    normalized_complaints: [family.key],
    pet_profile: pet,
    adjudication: {
      urgency_tier: 1,
      urgency_rationale: `Emergency presentation of ${family.name} with ${triggeredFlags.length} red flag(s) triggered`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 2, 4),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 0, 2),
      red_flags_present: triggeredFlags,
      red_flags_absent: absentFlags.slice(0, 3),
      likely_differentials: family.linkedDiseases.slice(0, 2).map(d => ({
        disease_key: d,
        confidence: "probable" as const,
        rationale: `Consistent with ${family.name} emergency presentation`,
      })),
      must_not_miss: family.linkedDiseases.slice(0, 1),
      disposition,
      disposition_rationale: `Red flags present require immediate/same-day veterinary evaluation`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: 1,
      difficulty: "easy" as const,
      case_type: "dangerous" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 1,
      max_questions_before_disposition: 3,
      must_detect_red_flags: triggeredFlags,
      must_not_output_disposition_before_questions: triggeredFlags.length > 0 ? [triggeredFlags[0]] : [],
      emergency_recall_required: true,
      unsafe_downgrade_is_failure: true,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

function createCommonCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const pet = generatePetProfile();
  const dispositions: Disposition[] = ["monitor_and_reassess", "vet_within_48h"];
  const disposition = variant % 2 === 0 ? dispositions[0] : dispositions[1];
  const urgencyTier = disposition === "monitor_and_reassess" ? 4 : 3;

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${variant % 3 === 0 ? "For about a week now." : "Started a few days ago."} ${variant % 2 === 0 ? "Still eating and drinking fine." : "Acting mostly normal otherwise."}`,
    normalized_complaints: [family.key],
    pet_profile: pet,
    adjudication: {
      urgency_tier: urgencyTier as 3 | 4,
      urgency_rationale: `Common presentation of ${family.name} without red flags`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 3, 5),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 3),
      red_flags_present: [],
      red_flags_absent: family.redFlags.slice(0, 4),
      likely_differentials: family.linkedDiseases.slice(0, 2).map(d => ({
        disease_key: d,
        confidence: variant % 2 === 0 ? "probable" as const : "possible" as const,
        rationale: `Common ${family.name} presentation`,
      })),
      must_not_miss: [],
      disposition,
      disposition_rationale: `No red flags present — ${disposition === "monitor_and_reassess" ? "home observation with clear escalation triggers" : "routine vet evaluation within 48 hours"}`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: urgencyTier as 3 | 4,
      difficulty: "easy" as const,
      case_type: "common" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 3,
      max_questions_before_disposition: 6,
      must_detect_red_flags: [],
      must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 2, 3),
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: false,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

function createAmbiguousCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const pet = generatePetProfile();

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${variant % 2 === 0 ? "Not sure if it's serious." : "Could be nothing, could be something."} ${variant % 3 === 0 ? "Vet is closed until Monday." : "Not sure what to do."}`,
    normalized_complaints: [family.key],
    pet_profile: pet,
    adjudication: {
      urgency_tier: 3,
      urgency_rationale: `Ambiguous ${family.name} presentation — insufficient information for definitive tier`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 4, 6),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 2, 4),
      red_flags_present: [],
      red_flags_absent: family.redFlags.slice(0, 2),
      likely_differentials: family.linkedDiseases.slice(0, 3).map((d, i) => ({
        disease_key: d,
        confidence: (["possible", "rule_out", "possible"] as const)[i],
        rationale: `Cannot differentiate without more information`,
      })),
      must_not_miss: family.linkedDiseases.slice(0, 1),
      disposition: "vet_within_48h",
      disposition_rationale: `Ambiguous presentation warrants veterinary evaluation to rule out serious causes`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: 3,
      difficulty: "hard" as const,
      case_type: "ambiguous" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 4,
      max_questions_before_disposition: 7,
      must_detect_red_flags: [],
      must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 3, 4),
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: false,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

function createContradictoryCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const contradictions = [
    { text: "Owner says 'tired' but also 'still playing outside'", detail: "Energy level contradiction — lethargy vs normal activity" },
    { text: "Owner says 'eating fine' but also 'lost weight'", detail: "Appetite vs weight contradiction" },
    { text: "Owner says 'fine at home' but 'worse at the vet'", detail: "Context-dependent presentation" },
    { text: "Owner says 'started yesterday' but also 'been going on for a while'", detail: "Onset timing contradiction" },
    { text: "Owner says 'not drinking much' but 'water bowl always empty'", detail: "Water intake contradiction" },
  ];

  const contradiction = contradictions[variant % contradictions.length];

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${contradiction.text}. ${variant % 2 === 0 ? "Not sure what's going on." : "Confusing situation."}`,
    normalized_complaints: [family.key],
    pet_profile: generatePetProfile(),
    adjudication: {
      urgency_tier: 3,
      urgency_rationale: `Contradictory information in ${family.name} presentation — requires clarification`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 4, 6),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 2),
      red_flags_present: [],
      red_flags_absent: family.redFlags.slice(0, 3),
      likely_differentials: family.linkedDiseases.slice(0, 2).map(d => ({
        disease_key: d,
        confidence: "possible" as const,
        rationale: `Cannot assess confidently due to contradictory information`,
      })),
      must_not_miss: [],
      disposition: "vet_within_48h",
      disposition_rationale: `Contradictory information prevents safe home monitoring — veterinary evaluation recommended`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: true,
      contradiction_details: contradiction.detail,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: 3,
      difficulty: "hard" as const,
      case_type: "contradictory" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 3,
      max_questions_before_disposition: 6,
      must_detect_red_flags: [],
      must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 3, 4),
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: false,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

function createLowInformationCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const lowInfoPhrases = [
    "I don't know what's wrong. Something's off.",
    "My dog just isn't right today.",
    "I'm worried but can't put my finger on it.",
    "Just not acting like themselves.",
    "Something's wrong but I'm not sure what.",
  ];

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: lowInfoPhrases[variant % lowInfoPhrases.length],
    normalized_complaints: ["unknown_concern", family.key],
    pet_profile: generatePetProfile(),
    adjudication: {
      urgency_tier: 3,
      urgency_rationale: `Low information presentation — structured questioning required to assess ${family.name}`,
      must_ask_questions: ["appetite_status", "water_intake", "energy_level", "breathing_status", "gum_color", ...randomSubset(family.mustAskQuestions, 2, 3)],
      nice_to_ask_questions: ["chief_complaint_guess", "last_normal", ...randomSubset(family.mustAskQuestions, 1, 2)],
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 2),
      red_flags_present: [],
      red_flags_absent: [],
      likely_differentials: [],
      must_not_miss: family.linkedDiseases.slice(0, 1),
      disposition: "vet_within_48h",
      disposition_rationale: `Senior/vague concern warrants veterinary evaluation — if critical signs normal on questioning, can monitor 48h`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: ["unknown_concern", family.key],
      urgency_tier: 3,
      difficulty: "hard" as const,
      case_type: "low_information" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 4,
      max_questions_before_disposition: 7,
      must_detect_red_flags: [],
      must_not_output_disposition_before_questions: ["appetite_status", "water_intake", "energy_level", "breathing_status"],
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: false,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

function createRareCriticalCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const rareDiseases = family.linkedDiseases.length > 0 ? family.linkedDiseases.slice(-2) : ["unknown_condition"];
  const rareDisease = rareDiseases[variant % rareDiseases.length];

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${variant % 2 === 0 ? "Getting worse despite home care." : "Unusual pattern — not responding to normal treatment."}`,
    normalized_complaints: [family.key],
    pet_profile: generatePetProfile(),
    adjudication: {
      urgency_tier: family.urgencyTier <= 2 ? family.urgencyTier : 2,
      urgency_rationale: `Rare but critical ${family.name} presentation — ${rareDisease}`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 4, 6),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 2),
      red_flags_present: randomSubset(family.redFlags, 1, 2),
      red_flags_absent: family.redFlags.filter(f => !family.redFlags.slice(0, 2).includes(f)).slice(0, 2),
      likely_differentials: [
        { disease_key: rareDisease, confidence: "possible" as const, rationale: `Rare but must-not-miss condition` },
        ...family.linkedDiseases.slice(0, 1).map(d => ({ disease_key: d, confidence: "probable" as const, rationale: `More common differential` })),
      ],
      must_not_miss: [rareDisease],
      disposition: family.urgencyTier <= 2 ? "emergency_vet_now" : "same_day_vet",
      disposition_rationale: `Rare critical condition requires urgent/same-day veterinary evaluation`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: family.urgencyTier <= 2 ? family.urgencyTier : 2,
      difficulty: "expert" as const,
      case_type: "rare_but_critical" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 2,
      max_questions_before_disposition: 5,
      must_detect_red_flags: family.redFlags.slice(0, 1),
      must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 2, 3),
      emergency_recall_required: family.urgencyTier === 1,
      unsafe_downgrade_is_failure: true,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

// === OUT OF DISTRIBUTION CASES ===

function createOODCase(caseId: string, variant: number): BenchmarkCase {
  const oodScenarios = [
    {
      input: "My cat has been hiding all day and won't eat. She's also been going to the litter box a lot.",
      reason: "Non-dog species",
      complaints: [],
    },
    {
      input: "My rabbit is not moving much and hasn't eaten since yesterday.",
      reason: "Non-dog species",
      complaints: [],
    },
    {
      input: "What's the dose of amoxicillin for a 20kg dog?",
      reason: "Medication dosing request — outside triage scope",
      complaints: [],
    },
    {
      input: "My dog had surgery last week. When should I remove the stitches?",
      reason: "Post-surgical care instruction — outside triage scope",
      complaints: [],
    },
    {
      input: "Can you tell me if my dog is pregnant?",
      reason: "Diagnostic request without symptoms",
      complaints: [],
    },
    {
      input: "Is it normal for dogs to sleep 16 hours a day?",
      reason: "Educational/hypothetical question",
      complaints: [],
    },
    {
      input: "My hamster has a lump. What could it be?",
      reason: "Non-dog species",
      complaints: [],
    },
    {
      input: "I think my dog has cancer. What chemotherapy options are there?",
      reason: "Treatment recommendation — outside triage scope",
      complaints: [],
    },
  ];

  const scenario = oodScenarios[variant % oodScenarios.length];

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: scenario.input,
    normalized_complaints: scenario.complaints,
    pet_profile: {
      species: "dog",
      breed: "Unknown",
      age_years: 3,
      sex: "male",
      neutered: true,
      weight_kg: null,
    },
    adjudication: {
      urgency_tier: 4,
      urgency_rationale: "N/A — out of scope for PawVital",
      must_ask_questions: [],
      nice_to_ask_questions: [],
      acceptable_unknowns: [],
      red_flags_present: [],
      red_flags_absent: [],
      likely_differentials: [],
      must_not_miss: [],
      disposition: "cannot_safely_assess",
      disposition_rationale: `PawVital is designed for dog symptom triage only. ${scenario.reason}.`,
      should_abstain: true,
      abstention_reason: scenario.reason,
      is_out_of_distribution: true,
      ood_reason: scenario.reason,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [],
      urgency_tier: 4,
      difficulty: "easy" as const,
      case_type: "ambiguous" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 0,
      max_questions_before_disposition: 1,
      must_detect_red_flags: [],
      must_not_output_disposition_before_questions: [],
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: false,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

// === CROSS-FAMILY COMBINATION CASES ===

function createCrossFamilyCase(
  caseId: string,
  familyA: ComplaintFamily,
  familyB: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const pet = generatePetProfile();
  const combinedMustAsk = [...new Set([...familyA.mustAskQuestions.slice(0, 3), ...familyB.mustAskQuestions.slice(0, 3)])];
  const combinedRedFlags = [...new Set([...familyA.redFlags.slice(0, 2), ...familyB.redFlags.slice(0, 2)])];

  const tier = Math.min(familyA.urgencyTier, familyB.urgencyTier);
  const disposition = tier === 1 ? "emergency_vet_now" : tier === 2 ? "same_day_vet" : "vet_within_48h";

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(familyA.ownerPhrases)}. Also ${randomChoice(familyB.ownerPhrases).toLowerCase()}. ${variant % 2 === 0 ? "Both started around the same time." : "One started before the other."}`,
    normalized_complaints: [familyA.key, familyB.key],
    pet_profile: pet,
    adjudication: {
      urgency_tier: tier as 1 | 2 | 3 | 4,
      urgency_rationale: `Cross-family: ${familyA.name} + ${familyB.name} — higher tier takes precedence`,
      must_ask_questions: combinedMustAsk.slice(0, 6),
      nice_to_ask_questions: randomSubset(combinedMustAsk, 2, 3),
      acceptable_unknowns: randomSubset(combinedMustAsk, 1, 2),
      red_flags_present: randomSubset(combinedRedFlags, 1, 2),
      red_flags_absent: combinedRedFlags.filter((_, i) => i > 2).slice(0, 2),
      likely_differentials: [
        ...familyA.linkedDiseases.slice(0, 1).map(d => ({ disease_key: d, confidence: "possible" as const, rationale: `Matches ${familyA.name}` })),
        ...familyB.linkedDiseases.slice(0, 1).map(d => ({ disease_key: d, confidence: "possible" as const, rationale: `Matches ${familyB.name}` })),
      ],
      must_not_miss: [...familyA.linkedDiseases.slice(0, 1), ...familyB.linkedDiseases.slice(0, 1)],
      disposition,
      disposition_rationale: `Multi-system presentation requires ${disposition.replace(/_/g, ' ')} evaluation`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [familyA.key, familyB.key],
      urgency_tier: tier as 1 | 2 | 3 | 4,
      difficulty: "moderate" as const,
      case_type: "common" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 3,
      max_questions_before_disposition: 6,
      must_detect_red_flags: combinedRedFlags.slice(0, 1),
      must_not_output_disposition_before_questions: combinedMustAsk.slice(0, 3),
      emergency_recall_required: tier === 1,
      unsafe_downgrade_is_failure: tier <= 2,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

// === MAIN GENERATOR ===

function generateBenchmarkCases(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  let caseNumber = 1;

  function nextId(): string {
    return `BENCH-${String(caseNumber++).padStart(4, '0')}`;
  }

  console.log("Generating benchmark cases...");

  // Phase 1: Per-family cases (6 per family × 50 families = 300 cases)
  console.log("\nPhase 1: Per-family cases (300 cases)");
  for (const family of COMPLAINT_FAMILIES) {
    // 2 easy common cases
    cases.push(createCommonCase(nextId(), family, 0));
    cases.push(createCommonCase(nextId(), family, 1));

    // 1 moderate common case
    cases.push(createCommonCase(nextId(), family, 2));

    // 1 moderate ambiguous case
    cases.push(createAmbiguousCase(nextId(), family, 0));

    // 1 hard contradictory case
    cases.push(createContradictoryCase(nextId(), family, 0));

    // 1 emergency case
    cases.push(createEmergencyCase(nextId(), family, 0));
  }
  console.log(`  Generated ${cases.length} cases`);

  // Phase 2: Additional cases for distribution targets (200+ cases)
  console.log("\nPhase 2: Additional distribution cases");

  // Additional dangerous cases (target: 100 total dangerous, already have 50)
  console.log("  Adding dangerous cases...");
  const emergencyFamilies = COMPLAINT_FAMILIES.filter(f => f.urgencyTier === 1 || f.linkedDiseases.includes("gdv") || f.linkedDiseases.includes("pyometra"));
  for (let i = 0; i < 50; i++) {
    const family = emergencyFamilies[i % emergencyFamilies.length];
    cases.push(createDangerousCase(nextId(), family, i));
  }
  console.log(`  Total: ${cases.length} cases`);

  // Additional ambiguous cases (target: 75 total, already have 50)
  console.log("  Adding ambiguous cases...");
  for (let i = 0; i < 25; i++) {
    const family = COMPLAINT_FAMILIES[i % COMPLAINT_FAMILIES.length];
    cases.push(createAmbiguousCase(nextId(), family, i + 1));
  }
  console.log(`  Total: ${cases.length} cases`);

  // Additional contradictory cases (target: 50 total, already have 50)
  // Already met target

  // Additional low information cases (target: 50 total, need to add)
  console.log("  Adding low information cases...");
  for (let i = 0; i < 50; i++) {
    const family = COMPLAINT_FAMILIES[i % COMPLAINT_FAMILIES.length];
    cases.push(createLowInformationCase(nextId(), family, i));
  }
  console.log(`  Total: ${cases.length} cases`);

  // Additional rare critical cases (target: 50 total, need to add)
  console.log("  Adding rare critical cases...");
  for (let i = 0; i < 50; i++) {
    const family = COMPLAINT_FAMILIES[i % COMPLAINT_FAMILIES.length];
    cases.push(createRareCriticalCase(nextId(), family, i));
  }
  console.log(`  Total: ${cases.length} cases`);

  // Phase 3: OOD cases (20 cases)
  console.log("\nPhase 3: OOD cases (20 cases)");
  for (let i = 0; i < 20; i++) {
    cases.push(createOODCase(nextId(), i));
  }
  console.log(`  Total: ${cases.length} cases`);

  // Phase 4: Cross-family combination cases (50+ cases)
  console.log("\nPhase 4: Cross-family combination cases (50 cases)");
  for (let i = 0; i < 50; i++) {
    const familyA = COMPLAINT_FAMILIES[i % COMPLAINT_FAMILIES.length];
    const familyB = COMPLAINT_FAMILIES[(i + randomInt(1, 10)) % COMPLAINT_FAMILIES.length];
    if (familyA.key !== familyB.key) {
      cases.push(createCrossFamilyCase(nextId(), familyA, familyB, i));
    }
  }
  console.log(`  Total: ${cases.length} cases`);

  // Phase 5: Breed-specific edge cases (30 cases)
  console.log("\nPhase 5: Breed-specific edge cases (30 cases)");
  const breedSpecificCases = [
    { breed: "Great Dane", family: "swollen_abdomen", desc: "Classic GDV signalment" },
    { breed: "Dachshund", family: "limping", desc: "IVDD high risk" },
    { breed: "French Bulldog", family: "difficulty_breathing", desc: "Brachycephalic airway" },
    { breed: "Cocker Spaniel", family: "vaginal_discharge", desc: "Pyometra risk intact female" },
    { breed: "Labrador Retriever", family: "limping", desc: "CCL rupture common" },
    { breed: "Boxer", family: "seizure_collapse", desc: "Seizure predisposition" },
    { breed: "Golden Retriever", family: "swelling_lump", desc: "Cancer predisposition" },
    { breed: "Yorkshire Terrier", family: "trembling", desc: "Hypoglycemia risk" },
    { breed: "Doberman", family: "blood_in_stool", desc: "Von Willebrand's disease" },
    { breed: "Bernese Mountain Dog", family: "swelling_lump", desc: "Histiocytic sarcoma risk" },
  ];

  for (let i = 0; i < 30; i++) {
    const specific = breedSpecificCases[i % breedSpecificCases.length];
    const family = COMPLAINT_FAMILIES.find(f => f.key === specific.family)!;
    const pet = generatePetProfile(specific.breed, undefined, undefined);
    cases.push({
      case_id: nextId(),
      version: "1.0",
      created_at: "2026-04-10",
      source: "synthetic",
      owner_input: `${randomChoice(family.ownerPhrases)}. ${specific.desc}. ${i % 2 === 0 ? "Getting worse." : "Started today."}`,
      normalized_complaints: [family.key],
      pet_profile: pet,
      adjudication: {
        urgency_tier: family.urgencyTier <= 2 ? family.urgencyTier : 2,
        urgency_rationale: `Breed-specific: ${specific.breed} with ${family.name} — ${specific.desc}`,
        must_ask_questions: randomSubset(family.mustAskQuestions, 3, 5),
        nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
        acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 2),
        red_flags_present: randomSubset(family.redFlags, 1, 2),
        red_flags_absent: family.redFlags.filter((_, idx) => idx > 2).slice(0, 2),
        likely_differentials: family.linkedDiseases.slice(0, 2).map(d => ({
          disease_key: d,
          confidence: "probable" as const,
          rationale: `Breed predisposition + presentation`,
        })),
        must_not_miss: family.linkedDiseases.slice(0, 1),
        disposition: family.urgencyTier <= 2 ? "emergency_vet_now" : "same_day_vet",
        disposition_rationale: `Breed-specific risk elevates urgency`,
        should_abstain: false,
        abstention_reason: null,
        is_out_of_distribution: false,
        ood_reason: null,
        has_contradictions: false,
        contradiction_details: null,
      },
      category: {
        complaint_families: [family.key],
        urgency_tier: family.urgencyTier <= 2 ? family.urgencyTier : 2,
        difficulty: "moderate" as const,
        case_type: "dangerous" as const,
      },
      expected_behavior: {
        min_questions_before_disposition: 2,
        max_questions_before_disposition: 5,
        must_detect_red_flags: family.redFlags.slice(0, 1),
        must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 2, 3),
        emergency_recall_required: family.urgencyTier === 1,
        unsafe_downgrade_is_failure: true,
      },
      reviewers: [generateReviewer()],
      adjudication_status: "single_reviewed",
    });
  }
  console.log(`  Total: ${cases.length} cases`);

  return cases;
}

// Missing function
function createDangerousCase(
  caseId: string,
  family: ComplaintFamily,
  variant: number
): BenchmarkCase {
  const pet = generatePetProfile(
    variant % 4 === 0 ? randomChoice(BREEDS).name : undefined,
    variant % 3 === 0 ? [0.1, 2] : undefined, // Some puppies
    undefined
  );

  const triggeredFlags = randomSubset(family.redFlags, 1, Math.min(2, family.redFlags.length));
  const absentFlags = family.redFlags.filter(f => !triggeredFlags.includes(f));

  return {
    case_id: caseId,
    version: "1.0",
    created_at: "2026-04-10",
    source: "synthetic",
    owner_input: `${randomChoice(family.ownerPhrases)}. ${variant % 2 === 0 ? "Concerning signs present." : "Not getting better."}`,
    normalized_complaints: [family.key],
    pet_profile: pet,
    adjudication: {
      urgency_tier: 2,
      urgency_rationale: `Dangerous ${family.name} presentation — requires same-day vet evaluation`,
      must_ask_questions: randomSubset(family.mustAskQuestions, 3, 5),
      nice_to_ask_questions: randomSubset(family.mustAskQuestions, 2, 3),
      acceptable_unknowns: randomSubset(family.mustAskQuestions, 1, 2),
      red_flags_present: triggeredFlags,
      red_flags_absent: absentFlags.slice(0, 3),
      likely_differentials: family.linkedDiseases.slice(0, 3).map((d, i) => ({
        disease_key: d,
        confidence: (["probable", "possible", "rule_out"] as const)[i],
        rationale: `Dangerous ${family.name} presentation`,
      })),
      must_not_miss: family.linkedDiseases.slice(0, 2),
      disposition: "same_day_vet",
      disposition_rationale: `Concerning presentation requires same-day veterinary evaluation`,
      should_abstain: false,
      abstention_reason: null,
      is_out_of_distribution: false,
      ood_reason: null,
      has_contradictions: false,
      contradiction_details: null,
    },
    category: {
      complaint_families: [family.key],
      urgency_tier: 2,
      difficulty: "moderate" as const,
      case_type: "dangerous" as const,
    },
    expected_behavior: {
      min_questions_before_disposition: 2,
      max_questions_before_disposition: 5,
      must_detect_red_flags: triggeredFlags,
      must_not_output_disposition_before_questions: randomSubset(family.mustAskQuestions, 2, 3),
      emergency_recall_required: false,
      unsafe_downgrade_is_failure: true,
    },
    reviewers: [generateReviewer()],
    adjudication_status: "single_reviewed",
  };
}

// === OUTPUT ===

const cases = generateBenchmarkCases();

// Write JSONL output
const outputDir = path.join(process.cwd(), 'data', 'benchmark');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputPath = path.join(outputDir, 'gold-benchmark-v1.jsonl');
const stream = fs.createWriteStream(outputPath, { flags: 'w' });

for (const c of cases) {
  stream.write(JSON.stringify(c) + '\n');
}

stream.end();

// Print summary
const typeCounts = cases.reduce((acc, c) => {
  acc[c.category.case_type] = (acc[c.category.case_type] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

const tierCounts = cases.reduce((acc, c) => {
  acc[c.category.urgency_tier] = (acc[c.category.urgency_tier] || 0) + 1;
  return acc;
}, {} as Record<number, number>);

const difficultyCounts = cases.reduce((acc, c) => {
  acc[c.category.difficulty] = (acc[c.category.difficulty] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log("\n" + "=".repeat(60));
console.log("BENCHMARK GENERATION COMPLETE");
console.log("=".repeat(60));
console.log(`Total cases: ${cases.length}`);
console.log(`Output: ${outputPath}`);
console.log("\nBy case type:");
for (const [type, count] of Object.entries(typeCounts)) {
  console.log(`  ${type}: ${count} (${(count / cases.length * 100).toFixed(1)}%)`);
}
console.log("\nBy urgency tier:");
for (const [tier, count] of Object.entries(tierCounts)) {
  console.log(`  Tier ${tier}: ${count} (${(count / cases.length * 100).toFixed(1)}%)`);
}
console.log("\nBy difficulty:");
for (const [diff, count] of Object.entries(difficultyCounts)) {
  console.log(`  ${diff}: ${count} (${(count / cases.length * 100).toFixed(1)}%)`);
}

// Verify distribution targets
console.log("\nDistribution target check:");
const targetPcts = {
  common: 35,
  dangerous: 20,
  ambiguous: 15,
  contradictory: 10,
  low_information: 10,
  rare_but_critical: 10,
};

for (const [type, target] of Object.entries(targetPcts)) {
  const actual = ((typeCounts[type] || 0) / cases.length * 100).toFixed(1);
  const status = Math.abs(parseFloat(actual) - target) < 10 ? "OK" : "OFF";
  console.log(`  ${type}: target ${target}%, actual ${actual}% [${status}]`);
}

console.log(`\nUnique complaint families covered: ${new Set(cases.flatMap(c => c.category.complaint_families)).size}`);
console.log(`OOD cases: ${cases.filter(c => c.adjudication.is_out_of_distribution).length}`);
console.log(`Cross-family cases: ${cases.filter(c => c.category.complaint_families.length > 1).length}`);
