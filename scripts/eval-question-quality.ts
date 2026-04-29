/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { registerHooks } = require("node:module");

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  "tests",
  "fixtures",
  "question-quality-cases.json"
);
const CATEGORY_KEYS = [
  "questionSpecificity",
  "urgencyChangingValue",
  "emergencyRedFlagCoverage",
  "concernBucketDiscrimination",
  "ownerAnswerability",
  "repeatedQuestionBehavior",
  "genericWording",
  "reportUsefulnessValue",
] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_KEYS)[number], string> = {
  questionSpecificity: "question specificity",
  urgencyChangingValue: "urgency-changing value",
  emergencyRedFlagCoverage: "emergency red-flag coverage",
  concernBucketDiscrimination: "concern-bucket discrimination",
  ownerAnswerability: "owner-answerability",
  repeatedQuestionBehavior: "repeated-question behavior",
  genericWording: "generic wording",
  reportUsefulnessValue: "report usefulness value",
};
const REQUIRED_CATEGORY_MINIMUMS = {
  emergency: 45,
  urgent_same_day: 40,
  routine_unclear: 40,
  confusing_multi_symptom: 25,
};
const REQUIRED_COMPLAINT_FAMILIES = new Set([
  "collapse_pale_gums",
  "breathing_difficulty",
  "bloat_nonproductive_retching_swollen_abdomen",
  "seizure_or_repeated_seizures",
  "toxin_ingestion",
  "trauma",
  "urinary_blockage",
  "heat_stroke",
  "vomiting_and_lethargy",
  "bloody_diarrhea",
  "eye_injury",
  "non_weight_bearing_limp",
  "wound_or_bite",
  "painful_abdomen_without_collapse",
  "mild_itching",
  "mild_limp",
  "eating_less",
  "ear_scratching",
  "occasional_vomiting",
  "mild_diarrhea",
  "itching_and_vomiting",
  "limping_and_lethargy",
  "drinking_more_and_weight_loss",
  "coughing_and_tiredness",
  "old_dog_vague_weakness",
]);
const GENERIC_QUESTION_PATTERNS = [
  /\bcan you tell me more\b/i,
  /\btell me more\b/i,
  /\bwhat else have you noticed\b/i,
  /\bwhat have you noticed\b/i,
  /\bcan you describe\b/i,
  /\bwhat's your best guess\b/i,
];
const OWNER_JARGON_PATTERNS = [
  /\bcyanosis\b/i,
  /\bdyspnea\b/i,
  /\bhematochezia\b/i,
  /\bpolydipsia\b/i,
  /\bneurologic\b/i,
  /\bmucous membranes?\b/i,
  /\babdominal distension\b/i,
];
const CRITICAL_QUESTION_CATEGORIES = new Set([
  "abdominal_emergency_screen",
  "bleeding_screen",
  "breathing_distress_screen",
  "collapse_screen",
  "eye_emergency_screen",
  "gdv_screen",
  "gum_color_screen",
  "heat_exposure_screen",
  "mobility_screen",
  "seizure_duration",
  "toxin_screen",
  "urinary_obstruction_screen",
  "vision_screen",
  "vomiting_screen",
]);
const DISCRIMINATIVE_CATEGORIES = new Set([
  "abdominal_emergency_screen",
  "appetite_duration",
  "bite_trauma_history",
  "bucket_split",
  "cough_character",
  "endocrine_discrimination",
  "eye_emergency_screen",
  "gi_bleeding_screen",
  "heat_exposure_screen",
  "hydration_screen",
  "limp_location",
  "mobility_screen",
  "pain_severity",
  "respiratory_vs_systemic_split",
  "seizure_duration",
  "stool_blood_screen",
  "symptom_timing",
  "timeline",
  "toxin_screen",
  "urinary_obstruction_screen",
  "vision_screen",
  "vomiting_severity",
  "weight_change",
  "wound_severity",
]);
const LOCATION_FIRST_CATEGORIES = new Set([
  "itch_location",
  "limp_location",
  "wound_location",
]);
const DETAIL_FIRST_CATEGORIES = new Set([
  "ear_discharge",
  "ocular_discharge_color",
  "urination_change",
  "weight_change",
]);
const TIMELINE_FIRST_CATEGORIES = new Set([
  "appetite_duration",
  "timeline",
  "vomiting_severity",
]);
const OPEN_FIRST_CATEGORIES = new Set(["open_clarification"]);
const REPORT_STRONG_CATEGORIES = new Set([
  "abdominal_emergency_screen",
  "bleeding_screen",
  "breathing_distress_screen",
  "collapse_screen",
  "cough_character",
  "ear_discharge",
  "endocrine_discrimination",
  "eye_emergency_screen",
  "gdv_screen",
  "gi_bleeding_screen",
  "gum_color_screen",
  "heat_exposure_screen",
  "hydration_screen",
  "limp_location",
  "mobility_screen",
  "pain_severity",
  "seizure_duration",
  "stool_blood_screen",
  "toxin_screen",
  "urinary_obstruction_screen",
  "vision_screen",
  "vomiting_severity",
  "wound_severity",
]);
const MODULE_DESCRIPTIONS: Record<string, string> = {
  collapse_shock_screen:
    "Add a collapse and shock opener that checks responsiveness, gum color, and breathing before other detail questions.",
  respiratory_distress_screen:
    "Add a dedicated breathing-distress opener that checks onset, effort, and gum color first.",
  bloat_gdv_screen:
    "Add a bloat/GDV opener that screens retching, abdominal distension, and restlessness immediately.",
  seizure_episode_screen:
    "Add a seizure opener that checks duration, recurrence, breathing, and post-event responsiveness first.",
  toxin_exposure_screen:
    "Add a toxin-exposure opener that checks the substance, timing, and active symptoms before generic detail gathering.",
  major_trauma_screen:
    "Add a trauma opener that screens bleeding, breathing compromise, mobility loss, and fracture risk immediately.",
  urinary_obstruction_screen:
    "Add a urinary-obstruction opener that asks about straining with little or no urine before routine urinary detail.",
  heat_illness_screen:
    "Add a heat-illness opener that checks exposure, collapse, gum color, and vomiting first.",
  vomiting_lethargy_module:
    "Add a combined vomiting plus lethargy opener that screens hydration, gum color, and frequency before timeline only.",
  gi_bleeding_module:
    "Add a bloody-diarrhea opener that screens bleeding severity and perfusion before lower-value detail.",
  eye_injury_module:
    "Add an eye-injury opener that checks squinting, vision change, trauma, and swelling before discharge detail.",
  limp_severity_module:
    "Add a non-weight-bearing limp opener that asks about weight bearing before location-only detail.",
  wound_bite_module:
    "Add a wound or bite opener that screens wound depth, bleeding, and bite trauma severity before location-only detail.",
  abdominal_pain_module:
    "Add an abdominal-pain opener that checks distension, vomiting, and collapse risk before lower-value detail.",
  itching_module:
    "Add a mild-itching opener that screens allergy red flags before routine itch-location questions.",
  mild_limp_module:
    "Add a mild-limp opener that checks weight bearing and trauma before routine location and timing questions.",
  reduced_appetite_module:
    "Add a reduced-appetite opener that screens vomiting and hydration before duration-only questions.",
  ear_scratching_module:
    "Add an ear-scratching opener that checks head tilt and balance changes before routine discharge detail.",
  vomiting_module:
    "Add an occasional-vomiting opener that screens frequency and hydration before routine follow-up.",
  mild_diarrhea_module:
    "Add a mild-diarrhea opener that checks blood and hydration before stool-detail questions.",
  itching_vomiting_split_module:
    "Add a bucket-splitting opener for itching plus vomiting so the checker can separate allergy risk from GI severity first.",
  limping_lethargy_split_module:
    "Add a bucket-splitting opener for limping plus lethargy that screens perfusion and non-weight-bearing risk first.",
  polydipsia_weight_loss_module:
    "Add a drinking-more plus weight-loss opener that separates endocrine, urinary, and intact-female emergency paths earlier.",
  cough_lethargy_module:
    "Add a coughing plus tiredness opener that splits respiratory distress from lower-acuity cough characterization.",
  senior_vague_weakness_module:
    "Add an older-dog vague-weakness opener that screens responsiveness, breathing, gum color, and last-normal time first.",
};
type ScoreCategoryKey = (typeof CATEGORY_KEYS)[number];
type CaseCategory = keyof typeof REQUIRED_CATEGORY_MINIMUMS;
type CategoryCountMap = Record<string, number>;
type CategoryScoreMap = Record<ScoreCategoryKey, number>;

