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
import type {
  ConsultOpinion,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
  ShadowComparisonRecord,
  ServiceTimeoutRecord,
  SidecarObservation,
  SupportedImageDomain,
  VisionClinicalEvidence,
  VisionPreprocessResult,
} from "./clinical-evidence";
import type { ModelBudgetState } from "./model-budget";

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
  latest_image_domain?: SupportedImageDomain;
  latest_image_body_region?: string;
  latest_image_quality?: string;
  latest_preprocess?: VisionPreprocessResult;
  latest_visual_evidence?: VisionClinicalEvidence;
  latest_retrieval_bundle?: {
    textChunks: RetrievalTextEvidence[];
    imageMatches: RetrievalImageEvidence[];
    rerankScores: number[];
    sourceCitations: string[];
  };
  latest_consult_opinion?: ConsultOpinion;
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
  clarification_reasons?: Record<string, string>;
  pending_question_id?: string;
  question_asked_counts?: Record<string, number>;
  clarification_attempts?: Record<string, number>;
  answer_source_messages?: Record<string, string>;
  timeline_notes: string[];
  visual_evidence: VisionClinicalEvidence[];
  retrieval_evidence: Array<RetrievalTextEvidence | RetrievalImageEvidence>;
  consult_opinions: ConsultOpinion[];
  evidence_chain: string[];
  service_timeouts: ServiceTimeoutRecord[];
  service_observations: SidecarObservation[];
  shadow_comparisons: ShadowComparisonRecord[];
  ambiguity_flags: string[];
  model_budget_state?: ModelBudgetState;
  latest_owner_turn?: string;
  compressed_summary?: string;
  compression_model?: string;
  last_compressed_turn?: number;
  /** Serialized ClinicalCaseState JSON — protected from compression (VET-1581) */
  clinical_case_state?: string;
  /** Planner shortReason for current question (VET-1576) */
  asking_because?: string;
  /** Doc Intel vet record summary when uploaded */
  vet_record_context?: string;
  /**
   * Owner-reported daily health-log summary (recent trends). Supportive
   * narrative context for the LLM report only — never feeds deterministic
   * urgency / red-flag logic.
   */
  daily_log_context?: string;
}

export interface PetProfile {
  /**
   * Stable DB pet id when known (the client sends the active pet, which carries
   * it). Optional and purely carried through — deterministic clinical logic
   * never reads it. Used only to give the Dog Brain report context an exact
   * pet_id and skip the ambiguous name lookup.
   */
  id?: string;
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
      clarification_reasons: {},
      pending_question_id: undefined,
      question_asked_counts: {},
      clarification_attempts: {},
      answer_source_messages: {},
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: [],
      service_timeouts: [],
      service_observations: [],
      shadow_comparisons: [],
      ambiguity_flags: [],
      model_budget_state: {
        callCounts: {},
        circuitOpen: {},
      },
    },
  };
}

// --- Question Flow Tuning ---
// A real vet asks at least a few follow-ups before concluding, and keeps
// gathering context (not just clearing red flags) up to a bounded ceiling.
const MIN_QUESTIONS_BEFORE_READY = 3;
const MAX_QUESTIONS_BEFORE_READY = 12;
/**
 * Generic open-ended capture turn, offered once when the structured follow-ups
 * run out — see getNextQuestion / isReadyForDiagnosis. The entry itself lives in
 * clinical-matrix's FOLLOW_UP_QUESTIONS.
 */
