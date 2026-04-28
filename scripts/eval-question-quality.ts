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
  "specificity",
  "urgencyValue",
  "redFlagCoverage",
  "concernBucketDiscrimination",
  "ownerAnswerability",
  "reportValue",
  "repetitionSafety",
];
const CATEGORY_LABELS = {
  specificity: "specificity",
  urgencyValue: "urgency value",
  redFlagCoverage: "red-flag coverage",
  concernBucketDiscrimination: "concern-bucket discrimination",
  ownerAnswerability: "owner answerability",
  reportValue: "report value",
  repetitionSafety: "repetition safety",
};
const GENERIC_QUESTION_PATTERNS = [
  /\bcan you tell me more\b/i,
  /\btell me more\b/i,
  /\bwhat else\b/i,
  /\bwhat has changed\b/i,
  /\bwhat have you noticed\b/i,
  /\bcan you describe\b/i,
  /\btell me what you've noticed\b/i,
];
const DISCRIMINATIVE_QUESTION_PATTERNS = [
  /\bhow long\b/i,
  /\bhow often\b/i,
  /\bwhen\b/i,
  /\bwhat color\b/i,
  /\bwhich\b/i,
  /\bwhere\b/i,
  /\bhow much\b/i,
  /\bhow many\b/i,
  /\brate\b/i,
  /\bfrequency\b/i,
  /\bduration\b/i,
  /\bonset\b/i,
  /\bamount\b/i,
  /\bsize\b/i,
  /\bleg\b/i,
  /\bgum\b/i,
  /\bblood\b/i,
  /\bdrink\b/i,
  /\beat\b/i,
  /\bretch\b/i,
  /\bweight\bW*bearing\b/i,
];
const OWNER_JARGON_PATTERNS = [
  /\bcyanosis\b/i,
  /\bdyspnea\b/i,
  /\bhematochezia\b/i,
  /\bpolydipsia\b/i,
  /\bregurgitation\b/i,
  /\bneurologic\b/i,
  /\bmucous membranes?\b/i,
  /\babdominal distension\b/i,
];
const MODULE_DESCRIPTIONS = {
  emergency_screening:
    "Prioritize immediate red-flag screening for high-risk symptom clusters.",
  red_flag_coverage:
    "Improve direct coverage of symptom-specific emergency triggers.",
  question_specificity:
    "Reduce generic prompts and anchor follow-ups to observable complaint details.",
  concern_bucket_discrimination:
    "Bias question choice toward prompts that separate complaint families cleanly.",
  owner_answerability:
    "Prefer owner-observable questions and avoid phrasing that requires interpretation.",
  report_structure:
    "Favor structured answers that produce cleaner downstream report facts.",
  repeat_guard:
    "Strengthen repeat-avoidance when a follow-up was just asked or answered.",
  question_selection_alignment:
    "Align deterministic selection with explicitly expected or reviewed follow-up targets.",
};
const RED_FLAG_SCREEN_QUESTION_IDS = {
  active_bleeding_trauma: ["active_bleeding_trauma"],
  balance_loss: ["balance_issues", "head_tilt"],
  blue_gums: ["gum_color"],
  bloody_diarrhea_puppy: ["stool_blood", "blood_amount"],
  breathing_difficulty: ["breathing_rate", "position_preference"],
  breathing_onset_sudden: ["breathing_onset"],
  collapse: ["consciousness_level"],
  cough_blood: ["cough_type", "cough_timing"],
  eye_bulging: ["eye_redness", "vision_changes"],
  eye_swollen_shut: ["squinting", "eye_redness"],
  face_swelling: ["hives_with_breathing", "skin_changes"],
  hives_widespread: ["hives_with_breathing", "skin_changes"],
  inability_to_stand: ["trauma_mobility", "hind_limb_function", "weight_bearing"],
  large_blood_volume: ["blood_amount", "stool_blood"],
  no_water_24h: ["water_intake"],
  non_weight_bearing: ["weight_bearing", "trauma_mobility", "hind_limb_function"],
  not_drinking: ["water_intake"],
  pale_gums: ["gum_color"],
  pyometra_signs: ["spay_status"],
  rapid_onset_distension: ["abdomen_onset", "restlessness"],
  rat_poison_confirmed: ["rat_poison_access", "toxin_exposure"],
  sudden_blindness: ["vision_changes"],
  sudden_paralysis: ["weight_bearing", "hind_limb_function", "trauma_mobility"],
  toxin_confirmed: [
    "toxin_exposure",
    "reaction_symptoms",
    "medication_name",
    "current_medications",
  ],
  unproductive_retching: ["unproductive_retching"],
  unresponsive: ["consciousness_level"],
  visible_fracture: ["visible_fracture", "trauma_mobility"],
  wound_bone_visible: ["wound_size", "wound_color"],
  wound_deep_bleeding: ["wound_discharge", "wound_color", "wound_size"],
  wound_spreading_rapidly: ["wound_duration", "wound_size", "wound_color"],
  wound_tissue_exposed: ["wound_size", "wound_color"],
};
const RED_FLAG_KEYWORD_ALIASES = {
  active_bleeding_trauma: ["bleeding", "bleed", "blood"],
  balance_loss: ["balance", "falling", "wobbly"],
  blue_gums: ["gum", "gums"],
  bloody_diarrhea_puppy: ["blood", "bloody"],
  breathing_difficulty: ["breathing", "breathe", "air"],
  breathing_onset_sudden: ["started", "sudden", "suddenly", "onset"],
  collapse: ["responsive", "conscious", "collapse"],
  cough_blood: ["blood", "bloody"],
  eye_bulging: ["eye", "bulging", "swollen"],
  eye_swollen_shut: ["eye", "shut", "swollen"],
  face_swelling: ["face", "swelling", "swollen"],
  hives_widespread: ["hives", "widespread", "skin"],
  inability_to_stand: ["stand", "standing", "walk"],
  large_blood_volume: ["blood", "amount", "how much"],
  no_water_24h: ["drink", "water", "drinking"],
  non_weight_bearing: ["weight", "bearing", "walk", "stand"],
  not_drinking: ["drink", "water", "drinking"],
  pale_gums: ["gum", "gums"],
  pyometra_signs: ["spayed", "spay"],
  rapid_onset_distension: ["started", "sudden", "swollen", "abdomen", "belly"],
  rat_poison_confirmed: ["rat poison", "bait", "toxin", "rodenticide"],
  sudden_blindness: ["vision", "see", "blind"],
  sudden_paralysis: ["stand", "walk", "legs", "paralysis"],
  toxin_confirmed: ["toxin", "medication", "poison", "exposure"],
  unproductive_retching: ["retch", "trying to vomit"],
  unresponsive: ["responsive", "conscious"],
  visible_fracture: ["fracture", "broken", "bone"],
  wound_bone_visible: ["wound", "bone", "deep"],
  wound_deep_bleeding: ["wound", "bleeding", "blood"],
  wound_spreading_rapidly: ["spreading", "rapidly", "wound"],
  wound_tissue_exposed: ["wound", "tissue", "exposed"],
};