interface FixturePet {
  species: string;
  breed: string;
  ageYears: number;
  weightLbs: number;
  sexNeuter: string;
}

interface EvalFixtureCase {
  id: string;
  category: CaseCategory | string;
  complaintFamily: string;
  pet: FixturePet;
  initialMessage: string;
  expectedMustScreen: string[];
  badFirstQuestions: string[];
  idealQuestionCategories: string[];
  expectedUrgency: string;
  symptomKeys: string[];
  turnFocusSymptoms: string[];
  recommendedFirstModule: string;
}

interface QuestionSignalDefinition {
  questionCategories: string[];
  mustScreenTags: string[];
  missedScreenPattern?: string | null;
}

interface QuestionSignals extends QuestionSignalDefinition {
  missedScreenPattern: string | null;
}

interface QuestionDefinition {
  data_type?: string;
  critical?: boolean;
  [key: string]: unknown;
}

interface SessionState {
  answered_questions: string[];
  last_question_asked: string | null;
  [key: string]: unknown;
}

interface TriageEngineModule {
  createSession: () => SessionState;
  addSymptoms: (session: SessionState, symptomKeys: string[]) => SessionState;
  getQuestionText: (questionId: string) => string;
  getSymptomPriorityScore: (symptomKey: string) => number;
}

interface QuestionSelectionModule {
  getNextQuestionAvoidingRepeat: (
    session: SessionState,
    symptomKeys: string[]
  ) => string | null | undefined;
}

interface ClinicalMatrixModule {
  FOLLOW_UP_QUESTIONS: Record<string, QuestionDefinition>;
}

interface QuestionRuntime
  extends TriageEngineModule,
    QuestionSelectionModule,
    ClinicalMatrixModule {}

interface CaseEvaluationResult {
  caseDefinition: EvalFixtureCase;
  questionId: string | null;
  questionText: string;
  questionCategories: string[];
  mustScreenHits: string[];
  missedMustScreen: string[];
  idealCategoryHits: string[];
  isGeneric: boolean;
  repeated: boolean;
  scores: CategoryScoreMap;
  averageScore: number;
  weakPatterns: string[];
}

interface ComplaintFamilyAccumulator {
  count: number;
  totalScore: number;
  weakCases: number;
  missedScreens: number;
  genericCases: number;
  questionIds: Set<string>;
  recommendedFirstModule: string;
}

interface ComplaintFamilySummary {
  complaintFamily: string;
  averageScore: number;
  count: number;
  weakCases: number;
  missedScreens: number;
  genericCases: number;
  questionIds: string[];
  recommendedFirstModule: string;
}

interface RecommendedModuleAccumulator {
  count: number;
  complaintFamilies: string[];
  weakestScore: number;
}

interface RecommendedModuleSummary {
  moduleId: string;
  count: number;
  weakestScore: number;
  complaintFamilies: string[];
  description: string;
}

interface FrequencyAccumulatorEntry {
  count: number;
  cases: string[];
  complaintFamilies: Set<string>;
  questionIds: Set<string>;
}

type FrequencySummaryItem<LabelKey extends string> = Record<LabelKey, string> & {
  count: number;
  cases: string[];
  complaintFamilies: string[];
  questionIds: string[];
};

interface EvaluationSummary {
  totalCases: number;
  categoryCounts: CategoryCountMap;
  averageQuestionScore: number;
  genericQuestionRate: number;
  emergencyRedFlagMissRate: number;
  firstQuestionEmergencyScreenRate: number;
  repeatedQuestionRate: number;
  categoryScores: CategoryScoreMap;
  weakPatterns: FrequencySummaryItem<"pattern">[];
  missedRedFlagPatterns: FrequencySummaryItem<"pattern">[];
  complaintFamilySummaries: ComplaintFamilySummary[];
  worstComplaintFamilies: ComplaintFamilySummary[];
  recommendedFirstModules: RecommendedModuleSummary[];
}

interface EvaluationReport {
  fixturePath: string;
  cases: EvalFixtureCase[];
  caseResults: CaseEvaluationResult[];
  summary: EvaluationSummary;
}

interface RunEvaluationOptions {
  fixturePath?: string;
}

interface ResolveHookContext {
  parentURL?: string;
}

type ResolveFunction = (
  specifier: string,
  context: ResolveHookContext,
  defaultResolve: ResolveFunction
) => unknown;

type EmitWarningValue = string | Error;
type EmitWarningFunction = (warning: EmitWarningValue, ...args: unknown[]) => void;

