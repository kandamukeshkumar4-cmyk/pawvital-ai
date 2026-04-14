import type { PetProfile, TriageSession } from "@/lib/triage-engine";

export type ContradictionResolution =
  | "clarify"
  | "escalate"
  | "take_worst_case";

export type ContradictionSeverity = "moderate" | "high";

export type ContradictionSourceType =
  | "previous_answer"
  | "owner_text"
  | "session_symptom"
  | "pet_profile";

export type ContradictionType =
  | "appetite_conflict"
  | "energy_conflict"
  | "onset_conflict"
  | "water_conflict"
  | "gum_conflict"
  | "breathing_conflict"
  | "puppy_age_conflict";

export interface ContradictionSourcePairEntry {
  source: ContradictionSourceType;
  key: string;
  value: string;
}

export interface NormalizedContradictionRecord {
  contradiction_type: ContradictionType;
  severity: ContradictionSeverity;
  resolution: ContradictionResolution;
  source_pair: [
    ContradictionSourcePairEntry,
    ContradictionSourcePairEntry,
  ];
  affected_key: string;
  turn_number: number;
}

export interface DetectedContradiction {
  id: ContradictionType;
  resolution: ContradictionResolution;
  severity: ContradictionSeverity;
  flag: string;
  affectedKey: string;
  sourcePair: [
    ContradictionSourcePairEntry,
    ContradictionSourcePairEntry,
  ];
}

interface ContradictionDetectionInput {
  ownerText: string;
  pet: PetProfile;
  previousAnswers: Record<string, string | boolean | number>;
  session: TriageSession;
}

const APPETITE_LOSS_PATTERNS = [
  /\bnot eating\b/,
  /\bisn't eating\b/,
  /\bis not eating\b/,
  /\bwon't eat\b/,
  /\bstopped eating\b/,
  /\bhasn't eaten\b/,
  /\bhas not eaten\b/,
  /\brefusing food\b/,
  /\bno appetite\b/,
];

const SEVERE_ENERGY_PATTERNS = [
  /\bbarely moving\b/,
  /\bhardly moving\b/,
  /\bwon't move\b/,
  /\bwill not move\b/,
  /\bcan barely stand\b/,
  /\bnot getting up\b/,
];

const SUDDEN_ONSET_PATTERNS = [
  /\bsuddenly today\b/,
  /\ball of a sudden\b/,
  /\bhappened suddenly\b/,
  /\bstarted suddenly\b/,
  /\bout of nowhere\b/,
  /\bjust started today\b/,
];

const NORMAL_DRINKING_PATTERNS = [
  /\bdrinking fine\b/,
  /\bdrinking normally\b/,
  /\bstill drinking\b/,
  /\bhe'?s drinking\b/,
  /\bshe'?s drinking\b/,
];

const PALE_GUM_PATTERNS = [
  /\bwhite gums\b/,
  /\bpale gums\b/,
  /\bgums are white\b/,
  /\bgums look white\b/,
  /\bgums are pale\b/,
  /\bgums look pale\b/,
];

