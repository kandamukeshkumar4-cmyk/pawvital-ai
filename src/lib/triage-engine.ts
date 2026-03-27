// =============================================================================
// TRIAGE ENGINE — Orchestration Logic
// Manages session state, calculates probabilities, determines next questions
// The LLM NEVER decides what to ask — this code does.
// =============================================================================

import {
  SYMPTOM_MAP,
  DISEASE_DB,
  BREED_MODIFIERS,
  FOLLOW_UP_QUESTIONS,
  type BreedModifiers,
  type DiseaseEntry,
} from "./clinical-matrix";

// --- Session State ---

export interface TriageSession {
  known_symptoms: string[]; // Normalized symptom keys from SYMPTOM_MAP
  answered_questions: string[]; // Question IDs already answered
  extracted_answers: Record<string, string | boolean | number>; // Extracted data
  red_flags_triggered: string[]; // Red flags detected
  candidate_diseases: string[]; // Union of linked diseases from all symptoms
  body_systems_involved: string[];
  last_question_asked?: string;
  last_uploaded_image_hash?: string;
  image_enrichment_hash?: string;
  gate_cache_key?: string;
  gate_warning_reason?: "blurry" | "low_resolution" | "not_close_up";
  gate_warning_label?: string;
  gate_warning_score?: number;
  vision_cache_key?: string;
  vision_symptoms?: string[];
  vision_red_flags?: string[];
  vision_analysis?: string;
  vision_severity?: "normal" | "needs_review" | "urgent";
  effective_breed?: string;
  image_inferred_breed?: string;
  image_inferred_breed_confidence?: number;
  breed_profile_name?: string;
  breed_profile_summary?: string;
  roboflow_skin_summary?: string;
  roboflow_skin_labels?: string[];
  case_memory?: StructuredCaseMemory;
}

export interface StructuredCaseMemory {
  turn_count: number;
  chief_complaints: string[];
  active_focus_symptoms: string[];
  confirmed_facts: Record<string, string | boolean | number>;
  image_findings: string[];
  red_flag_notes: string[];
  unresolved_question_ids: string[];
  timeline_notes: string[];
  latest_owner_turn?: string;
  compressed_summary?: string;
  compression_model?: string;
  last_compressed_turn?: number;
}

export interface PetProfile {
  name: string;
  species?: string;
  breed: string;
  age_years: number;
  weight: number;
  existing_conditions?: string[];
  medications?: string[];
}

export interface DiseaseProbability {
  disease_key: string;
  name: string;
  medical_term: string;
  raw_score: number;
  breed_multiplier: number;
  age_multiplier: number;
  final_score: number;
  urgency: string;
  key_differentiators: string[];
  typical_tests: string[];
  typical_home_care: string[];
}

// --- Core Functions ---

export function createSession(): TriageSession {
  return {
    known_symptoms: [],
    answered_questions: [],
    extracted_answers: {},
    red_flags_triggered: [],
    candidate_diseases: [],
    body_systems_involved: [],
    case_memory: {
      turn_count: 0,
      chief_complaints: [],
      active_focus_symptoms: [],
      confirmed_facts: {},
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: [],
      timeline_notes: [],
    },
  };
}

/**
 * Given known symptoms, return all required follow-up questions
 * minus ones already answered.
 */
export function getMissingQuestions(session: TriageSession): string[] {
  const allRequired = new Set<string>();

  for (const symptom of session.known_symptoms) {
    const entry = SYMPTOM_MAP[symptom];
    if (!entry) continue;

    for (const qId of entry.follow_up_questions) {
      // Only add critical questions first, then non-critical
      const qDef = FOLLOW_UP_QUESTIONS[qId];
      if (qDef && qDef.critical) {
        allRequired.add(qId);
      }
    }
  }

  // Filter out already answered
  const missing = [...allRequired].filter(
    (q) => !session.answered_questions.includes(q)
  );

  // If no critical questions remain, add non-critical ones
  if (missing.length === 0) {
    for (const symptom of session.known_symptoms) {
      const entry = SYMPTOM_MAP[symptom];
      if (!entry) continue;
      for (const qId of entry.follow_up_questions) {
        const qDef = FOLLOW_UP_QUESTIONS[qId];
        if (qDef && !qDef.critical && !session.answered_questions.includes(qId)) {
          allRequired.add(qId);
        }
      }
    }
    return [...allRequired].filter(
      (q) => !session.answered_questions.includes(q)
    );
  }

  return missing;
}

