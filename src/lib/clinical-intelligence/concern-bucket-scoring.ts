import type { ClinicalCaseState } from "./case-state";
import type { ConcernBucketDefinition, ScoredConcernBucket } from "./concern-buckets";
import { getConcernBucketDefinitions } from "./concern-buckets";

const SCORE_CLAMP_MIN = 0;
const SCORE_CLAMP_MAX = 100;

const POSITIVE_RED_FLAG_SCORE = 35;
const CLINICAL_SIGNAL_SCORE = 20;
const EXPLICIT_ANSWER_SCORE = 15;
const UNKNOWN_EMERGENCY_SLOT_SCORE = 5;

function normalizeAnswerValue(value: unknown): string {
  return String(value).trim().toLowerCase().replace(/[_-]+/g, " ");
}

function includesAny(text: string, snippets: readonly string[]): boolean {
  return snippets.some((snippet) => text.includes(snippet));
}

function parseNumericAnswer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isAffirmativeAnswer(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  const normalized = normalizeAnswerValue(value);
  return ["yes", "true", "male", "present"].includes(normalized);
}

function hasMeaningfulText(value: unknown): boolean {
  const normalized = normalizeAnswerValue(value);

  if (!normalized) {
    return false;
  }

  return ![
    "no",
    "none",
    "normal",
    "pink normal",
    "unknown",
    "not sure",
    "false",
  ].includes(normalized);
}

function formatEvidenceValue(value: unknown): string {
  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function doesExplicitAnswerSupportConcern(
  answerKey: string,
  value: unknown
): boolean {
  const normalized = normalizeAnswerValue(value);
  const numericValue = parseNumericAnswer(value);

  switch (answerKey) {
    case "gum_color":
      return includesAny(normalized, ["blue", "pale", "white", "gray", "grey"]);
    case "difficulty_breathing":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, [
          "trouble",
          "hard",
          "labored",
          "laboured",
          "difficult",
          "open mouth",
          "fast",
          "rapid",
          "noisy",
          "struggling",
        ])
      );
    case "breathing_onset":
    case "abdomen_onset":
      return includesAny(normalized, ["sudden", "acute", "rapid"]);
    case "breathing_rate":
      return (
        (numericValue !== null && numericValue > 40) ||
        includesAny(normalized, [
          "fast",
          "rapid",
          "labored",
          "laboured",
          "open mouth",
          "noisy",
          "stridor",
        ])
      );
    case "consciousness_level":
      return includesAny(normalized, [
        "unresponsive",
        "collapsed",
        "collapse",
        "fainted",
        "faint",
        "obtunded",
        "disoriented",
        "confused",
        "unable to stand",
      ]);
    case "blood_amount":
      return includesAny(normalized, [
        "mostly blood",
        "large",
        "lots of blood",
        "coffee ground",
        "black tarry",
        "tarry",
        "bloody",
        "mixed in",
      ]);
    case "wound_discharge":
      return includesAny(normalized, ["blood", "bleeding", "hemorrhage", "haemorrhage"]);
    case "unproductive_retching":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, [
          "retch",
          "dry heave",
          "trying to vomit",
          "nothing comes up",
        ])
      );
    case "swollen_abdomen":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["swollen", "bloated", "distended", "tight", "hard"])
      );
    case "restlessness":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["restless", "pacing", "cant settle", "can't settle"])
      );
    case "abdomen_pain":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["pain", "painful", "tender", "sore", "yelps"])
      );
    case "toxin_exposure":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, [
          "chocolate",
          "xylitol",
          "poison",
          "toxin",
          "rat poison",
          "grape",
          "raisin",
          "medication",
          "pill",
          "antifreeze",
          "chemical",
        ])
      );
    case "rat_poison_access":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["rat poison", "rodenticide"]);
    case "vomiting":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["vomit", "threw up", "throwing up"]);
    case "trembling":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["trembl", "shak"]);
    case "straining_to_urinate":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["straining", "trying to pee", "trying to urinate", "pushing"])
      );
    case "no_urine_output":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, [
          "no urine",
          "nothing comes out",
          "little or no urine",
          "cannot urinate",
          "can't urinate",
        ])
      );
    case "male_dog":
      return isAffirmativeAnswer(value);
    case "seizure_duration":
      return hasMeaningfulText(value);
    case "balance_issues":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["stumbling", "wobbly", "falling", "balance"]);
    case "head_tilt":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["head tilt", "tilted"]);
    case "trauma_onset":
      return includesAny(normalized, ["trauma", "jump", "fall", "accident", "hit by car", "injury", "bitten"]);
    case "wound_depth":
      return includesAny(normalized, ["deep", "bone", "severe", "gaping"]);
    case "pain_level":
      return (
        (numericValue !== null && numericValue >= 7) ||
        includesAny(normalized, ["severe", "extreme", "very painful", "screaming"])
      );
    case "vomiting_frequency":
      return (
        (numericValue !== null && numericValue >= 3) ||
        includesAny(normalized, ["repeated", "multiple", "frequent", "more than 3"])
      );
    case "blood_in_stool":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["blood", "bloody", "black", "tarry"]);
    case "water_intake":
      return includesAny(normalized, [
        "not drinking",
        "less than usual",
        "decreased",
        "won't drink",
        "wont drink",
      ]);
    case "keeping_water_down":
      return (
        value === false ||
        ["no", "false"].includes(normalized) ||
        includesAny(normalized, [
          "comes back up",
          "vomits water",
          "cannot keep water down",
          "can't keep water down",
        ])
      );
    case "facial_swelling":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["face swelling", "swollen face", "lips swelling", "eyelid swelling"])
      );
    case "hives":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["hives", "welts", "rash"]);
    case "medication_reaction":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["after medicine", "after medication", "reaction", "vaccine", "sting", "new food"])
      );
    case "excessive_scratching":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["scratching", "itching", "itchy"]);
    case "skin_changes":
      return includesAny(normalized, [
        "red",
        "flaky",
        "crust",
        "moist",
        "hairless",
        "bumpy",
        "open sore",
        "rash",
        "hive",
        "welt",
      ]);
    case "skin_exposure":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["new shampoo", "flea", "tick", "bedding", "plant", "environment"])
      );
    case "limping":
      return isAffirmativeAnswer(value) || includesAny(normalized, ["limp", "limping", "favoring"]);
    case "weight_bearing":
      return includesAny(normalized, [
        "partial",
        "non weight bearing",
        "toe touching",
        "toe touch",
        "barely",
        "holding it up",
      ]);
    case "abnormal_gait":
      return (
        isAffirmativeAnswer(value) ||
        includesAny(normalized, ["wobbly", "stumbling", "drunk walking", "abnormal gait", "knuckling"])
      );
    default:
      return false;
  }
}