const QUESTION_SIGNAL_MAP: Record<string, QuestionSignalDefinition> = {
  abdomen_onset: {
    questionCategories: ["abdominal_emergency_screen", "gdv_screen", "timeline"],
    mustScreenTags: ["abdominal_distension"],
  },
  active_bleeding_trauma: {
    questionCategories: ["bleeding_screen"],
    mustScreenTags: ["active_bleeding"],
  },
  appetite_duration: {
    questionCategories: ["appetite_duration", "timeline"],
    mustScreenTags: [],
    missedScreenPattern: "appetite-duration-before-dehydration-screen",
  },
  appetite_status: {
    questionCategories: ["appetite_severity"],
    mustScreenTags: [],
  },
  balance_issues: {
    questionCategories: ["head_tilt_balance"],
    mustScreenTags: ["head_tilt_balance", "collapse_or_weakness"],
  },
  blood_amount: {
    questionCategories: ["gi_bleeding_screen"],
    mustScreenTags: ["bloody_stool_or_vomit"],
  },
  blood_color: {
    questionCategories: ["gi_bleeding_screen"],
    mustScreenTags: ["bloody_stool_or_vomit"],
  },
  blood_in_either: {
    questionCategories: ["gi_bleeding_screen"],
    mustScreenTags: ["bloody_stool_or_vomit"],
  },
  blood_in_urine: {
    questionCategories: ["urination_change"],
    mustScreenTags: [],
  },
  breathing_onset: {
    questionCategories: ["breathing_distress_screen", "timeline"],
    mustScreenTags: ["breathing_difficulty"],
  },
  breathing_rate: {
    questionCategories: ["breathing_distress_screen"],
    mustScreenTags: ["breathing_difficulty"],
  },
  breathing_status: {
    questionCategories: ["breathing_distress_screen"],
    mustScreenTags: ["breathing_difficulty"],
  },
  chief_complaint_guess: {
    questionCategories: ["open_clarification"],
    mustScreenTags: [],
    missedScreenPattern: "open-guess-before-safety-screen",
  },
  combined_diarrhea_duration: {
    questionCategories: ["timeline", "vomiting_severity"],
    mustScreenTags: [],
    missedScreenPattern: "timeline-before-safety-screen",
  },
  combined_vomiting_duration: {
    questionCategories: ["timeline", "vomiting_severity"],
    mustScreenTags: [],
    missedScreenPattern: "timeline-before-safety-screen",
  },
  consciousness_level: {
    questionCategories: ["collapse_screen"],
    mustScreenTags: ["collapse_or_weakness"],
  },
  cough_duration: {
    questionCategories: ["respiratory_vs_systemic_split", "timeline"],
    mustScreenTags: [],
  },
  cough_type: {
    questionCategories: ["cough_character", "respiratory_vs_systemic_split"],
    mustScreenTags: [],
  },
  coughing_breathing_onset: {
    questionCategories: ["breathing_distress_screen", "respiratory_vs_systemic_split"],
    mustScreenTags: ["breathing_difficulty"],
  },
  discharge_color: {
    questionCategories: ["ocular_discharge_color"],
    mustScreenTags: [],
    missedScreenPattern: "discharge-color-before-eye-emergency-screen",
  },
  ear_discharge: {
    questionCategories: ["ear_discharge"],
    mustScreenTags: [],
    missedScreenPattern: "ear-detail-before-neuro-screen",
  },
  energy_level: {
    questionCategories: ["vague_weakness_screen", "energy_change"],
    mustScreenTags: [],
  },
  exercise_intolerance: {
    questionCategories: ["respiratory_vs_systemic_split"],
    mustScreenTags: [],
  },
  eye_redness: {
    questionCategories: ["eye_emergency_screen"],
    mustScreenTags: ["eye_swelling"],
  },
  gum_color: {
    questionCategories: ["gum_color_screen"],
    mustScreenTags: ["pale_or_blue_gums"],
  },
  heat_exposure_duration: {
    questionCategories: ["heat_exposure_screen", "timeline"],
    mustScreenTags: ["heat_exposure"],
  },
  head_tilt: {
    questionCategories: ["head_tilt_balance"],
    mustScreenTags: ["head_tilt_balance"],
  },
  last_normal: {
    questionCategories: ["last_normal", "vague_weakness_screen", "timeline"],
    mustScreenTags: [],
  },
  lethargy_duration: {
    questionCategories: ["energy_change", "timeline"],
    mustScreenTags: [],
    missedScreenPattern: "duration-before-shock-screen",
  },
  limping_onset: {
    questionCategories: ["limp_timing", "timeline"],
    mustScreenTags: [],
  },
  medication_name: {
    questionCategories: ["toxin_screen", "medication_name"],
    mustScreenTags: ["toxin_exposure"],
  },
  position_preference: {
    questionCategories: ["breathing_distress_screen", "position_preference"],
    mustScreenTags: ["breathing_difficulty"],
  },
  prior_seizures: {
    questionCategories: ["seizure_history", "bucket_split"],
    mustScreenTags: [],
  },
  question_cards: {
    questionCategories: [],
    mustScreenTags: [],
  },
  reaction_symptoms: {
    questionCategories: ["toxin_screen", "symptom_timing"],
    mustScreenTags: ["toxin_exposure"],
  },
  scratch_location: {
    questionCategories: ["itch_location"],
    mustScreenTags: [],
    missedScreenPattern: "itch-location-before-allergy-screen",
  },
  seizure_duration: {
    questionCategories: ["seizure_duration", "collapse_screen", "timeline"],
    mustScreenTags: ["seizure_activity"],
  },
  squinting: {
    questionCategories: ["eye_emergency_screen", "vision_screen"],
    mustScreenTags: ["vision_loss_or_eye_trauma", "eye_swelling"],
  },
  stool_blood: {
    questionCategories: ["stool_blood_screen", "gi_bleeding_screen"],
    mustScreenTags: ["bloody_stool_or_vomit"],
  },
  stool_consistency: {
    questionCategories: ["stool_consistency"],
    mustScreenTags: [],
  },
  straining_present: {
    questionCategories: ["urinary_obstruction_screen", "urine_output"],
    mustScreenTags: ["straining_with_no_urine"],
  },
  temperature_exposure: {
    questionCategories: ["heat_exposure_screen", "timeline"],
    mustScreenTags: ["heat_exposure"],
  },
  toxin_exposure: {
    questionCategories: ["toxin_screen", "symptom_timing"],
    mustScreenTags: ["toxin_exposure"],
  },
  trauma_mechanism: {
    questionCategories: ["trauma_mechanism", "bite_trauma_history"],
    mustScreenTags: [],
  },
  trauma_mobility: {
    questionCategories: ["mobility_screen"],
    mustScreenTags: ["collapse_or_weakness", "non_weight_bearing"],
  },
  treats_accepted: {
    questionCategories: ["appetite_severity"],
    mustScreenTags: [],
  },
  unproductive_retching: {
    questionCategories: ["gdv_screen", "abdominal_emergency_screen"],
    mustScreenTags: ["unproductive_retching"],
  },
  urination_accidents: {
    questionCategories: ["urination_change"],
    mustScreenTags: [],
  },
  urination_frequency: {
    questionCategories: ["urination_change", "urine_output"],
    mustScreenTags: [],
    missedScreenPattern: "frequency-before-obstruction-screen",
  },
  vision_changes: {
    questionCategories: ["vision_screen", "eye_emergency_screen"],
    mustScreenTags: ["vision_loss_or_eye_trauma"],
  },
  visible_fracture: {
    questionCategories: ["fracture_screen", "mobility_screen"],
    mustScreenTags: ["fracture_or_bone_exposure"],
  },
  vomit_duration: {
    questionCategories: ["vomiting_severity", "timeline"],
    mustScreenTags: [],
    missedScreenPattern: "vomit-duration-before-danger-screen",
  },
  vomit_frequency: {
    questionCategories: ["vomiting_severity"],
    mustScreenTags: ["repeated_vomiting"],
  },
  vomiting_present: {
    questionCategories: ["vomiting_screen"],
    mustScreenTags: [],
  },
  water_amount_change: {
    questionCategories: ["endocrine_discrimination", "hydration_screen"],
    mustScreenTags: [],
  },
  water_intake: {
    questionCategories: ["hydration_screen"],
    mustScreenTags: ["not_drinking"],
  },
  weight_bearing: {
    questionCategories: ["mobility_screen", "weight_bearing"],
    mustScreenTags: ["non_weight_bearing"],
  },
  weight_change: {
    questionCategories: ["weight_change", "endocrine_discrimination"],
    mustScreenTags: [],
  },
  weight_loss: {
    questionCategories: ["weight_change"],
    mustScreenTags: [],
  },
  weight_loss_duration: {
    questionCategories: ["weight_change", "timeline"],
    mustScreenTags: [],
  },
  which_leg: {
    questionCategories: ["limp_location"],
    mustScreenTags: [],
    missedScreenPattern: "limb-location-before-weight-bearing-screen",
  },
  wound_color: {
    questionCategories: ["wound_severity"],
    mustScreenTags: [],
  },
  wound_discharge: {
    questionCategories: ["wound_severity", "bleeding_screen"],
    mustScreenTags: ["wound_depth_or_bleeding"],
  },
  wound_location: {
    questionCategories: ["wound_location"],
    mustScreenTags: [],
    missedScreenPattern: "location-before-wound-depth-screen",
  },
  wound_size: {
    questionCategories: ["wound_severity"],
    mustScreenTags: ["wound_depth_or_bleeding"],
  },
};