/**
 * Get the next best question to ask.
 * Prioritizes: critical questions first, then by most diseases it serves.
 */
export function getNextQuestion(session: TriageSession): string | null {
  const missing = getMissingQuestions(session);
  if (missing.length === 0) return null;

  // Score each question by how many candidate diseases it helps narrow down
  const scored = missing.map((qId, index) => {
    let relevanceScore = 0;
    const qDef = FOLLOW_UP_QUESTIONS[qId];

    // Higher score for critical questions
    if (qDef?.critical) relevanceScore += 10;

    // Count how many current symptoms reference this question, weighted by urgency
    for (const symptom of session.known_symptoms) {
      const entry = SYMPTOM_MAP[symptom];
      if (entry?.follow_up_questions.includes(qId)) {
        relevanceScore += 5 + getSymptomPriorityScore(symptom);
      }
    }

    return { qId, score: relevanceScore, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.qId || null;
}

/**
 * Update session with newly extracted symptoms.
 */
export function addSymptoms(
  session: TriageSession,
  symptoms: string[]
): TriageSession {
  const updated = { ...session };

  for (const symptom of symptoms) {
    const normalized = normalizeSymptom(symptom);
    if (normalized && !updated.known_symptoms.includes(normalized)) {
      updated.known_symptoms.push(normalized);

      const entry = SYMPTOM_MAP[normalized];
      if (entry) {
        // Add candidate diseases
        for (const disease of entry.linked_diseases) {
          if (!updated.candidate_diseases.includes(disease)) {
            updated.candidate_diseases.push(disease);
          }
        }
        // Add body systems
        for (const system of entry.body_systems) {
          if (!updated.body_systems_involved.includes(system)) {
            updated.body_systems_involved.push(system);
          }
        }
        // Check red flags
        for (const flag of entry.red_flags) {
          if (
            session.extracted_answers[flag] === true &&
            !updated.red_flags_triggered.includes(flag)
          ) {
            updated.red_flags_triggered.push(flag);
          }
        }
      }
    }
  }

  return updated;
}

/**
 * Record an answer to a follow-up question.
 */
export function recordAnswer(
  session: TriageSession,
  questionId: string,
  value: string | boolean | number
): TriageSession {
  const updated = { ...session };
  if (!updated.answered_questions.includes(questionId)) {
    updated.answered_questions.push(questionId);
  }
  updated.extracted_answers[questionId] = value;

  // Check if this answer triggers any red flags
  checkRedFlags(updated);

  return updated;
}

/**
 * Check all known symptoms' red flags against current answers.
 */
function checkRedFlags(session: TriageSession): void {
  for (const symptom of session.known_symptoms) {
    const entry = SYMPTOM_MAP[symptom];
    if (!entry) continue;
    for (const flag of entry.red_flags) {
      if (
        isRedFlagTriggered(flag, session) &&
        !session.red_flags_triggered.includes(flag)
      ) {
        session.red_flags_triggered.push(flag);
      }
    }
  }
}

function isRedFlagTriggered(flag: string, session: TriageSession): boolean {
  const answers = session.extracted_answers;

  if (answers[flag] === true || Object.values(answers).includes(flag)) {
    return true;
  }

  switch (flag) {
    case "blue_gums":
      return answers.gum_color === "blue";
    case "pale_gums":
      return answers.gum_color === "pale_white";
    case "breathing_onset_sudden":
      return answers.breathing_onset === "sudden";
    case "large_blood_volume":
      return answers.blood_amount === "mostly_blood";
    case "rat_poison_confirmed":
      return (
        answers.rat_poison_access === true ||
        matchesExposureText(answers.toxin_exposure, [
          "rat poison",
          "rodenticide",
          "mouse bait",
          "bait station",
          "warfarin",
          "brodifacoum",
          "bromadiolone",
        ])
      );
    case "balance_loss":
      return answers.balance_issues === true;
    case "head_tilt_sudden":
      return answers.head_tilt === true;
    case "no_water_24h":
      return answers.water_intake === "not_drinking";
    case "toxin_confirmed":
      return matchesExposureText(answers.toxin_exposure, [
        "rat poison",
        "rodenticide",
        "xylitol",
        "chocolate",
        "grapes",
        "raisins",
        "antifreeze",
        "ibuprofen",
        "naproxen",
        "acetaminophen",
        "marijuana",
      ]);
    case "rapid_onset_distension":
      return matchesExposureText(answers.abdomen_onset, [
        "sudden",
        "suddenly",
        "today",
        "this morning",
        "last night",
        "hours",
        "just started",
      ]);
    case "unresponsive":
      return answers.consciousness_level === "unresponsive";
    default:
      return false;
  }
}

function matchesExposureText(
  value: string | boolean | number | undefined,
  keywords: string[]
): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

/**
 * Calculate disease probabilities using the matrix + breed + age modifiers.
 * This is the core scoring algorithm — NO LLM involved.
 */
export function calculateProbabilities(
  session: TriageSession,
  pet: PetProfile
): DiseaseProbability[] {
  const breedMods = getBreedModifiers(pet.breed);
  const ageCategory =
    pet.age_years <= 1 ? "puppy" : pet.age_years >= 7 ? "senior" : "adult";

  const results: DiseaseProbability[] = [];

  for (const diseaseKey of session.candidate_diseases) {
    const disease = DISEASE_DB[diseaseKey];
    if (!disease) continue;

    // Base probability
    let score = disease.base_probability;

    // Breed multiplier
    const breedMult = breedMods[diseaseKey] || 1.0;
    score *= breedMult;

    // Age multiplier
    const ageMult = disease.age_modifier[ageCategory];
    score *= ageMult;

    // Symptom count bonus — more matching symptoms = higher confidence
    let symptomMatches = 0;
    for (const symptom of session.known_symptoms) {
      const entry = SYMPTOM_MAP[symptom];
      if (entry?.linked_diseases.includes(diseaseKey)) {
        symptomMatches++;
      }
    }
    if (symptomMatches > 1) {
      score *= 1.0 + (symptomMatches - 1) * 0.3; // 30% bonus per extra symptom
    }

    // Answer-based adjustments
    score = applyAnswerModifiers(score, diseaseKey, session);

    results.push({
      disease_key: diseaseKey,
      name: disease.name,
      medical_term: disease.medical_term,
      raw_score: disease.base_probability,
      breed_multiplier: breedMult,
      age_multiplier: ageMult,
      final_score: score,
      urgency: disease.urgency,
      key_differentiators: disease.key_differentiators,
      typical_tests: disease.typical_tests,
      typical_home_care: disease.typical_home_care,
    });
  }

  // Sort by final score descending
  results.sort((a, b) => b.final_score - a.final_score);

  return results;
}

/**
 * Apply answer-specific modifiers to disease scores.
 * E.g., "worse after rest" boosts OA/hip dysplasia, reduces soft tissue.
 */
function applyAnswerModifiers(
  score: number,
  diseaseKey: string,
  session: TriageSession
): number {
  const answers = session.extracted_answers;

  // Limping-specific modifiers
  if (answers.worse_after_rest === true) {
    if (
      diseaseKey === "hip_dysplasia" ||
      diseaseKey === "osteoarthritis"
    ) {
      score *= 1.5; // Classic OA/HD pattern
    }
    if (diseaseKey === "soft_tissue_injury") {
      score *= 0.7; // Less typical for soft tissue
    }
  }

  if (answers.weight_bearing === "non_weight_bearing") {
    if (diseaseKey === "ccl_rupture" || diseaseKey === "bone_cancer") {
      score *= 1.8;
    }
    if (
      diseaseKey === "osteoarthritis" ||
      diseaseKey === "soft_tissue_injury"
    ) {
      score *= 0.5;
    }
  }

  if (answers.limping_onset === "sudden" || String(answers.trauma_history || "").includes("sudden")) {
    if (
      diseaseKey === "ccl_rupture" ||
      diseaseKey === "soft_tissue_injury"
    ) {
      score *= 1.3;
    }
    if (diseaseKey === "osteoarthritis") {
      score *= 0.5; // OA is gradual
    }
  }

  if (answers.prior_limping === true) {
    if (
      diseaseKey === "osteoarthritis" ||
      diseaseKey === "hip_dysplasia" ||
      diseaseKey === "patellar_luxation"
    ) {
      score *= 1.5;
    }
  }

  if (answers.warmth_present === true) {
    if (
      diseaseKey === "soft_tissue_injury" ||
      diseaseKey === "impa" ||
      diseaseKey === "ccl_rupture"
    ) {
      score *= 1.3; // Inflammation indicator
    }
  }

  if (answers.swelling_present === true) {
    if (diseaseKey === "bone_cancer" || diseaseKey === "impa") {
      score *= 1.5;
    }
  }

  // GI-specific modifiers
  if (answers.vomit_blood === true) {
    if (
      diseaseKey === "foreign_body" ||
      diseaseKey === "toxin_ingestion"
    ) {
      score *= 2.0;
    }
    if (diseaseKey === "gastroenteritis") {
      score *= 0.7;
    }
  }

  if (answers.unproductive_retching === true) {
    if (diseaseKey === "gdv") {
      score *= 5.0; // Pathognomonic for GDV
    }
  }

  if (String(answers.toxin_exposure || "").length > 5) {
    // Non-empty toxin exposure
    if (diseaseKey === "toxin_ingestion") {
      score *= 3.0;
    }
  }

  // Respiratory modifiers
  if (answers.cough_type === "dry_honking") {
    if (diseaseKey === "kennel_cough" || diseaseKey === "collapsing_trachea") {
      score *= 1.8;
    }
  }

  if (answers.exercise_intolerance === true) {
    if (diseaseKey === "heart_disease") {
      score *= 1.8;
    }
  }

  if (answers.gum_color === "blue" || answers.gum_color === "pale_white") {
    // Any disease becomes emergency
    score *= 2.0;
  }

  // Drinking more modifiers
  if (answers.urination_frequency === true) {
    if (
      diseaseKey === "diabetes" ||
      diseaseKey === "cushings_disease" ||
      diseaseKey === "kidney_disease"
    ) {
      score *= 1.5;
    }
  }

  // Wound / skin modifiers
  if (answers.wound_discharge === "pus" || answers.wound_discharge === "mixed") {
    if (diseaseKey === "wound_infection" || diseaseKey === "abscess") {
      score *= 2.0; // Strong indicator of infection
    }
  }

  if (answers.wound_odor === true) {
    if (diseaseKey === "wound_infection" || diseaseKey === "abscess") {
      score *= 1.8; // Odor = infection
    }
  }

  if (answers.wound_licking === true) {
    if (diseaseKey === "hot_spots") {
      score *= 2.0; // Self-trauma is the defining feature of hot spots
    }
  }

  if (String(answers.wound_duration || "").match(/week|month|long/i)) {
    if (diseaseKey === "skin_mass" || diseaseKey === "autoimmune_skin") {
      score *= 1.5; // Chronic = more likely neoplastic or autoimmune
    }
    if (diseaseKey === "laceration") {
      score *= 0.5; // Acute trauma doesn't last weeks
    }
  }

  if (String(answers.wound_duration || "").match(/today|hour|just|sudden/i)) {
    if (diseaseKey === "laceration" || diseaseKey === "abscess") {
      score *= 1.5; // Acute presentation
    }
    if (diseaseKey === "skin_mass" || diseaseKey === "autoimmune_skin") {
      score *= 0.5; // Masses/autoimmune don't appear suddenly
    }
  }

  return score;
}

/**
 * Determine if we have enough data to generate a diagnosis.
 * Returns true when all critical questions for known symptoms are answered.
 */
export function isReadyForDiagnosis(session: TriageSession): boolean {
  // Always ready if red flags are triggered
  if (session.red_flags_triggered.length > 0) return true;

  // NEVER ready if no symptoms identified yet
  if (session.known_symptoms.length === 0) return false;

  // NEVER ready if fewer than 3 questions have been answered
  // A real vet always asks at least a few follow-up questions
  if (session.answered_questions.length < 3) return false;

  // Check if all critical questions are answered
  const missing = getMissingQuestions(session);
  const criticalMissing = missing.filter((qId) => {
    const qDef = FOLLOW_UP_QUESTIONS[qId];
    return qDef?.critical;
  });

  return criticalMissing.length === 0;
}

/**
 * Build the data package that gets injected into the final LLM prompt.
 * This is what makes the diagnosis accurate — NOT the LLM's own knowledge.
 */
export function buildDiagnosisContext(
  session: TriageSession,
  pet: PetProfile
): {
  probabilities: DiseaseProbability[];
  top5: DiseaseProbability[];
  breed_risk_summary: string;
  symptom_summary: string;
  answer_summary: string;
  red_flags: string[];
  body_systems: string[];
  highest_urgency: string;
} {
  const probs = calculateProbabilities(session, pet);
  const top5 = probs.slice(0, 5);

  // Build breed risk summary
  const breedMods = getBreedModifiers(pet.breed);
  const highRiskDiseases = Object.entries(breedMods)
    .filter(([, mult]) => mult >= 1.5)
    .sort((a, b) => b[1] - a[1])
    .map(([disease, mult]) => {
      const db = DISEASE_DB[disease];
      return `${db?.name || disease}: ${mult}x breed risk`;
    });

  const breedRiskSummary =
    highRiskDiseases.length > 0
      ? `${pet.breed} has elevated risk for: ${highRiskDiseases.join("; ")}`
      : `No specific elevated breed risks documented for ${pet.breed}`;

  // Symptom summary
  const symptomSummary = session.known_symptoms
    .map((s) => {
      const entry = SYMPTOM_MAP[s];
      return `${s} (systems: ${entry?.body_systems.join(", ") || "unknown"})`;
    })
    .join("; ");

  // Answer summary
  const answerSummary = Object.entries(session.extracted_answers)
    .map(([key, val]) => {
      const qDef = FOLLOW_UP_QUESTIONS[key];
      return `${qDef?.question_text || key}: ${val}`;
    })
    .join("\n");

  // Highest urgency from top candidates
  const urgencyOrder = ["emergency", "high", "moderate", "low"];
  let highestUrgency = "low";
  for (const p of top5) {
    if (urgencyOrder.indexOf(p.urgency) < urgencyOrder.indexOf(highestUrgency)) {
      highestUrgency = p.urgency;
    }
  }

  // Red flags override urgency
  if (session.red_flags_triggered.length > 0) {
    highestUrgency = "emergency";
  }

  return {
    probabilities: probs,
    top5,
    breed_risk_summary: breedRiskSummary,
    symptom_summary: symptomSummary,
    answer_summary: answerSummary,
    red_flags: session.red_flags_triggered,
    body_systems: session.body_systems_involved,
    highest_urgency: highestUrgency,
  };
}

function getBreedModifiers(breed: string): BreedModifiers {
  if (BREED_MODIFIERS[breed]) return BREED_MODIFIERS[breed];

  const normalized = normalizeBreedKey(breed);
  for (const [key, modifiers] of Object.entries(BREED_MODIFIERS)) {
    const normalizedKey = normalizeBreedKey(key);
    if (
      normalizedKey === normalized ||
      normalizedKey.includes(normalized) ||
      normalized.includes(normalizedKey)
    ) {
      return modifiers;
    }
  }

  return {};
}

export function getSymptomPriorityScore(symptom: string): number {
  const entry = SYMPTOM_MAP[symptom];
  if (!entry) return 0;

  const urgencyWeights: Record<DiseaseEntry["urgency"], number> = {
    low: 0,
    moderate: 4,
    high: 8,
    emergency: 12,
  };

  let maxUrgencyWeight = 0;
  for (const diseaseKey of entry.linked_diseases) {
    const urgency = DISEASE_DB[diseaseKey]?.urgency;
    if (!urgency) continue;
    maxUrgencyWeight = Math.max(maxUrgencyWeight, urgencyWeights[urgency]);
  }

  return maxUrgencyWeight + Math.min(entry.red_flags.length, 3);
}

function normalizeBreedKey(breed: string): string {
  return breed.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// --- Helpers ---

/**
 * Normalize a free-text symptom string to a SYMPTOM_MAP key.
 */
function normalizeSymptom(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  const mapping: Record<string, string> = {
    vomiting: "vomiting",
    vomit: "vomiting",
    throwing_up: "vomiting",
    "throwing up": "vomiting",
    puking: "vomiting",
    "not eating": "not_eating",
    not_eating: "not_eating",
    anorexia: "not_eating",
    "won't eat": "not_eating",
    "wont eat": "not_eating",
    "no appetite": "not_eating",
    "lost appetite": "not_eating",
    "decreased appetite": "not_eating",
    diarrhea: "diarrhea",
    "loose stool": "diarrhea",
    "runny stool": "diarrhea",
    limping: "limping",
    lame: "limping",
    lameness: "limping",
    "can't walk": "limping",
    "trouble walking": "limping",
    favoring: "limping",
    hobbling: "limping",
    lethargy: "lethargy",
    lethargic: "lethargy",
    tired: "lethargy",
    "no energy": "lethargy",
    sluggish: "lethargy",
    "not playful": "lethargy",
    "less active": "lethargy",
    coughing: "coughing",
    cough: "coughing",
    hacking: "coughing",
    gagging: "coughing",
    "difficulty breathing": "difficulty_breathing",
    "hard to breathe": "difficulty_breathing",
    "trouble breathing": "difficulty_breathing",
    panting: "difficulty_breathing",
    wheezing: "difficulty_breathing",
    scratching: "excessive_scratching",
    itching: "excessive_scratching",
    "excessive scratching": "excessive_scratching",
    itchy: "excessive_scratching",
    "drinking more": "drinking_more",
    "drinking more water": "drinking_more",
    "increased thirst": "drinking_more",
    "drinking more water than usual": "drinking_more",
    "polydipsia": "drinking_more",
    trembling: "trembling",
    shaking: "trembling",
    "trembling/shaking": "trembling",
    tremors: "trembling",
    shivering: "trembling",
    "swollen abdomen": "swollen_abdomen",
    bloated: "swollen_abdomen",
    "belly swollen": "swollen_abdomen",
    distended: "swollen_abdomen",
    "blood in stool": "blood_in_stool",
    "bloody stool": "blood_in_stool",
    "blood in poop": "blood_in_stool",
    "eye discharge": "eye_discharge",
    "eyes watering": "eye_discharge",
    "goopy eyes": "eye_discharge",
    "runny eyes": "eye_discharge",
    "ear scratching": "ear_scratching",
    "ear infection": "ear_scratching",
    "shaking head": "ear_scratching",
    "weight loss": "weight_loss",
    "losing weight": "weight_loss",
    "sudden weight loss": "weight_loss",
    "getting thin": "weight_loss",
    // Wound / skin / injury keywords
    wound: "wound_skin_issue",
    wound_skin_issue: "wound_skin_issue",
    cut: "wound_skin_issue",
    laceration: "wound_skin_issue",
    gash: "wound_skin_issue",
    "open wound": "wound_skin_issue",
    scrape: "wound_skin_issue",
    abrasion: "wound_skin_issue",
    abscess: "wound_skin_issue",
    "hot spot": "wound_skin_issue",
    hotspot: "wound_skin_issue",
    sore: "wound_skin_issue",
    lesion: "wound_skin_issue",
    "skin lesion": "wound_skin_issue",
    bump: "wound_skin_issue",
    lump: "wound_skin_issue",
    mass: "wound_skin_issue",
    swelling: "wound_skin_issue",
    rash: "wound_skin_issue",
    "skin infection": "wound_skin_issue",
    bite: "wound_skin_issue",
    "bite wound": "wound_skin_issue",
    "puncture wound": "wound_skin_issue",
    puncture: "wound_skin_issue",
    bleeding: "wound_skin_issue",
    "red skin": "wound_skin_issue",
    redness: "wound_skin_issue",
    inflamed: "wound_skin_issue",
    inflammation: "wound_skin_issue",
    scab: "wound_skin_issue",
    "hair loss": "wound_skin_issue",
    bald: "wound_skin_issue",
    "bald spot": "wound_skin_issue",
    pus: "wound_skin_issue",
    infected: "wound_skin_issue",
    "skin issue": "wound_skin_issue",
    "skin problem": "wound_skin_issue",
    ulcer: "wound_skin_issue",
    blister: "wound_skin_issue",
  };

  // Direct match
  if (mapping[lower]) return mapping[lower];

  // Exact SYMPTOM_MAP keys should win over looser substring matches
  if (SYMPTOM_MAP[lower]) return lower;

  // Partial match
  for (const [key, val] of Object.entries(mapping)) {
    if (lower.includes(key)) return val;
  }

  return null;
}

/**
 * Get the question text for a question ID, suitable for LLM rephrasing.
 */
export function getQuestionText(questionId: string): string {
  return (
    FOLLOW_UP_QUESTIONS[questionId]?.question_text ||
    "Can you tell me more about what you've noticed?"
  );
}

/**
 * Get extraction hints for all questions we want to extract from a user message.
 */
export function getExtractionSchema(session: TriageSession): Record<string, string> {
  const schema: Record<string, string> = {};

  // Always try to extract symptoms
  schema["symptoms"] = "Array of symptoms mentioned (e.g., limping, vomiting, not eating)";

  // Add extraction hints for all unanswered questions related to known symptoms
  for (const symptom of session.known_symptoms) {
    const entry = SYMPTOM_MAP[symptom];
    if (!entry) continue;
    for (const qId of entry.follow_up_questions) {
      if (!session.answered_questions.includes(qId)) {
        const qDef = FOLLOW_UP_QUESTIONS[qId];
        if (qDef) {
          schema[qId] = qDef.extraction_hint;
        }
      }
    }
  }

  return schema;
}