let hooksRegistered = false;
let runtimePromise = null;

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value) {
  return Number(value.toFixed(3));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function safeRate(numerator, denominator) {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
}

function getTextCaseId(rawCase, index) {
  const value = rawCase.id ?? rawCase.caseId ?? rawCase.slug ?? `case-${index + 1}`;
  return String(value).trim();
}

function normalizeCaseDefinition(rawCase, index) {
  if (!rawCase || typeof rawCase !== "object") {
    throw new Error(`Fixture case at index ${index} must be an object`);
  }

  const id = getTextCaseId(rawCase, index);
  const symptomKeys = normalizeStringArray(
    rawCase.symptomKeys ?? rawCase.symptoms ?? rawCase.knownSymptoms
  );
  const turnFocusSymptoms = normalizeStringArray(
    rawCase.turnFocusSymptoms ??
      rawCase.focusSymptoms ??
      rawCase.preferredSymptoms ??
      rawCase.turn_focus_symptoms
  );
  const redFlags = normalizeStringArray(
    rawCase.redFlags ?? rawCase.expectedRedFlags ?? rawCase.emergencySignals
  );
  const tags = normalizeStringArray(rawCase.tags);
  const expectedQuestionIds = normalizeStringArray(
    rawCase.expectedQuestionIds ?? rawCase.expectedQuestionId
  );
  const recommendedModules = normalizeStringArray(
    rawCase.recommendedModules ?? rawCase.modules
  );

  if (symptomKeys.length === 0) {
    throw new Error(`Fixture case "${id}" must include at least one symptom key`);
  }

  return {
    id,
    symptomKeys,
    turnFocusSymptoms,
    concernBucket: rawCase.concernBucket ?? rawCase.expectedConcernBucket ?? null,
    emergency:
      Boolean(rawCase.emergency) ||
      Boolean(rawCase.mustScreenEmergency) ||
      Boolean(rawCase.mustScreenUrgent) ||
      redFlags.length > 0,
    redFlags,
    expectedQuestionIds,
    recommendedModules,
    tags,
    notes: rawCase.notes ? String(rawCase.notes) : null,
  };
}

function loadCases(fixturePath = FIXTURE_PATH) {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Question-quality fixture not found: ${fixturePath}`);
  }

  const rawFixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const rawCases = Array.isArray(rawFixture)
    ? rawFixture
    : Array.isArray(rawFixture?.cases)
      ? rawFixture.cases
      : null;

  if (!rawCases) {
    throw new Error(
      `Question-quality fixture must be an array or { cases: [] }: ${fixturePath}`
    );
  }

  return rawCases.map((rawCase, index) => normalizeCaseDefinition(rawCase, index));
}

function registerTypeScriptHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  registerHooks({
    resolve(specifier, context, defaultResolve) {
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

async function withFilteredRuntimeWarnings(work) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function patchedEmitWarning(warning, ...args) {
    const primaryArg = args[0];
    const warningCode =
      (warning && typeof warning === "object" && warning.code) ||
      (primaryArg &&
      typeof primaryArg === "object" &&
      !Array.isArray(primaryArg) &&
      primaryArg.code
        ? primaryArg.code
        : null);
    const warningText =
      typeof warning === "string"
        ? warning
        : warning && typeof warning.message === "string"
          ? warning.message
          : "";

    if (
      warningCode === "MODULE_TYPELESS_PACKAGE_JSON" ||
      warningText.includes("MODULE_TYPELESS_PACKAGE_JSON")
    ) {
      return;
    }

    return originalEmitWarning.call(process, warning, ...args);
  };

  try {
    return await work();
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function loadQuestionRuntime() {
  if (runtimePromise) {
    return runtimePromise;
  }

  runtimePromise = (async () => {
    registerTypeScriptHooks();

    return withFilteredRuntimeWarnings(async () => {
      const triageEngine = await import(
        pathToFileURL(path.join(ROOT, "src", "lib", "triage-engine.ts")).href
      );
      const questionSelection = await import(
        pathToFileURL(
          path.join(ROOT, "src", "lib", "symptom-chat", "answer-coercion.ts")
        ).href
      );
      const clinicalMatrix = await import(
        pathToFileURL(path.join(ROOT, "src", "lib", "clinical-matrix.ts")).href
      );

      return {
        createSession: triageEngine.createSession,
        addSymptoms: triageEngine.addSymptoms,
        getQuestionText: triageEngine.getQuestionText,
        getSymptomPriorityScore: triageEngine.getSymptomPriorityScore,
        getNextQuestionAvoidingRepeat:
          questionSelection.getNextQuestionAvoidingRepeat,
        FOLLOW_UP_QUESTIONS: clinicalMatrix.FOLLOW_UP_QUESTIONS,
        SYMPTOM_MAP: clinicalMatrix.SYMPTOM_MAP,
      };
    });
  })();

  return runtimePromise;
}

function questionUsesGenericPattern(questionText) {
  if (!questionText) return true;
  return GENERIC_QUESTION_PATTERNS.some((pattern) => pattern.test(questionText));
}

function questionHasDiscriminativeSignal(questionText) {
  return DISCRIMINATIVE_QUESTION_PATTERNS.some((pattern) => pattern.test(questionText));
}

function normalizeFlagTokens(value) {
  return String(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/s$/u, ""))
    .filter((token) => token.length >= 3);
}

function questionScreensRedFlag(questionId, questionText, redFlag) {
  if (!questionId || !questionText || !redFlag) {
    return false;
  }

  if (questionId === redFlag) {
    return true;
  }

  const aliasQuestionIds = RED_FLAG_SCREEN_QUESTION_IDS[redFlag] ?? [];
  if (aliasQuestionIds.includes(questionId)) {
    return true;
  }

  const lowerText = questionText.toLowerCase();
  const questionTokens = new Set([
    ...normalizeFlagTokens(questionId),
    ...normalizeFlagTokens(questionText),
  ]);
  const redFlagTokens = normalizeFlagTokens(redFlag);
  const keywordAliases = RED_FLAG_KEYWORD_ALIASES[redFlag] ?? [];

  if (keywordAliases.some((keyword) => lowerText.includes(keyword.toLowerCase()))) {
    return true;
  }

  return redFlagTokens.some((token) => questionTokens.has(token));
}

function getRelevantRedFlags(caseDefinition, focusSymptoms, symptomMap) {
  if (caseDefinition.redFlags.length > 0) {
    return caseDefinition.redFlags;
  }

  return [...new Set(
    focusSymptoms.flatMap((symptom) => symptomMap[symptom]?.red_flags ?? [])
  )];
}

function scoreSpecificity({
  questionDef,
  questionId,
  questionText,
  generic,
  focusMatchCount,
}) {
  if (!questionId || !questionDef || !questionText) return 0;

  let score = 0.3;
  if (!generic) score += 0.2;
  if (questionDef.critical) score += 0.15;
  if (questionDef.data_type !== "string") score += 0.15;
  if (questionHasDiscriminativeSignal(questionText)) score += 0.15;
  if (focusMatchCount > 0) score += 0.1;
  if (Array.isArray(questionDef.choices) && questionDef.choices.length > 0) {
    score += 0.05;
  }

  return clamp01(score);
}

function scoreUrgencyValue({
  questionDef,
  isEmergencyCase,
  emergencyScreened,
  generic,
  focusPriority,
}) {
  if (!questionDef) return 0;

  if (isEmergencyCase || focusPriority >= 8) {
    if (questionDef.critical && emergencyScreened) return 1;
    if (emergencyScreened) return 0.8;
    if (questionDef.critical) return 0.45;
    return generic ? 0.1 : 0.25;
  }

  if (questionDef.critical) return 0.95;
  if (generic) return 0.55;
  return 0.8;
}

function scoreRedFlagCoverage(relevantRedFlags, coveredRedFlags, questionDef) {
  if (!questionDef) return 0;
  if (relevantRedFlags.length === 0) {
    return questionDef.critical ? 1 : 0.8;
  }

  return coveredRedFlags.length / relevantRedFlags.length;
}

function scoreConcernBucketDiscrimination({
  questionId,
  questionText,
  focusMatchCount,
  focusSymptoms,
  sessionFocusFollowUpCount,
  generic,
}) {
  if (!questionId || !questionText) return 0;

  let score = generic ? 0.2 : 0.4;
  if (focusMatchCount > 0) score += 0.25;
  if (focusSymptoms.length > 1 && focusMatchCount === 1) score += 0.15;
  if (sessionFocusFollowUpCount <= 3) score += 0.1;
  if (questionHasDiscriminativeSignal(questionText)) score += 0.1;

  return clamp01(score);
}

function scoreOwnerAnswerability(questionDef, questionText) {
  if (!questionDef || !questionText) return 0;

  const dataTypeScore = {
    boolean: 0.95,
    choice: 0.9,
    number: 0.85,
    string: 0.75,
  }[questionDef.data_type] ?? 0.7;

  let score = dataTypeScore;
  const wordCount = questionText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 18) score -= 0.15;
  if (OWNER_JARGON_PATTERNS.some((pattern) => pattern.test(questionText))) {
    score -= 0.2;
  }
  if (/^(is|are|has|have|did|does|when|how long|how often|what color|which)\b/i.test(questionText)) {
    score += 0.05;
  }

  return clamp01(score);
}

function scoreReportValue(questionDef, questionText, generic) {
  if (!questionDef || !questionText) return 0;

  let score = {
    choice: 0.95,
    boolean: 0.9,
    number: 0.85,
    string: 0.7,
  }[questionDef.data_type] ?? 0.7;

  if (questionDef.critical) score += 0.05;
  if (String(questionDef.extraction_hint ?? "").trim().length >= 10) score += 0.05;
  if (generic) score -= 0.25;

  return clamp01(score);
}

function buildWeakPatterns({
  caseDefinition,
  generic,
  questionId,
  questionText,
  categories,
  repeated,
  missedRedFlags,
  emergencyMiss,
}) {
  const weakPatterns = [];

  if (!questionId) {
    weakPatterns.push("no-question-selected");
    return weakPatterns;
  }

  if (generic) weakPatterns.push("generic-question");
  if (categories.specificity < 0.7) weakPatterns.push("low-specificity");
  if (categories.urgencyValue < 0.7) weakPatterns.push("low-urgency-value");
  if (categories.redFlagCoverage < 0.75) weakPatterns.push("weak-red-flag-coverage");
  if (categories.concernBucketDiscrimination < 0.75) {
    weakPatterns.push("weak-concern-bucket-discrimination");
  }
  if (categories.ownerAnswerability < 0.75) {
    weakPatterns.push("low-owner-answerability");
  }
  if (categories.reportValue < 0.75) weakPatterns.push("low-report-value");
  if (repeated) weakPatterns.push("repeat-guard-failure");
  if (
    caseDefinition.expectedQuestionIds.length > 0 &&
    !caseDefinition.expectedQuestionIds.includes(questionId)
  ) {
    weakPatterns.push("unexpected-question-selection");
  }
  if (emergencyMiss) weakPatterns.push("missed-emergency-screen");
  for (const redFlag of missedRedFlags) {
    weakPatterns.push(`missed-red-flag:${redFlag}`);
  }
  if (!questionText.trim()) weakPatterns.push("empty-question-text");

  return weakPatterns;
}

function buildRecommendedModules(caseResult) {
  const modules = [];

  if (caseResult.generic || caseResult.categories.specificity < 0.7) {
    modules.push("question_specificity");
  }
  if (caseResult.emergencyMiss || caseResult.categories.urgencyValue < 0.7) {
    modules.push("emergency_screening");
  }
  if (caseResult.categories.redFlagCoverage < 0.75) {
    modules.push("red_flag_coverage");
  }
  if (caseResult.categories.concernBucketDiscrimination < 0.75) {
    modules.push("concern_bucket_discrimination");
  }
  if (caseResult.categories.ownerAnswerability < 0.75) {
    modules.push("owner_answerability");
  }
  if (caseResult.categories.reportValue < 0.75) {
    modules.push("report_structure");
  }
  if (caseResult.repeated) {
    modules.push("repeat_guard");
  }
  if (
    caseResult.caseDefinition.expectedQuestionIds.length > 0 &&
    !caseResult.caseDefinition.expectedQuestionIds.includes(caseResult.questionId)
  ) {
    modules.push("question_selection_alignment");
  }

  return [...new Set([...modules, ...caseResult.caseDefinition.recommendedModules])];
}

function createFrequencyMap() {
  return new Map();
}

function addFrequencyEntry(map, key, caseId, extra) {
  const current = map.get(key) ?? { count: 0, cases: [], extras: new Set() };
  current.count += 1;
  if (current.cases.length < 5 && !current.cases.includes(caseId)) {
    current.cases.push(caseId);
  }
  if (extra) {
    current.extras.add(extra);
  }
  map.set(key, current);
}

function summarizeFrequencyMap(map, limit, formatter) {
  return [...map.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }
      return String(left[0]).localeCompare(String(right[0]));
    })
    .slice(0, limit)
    .map(([key, entry]) => formatter(key, entry));
}

function evaluateCase(caseDefinition, runtime) {
  const session = runtime.addSymptoms(
    runtime.createSession(),
    caseDefinition.symptomKeys
  );
  const focusSymptoms =
    caseDefinition.turnFocusSymptoms.length > 0
      ? caseDefinition.turnFocusSymptoms
      : caseDefinition.symptomKeys;
  const questionId = runtime.getNextQuestionAvoidingRepeat(session, focusSymptoms);
  const questionText = questionId ? runtime.getQuestionText(questionId) : "";
  const questionDef = questionId ? runtime.FOLLOW_UP_QUESTIONS[questionId] ?? null : null;
  const generic = questionUsesGenericPattern(questionText);
  const relevantRedFlags = getRelevantRedFlags(
    caseDefinition,
    focusSymptoms,
    runtime.SYMPTOM_MAP
  );
  const coveredRedFlags = relevantRedFlags.filter((redFlag) =>
    questionScreensRedFlag(questionId, questionText, redFlag)
  );
  const missedRedFlags = relevantRedFlags.filter(
    (redFlag) => !coveredRedFlags.includes(redFlag)
  );
  const focusEntries = focusSymptoms
    .map((symptom) => runtime.SYMPTOM_MAP[symptom])
    .filter(Boolean);
  const focusPriority = Math.max(
    0,
    ...focusSymptoms.map((symptom) => runtime.getSymptomPriorityScore(symptom))
  );
  const focusMatchCount = focusSymptoms.filter((symptom) =>
    runtime.SYMPTOM_MAP[symptom]?.follow_up_questions?.includes(questionId)
  ).length;
  const sessionFocusFollowUpCount = new Set(
    focusEntries.flatMap((entry) => entry.follow_up_questions ?? [])
  ).size;
  const isEmergencyCase =
    caseDefinition.emergency || relevantRedFlags.length > 0 || focusPriority >= 8;
  const emergencyScreened =
    Boolean(questionDef?.critical) || coveredRedFlags.length > 0;

  const repeated = Boolean(questionId) && (() => {
    const answeredQuestions = [...session.answered_questions];
    if (!answeredQuestions.includes(questionId)) {
      answeredQuestions.push(questionId);
    }
    const replaySession = {
      ...session,
      answered_questions: answeredQuestions,
      last_question_asked: questionId,
    };
    return (
      runtime.getNextQuestionAvoidingRepeat(replaySession, focusSymptoms) === questionId
    );
  })();

  const categories = {
    specificity: round(
      scoreSpecificity({
        questionDef,
        questionId,
        questionText,
        generic,
        focusMatchCount,
      })
    ),
    urgencyValue: round(
      scoreUrgencyValue({
        questionDef,
        isEmergencyCase,
        emergencyScreened,
        generic,
        focusPriority,
      })
    ),
    redFlagCoverage: round(
      scoreRedFlagCoverage(relevantRedFlags, coveredRedFlags, questionDef)
    ),
    concernBucketDiscrimination: round(
      scoreConcernBucketDiscrimination({
        questionId,
        questionText,
        focusMatchCount,
        focusSymptoms,
        sessionFocusFollowUpCount,
        generic,
      })
    ),
    ownerAnswerability: round(scoreOwnerAnswerability(questionDef, questionText)),
    reportValue: round(scoreReportValue(questionDef, questionText, generic)),
    repetitionSafety: repeated ? 0 : 1,
  };

  const overallScore = round(mean(CATEGORY_KEYS.map((key) => categories[key])));
  const emergencyMiss = Boolean(isEmergencyCase && !emergencyScreened);
  const weakPatterns = buildWeakPatterns({
    caseDefinition,
    generic,
    questionId,
    questionText,
    categories,
    repeated,
    missedRedFlags,
    emergencyMiss,
  });

  const caseResult = {
    caseDefinition,
    questionId,
    questionText,
    questionDef,
    categories,
    overallScore,
    generic,
    repeated,
    focusPriority,
    isEmergencyCase,
    emergencyScreened,
    emergencyMiss,
    relevantRedFlags,
    coveredRedFlags,
    missedRedFlags,
    weakPatterns,
  };

  return {
    ...caseResult,
    recommendedModules: buildRecommendedModules(caseResult),
  };
}

function aggregateResults(caseResults) {
  const emergencyCaseCount = caseResults.filter(
    (result) => result.isEmergencyCase
  ).length;
  const categoryScores = Object.fromEntries(
    CATEGORY_KEYS.map((key) => [
      key,
      round(mean(caseResults.map((result) => result.categories[key]))),
    ])
  );
  const weakPatternMap = createFrequencyMap();
  const missedRedFlagMap = createFrequencyMap();
  const recommendedModuleMap = createFrequencyMap();

  for (const result of caseResults) {
    for (const weakPattern of result.weakPatterns) {
      addFrequencyEntry(
        weakPatternMap,
        weakPattern,
        result.caseDefinition.id,
        result.questionId || "none"
      );
    }
    for (const redFlag of result.missedRedFlags) {
      addFrequencyEntry(
        missedRedFlagMap,
        redFlag,
        result.caseDefinition.id,
        result.questionId || "none"
      );
    }
    for (const moduleId of result.recommendedModules) {
      addFrequencyEntry(
        recommendedModuleMap,
        moduleId,
        result.caseDefinition.id,
        result.questionId || "none"
      );
    }
  }

  return {
    totalCases: caseResults.length,
    averageScore: round(mean(caseResults.map((result) => result.overallScore))),
    categoryScores,
    genericRate: round(
      safeRate(
        caseResults.filter((result) => result.generic).length,
        caseResults.length
      )
    ),
    emergencyCaseCount,
    emergencyMissRate: round(
      safeRate(
        caseResults.filter((result) => result.emergencyMiss).length,
        emergencyCaseCount
      )
    ),
    emergencyScreenRate: round(
      safeRate(
        caseResults.filter((result) => result.emergencyScreened).length,
        emergencyCaseCount
      )
    ),
    repeatedRate: round(
      safeRate(
        caseResults.filter((result) => result.repeated).length,
        caseResults.length
      )
    ),
    weakPatterns: summarizeFrequencyMap(weakPatternMap, 20, (pattern, entry) => ({
      pattern,
      count: entry.count,
      cases: entry.cases,
      questionIds: [...entry.extras],
    })),
    missedRedFlags: summarizeFrequencyMap(missedRedFlagMap, 20, (redFlag, entry) => ({
      redFlag,
      count: entry.count,
      cases: entry.cases,
      questionIds: [...entry.extras],
    })),
    recommendedModules: summarizeFrequencyMap(
      recommendedModuleMap,
      20,
      (moduleId, entry) => ({
        moduleId,
        count: entry.count,
        cases: entry.cases,
        questionIds: [...entry.extras],
        description: MODULE_DESCRIPTIONS[moduleId] || "No description available.",
      })
    ),
  };
}

async function runEvaluation(options = {}) {
  const runtime = await loadQuestionRuntime();
  const fixturePath = options.fixturePath || FIXTURE_PATH;
  const cases = loadCases(fixturePath);
  const caseResults = cases.map((caseDefinition) =>
    evaluateCase(caseDefinition, runtime)
  );

  return {
    fixturePath,
    caseResults,
    summary: aggregateResults(caseResults),
  };
}

function formatSummary(report) {
  const lines = [];
  lines.push("PAWVITAL QUESTION-QUALITY EVAL");
  lines.push("================================");
  lines.push(`Fixture: ${report.fixturePath}`);
  lines.push(`Total cases: ${report.summary.totalCases}`);
  lines.push(`Average score: ${formatPercent(report.summary.averageScore)}`);
  lines.push("Category scores:");
  for (const key of CATEGORY_KEYS) {
    lines.push(
      `  ${CATEGORY_LABELS[key]}: ${formatPercent(report.summary.categoryScores[key])}`
    );
  }
  lines.push(`Generic rate: ${formatPercent(report.summary.genericRate)}`);
  lines.push(
    `Emergency miss rate: ${formatPercent(report.summary.emergencyMissRate)} (${report.summary.emergencyCaseCount} emergency case(s))`
  );
  lines.push(
    `Emergency-screen rate: ${formatPercent(report.summary.emergencyScreenRate)} (${report.summary.emergencyCaseCount} emergency case(s))`
  );
  lines.push(`Repeated rate: ${formatPercent(report.summary.repeatedRate)}`);

  lines.push("Top 20 weak patterns:");
  if (report.summary.weakPatterns.length === 0) {
    lines.push("  none");
  } else {
    for (const item of report.summary.weakPatterns) {
      lines.push(
        `  ${item.pattern}: ${item.count} case(s) [${item.cases.join(", ")}]`
      );
    }
  }

  lines.push("Top 20 missed red flags:");
  if (report.summary.missedRedFlags.length === 0) {
    lines.push("  none");
  } else {
    for (const item of report.summary.missedRedFlags) {
      lines.push(
        `  ${item.redFlag}: ${item.count} case(s) [${item.cases.join(", ")}]`
      );
    }
  }

  lines.push("Recommended modules:");
  if (report.summary.recommendedModules.length === 0) {
    lines.push("  none");
  } else {
    for (const item of report.summary.recommendedModules) {
      lines.push(
        `  ${item.moduleId}: ${item.count} case(s) [${item.cases.join(", ")}] — ${item.description}`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
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
  evaluateCase,
  formatSummary,
  loadCases,
  loadQuestionRuntime,
  normalizeCaseDefinition,
  runEvaluation,
  __private: {
    aggregateResults,
    buildRecommendedModules,
    buildWeakPatterns,
    questionScreensRedFlag,
    questionUsesGenericPattern,
    scoreConcernBucketDiscrimination,
    scoreOwnerAnswerability,
    scoreRedFlagCoverage,
    scoreReportValue,
    scoreSpecificity,
    scoreUrgencyValue,
  },
};