function clampScore(score: number): number {
  return Math.max(SCORE_CLAMP_MIN, Math.min(SCORE_CLAMP_MAX, score));
}

export function scoreConcernBuckets(
  caseState: ClinicalCaseState
): ScoredConcernBucket[] {
  const definitions = getConcernBucketDefinitions();
  return definitions.map((def) => scoreConcernBucket(caseState, def));
}

export function scoreConcernBucket(
  caseState: ClinicalCaseState,
  definition: ConcernBucketDefinition
): ScoredConcernBucket {
  let score = 0;
  const evidence: string[] = [];

  for (const redFlagId of definition.redFlagIds) {
    const entry = caseState.redFlagStatus[redFlagId];
    if (entry?.status === "positive") {
      score += POSITIVE_RED_FLAG_SCORE;
      evidence.push(
        `Positive red flag: ${redFlagId}${entry.evidenceText ? ` — ${formatEvidenceValue(entry.evidenceText)}` : ""}`
      );
    }
  }

  for (const signalId of definition.signalIds) {
    const matchingSignal = caseState.clinicalSignals.find(
      (s) => s.id === signalId || s.type === signalId
    );
    if (matchingSignal) {
      score += CLINICAL_SIGNAL_SCORE;
      // Evidence strings stay internal to logs and tests; normalize them so raw owner text
      // never gets replayed with control characters.
      evidence.push(
        `Clinical signal: ${matchingSignal.type} — ${formatEvidenceValue(matchingSignal.evidenceText)}`
      );
    }
  }

  for (const answerKey of definition.answerKeys) {
    if (
      answerKey in caseState.explicitAnswers &&
      doesExplicitAnswerSupportConcern(
        answerKey,
        caseState.explicitAnswers[answerKey]
      )
    ) {
      score += EXPLICIT_ANSWER_SCORE;
      const value = caseState.explicitAnswers[answerKey];
      evidence.push(`Explicit answer: ${answerKey} = ${formatEvidenceValue(value)}`);
    }
  }

  const hasPositiveRedFlag = definition.redFlagIds.some(
    (id) => caseState.redFlagStatus[id]?.status === "positive"
  );

  if (!hasPositiveRedFlag && definition.mustNotMiss) {
    const hasUnresolvedRedFlag = definition.redFlagIds.some((id) => {
      const status = caseState.redFlagStatus[id]?.status;
      return status === undefined || status === "unknown" || status === "not_sure";
    });

    if (hasUnresolvedRedFlag && definition.redFlagIds.length > 0) {
      score += UNKNOWN_EMERGENCY_SLOT_SCORE;
      evidence.push(`Must-not-miss bucket with unresolved red flags — kept at low score`);
    }
  }

  score = clampScore(score);

  if (caseState.currentUrgency === "emergency" && hasPositiveRedFlag) {
    score = Math.max(score, 80);
  }

  return {
    id: definition.id,
    score,
    evidence,
    mustNotMiss: definition.mustNotMiss,
    suggestedQuestionIds: definition.suggestedQuestionIds,
  };
}

export function getTopConcernBuckets(
  caseState: ClinicalCaseState,
  limit: number = 5
): ScoredConcernBucket[] {
  const scored = scoreConcernBuckets(caseState);

  return scored
    .filter((bucket) => bucket.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function hasMustNotMissConcern(
  caseState: ClinicalCaseState
): boolean {
  const scored = scoreConcernBuckets(caseState);
  return scored.some(
    (bucket) => bucket.mustNotMiss && bucket.score > UNKNOWN_EMERGENCY_SLOT_SCORE
  );
}

export function mergeConcernBucketsIntoCaseState(
  caseState: ClinicalCaseState
): ClinicalCaseState {
  const scored = scoreConcernBuckets(caseState);

  const concernBuckets = scored
    .filter((bucket) => bucket.score > 0)
    .map((bucket) => ({
      id: bucket.id,
      score: bucket.score,
      evidence: bucket.evidence,
      mustNotMiss: bucket.mustNotMiss,
    }));

  return {
    ...caseState,
    concernBuckets,
  };
}