const ADDITIONAL_CONTEXT_QUESTION_ID = "additional_context";

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
  const hasSymptoms = session.known_symptoms.length > 0;
  const answeredCount = session.answered_questions.length;

  // Hard ceiling: never keep asking past the bounded maximum.
  if (answeredCount >= MAX_QUESTIONS_BEFORE_READY) return null;

  // Ask the trajectory question once — after the minimum history and not yet asked.
  const sufficientHistory = answeredCount >= MIN_QUESTIONS_BEFORE_READY;
  const trajectoryNotAsked =
    !session.answered_questions.includes("condition_progression") &&
    !session.last_question_asked?.includes("condition_progression");
  const hasPendingCriticalQuestion = missing.some(
    (qId) => FOLLOW_UP_QUESTIONS[qId]?.critical
  );

  // Inline readiness check — avoids mutual recursion with isReadyForDiagnosis.
  // Ask trajectory when there is still more to gather (missing follow-ups or
  // the capture turn hasn't been offered), mirroring what isReadyForDiagnosis
  // would return without calling getNextQuestion.
  const captureAlreadyOfferedForTrajectory =
    session.answered_questions.includes(ADDITIONAL_CONTEXT_QUESTION_ID) ||
    session.last_question_asked === ADDITIONAL_CONTEXT_QUESTION_ID;
  if (
    hasSymptoms &&
    sufficientHistory &&
    trajectoryNotAsked &&
    !hasPendingCriticalQuestion &&
    (missing.length > 0 || !captureAlreadyOfferedForTrajectory)
  ) {
    return "condition_progression";
  }

  // Prefer the most informative structured follow-up still missing. The pool
  // includes non-critical follow-ups (getMissingQuestions surfaces them once the
  // criticals are answered), so we keep narrowing instead of stopping early.
  if (missing.length > 0) {
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

  // Structured follow-ups exhausted: offer one open-ended capture turn so an
  // owner who still has more to share isn't cut off abruptly. Asked at most once.
  const captureAlreadyOffered =
    session.answered_questions.includes(ADDITIONAL_CONTEXT_QUESTION_ID) ||
    session.last_question_asked === ADDITIONAL_CONTEXT_QUESTION_ID;
  if (hasSymptoms && !captureAlreadyOffered) {
    return ADDITIONAL_CONTEXT_QUESTION_ID;
  }

  return null;
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

  checkRedFlags(updated);

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

  for (const flag of getCompositeEmergencyRedFlags(session)) {
    if (!session.red_flags_triggered.includes(flag)) {
      session.red_flags_triggered.push(flag);
    }
  }

  // De-escalation signal — owner reports improvement; record in timeline but do not add a red flag.
  if (
    getUrgencyFromTrajectory(String(session.extracted_answers.condition_progression ?? "")) === "deescalate" &&
    session.case_memory
  ) {
    const note = "Owner reports condition is improving (de-escalation signal).";
    if (!session.case_memory.timeline_notes.includes(note)) {
      session.case_memory.timeline_notes.push(note);
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
    case "collapse":
      return answers.consciousness_level === "unresponsive";
    case "breathing_onset_sudden":
      return answers.breathing_onset === "sudden";
    case "collapse_after_exercise":
      return (
        answers.onset_during_exercise === "during" &&
        isRedFlagTriggered("collapse", session)
      );
    case "blue_gums_after_exercise":
      return (
        answers.onset_during_exercise === "during" &&
        answers.gum_color === "blue"
      );
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
    case "face_swelling":
      return answers.face_swelling === true;
    case "hives_with_breathing":
      return answers.hives_with_breathing === true;
    case "hives_widespread":
      return answers.hives_with_breathing === true;
    case "inability_to_stand":
      return (
        answers.trauma_mobility === "inability_to_stand" ||
        answers.hind_limb_function === "inability_to_stand"
      );
    case "paralysis":
      return (
        answers.trauma_mobility === "inability_to_stand" ||
        answers.hind_limb_function === "inability_to_stand"
      );
    case "active_bleeding_trauma":
      return answers.active_bleeding_trauma === true;
    case "no_water_24h":
      return answers.water_intake === "not_drinking";
    case "not_drinking":
      return answers.water_intake === "not_drinking";
    case "toxin_confirmed":
      return hasAnyExposureEvidence(session, TOXIN_EXPOSURE_KEYWORDS);
    case "collapse_in_heat":
      return (
        session.known_symptoms.includes("heat_intolerance") &&
        answers.consciousness_level === "unresponsive"
      );
    case "brick_red_gums":
      return (
        session.known_symptoms.includes("heat_intolerance") &&
        answers.gum_color === "bright_red"
      );
    case "vomiting_overheating":
      return (
        session.known_symptoms.includes("heat_intolerance") &&
        answers.vomiting_present === true
      );
    case "blood_in_both":
      return answers.blood_in_either === true;
    case "puppy_vomiting_diarrhea":
      return (
        session.known_symptoms.includes("vomiting_diarrhea_combined") &&
        answers.blood_in_either === true
      );
    case "rapid_onset_distension":
      return matchesExposureText(answers.abdomen_onset, [
        "sudden",
        "suddenly",
        "today",
        "this morning",
        "last night",
        "hours",
        "just started",
      ]) ||
      (session.known_symptoms.includes("swollen_abdomen") &&
        answers.restlessness === true) ||
      (session.known_symptoms.includes("swollen_abdomen") &&
        answers.abdomen_pain === true);
    case "unresponsive":
      return answers.consciousness_level === "unresponsive";
    default:
      return false;
  }
}

const RAT_POISON_KEYWORDS = [
  "rat poison",
  "rodenticide",
  "mouse bait",
  "bait station",
  "warfarin",
  "brodifacoum",
  "bromadiolone",
];

const GENERAL_TOXIN_KEYWORDS = [
  "xylitol",
  "chocolate",
  "grapes",
  "raisins",
  "antifreeze",
  "ibuprofen",
  "naproxen",
  "acetaminophen",
  "marijuana",
  "cannabis",
];

const CHEMICAL_EXPOSURE_KEYWORDS = [
  "chemical",
  "drain cleaner",
  "bleach",
  "oven cleaner",
  "detergent",
  "battery acid",
  "muriatic acid",
  "acid burn",
  "alkali",
  "caustic",
  "solvent",
];

const TOXIN_EXPOSURE_KEYWORDS = [
  ...RAT_POISON_KEYWORDS,
  ...GENERAL_TOXIN_KEYWORDS,
  ...CHEMICAL_EXPOSURE_KEYWORDS,
];

const BLEEDING_KEYWORDS = [
  "bleeding",
  "bleed",
  "bloody",
  "blood from gums",
  "gums bleeding",
  "coughing blood",
];

const MAJOR_TRAUMA_KEYWORDS = [
  "hit by car",
  "run over",
  "struck by car",
  "vehicle",
  "major trauma",
];

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

function answerTextIncludes(
  answers: Record<string, string | boolean | number>,
  questionIds: string[],
  keywords: string[]
): boolean {
  return questionIds.some((questionId) =>
    matchesExposureText(answers[questionId], keywords)
  );
}

function hasAnyExposureEvidence(
  session: TriageSession,
  keywords: string[]
): boolean {
  const answers = session.extracted_answers;
  return (
    answerTextIncludes(
      answers,
      [
        "toxin_exposure",
        "reaction_symptoms",
        "medication_name",
        "current_medications",
      ],
      keywords
    ) || answers.rat_poison_access === true
  );
}

function hasBleedingEvidence(session: TriageSession): boolean {
  const answers = session.extracted_answers;
  return (
    answers.active_bleeding_trauma === true ||
    answers.bleeding_present === true ||
    answers.vomit_blood === true ||
    answers.blood_in_either === true ||
    (typeof answers.blood_amount === "string" &&
      ["streaks", "mixed_in", "mostly_blood"].includes(answers.blood_amount)) ||
    answerTextIncludes(
      answers,
      ["reaction_symptoms", "wound_discharge", "wound_color"],
      BLEEDING_KEYWORDS
    )
  );
}

function hasMajorTraumaEvidence(session: TriageSession): boolean {
  const answers = session.extracted_answers;
  return (
    session.known_symptoms.includes("trauma") ||
    answerTextIncludes(
      answers,
      ["trauma_mechanism", "trauma_timeframe", "trauma_area"],
      MAJOR_TRAUMA_KEYWORDS
    ) ||
    answers.trauma_mechanism === "hit_by_car"
  );
}

// ---------------------------------------------------------------------------
// Synergy rules — symptom *combinations* that together indicate emergency
// even when individual signals are moderate in isolation.
// ---------------------------------------------------------------------------

interface SynergyRule {
  id: string;
  requiredSymptoms: string[];
  requiredAnswers?: Array<{ key: string; value: string | boolean }>;
  flag: string;
  label: string;
}

const SYNERGY_RULES: SynergyRule[] = [
  {
    id: "gdv_triad",
    requiredSymptoms: ["swollen_abdomen", "vomiting"],
    requiredAnswers: [{ key: "retching_present", value: true }],
    flag: "gdv_triad_present",
    label: "GDV triad: vomiting + distended belly + retching",
  },
  {
    id: "gdv_pair",
    requiredSymptoms: ["swollen_abdomen"],
    requiredAnswers: [
      { key: "unproductive_retching", value: true },
    ],
    flag: "gdv_triad_present",
    label: "GDV pair: distended belly + non-productive retching",
  },
  {
    id: "multi_sign_shock",
    requiredSymptoms: ["lethargy"],
    requiredAnswers: [
      { key: "gum_color", value: "pale_white" },
    ],
    flag: "multi_sign_shock_pattern",
    label: "Shock pattern: pale gums + lethargy",
  },
  {
    id: "respiratory_crisis",
    requiredSymptoms: ["coughing_breathing_combined"],
    requiredAnswers: [{ key: "breathing_effort", value: "severe" }],
    flag: "respiratory_crisis_combo",
    label: "Respiratory crisis: combined coughing/breathing + severe effort",
  },
  {
    id: "spinal_herniation",
    requiredSymptoms: ["limping"],
    requiredAnswers: [
      { key: "back_pain_yelp", value: true },
    ],
    flag: "spinal_herniation_pattern",
    label: "Spinal pattern: limping + yelping on back touch",
  },
  {
    id: "toxin_vomiting",
    requiredSymptoms: ["vomiting"],
    requiredAnswers: [{ key: "toxin_ingestion_confirmed", value: true }],
    flag: "toxin_plus_vomiting",
    label: "Toxin + vomiting: active GI absorption risk",
  },
];

function getSymptomSynergyFlags(session: TriageSession): string[] {
  const triggered: string[] = [];
  const answers = session.extracted_answers;

  for (const rule of SYNERGY_RULES) {
    const hasAllSymptoms = rule.requiredSymptoms.every((s) =>
      session.known_symptoms.includes(s)
    );
    if (!hasAllSymptoms) continue;

    const hasAllAnswers = !rule.requiredAnswers || rule.requiredAnswers.every(
      ({ key, value }) => answers[key] === value
    );
    if (!hasAllAnswers) continue;

    if (!triggered.includes(rule.flag)) {
      triggered.push(rule.flag);
    }
  }

  return triggered;
}

export function getSynergyFlags(session: TriageSession): string[] {
  return getSymptomSynergyFlags(session);
}

/**
 * Translate a condition_progression answer to a triage urgency signal.
 * "escalate"   — owner reports worsening; caller should raise urgency one tier.
 * "deescalate" — owner reports improving; caller may note it as a positive signal.
 * "same"       — stable or unknown; no urgency change.
 */
export function getUrgencyFromTrajectory(
  answer: string
): "escalate" | "same" | "deescalate" {
  if (answer === "worsening") return "escalate";
  if (answer === "improving") return "deescalate";
  return "same";
}

function getCompositeEmergencyRedFlags(session: TriageSession): string[] {
  const flags = new Set<string>();
  const answers = session.extracted_answers;

  // Urgency trajectory — owner-reported worsening is a moderate escalation signal.
  // It is not an emergency on its own but increments urgency in buildDiagnosisContext.
  if (getUrgencyFromTrajectory(String(answers.condition_progression ?? "")) === "escalate") {
    flags.add("condition_worsening");
  }

  // Synergy rules fire first — these are the highest-confidence composite signals
  for (const flag of getSymptomSynergyFlags(session)) {
    flags.add(flag);
  }

  if (hasAnyExposureEvidence(session, TOXIN_EXPOSURE_KEYWORDS)) {
    flags.add("toxin_confirmed");
  }

  if (
    hasAnyExposureEvidence(session, RAT_POISON_KEYWORDS) &&
    hasBleedingEvidence(session)
  ) {
    flags.add("rat_poison_confirmed");
  }

  if (
    session.known_symptoms.includes("heat_intolerance") &&
    answers.gum_color === "bright_red"
  ) {
    flags.add("brick_red_gums");
  }

  if (
    session.known_symptoms.includes("heat_intolerance") &&
    answers.vomiting_present === true
  ) {
    flags.add("vomiting_overheating");
  }

  if (
    session.known_symptoms.includes("heat_intolerance") &&
    answers.consciousness_level === "unresponsive"
  ) {
    flags.add("collapse_in_heat");
  }

  if (hasMajorTraumaEvidence(session) && isRedFlagTriggered("inability_to_stand", session)) {
    flags.add("inability_to_stand");
  }

  if (session.known_symptoms.includes("vomiting_diarrhea_combined")) {
    if (answers.blood_in_either === true) {
      flags.add("blood_in_both");
      flags.add("puppy_vomiting_diarrhea");
    }

    if (answers.water_intake === "not_drinking") {
      flags.add("not_drinking");
    }
  }

  if (
    session.known_symptoms.includes("vomiting") &&
    answers.appetite_status === "none" &&
    answers.water_intake === "not_drinking"
  ) {
    flags.add("vomiting_not_drinking");
  }

  return [...flags];
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
    pet.age_years < 1.5 ? "puppy" : pet.age_years >= 7 ? "senior" : "adult";

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

  if (
    answers.limping_onset === "sudden" ||
    answers.trauma_history === "yes_trauma"
  ) {
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

  const compositeRedFlags = getCompositeEmergencyRedFlags(session);

  // Synergy boosts — cross-symptom combinations strongly support specific diseases
  if (compositeRedFlags.includes("gdv_triad_present")) {
    if (diseaseKey === "bloat" || diseaseKey === "gastric_dilatation_volvulus") {
      score *= 8.0;
    }
  }

  if (compositeRedFlags.includes("multi_sign_shock_pattern")) {
    if (diseaseKey === "anemia" || diseaseKey === "imha" || diseaseKey === "coagulopathy") {
      score *= 4.0;
    }
  }

  if (compositeRedFlags.includes("respiratory_crisis_combo")) {
    if (diseaseKey === "congestive_heart_failure" || diseaseKey === "pneumonia" || diseaseKey === "laryngeal_paralysis") {
      score *= 5.0;
    }
  }

  if (compositeRedFlags.includes("spinal_herniation_pattern")) {
    if (diseaseKey === "intervertebral_disc_disease" || diseaseKey === "spinal_injury") {
      score *= 5.0;
    }
  }

  if (
    session.known_symptoms.includes("heat_intolerance") &&
    compositeRedFlags.some((flag) =>
      ["brick_red_gums", "vomiting_overheating", "collapse_in_heat"].includes(flag)
    )
  ) {
    if (diseaseKey === "heat_stroke") {
      score *= 4.0;
    }
  }

  if (
    hasMajorTraumaEvidence(session) &&
    compositeRedFlags.includes("inability_to_stand") &&
    diseaseKey === "trauma_chest"
  ) {
    score *= 5.0;
  }

  if (
    compositeRedFlags.includes("rat_poison_confirmed") &&
    diseaseKey === "toxin_ingestion"
  ) {
    score *= 6.0;
  }

  if (
    compositeRedFlags.includes("toxin_confirmed") &&
    session.known_symptoms.includes("wound_skin_issue") &&
    diseaseKey === "toxin_ingestion"
  ) {
    score *= 5.0;
  }

  if (session.known_symptoms.includes("vomiting_diarrhea_combined")) {
    const giEmergencySignalCount = [
      compositeRedFlags.includes("blood_in_both"),
      compositeRedFlags.includes("not_drinking"),
      answers.appetite_status === "none",
    ].filter(Boolean).length;

    if (giEmergencySignalCount > 0) {
      if (diseaseKey === "parvovirus") {
        score *= 1 + giEmergencySignalCount * 1.5;
      }
      if (diseaseKey === "hemorrhagic_gastroenteritis") {
        score *= 1 + giEmergencySignalCount;
      }
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
  if (
    session.red_flags_triggered.length > 0 ||
    getCompositeEmergencyRedFlags(session).length > 0
  ) {
    return true;
  }

  // NEVER ready if no symptoms identified yet
  if (session.known_symptoms.length === 0) return false;

  // Bounded: once the hard ceiling is reached, conclude regardless. A
  // non-emergency critical could in theory still be unanswered here, but EVERY
  // report — owner-requested or auto-concluded (the client re-issues
  // generate_report after a "ready" turn) — funnels through the unbounded
  // findReportBlockingCriticalInfo gate, which still blocks on emergency-grade
  // criticals. So the ceiling can never release a dangerously premature report,
  // only a slightly less rich one.
  if (session.answered_questions.length >= MAX_QUESTIONS_BEFORE_READY) return true;

  // Ready only when there is genuinely nothing left to ask: no missing
  // follow-ups, trajectory asked (or session too short for it), and the capture
  // turn offered. Inlined here — NOT via getNextQuestion — to avoid mutual
  // recursion (getNextQuestion calls isReadyForDiagnosis in the trajectory
  // guard; calling back would overflow the call stack).
  const missingForReady = getMissingQuestions(session);
  if (missingForReady.length > 0) return false;

  const sufficientHistoryForReady =
    session.answered_questions.length >= MIN_QUESTIONS_BEFORE_READY;
  const trajectoryNotAskedForReady =
    !session.answered_questions.includes("condition_progression") &&
    !session.last_question_asked?.includes("condition_progression");
  if (sufficientHistoryForReady && trajectoryNotAskedForReady) return false;

  const captureAlreadyOfferedForReady =
    session.answered_questions.includes(ADDITIONAL_CONTEXT_QUESTION_ID) ||
    session.last_question_asked === ADDITIONAL_CONTEXT_QUESTION_ID;
  if (!captureAlreadyOfferedForReady) return false;

  return true;
}

/**
 * Permissive readiness: does the case hold the *minimum* critical information
 * needed to produce a safe report, even if optional follow-ups remain?
 *
 * Use this when the OWNER explicitly asks for a report (the "generate_report"
 * action) or to decide whether to surface a "get the report now" affordance.
 * It is intentionally distinct from isReadyForDiagnosis: the latter governs
 * when the engine stops asking *on its own* (and now keeps gathering optional
 * context first), while this lets an owner bail out to a report as soon as the
 * case is minimally sufficient. Red flags and the critical-question contract
 * are still required — this never lets a dangerously premature report through.
 */
export function hasMinimumDiagnosticInfo(session: TriageSession): boolean {
  if (
    session.red_flags_triggered.length > 0 ||
    getCompositeEmergencyRedFlags(session).length > 0
  ) {
    return true;
  }

  if (session.known_symptoms.length === 0) return false;
  if (session.answered_questions.length < MIN_QUESTIONS_BEFORE_READY) return false;

  const criticalMissing = getMissingQuestions(session).filter(
    (qId) => FOLLOW_UP_QUESTIONS[qId]?.critical
  );
  return criticalMissing.length === 0;
}

/**
 * Conservative, urgency-aware probability floor for triage urgency (Ticket 2).
 *
 * A candidate disease only raises the case's urgency floor if its normalized
 * probability share meets the minimum for its urgency tier. Serious tiers use a
 * low bar (we accept escalating on a small chance of something serious); the
 * moderate tier uses a higher bar (a long-shot moderate disease should not force
 * a vet visit over a dominant benign explanation). Emergency tier is never gated
 * here (min share 0) — emergencies are floored by red-flag evidence separately.
 */
const URGENCY_FLOOR_MIN_SHARE: Record<string, number> = {
  emergency: 0,
  high: 0.05,
  moderate: 0.15,
  low: 0,
};

/**
 * Compute the deterministic urgency floor across candidate diseases, gating each
 * candidate by URGENCY_FLOOR_MIN_SHARE. The single most probable candidate
 * (index 0) always contributes so the floor is never computed over an empty set;
 * if the gate somehow excludes everything, it falls back to the ungated maximum.
 *
 * Pure and exported for direct testing. `candidates` is assumed ordered by
 * descending final_score (as produced by calculateProbabilities / top5).
 */
export function computeProbabilityGatedUrgency(
  candidates: Array<{ urgency: string; final_score: number }>
): string {
  const urgencyOrder = ["emergency", "high", "moderate", "low"];
  if (candidates.length === 0) return "low";

  const totalScore = candidates.reduce(
    (sum, c) => sum + Math.max(0, c.final_score),
    0
  );
  const probabilityShare = (c: { final_score: number }): number =>
    totalScore > 0 ? Math.max(0, c.final_score) / totalScore : 0;

  // The most probable candidate always sets the baseline floor. This is the
  // safety invariant: calibration can only EXCLUDE lower-probability tail
  // candidates — it never computes the floor over an empty set and never drops
  // below the dominant explanation.
  let highestUrgency = candidates[0].urgency;
  const raiseFloor = (urgency: string): void => {
    if (urgencyOrder.indexOf(urgency) < urgencyOrder.indexOf(highestUrgency)) {
      highestUrgency = urgency;
    }
  };

  // Tail candidates raise the floor only if their probability share meets the
  // urgency-aware minimum. Emergency tier (min 0) is never gated.
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i];
    const minShare = URGENCY_FLOOR_MIN_SHARE[candidate.urgency] ?? 0;
    if (probabilityShare(candidate) >= minShare) {
      raiseFloor(candidate.urgency);
    }
  }

  return highestUrgency;
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
  const compositeRedFlags = getCompositeEmergencyRedFlags(session);
  const hasEmergencyFlooringEvidence =
    session.red_flags_triggered.length > 0 || compositeRedFlags.length > 0;

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

  // Highest urgency from top candidates, gated by a conservative, urgency-aware
  // probability floor so a low-probability moderate/high disease in the tail no
  // longer dictates the whole case's urgency (see computeProbabilityGatedUrgency).
  // Shares are computed over top5 (not the full candidate list) by design: the
  // smaller denominator inflates each share, biasing toward escalation — the
  // safe direction.
  let highestUrgency = computeProbabilityGatedUrgency(top5);

  if (hasEmergencyFlooringEvidence) {
    highestUrgency = "emergency";
  } else if (highestUrgency === "emergency") {
    // Prevent mild lookalikes from auto-upgrading when they only inherit an
    // emergency candidate disease without matching emergency evidence.
    highestUrgency = "high";
  }

  // Urgency trajectory escalation — owner-reported worsening adds one tier.
  // Only applies when not already at emergency and owner explicitly said worsening.
  if (
    session.extracted_answers.condition_progression === "worsening" &&
    highestUrgency !== "emergency"
  ) {
    const trajectoryOrder = ["low", "moderate", "high", "emergency"];
    const currentIdx = trajectoryOrder.indexOf(highestUrgency);
    if (currentIdx >= 0 && currentIdx < trajectoryOrder.length - 1) {
      highestUrgency = trajectoryOrder[currentIdx + 1];
    }
  }

  return {
    probabilities: probs,
    top5,
    breed_risk_summary: breedRiskSummary,
    symptom_summary: symptomSummary,
    answer_summary: answerSummary,
    red_flags: [
      ...session.red_flags_triggered,
      ...getSymptomSynergyFlags(session),
    ],
    body_systems: session.body_systems_involved,
    highest_urgency: highestUrgency,
  };
}

const BREED_ALIASES: Record<string, string[]> = {
  "French Bulldog": ["frenchie"],
  "Golden Retriever": ["golden"],
  "Labrador Retriever": ["lab", "labrador"],
  "Miniature Schnauzer": ["mini schnauzer"],
  "Pembroke Welsh Corgi": ["corgi", "pembroke corgi", "welsh corgi"],
};

function getBreedModifiers(breed: string): BreedModifiers {
  if (!breed.trim()) return {};
  if (BREED_MODIFIERS[breed]) return BREED_MODIFIERS[breed];

  const normalized = normalizeBreedKey(breed);
  const mixStem = getBreedMixStem(normalized);
  for (const [key, modifiers] of Object.entries(BREED_MODIFIERS)) {
    const normalizedKey = normalizeBreedKey(key);
    if (
      normalizedKey === normalized ||
      normalizedKey.includes(normalized) ||
      normalized.includes(normalizedKey) ||
      aliasMatchesBreed(normalized, key) ||
      (mixStem !== null &&
        (normalizedKey === mixStem || normalizedKey.startsWith(`${mixStem} `)))
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

function getBreedMixStem(normalizedBreed: string): string | null {
  if (!normalizedBreed || normalizedBreed === "mixed breed") {
    return null;
  }

  const match = normalizedBreed.match(/^(.*?)(?:\s+mix|\s+mixed breed)$/);
  const stem = match?.[1]?.trim() || "";
  return stem.length >= 3 ? stem : null;
}

function aliasMatchesBreed(normalizedBreed: string, targetBreed: string): boolean {
  const aliases = BREED_ALIASES[targetBreed] ?? [];
  return aliases.some((alias) => {
    const normalizedAlias = normalizeBreedKey(alias);
    return (
      normalizedBreed === normalizedAlias ||
      normalizedBreed.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedBreed)
    );
  });
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
    "trembling/shaking": "trembling",
    tremors: "trembling",
    shivering: "trembling",
    "shaking all over": "trembling",
    "whole body shaking": "trembling",
    "body is shaking": "trembling",
    "legs shaking": "trembling",
    "can't stop shaking": "trembling",
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
    "shaking his head": "ear_scratching",
    "shaking her head": "ear_scratching",
    "shakes his head": "ear_scratching",
    "shakes her head": "ear_scratching",
    "keeps shaking head": "ear_scratching",
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

    // --- VET-902: New complaint family normalization ---

    // Seizure/collapse
    seizure: "seizure_collapse",
    fitting: "seizure_collapse",
    "having a fit": "seizure_collapse",
    passed_out: "seizure_collapse",
    collapsed: "seizure_collapse",
    collapse: "seizure_collapse",
    "fell over": "seizure_collapse",
    "went limp": "seizure_collapse",
    "uncontrolled shaking": "seizure_collapse",
    "foaming at mouth": "seizure_collapse",
    "lost consciousness": "seizure_collapse",
    paddling: "seizure_collapse",

    // Urination
    "peeing inside": "urination_problem",
    "can't pee": "urination_problem",
    "straining to pee": "urination_problem",
    "peeing blood": "urination_problem",
    "dripping urine": "urination_problem",
    "squatting but nothing": "urination_problem",
    "can't urinate": "urination_problem",
    "straining to urinate": "urination_problem",

    // Behavior
    "not acting right": "behavior_change",
    "different lately": "behavior_change",
    confused: "behavior_change",
    "staring at walls": "behavior_change",
    wandering: "behavior_change",
    "not recognizing me": "behavior_change",
    disoriented: "behavior_change",

    // Swelling/lump
    "found a lump": "swelling_lump",
    "bump under skin": "swelling_lump",
    growth: "swelling_lump",
    "found a mass": "swelling_lump",
    "enlarged lymph node": "swelling_lump",
    "swollen leg": "swelling_lump",
    "swollen face": "swelling_lump",

    // Dental
    "bad breath": "dental_problem",
    "stinky breath": "dental_problem",
    "dropping food": "dental_problem",
    "pawing at mouth": "dental_problem",
    "bleeding gums": "dental_problem",
    "loose teeth": "dental_problem",
    "tartar buildup": "dental_problem",

    // Hair loss
    "losing fur": "hair_loss",
    "bald patches": "hair_loss",
    "thin coat": "hair_loss",
    "hair falling out": "hair_loss",
    "patchy fur": "hair_loss",
    "dull coat": "hair_loss",
    "flaky skin": "hair_loss",
    dandruff: "hair_loss",

    // Regurgitation
    "food comes right back up": "regurgitation",
    "undigested food on floor": "regurgitation",
    "gurgling up food": "regurgitation",
    "passive vomiting": "regurgitation",
    "food just drops out": "regurgitation",
    regurgitating: "regurgitation",

    // Constipation
    "can't poop": "constipation",
    "straining on floor": "constipation",
    "hard little poops": "constipation",
    "no poop for days": "constipation",
    "crying when pooping": "constipation",
    constipated: "constipation",

    // Generalized stiffness
    "stiff all over": "generalized_stiffness",
    "can't get comfortable": "generalized_stiffness",
    "reluctant to move": "generalized_stiffness",
    "slow to stand": "generalized_stiffness",
    "stiff in morning": "generalized_stiffness",
    "sore everywhere": "generalized_stiffness",

    // Nasal
    "runny nose": "nasal_discharge",
    sneezing: "nasal_discharge",
    "snotty nose": "nasal_discharge",
    "nose bleeding": "nasal_discharge",
    snorting: "nasal_discharge",
    "reverse sneezing": "nasal_discharge",
    "nasal gunk": "nasal_discharge",

    // Vaginal
    "discharge from privates": "vaginal_discharge",
    "bloody vulva": "vaginal_discharge",
    "pus from vagina": "vaginal_discharge",
    "licking privates constantly": "vaginal_discharge",
    "smelly discharge": "vaginal_discharge",

    // Testicular/prostate
    "swollen balls": "testicular_prostate",
    "one testicle bigger": "testicular_prostate",
    "dragging back legs": "testicular_prostate",

    // Exercise-induced lameness
    "fine until we walk": "exercise_induced_lameness",
    "stops mid-walk": "exercise_induced_lameness",
    "fine at home but won't walk far": "exercise_induced_lameness",
    "lies down after running": "exercise_induced_lameness",
    "sore after play": "exercise_induced_lameness",

    // Skin odor
    "smells bad": "skin_odor_greasy",
    "greasy fur": "skin_odor_greasy",
    "yeasty smell": "skin_odor_greasy",
    "corn chip feet": "skin_odor_greasy",
    "oily coat": "skin_odor_greasy",
    "smells even after bath": "skin_odor_greasy",

    // Recurrent ear
    "always getting ear infections": "recurrent_ear",
    "back on ear meds": "recurrent_ear",
    "ears never clear up": "recurrent_ear",
    "chronic ear problem": "recurrent_ear",

    // Recurrent skin
    "always getting skin infections": "recurrent_skin",
    "pimples keep coming back": "recurrent_skin",
    "antibiotics work then it returns": "recurrent_skin",

    // Inappropriate urination
    "peeing in house": "inappropriate_urination",
    "was housetrained now isn't": "inappropriate_urination",
    "leaking urine": "inappropriate_urination",
    "waking up wet": "inappropriate_urination",
    marking: "inappropriate_urination",

    // Fecal incontinence
    "pooping without knowing": "fecal_incontinence",
    "waking up in poop": "fecal_incontinence",
    "can't hold it": "fecal_incontinence",
    "leaking stool": "fecal_incontinence",
    "dropping stool while walking": "fecal_incontinence",

    // Vomiting + diarrhea combined
    "both ends": "vomiting_diarrhea_combined",
    "sick top and bottom": "vomiting_diarrhea_combined",
    "vomiting and diarrhea": "vomiting_diarrhea_combined",
    "everything is coming out": "vomiting_diarrhea_combined",

    // Coughing + breathing combined
    "coughing and can't breathe": "coughing_breathing_combined",
    "wheezing and coughing": "coughing_breathing_combined",
    "struggling to breathe after coughing": "coughing_breathing_combined",

    // Oral mass
    "lump in mouth": "oral_mass",
    "growth on gum": "oral_mass",
    "won't close mouth": "oral_mass",
    "something hanging from mouth": "oral_mass",
    "mouth won't shut": "oral_mass",

    // Vision loss
    "bumping into things": "vision_loss",
    "can't see": "vision_loss",
    "blind suddenly": "vision_loss",
    "eyes look cloudy": "vision_loss",
    "won't go in dark": "vision_loss",
    blind: "vision_loss",

    // Hearing loss
    "not hearing me": "hearing_loss",
    "deaf suddenly": "hearing_loss",
    "doesn't respond to name": "hearing_loss",
    "startled easily": "hearing_loss",
    "sleeping through noise": "hearing_loss",
    deaf: "hearing_loss",

    // Aggression
    "biting suddenly": "aggression",
    "growling when touched": "aggression",
    snapping: "aggression",
    "doesn't want to be picked up": "aggression",
    "new aggression": "aggression",

    // Pacing
    "can't settle": "pacing_restlessness",
    "walking in circles": "pacing_restlessness",
    "pacing all night": "pacing_restlessness",
    "won't lie down": "pacing_restlessness",
    restless: "pacing_restlessness",
    anxious: "pacing_restlessness",

    // Abnormal gait
    "wobbly walking": "abnormal_gait",
    "drunk walking": "abnormal_gait",
    "crossing legs": "abnormal_gait",
    knuckling: "abnormal_gait",
    "weak in back": "abnormal_gait",
    stumbling: "abnormal_gait",
    "walking weird": "abnormal_gait",
    wobbly: "abnormal_gait",

    // Heat intolerance
    "overheats fast": "heat_intolerance",
    "can't handle heat": "heat_intolerance",
    "panting too much in heat": "heat_intolerance",
    "collapsed in heat": "heat_intolerance",
    overheating: "heat_intolerance",

    // Post-operative
    "incision looks bad": "postoperative_concern",
    "stitches open": "postoperative_concern",
    "oozing from surgery site": "postoperative_concern",
    "not recovering well": "postoperative_concern",
    "swollen after surgery": "postoperative_concern",

    // Toxin ingestion — phrases map to vomiting to trigger the toxin_exposure follow-up question chain
    "ate chocolate": "vomiting",
    "chocolate ingestion": "vomiting",
    "ate some chocolate": "vomiting",
    "ate rat poison": "vomiting",
    "ingested poison": "vomiting",
    "ate poison": "vomiting",
    "ate xylitol": "vomiting",
    "ate grapes": "vomiting",
    "ate raisins": "vomiting",
    "ate something toxic": "vomiting",
    "ate something poisonous": "vomiting",
    "swallowed something": "vomiting",
    "chocolate toxicity": "vomiting",

    // Medication reaction
    "reaction to medicine": "medication_reaction",
    "got sick after pill": "medication_reaction",
    "allergic to medication": "medication_reaction",
    "side effects": "medication_reaction",
    "after vaccine": "post_vaccination_reaction",
    "after vaccination": "post_vaccination_reaction",
    "after booster": "post_vaccination_reaction",
    "after shots": "post_vaccination_reaction",
    "reaction to vaccine": "post_vaccination_reaction",
    "reaction to shot": "post_vaccination_reaction",
    "vaccine reaction": "post_vaccination_reaction",
    "shot reaction": "post_vaccination_reaction",
    "after rabies shot": "post_vaccination_reaction",
    "swollen after vaccine": "post_vaccination_reaction",
    "face swollen after vaccine": "post_vaccination_reaction",

    // Trauma / injury
    trauma: "trauma",
    injury: "trauma",
    injured: "trauma",
    "hit by car": "trauma",
    "hit by truck": "trauma",
    "got hit": "trauma",
    "got run over": "trauma",
    "fell off": "trauma",
    "took a bad fall": "trauma",
    "fell down stairs": "trauma",
    "jumped off": "trauma",
    "hurt after jump": "trauma",
    "dog attack": "trauma",
    attacked: "trauma",
    "bite injury": "trauma",
    "chest trauma": "trauma",
    "road traffic accident": "trauma",
    "rough play injury": "trauma",

    // Pregnancy/birth
    "having trouble giving birth": "pregnancy_birth",
    "straining but no puppies": "pregnancy_birth",
    "green discharge but no puppies": "pregnancy_birth",
    "pregnant and sick": "pregnancy_birth",
    dystocia: "pregnancy_birth",

    // Puppy
    "puppy not right": "puppy_concern",
    "weak puppy": "puppy_concern",
    "not nursing": "puppy_concern",
    "puppy crying": "puppy_concern",
    "puppy cold": "puppy_concern",
    "puppy not growing": "puppy_concern",

    // Senior
    "getting old and slow": "senior_decline",
    "not like she used to be": "senior_decline",
    "slowing down": "senior_decline",
    "confused at night": "senior_decline",
    "forgetting training": "senior_decline",

    // Multi-system
    "just not right in multiple ways": "multi_system_decline",
    "a bit of everything wrong": "multi_system_decline",
    "going downhill": "multi_system_decline",

    // Unknown
    "something is wrong but I can't tell what": "unknown_concern",
    "just seems off": "unknown_concern",
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