let hooksRegistered = false;
let runtimePromise: Promise<QuestionRuntime> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== "string") {
    return undefined;
  }

  return error.code;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value: unknown): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, "")
    .replace(/\s+/g, " ");
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values
        .filter((value: unknown) => value !== null && value !== undefined)
        .map((value: unknown) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum: number, value: number) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(3, value));
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function formatScore(value: number): string {
  return `${value.toFixed(2)} / 3.00`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeCaseDefinition(rawCase: unknown, index: number): EvalFixtureCase {
  if (!isRecord(rawCase)) {
    throw new Error(`Case at index ${index} must be an object`);
  }

  const id = String(rawCase.id ?? "").trim() || `case-${index + 1}`;
  const category = String(rawCase.category ?? "").trim();
  const complaintFamily = String(rawCase.complaintFamily ?? "").trim();
  const initialMessage = String(rawCase.initialMessage ?? "").trim();
  const expectedUrgency = String(rawCase.expectedUrgency ?? "").trim();
  const expectedMustScreen = uniqueStrings(asArray(rawCase.expectedMustScreen));
  const badFirstQuestions = uniqueStrings(asArray(rawCase.badFirstQuestions));
  const idealQuestionCategories = uniqueStrings(
    asArray(rawCase.idealQuestionCategories)
  );
  const symptomKeys = uniqueStrings(asArray(rawCase.symptomKeys));
  const turnFocusSymptoms = uniqueStrings(asArray(rawCase.turnFocusSymptoms));
  const recommendedFirstModule = String(
    rawCase.recommendedFirstModule ?? ""
  ).trim();
  const pet = isRecord(rawCase.pet) ? rawCase.pet : {};

  if (!category) throw new Error(`Case "${id}" is missing category`);
  if (!complaintFamily) throw new Error(`Case "${id}" is missing complaintFamily`);
  if (!initialMessage) throw new Error(`Case "${id}" is missing initialMessage`);
  if (!expectedUrgency) throw new Error(`Case "${id}" is missing expectedUrgency`);
  if (expectedMustScreen.length === 0) {
    throw new Error(`Case "${id}" must include expectedMustScreen`);
  }
  if (badFirstQuestions.length === 0) {
    throw new Error(`Case "${id}" must include badFirstQuestions`);
  }
  if (idealQuestionCategories.length === 0) {
    throw new Error(`Case "${id}" must include idealQuestionCategories`);
  }
  if (symptomKeys.length === 0) {
    throw new Error(`Case "${id}" must include symptomKeys for deterministic replay`);
  }

  return {
    id,
    category,
    complaintFamily,
    pet: {
      species: String(pet.species ?? "").trim(),
      breed: String(pet.breed ?? "").trim(),
      ageYears: Number(pet.ageYears),
      weightLbs: Number(pet.weightLbs),
      sexNeuter: String(pet.sexNeuter ?? "").trim(),
    },
    initialMessage,
    expectedMustScreen,
    badFirstQuestions,
    idealQuestionCategories,
    expectedUrgency,
    symptomKeys,
    turnFocusSymptoms,
    recommendedFirstModule,
  };
}

function countByCategory(cases: EvalFixtureCase[]): CategoryCountMap {
  return cases.reduce((counts: CategoryCountMap, caseDefinition: EvalFixtureCase) => {
    counts[caseDefinition.category] = (counts[caseDefinition.category] ?? 0) + 1;
    return counts;
  }, {});
}

function validateCaseSet(cases: EvalFixtureCase[]): void {
  if (cases.length < 150) {
    throw new Error(`Expected at least 150 question-quality cases, found ${cases.length}`);
  }

  const categoryCounts = countByCategory(cases);
  for (const [category, minimum] of Object.entries(REQUIRED_CATEGORY_MINIMUMS)) {
    if ((categoryCounts[category] ?? 0) < minimum) {
      throw new Error(
        `Expected at least ${minimum} ${category} cases, found ${categoryCounts[category] ?? 0}`
      );
    }
  }

  const complaintFamilies = new Set(cases.map((caseDefinition) => caseDefinition.complaintFamily));
  for (const complaintFamily of REQUIRED_COMPLAINT_FAMILIES) {
    if (!complaintFamilies.has(complaintFamily)) {
      throw new Error(`Missing required complaintFamily "${complaintFamily}"`);
    }
  }

  for (const caseDefinition of cases) {
    if (caseDefinition.pet.species !== "dog") {
      throw new Error(`Case "${caseDefinition.id}" must be dog-only`);
    }
  }
}

function loadCases(fixturePath: string = FIXTURE_PATH): EvalFixtureCase[] {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Question-quality fixture not found: ${fixturePath}`);
  }

  const rawFixture: unknown = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const rawCases = Array.isArray(rawFixture)
    ? rawFixture
    : isRecord(rawFixture) && Array.isArray(rawFixture.cases)
      ? rawFixture.cases
      : null;

  if (!rawCases) {
    throw new Error(
      `Question-quality fixture must be an array or { cases: [] }: ${fixturePath}`
    );
  }

  const cases = rawCases.map((rawCase, index) =>
    normalizeCaseDefinition(rawCase, index)
  );
  validateCaseSet(cases);
  return cases;
}

function registerTypeScriptHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerHooks({
    resolve(
      specifier: string,
      context: ResolveHookContext,
      defaultResolve: ResolveFunction
    ) {
      if (specifier.startsWith("@/")) {
        const mappedPath = path.join(ROOT, "src", specifier.slice(2));
        for (const candidate of [
          `${mappedPath}.ts`,
          `${mappedPath}.tsx`,
          path.join(mappedPath, "index.ts"),
        ]) {
          try {
            return defaultResolve(
              pathToFileURL(candidate).href,
              context,
              defaultResolve
            );
          } catch {}
        }
      }

      if (
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !path.extname(specifier)
      ) {
        const parentPath = context.parentURL
          ? fileURLToPath(context.parentURL)
          : ROOT;
        const basePath = path.resolve(path.dirname(parentPath), specifier);
        for (const candidate of [
          `${basePath}.ts`,
          `${basePath}.tsx`,
          path.join(basePath, "index.ts"),
        ]) {
          try {
            return defaultResolve(
              pathToFileURL(candidate).href,
              context,
              defaultResolve
            );
          } catch {}
        }
      }

      return defaultResolve(specifier, context, defaultResolve);
    },
  });
}

async function withFilteredRuntimeWarnings<T>(work: () => Promise<T>): Promise<T> {
  const originalEmitWarning = process.emitWarning.bind(
    process
  ) as unknown as EmitWarningFunction;
  process.emitWarning = ((warning: EmitWarningValue, ...args: unknown[]) => {
    const primaryArg = args[0];
    const warningCode = getErrorCode(warning) || getErrorCode(primaryArg);
    const warningText =
      typeof warning === "string"
        ? warning
        : warning.message;

    if (
      warningCode === "MODULE_TYPELESS_PACKAGE_JSON" ||
      warningText.includes("MODULE_TYPELESS_PACKAGE_JSON")
    ) {
      return;
    }

    originalEmitWarning(warning, ...args);
  }) as unknown as typeof process.emitWarning;

  try {
    return await work();
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function loadQuestionRuntime(): Promise<QuestionRuntime> {
  if (runtimePromise !== null) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    registerTypeScriptHooks();

    return withFilteredRuntimeWarnings(async () => {
      const triageEngine = (await import(
        pathToFileURL(path.join(ROOT, "src", "lib", "triage-engine.ts")).href
      )) as TriageEngineModule;
      const questionSelection = (await import(
        pathToFileURL(
          path.join(ROOT, "src", "lib", "symptom-chat", "answer-coercion.ts")
        ).href
      )) as QuestionSelectionModule;
      const clinicalMatrix = (await import(
        pathToFileURL(path.join(ROOT, "src", "lib", "clinical-matrix.ts")).href
      )) as ClinicalMatrixModule;

      return {
        createSession: triageEngine.createSession,
        addSymptoms: triageEngine.addSymptoms,
        getQuestionText: triageEngine.getQuestionText,
        getSymptomPriorityScore: triageEngine.getSymptomPriorityScore,
        getNextQuestionAvoidingRepeat:
          questionSelection.getNextQuestionAvoidingRepeat,
        FOLLOW_UP_QUESTIONS: clinicalMatrix.FOLLOW_UP_QUESTIONS,
      };
    });
  })();

  return runtimePromise;
}

function inferSignalsFromQuestionText(questionText: string): QuestionSignalDefinition {
  const lower = questionText.toLowerCase();
  const questionCategories: string[] = [];
  const mustScreenTags: string[] = [];

  if (lower.includes("gum")) {
    questionCategories.push("gum_color_screen");
    mustScreenTags.push("pale_or_blue_gums");
  }
  if (lower.includes("breathe") || lower.includes("breathing")) {
    questionCategories.push("breathing_distress_screen");
    mustScreenTags.push("breathing_difficulty");
  }
  if (lower.includes("collapse") || lower.includes("responsive")) {
    questionCategories.push("collapse_screen");
    mustScreenTags.push("collapse_or_weakness");
  }
  if (lower.includes("seizure")) {
    questionCategories.push("seizure_duration");
    mustScreenTags.push("seizure_activity");
  }
  if (lower.includes("retch") || lower.includes("abdomen") || lower.includes("belly")) {
    questionCategories.push("abdominal_emergency_screen");
    mustScreenTags.push("abdominal_distension");
  }
  if (lower.includes("poison") || lower.includes("toxin") || lower.includes("medication")) {
    questionCategories.push("toxin_screen");
    mustScreenTags.push("toxin_exposure");
  }
  if (lower.includes("urinate") || lower.includes("pee") || lower.includes("urine")) {
    questionCategories.push("urinary_obstruction_screen");
    mustScreenTags.push("straining_with_no_urine");
  }
  if (lower.includes("heat") || lower.includes("hot car") || lower.includes("sun")) {
    questionCategories.push("heat_exposure_screen");
    mustScreenTags.push("heat_exposure");
  }
  if (lower.includes("blood")) {
    questionCategories.push("gi_bleeding_screen");
    mustScreenTags.push("bloody_stool_or_vomit");
  }
  if (lower.includes("vision") || lower.includes("eye")) {
    questionCategories.push("eye_emergency_screen");
    mustScreenTags.push("vision_loss_or_eye_trauma");
  }
  if (lower.includes("weight") && lower.includes("leg")) {
    questionCategories.push("mobility_screen");
    mustScreenTags.push("non_weight_bearing");
  }
  if (lower.includes("wound") || lower.includes("bite")) {
    questionCategories.push("wound_severity");
    mustScreenTags.push("wound_depth_or_bleeding");
  }

  if (lower.startsWith("when ") || lower.startsWith("how long")) {
    questionCategories.push("timeline");
  }
  if (lower.includes("what color")) {
    questionCategories.push("detail_question");
  }
  if (lower.includes("which leg") || lower.includes("where is")) {
    questionCategories.push("location_question");
  }
  if (lower.includes("best guess")) {
    questionCategories.push("open_clarification");
  }

  return {
    questionCategories: uniqueStrings(questionCategories),
    mustScreenTags: uniqueStrings(mustScreenTags),
  };
}

function getQuestionSignals(
  questionId: string | null,
  questionText: string
): QuestionSignals {
  const mappedSignals: QuestionSignalDefinition = (questionId
    ? QUESTION_SIGNAL_MAP[questionId]
    : null) ?? {
    questionCategories: [],
    mustScreenTags: [],
  };
  const inferredSignals = inferSignalsFromQuestionText(questionText);

  return {
    questionCategories: uniqueStrings([
      ...(mappedSignals.questionCategories ?? []),
      ...inferredSignals.questionCategories,
    ]),
    mustScreenTags: uniqueStrings([
      ...(mappedSignals.mustScreenTags ?? []),
      ...inferredSignals.mustScreenTags,
    ]),
    missedScreenPattern: mappedSignals.missedScreenPattern ?? null,
  };
}

function isGenericQuestion(
  questionText: string,
  badFirstQuestions: string[],
  questionCategories: string[]
): boolean {
  if (!questionText) return true;

  const normalizedQuestion = normalizeText(questionText);
  if (
    badFirstQuestions.some(
      (badQuestion) => normalizeText(badQuestion) === normalizedQuestion
    )
  ) {
    return true;
  }

  if (GENERIC_QUESTION_PATTERNS.some((pattern) => pattern.test(questionText))) {
    return true;
  }

  return questionCategories.includes("open_clarification");
}

function scoreQuestionSpecificity(
  questionDef: QuestionDefinition | null,
  isGeneric: boolean,
  idealCategoryHits: string[],
  mustScreenHits: string[],
  questionCategories: string[]
): number {
  if (!questionDef) return 0;
  if (isGeneric) return 0;

  let score = 1;
  if (questionDef.data_type !== "string" || questionCategories.length > 0) {
    score += 1;
  }
  if (idealCategoryHits.length > 0 || mustScreenHits.length > 0) {
    score += 1;
  }

  return clampScore(score);
}

function scoreUrgencyChangingValue(
  questionDef: QuestionDefinition | null,
  mustScreenHits: string[],
  questionCategories: string[]
): number {
  if (!questionDef) return 0;
  if (mustScreenHits.length > 0) return 3;
  if (
    questionDef.critical ||
    questionCategories.some((category) => CRITICAL_QUESTION_CATEGORIES.has(category))
  ) {
    return 2;
  }
  if (questionCategories.length > 0) return 1;
  return 0;
}

function scoreEmergencyRedFlagCoverage(
  caseDefinition: EvalFixtureCase,
  mustScreenHits: string[],
  questionDef: QuestionDefinition | null,
  questionCategories: string[]
): number {
  if (!questionDef) return 0;
  if (caseDefinition.expectedMustScreen.length === 0) return 3;
  if (mustScreenHits.includes(caseDefinition.expectedMustScreen[0])) return 3;
  if (mustScreenHits.length > 0) return 2;
  if (
    questionDef.critical ||
    questionCategories.some((category) => CRITICAL_QUESTION_CATEGORIES.has(category))
  ) {
    return 1;
  }
  return 0;
}

function scoreConcernBucketDiscrimination(
  questionDef: QuestionDefinition | null,
  idealCategoryHits: string[],
  questionCategories: string[]
): number {
  if (!questionDef) return 0;
  if (
    idealCategoryHits.length > 0 &&
    questionCategories.some((category) => DISCRIMINATIVE_CATEGORIES.has(category))
  ) {
    return 3;
  }
  if (idealCategoryHits.length > 0) return 2;
  if (questionCategories.length > 0) return 1;
  return 0;
}

function scoreOwnerAnswerability(
  questionDef: QuestionDefinition | null,
  questionText: string,
  questionCategories: string[]
): number {
  if (!questionDef || !questionText) return 0;

  if (
    questionCategories.includes("open_clarification") ||
    OWNER_JARGON_PATTERNS.some((pattern) => pattern.test(questionText))
  ) {
    return 1;
  }

  if (
    questionDef.data_type === "boolean" ||
    questionDef.data_type === "choice" ||
    questionDef.data_type === "number"
  ) {
    return 3;
  }

  const wordCount = questionText.split(/\s+/).filter(Boolean).length;
  return wordCount <= 18 ? 2 : 1;
}

function scoreRepeatedQuestionBehavior(repeated: boolean): number {
  return repeated ? 0 : 3;
}

function scoreGenericWording(
  isGeneric: boolean,
  questionCategories: string[],
  idealCategoryHits: string[],
  mustScreenHits: string[]
): number {
  if (isGeneric) return 0;
  if (questionCategories.includes("open_clarification")) return 1;
  if (idealCategoryHits.length > 0 || mustScreenHits.length > 0) return 3;
  return 2;
}

function scoreReportUsefulnessValue(
  questionDef: QuestionDefinition | null,
  questionCategories: string[],
  idealCategoryHits: string[],
  mustScreenHits: string[]
): number {
  if (!questionDef) return 0;
  if (
    (questionDef.data_type === "boolean" ||
      questionDef.data_type === "choice" ||
      questionDef.data_type === "number") &&
    (idealCategoryHits.length > 0 ||
      mustScreenHits.length > 0 ||
      questionCategories.some((category) => REPORT_STRONG_CATEGORIES.has(category)))
  ) {
    return 3;
  }
  if (
    questionCategories.some((category) => REPORT_STRONG_CATEGORIES.has(category)) ||
    idealCategoryHits.length > 0
  ) {
    return 2;
  }
  if (questionCategories.includes("open_clarification")) return 1;
  return 1;
}

function buildWeakPatternLabel(
  questionId: string | null,
  questionSignals: QuestionSignals,
  mustScreenMiss: boolean,
  isGeneric: boolean
): string | null {
  if (isGeneric) {
    return "generic-first-question";
  }

  if (!mustScreenMiss) {
    return null;
  }

  if (questionSignals.missedScreenPattern) {
    return questionSignals.missedScreenPattern;
  }

  if (
    questionSignals.questionCategories.some((category) =>
      OPEN_FIRST_CATEGORIES.has(category)
    )
  ) {
    return "open-clarification-before-safety-screen";
  }
  if (
    questionSignals.questionCategories.some((category) =>
      LOCATION_FIRST_CATEGORIES.has(category)
    )
  ) {
    return "location-before-safety-screen";
  }
  if (
    questionSignals.questionCategories.some((category) =>
      DETAIL_FIRST_CATEGORIES.has(category)
    )
  ) {
    return "detail-before-safety-screen";
  }
  if (
    questionSignals.questionCategories.some((category) =>
      TIMELINE_FIRST_CATEGORIES.has(category)
    )
  ) {
    return "timeline-before-safety-screen";
  }
  if (!questionId) {
    return "no-first-question";
  }
  return "missed-first-emergency-screen";
}

function addFrequencyEntry(
  map: Map<string, FrequencyAccumulatorEntry>,
  key: string | null,
  caseDefinition: EvalFixtureCase,
  questionId: string | null
): void {
  if (!key) return;

  const current: FrequencyAccumulatorEntry = map.get(key) ?? {
    count: 0,
    cases: [],
    complaintFamilies: new Set(),
    questionIds: new Set(),
  };
  current.count += 1;
  if (current.cases.length < 5 && !current.cases.includes(caseDefinition.id)) {
    current.cases.push(caseDefinition.id);
  }
  current.complaintFamilies.add(caseDefinition.complaintFamily);
  if (questionId) {
    current.questionIds.add(questionId);
  }
  map.set(key, current);
}

function summarizeFrequencyMap<LabelKey extends string>(
  map: Map<string, FrequencyAccumulatorEntry>,
  limit: number,
  labelKey: LabelKey
): Array<FrequencySummaryItem<LabelKey>> {
  return [...map.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }
      return String(left[0]).localeCompare(String(right[0]));
    })
    .slice(0, limit)
    .map(
      ([label, entry]) =>
        ({
          [labelKey]: label,
          count: entry.count,
          cases: entry.cases,
          complaintFamilies: [...entry.complaintFamilies].sort(),
          questionIds: [...entry.questionIds].sort(),
        }) as FrequencySummaryItem<LabelKey>
    );
}

function evaluateCase(
  caseDefinition: EvalFixtureCase,
  runtime: QuestionRuntime
): CaseEvaluationResult {
  let session = runtime.createSession();
  session = runtime.addSymptoms(session, caseDefinition.symptomKeys);

  const preferredSymptoms =
    caseDefinition.turnFocusSymptoms.length > 0
      ? caseDefinition.turnFocusSymptoms
      : caseDefinition.symptomKeys;
  const selectedQuestionId = runtime.getNextQuestionAvoidingRepeat(
    session,
    preferredSymptoms
  );
  const questionId =
    typeof selectedQuestionId === "string" && selectedQuestionId.trim()
      ? selectedQuestionId
      : null;
  const questionText = questionId ? runtime.getQuestionText(questionId) : "";
  const questionDef = questionId ? runtime.FOLLOW_UP_QUESTIONS[questionId] ?? null : null;
  const questionSignals: QuestionSignals = getQuestionSignals(questionId, questionText);
  const mustScreenHits = caseDefinition.expectedMustScreen.filter((tag: string) =>
    questionSignals.mustScreenTags.includes(tag)
  );
  const missedMustScreen = caseDefinition.expectedMustScreen.filter(
    (tag: string) => !mustScreenHits.includes(tag)
  );
  const idealCategoryHits = caseDefinition.idealQuestionCategories.filter((tag: string) =>
    questionSignals.questionCategories.includes(tag)
  );
  const isGeneric = isGenericQuestion(
    questionText,
    caseDefinition.badFirstQuestions,
    questionSignals.questionCategories
  );
  const repeated = questionId
    ? (() => {
    const replaySession: SessionState = {
      ...session,
      answered_questions: session.answered_questions.includes(questionId)
        ? [...session.answered_questions]
        : [...session.answered_questions, questionId],
      last_question_asked: questionId,
    };
    return (
      runtime.getNextQuestionAvoidingRepeat(replaySession, preferredSymptoms) ===
      questionId
    );
      })()
    : false;

  const scores: CategoryScoreMap = {
    questionSpecificity: scoreQuestionSpecificity(
      questionDef,
      isGeneric,
      idealCategoryHits,
      mustScreenHits,
      questionSignals.questionCategories
    ),
    urgencyChangingValue: scoreUrgencyChangingValue(
      questionDef,
      mustScreenHits,
      questionSignals.questionCategories
    ),
    emergencyRedFlagCoverage: scoreEmergencyRedFlagCoverage(
      caseDefinition,
      mustScreenHits,
      questionDef,
      questionSignals.questionCategories
    ),
    concernBucketDiscrimination: scoreConcernBucketDiscrimination(
      questionDef,
      idealCategoryHits,
      questionSignals.questionCategories
    ),
    ownerAnswerability: scoreOwnerAnswerability(
      questionDef,
      questionText,
      questionSignals.questionCategories
    ),
    repeatedQuestionBehavior: scoreRepeatedQuestionBehavior(repeated),
    genericWording: scoreGenericWording(
      isGeneric,
      questionSignals.questionCategories,
      idealCategoryHits,
      mustScreenHits
    ),
    reportUsefulnessValue: scoreReportUsefulnessValue(
      questionDef,
      questionSignals.questionCategories,
      idealCategoryHits,
      mustScreenHits
    ),
  };

  const averageScore = round(
    average(CATEGORY_KEYS.map((key: ScoreCategoryKey) => scores[key]))
  );
  const mustScreenMiss = mustScreenHits.length === 0;
  const weakPatterns = uniqueStrings([
    buildWeakPatternLabel(questionId, questionSignals, mustScreenMiss, isGeneric),
    mustScreenMiss ? "no-first-screen-hit" : null,
    repeated ? "repeat-question-risk" : null,
    idealCategoryHits.length === 0 ? "off-ideal-first-question" : null,
    scores.questionSpecificity <= 1 ? "low-specificity-first-question" : null,
    scores.reportUsefulnessValue <= 1 ? "low-report-value-first-question" : null,
  ]);

  return {
    caseDefinition,
    questionId,
    questionText,
    questionCategories: questionSignals.questionCategories,
    mustScreenHits,
    missedMustScreen,
    idealCategoryHits,
    isGeneric,
    repeated,
    scores,
    averageScore,
    weakPatterns,
  };
}

function summarizeComplaintFamilies(
  caseResults: CaseEvaluationResult[]
): ComplaintFamilySummary[] {
  const grouped = new Map<string, ComplaintFamilyAccumulator>();

  for (const result of caseResults) {
    const complaintFamily = result.caseDefinition.complaintFamily;
    const current: ComplaintFamilyAccumulator = grouped.get(complaintFamily) ?? {
      count: 0,
      totalScore: 0,
      weakCases: 0,
      missedScreens: 0,
      genericCases: 0,
      questionIds: new Set(),
      recommendedFirstModule: result.caseDefinition.recommendedFirstModule,
    };
    current.count += 1;
    current.totalScore += result.averageScore;
    current.weakCases += result.averageScore < 2 ? 1 : 0;
    current.missedScreens += result.mustScreenHits.length === 0 ? 1 : 0;
    current.genericCases += result.isGeneric ? 1 : 0;
    if (result.questionId) {
      current.questionIds.add(result.questionId);
    }
    grouped.set(complaintFamily, current);
  }

  return [...grouped.entries()]
    .map(([complaintFamily, entry]) => ({
      complaintFamily,
      averageScore: round(entry.totalScore / entry.count),
      count: entry.count,
      weakCases: entry.weakCases,
      missedScreens: entry.missedScreens,
      genericCases: entry.genericCases,
      questionIds: [...entry.questionIds].sort(),
      recommendedFirstModule: entry.recommendedFirstModule,
    }))
    .sort((left, right) => {
      if (left.averageScore !== right.averageScore) {
        return left.averageScore - right.averageScore;
      }
      return right.missedScreens - left.missedScreens;
    });
}

function summarizeRecommendedModules(
  complaintFamilySummaries: ComplaintFamilySummary[]
): RecommendedModuleSummary[] {
  const moduleMap = new Map<string, RecommendedModuleAccumulator>();

  for (const summary of complaintFamilySummaries) {
    if (summary.averageScore >= 2 && summary.missedScreens === 0) {
      continue;
    }

    const moduleId = summary.recommendedFirstModule;
    if (!moduleId) continue;

    const current: RecommendedModuleAccumulator = moduleMap.get(moduleId) ?? {
      count: 0,
      complaintFamilies: [],
      weakestScore: 3,
    };
    current.count += summary.weakCases > 0 ? summary.weakCases : summary.count;
    if (!current.complaintFamilies.includes(summary.complaintFamily)) {
      current.complaintFamilies.push(summary.complaintFamily);
    }
    current.weakestScore = Math.min(current.weakestScore, summary.averageScore);
    moduleMap.set(moduleId, current);
  }

  return [...moduleMap.entries()]
    .map(([moduleId, entry]) => ({
      moduleId,
      count: entry.count,
      weakestScore: round(entry.weakestScore),
      complaintFamilies: entry.complaintFamilies.sort(),
      description: MODULE_DESCRIPTIONS[moduleId] ?? "No description available.",
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.weakestScore - right.weakestScore;
    });
}

function aggregateResults(
  cases: EvalFixtureCase[],
  caseResults: CaseEvaluationResult[]
): EvaluationSummary {
  const weakPatternMap = new Map<string, FrequencyAccumulatorEntry>();
  const missedScreenMap = new Map<string, FrequencyAccumulatorEntry>();

  for (const result of caseResults) {
    for (const weakPattern of result.weakPatterns) {
      addFrequencyEntry(weakPatternMap, weakPattern, result.caseDefinition, result.questionId);
    }
    for (const missedTag of result.missedMustScreen) {
      addFrequencyEntry(missedScreenMap, missedTag, result.caseDefinition, result.questionId);
    }
  }

  const categoryScores = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [
      key,
      round(average(caseResults.map((result) => result.scores[key]))),
    ])
  ) as CategoryScoreMap;
  const complaintFamilySummaries = summarizeComplaintFamilies(caseResults);

  return {
    totalCases: cases.length,
    categoryCounts: countByCategory(cases),
    averageQuestionScore: round(
      average(caseResults.map((result) => result.averageScore))
    ),
    genericQuestionRate: round(
      rate(caseResults.filter((result) => result.isGeneric).length, caseResults.length)
    ),
    emergencyRedFlagMissRate: round(
      rate(
        caseResults.filter((result) => result.mustScreenHits.length === 0).length,
        caseResults.length
      )
    ),
    firstQuestionEmergencyScreenRate: round(
      rate(
        caseResults.filter((result) => result.mustScreenHits.length > 0).length,
        caseResults.length
      )
    ),
    repeatedQuestionRate: round(
      rate(caseResults.filter((result) => result.repeated).length, caseResults.length)
    ),
    categoryScores,
    weakPatterns: summarizeFrequencyMap(weakPatternMap, 20, "pattern"),
    missedRedFlagPatterns: summarizeFrequencyMap(missedScreenMap, 20, "pattern"),
    complaintFamilySummaries,
    worstComplaintFamilies: complaintFamilySummaries.slice(0, 8),
    recommendedFirstModules: summarizeRecommendedModules(complaintFamilySummaries),
  };
}

async function runEvaluation(
  options: RunEvaluationOptions = {}
): Promise<EvaluationReport> {
  const runtime = await loadQuestionRuntime();
  const fixturePath = options.fixturePath || FIXTURE_PATH;
  const cases = loadCases(fixturePath);
  const caseResults = cases.map((caseDefinition) =>
    evaluateCase(caseDefinition, runtime)
  );

  return {
    fixturePath,
    cases,
    caseResults,
    summary: aggregateResults(cases, caseResults),
  };
}

function formatSummary(report: EvaluationReport): string {
  const lines: string[] = [];
  lines.push("PAWVITAL QUESTION INTELLIGENCE BASELINE");
  lines.push("=======================================");
  lines.push(`Fixture: ${report.fixturePath}`);
  lines.push(`Total cases: ${report.summary.totalCases}`);
  lines.push(
    `Scenario counts: emergency=${report.summary.categoryCounts.emergency ?? 0}, urgent_same_day=${report.summary.categoryCounts.urgent_same_day ?? 0}, routine_unclear=${report.summary.categoryCounts.routine_unclear ?? 0}, confusing_multi_symptom=${report.summary.categoryCounts.confusing_multi_symptom ?? 0}`
  );
  lines.push(
    `Average question score: ${formatScore(report.summary.averageQuestionScore)}`
  );
  lines.push(
    `Generic question rate: ${formatPercent(report.summary.genericQuestionRate)}`
  );
  lines.push(
    `Emergency red-flag miss rate: ${formatPercent(report.summary.emergencyRedFlagMissRate)}`
  );
  lines.push(
    `First-question emergency-screen rate: ${formatPercent(report.summary.firstQuestionEmergencyScreenRate)}`
  );
  lines.push(
    `Repeated-question rate: ${formatPercent(report.summary.repeatedQuestionRate)}`
  );
  lines.push("Per-category scores:");
  for (const key of CATEGORY_KEYS) {
    lines.push(`  ${CATEGORY_LABELS[key]}: ${formatScore(report.summary.categoryScores[key])}`);
  }

  lines.push("Worst complaint families:");
  for (const family of report.summary.worstComplaintFamilies) {
    lines.push(
      `  ${family.complaintFamily}: ${formatScore(family.averageScore)} | missed screens ${family.missedScreens}/${family.count} | first questions ${family.questionIds.join(", ")}`
    );
  }

  lines.push("Top 20 generic or weak question patterns:");
  if (report.summary.weakPatterns.length === 0) {
    lines.push("  none");
  } else {
    for (const pattern of report.summary.weakPatterns) {
      lines.push(
        `  ${pattern.pattern}: ${pattern.count} case(s) [${pattern.complaintFamilies.join(", ")}]`
      );
    }
  }

  lines.push("Top 20 missed red-flag patterns:");
  if (report.summary.missedRedFlagPatterns.length === 0) {
    lines.push("  none");
  } else {
    for (const pattern of report.summary.missedRedFlagPatterns) {
      lines.push(
        `  ${pattern.pattern}: ${pattern.count} case(s) [${pattern.complaintFamilies.join(", ")}]`
      );
    }
  }

  lines.push("Recommended first complaint modules:");
  if (report.summary.recommendedFirstModules.length === 0) {
    lines.push("  none");
  } else {
    for (const moduleSummary of report.summary.recommendedFirstModules) {
      lines.push(
        `  ${moduleSummary.moduleId}: ${moduleSummary.count} weak case(s) [${moduleSummary.complaintFamilies.join(", ")}] — ${moduleSummary.description}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const report = await runEvaluation();
  process.stdout.write(formatSummary(report));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CATEGORY_KEYS,
  FIXTURE_PATH,
  formatSummary,
  loadCases,
  loadQuestionRuntime,
  normalizeCaseDefinition,
  runEvaluation,
  __private: {
    aggregateResults,
    buildWeakPatternLabel,
    evaluateCase,
    getQuestionSignals,
    isGenericQuestion,
    scoreConcernBucketDiscrimination,
    scoreEmergencyRedFlagCoverage,
    scoreGenericWording,
    scoreOwnerAnswerability,
    scoreQuestionSpecificity,
    scoreRepeatedQuestionBehavior,
    scoreReportUsefulnessValue,
    scoreUrgencyChangingValue,
    summarizeComplaintFamilies,
    summarizeRecommendedModules,
    validateCaseSet,
  },
};