const BREATHING_DISTRESS_PATTERNS = [
  /\bdifficulty breathing\b/,
  /\btrouble breathing\b/,
  /\bhard to breathe\b/,
  /\bcan't breathe\b/,
  /\bcannot breathe\b/,
  /\bstruggling to breathe\b/,
  /\bbreathing hard\b/,
  /\bbreathing heavy\b/,
  /\bshort of breath\b/,
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function matchesAnswer(
  answers: Record<string, string | boolean | number>,
  key: string,
  expected: string
): boolean {
  return String(answers[key] ?? "").toLowerCase() === expected;
}

function pushIfMatched(
  contradictions: DetectedContradiction[],
  matched: boolean,
  contradiction: DetectedContradiction
): void {
  if (matched) {
    contradictions.push(contradiction);
  }
}

function toOwnerTextSignal(value: string): ContradictionSourcePairEntry {
  return {
    source: "owner_text",
    key: "owner_text",
    value,
  };
}

function toPreviousAnswerSignal(
  key: string,
  value: string
): ContradictionSourcePairEntry {
  return {
    source: "previous_answer",
    key,
    value,
  };
}

function toSymptomSignal(key: string, value = "reported"): ContradictionSourcePairEntry {
  return {
    source: "session_symptom",
    key,
    value,
  };
}

function toPetProfileSignal(
  key: string,
  value: string
): ContradictionSourcePairEntry {
  return {
    source: "pet_profile",
    key,
    value,
  };
}

export function buildContradictionRecord(
  contradiction: DetectedContradiction,
  turnNumber: number
): NormalizedContradictionRecord {
  return {
    contradiction_type: contradiction.id,
    severity: contradiction.severity,
    resolution: contradiction.resolution,
    source_pair: contradiction.sourcePair,
    affected_key: contradiction.affectedKey,
    turn_number: turnNumber,
  };
}

export function detectTextContradictions(
  input: ContradictionDetectionInput
): DetectedContradiction[] {
  const contradictions: DetectedContradiction[] = [];
  const ownerText = normalize(input.ownerText);

  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "appetite_status", "normal") &&
      hasPattern(ownerText, APPETITE_LOSS_PATTERNS),
    {
      id: "appetite_conflict",
      resolution: "clarify",
      severity: "moderate",
      flag:
        "appetite_conflict: prior appetite_status=normal conflicts with owner describing not eating",
      affectedKey: "appetite_status",
      sourcePair: [
        toPreviousAnswerSignal("appetite_status", "normal"),
        toOwnerTextSignal("not_eating_signal"),
      ],
    }
  );

  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "lethargy_severity", "mild") &&
      hasPattern(ownerText, SEVERE_ENERGY_PATTERNS),
    {
      id: "energy_conflict",
      resolution: "clarify",
      severity: "moderate",
      flag:
        "energy_conflict: prior lethargy_severity=mild conflicts with owner describing severe immobility",
      affectedKey: "lethargy_severity",
      sourcePair: [
        toPreviousAnswerSignal("lethargy_severity", "mild"),
        toOwnerTextSignal("severe_immobility_signal"),
      ],
    }
  );

  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "limping_onset", "gradual") &&
      hasPattern(ownerText, SUDDEN_ONSET_PATTERNS),
    {
      id: "onset_conflict",
      resolution: "clarify",
      severity: "moderate",
      flag:
        "onset_conflict: prior limping_onset=gradual conflicts with owner describing sudden onset",
      affectedKey: "limping_onset",
      sourcePair: [
        toPreviousAnswerSignal("limping_onset", "gradual"),
        toOwnerTextSignal("sudden_onset_signal"),
      ],
    }
  );

  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "water_intake", "not_drinking") &&
      hasPattern(ownerText, NORMAL_DRINKING_PATTERNS),
    {
      id: "water_conflict",
      resolution: "clarify",
      severity: "moderate",
      flag:
        "water_conflict: prior water_intake=not_drinking conflicts with owner describing normal drinking",
      affectedKey: "water_intake",
      sourcePair: [
        toPreviousAnswerSignal("water_intake", "not_drinking"),
        toOwnerTextSignal("normal_drinking_signal"),
      ],
    }
  );

  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "gum_color", "pink_normal") &&
      hasPattern(ownerText, PALE_GUM_PATTERNS),
    {
      id: "gum_conflict",
      resolution: "escalate",
      severity: "high",
      flag:
        "gum_conflict: prior gum_color=pink_normal conflicts with owner describing pale or white gums",
      affectedKey: "gum_color",
      sourcePair: [
        toPreviousAnswerSignal("gum_color", "pink_normal"),
        toOwnerTextSignal("pale_gums_signal"),
      ],
    }
  );

  const hasRespiratorySymptom =
    input.session.known_symptoms.includes("difficulty_breathing");
  const hasRespiratoryText = hasPattern(ownerText, BREATHING_DISTRESS_PATTERNS);
  pushIfMatched(
    contradictions,
    matchesAnswer(input.previousAnswers, "breathing_status", "normal") &&
      (hasRespiratorySymptom || hasRespiratoryText),
    {
      id: "breathing_conflict",
      resolution: "escalate",
      severity: "high",
      flag:
        "breathing_conflict: prior breathing_status=normal conflicts with respiratory distress signals",
      affectedKey: "breathing_status",
      sourcePair: [
        toPreviousAnswerSignal("breathing_status", "normal"),
        hasRespiratorySymptom
          ? toSymptomSignal("difficulty_breathing")
          : toOwnerTextSignal("respiratory_distress_signal"),
      ],
    }
  );

  pushIfMatched(
    contradictions,
    input.session.known_symptoms.includes("puppy_concern") &&
      Number.isFinite(input.pet.age_years) &&
      input.pet.age_years > 1,
    {
      id: "puppy_age_conflict",
      resolution: "clarify",
      severity: "moderate",
      flag:
        "puppy_age_conflict: puppy_concern symptom conflicts with patient age over 1 year",
      affectedKey: "age_years",
      sourcePair: [
        toSymptomSignal("puppy_concern"),
        toPetProfileSignal("age_years", String(input.pet.age_years)),
      ],
    }
  );

  return contradictions;
}
