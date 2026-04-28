import type {
  ClinicalCaseState,
  ClinicalSignal,
  RedFlagEntry,
  RedFlagStatusValue,
  RedFlagSource,
  UrgencyLevel,
} from "./case-state";

export function recordAskedQuestion(
  state: ClinicalCaseState,
  questionId: string
): ClinicalCaseState {
  if (state.askedQuestionIds.includes(questionId)) {
    return state;
  }

  return {
    ...state,
    askedQuestionIds: [...state.askedQuestionIds, questionId],
  };
}

export function recordAnsweredQuestion(
  state: ClinicalCaseState,
  questionId: string,
  answerKey: string,
  value: unknown
): ClinicalCaseState {
  const newState = {
    ...state,
    explicitAnswers: {
      ...state.explicitAnswers,
      [answerKey]: value,
    },
    answeredQuestionIds: state.answeredQuestionIds.includes(questionId)
      ? state.answeredQuestionIds
      : [...state.answeredQuestionIds, questionId],
  };

  const updatedMissing = newState.missingCriticalSlots.filter(
    (slot) => slot !== questionId && slot !== answerKey
  );

  if (updatedMissing.length !== newState.missingCriticalSlots.length) {
    newState.missingCriticalSlots = updatedMissing;
  }

  return newState;
}

export function recordSkippedQuestion(
  state: ClinicalCaseState,
  questionId: string
): ClinicalCaseState {
  if (state.skippedQuestionIds.includes(questionId)) {
    return state;
  }

  return {
    ...state,
    skippedQuestionIds: [...state.skippedQuestionIds, questionId],
  };
}

export function updateRedFlagStatus(
  state: ClinicalCaseState,
  redFlagId: string,
  update: {
    status: RedFlagStatusValue;
    source: RedFlagSource;
    evidenceText?: string;
    turn: number;
  }
): ClinicalCaseState {
  const existing = state.redFlagStatus[redFlagId];

  if (
    existing &&
    existing.status === "positive" &&
    update.status !== "positive"
  ) {
    return state;
  }

  const entry: RedFlagEntry = {
    status: update.status,
    source: update.source,
    evidenceText: update.evidenceText ?? existing?.evidenceText,
    updatedAtTurn: update.turn,
  };

  const newRedFlagStatus = {
    ...state.redFlagStatus,
    [redFlagId]: entry,
  };

  let newUrgency = state.currentUrgency;

  if (update.status === "positive") {
    const urgencyOrder: UrgencyLevel[] = [
      "unknown",
      "routine",
      "same_day",
      "urgent",
      "emergency",
    ];

    const candidateUrgency = inferUrgencyFromRedFlag(redFlagId);
    const currentIdx = urgencyOrder.indexOf(newUrgency);
    const candidateIdx = urgencyOrder.indexOf(candidateUrgency);

    if (candidateIdx > currentIdx) {
      newUrgency = candidateUrgency;
    }
  }

  const newTrajectory = computeUrgencyTrajectory(
    state.currentUrgency,
    newUrgency,
    state.urgencyTrajectory
  );

  return {
    ...state,
    redFlagStatus: newRedFlagStatus,
    currentUrgency: newUrgency,
    urgencyTrajectory: newTrajectory,
  };
}

export function addClinicalSignal(
  state: ClinicalCaseState,
  signal: ClinicalSignal
): ClinicalCaseState {
  const existingIndex = state.clinicalSignals.findIndex(
    (s) => s.id === signal.id
  );

  let newSignals: ClinicalSignal[];
  if (existingIndex >= 0) {
    newSignals = [...state.clinicalSignals];
    newSignals[existingIndex] = signal;
  } else {
    newSignals = [...state.clinicalSignals, signal];
  }

  return {
    ...state,
    clinicalSignals: newSignals,
  };
}

export function hasQuestionBeenAskedOrAnswered(
  state: ClinicalCaseState,
  questionId: string
): boolean {
  return (
    state.askedQuestionIds.includes(questionId) ||
    state.answeredQuestionIds.includes(questionId)
  );
}

export function getUnknownCriticalSlots(
  state: ClinicalCaseState,
  requiredSlotIds: string[]
): string[] {
  return requiredSlotIds.filter((slotId) => {
    const answered = state.answeredQuestionIds.includes(slotId);
    const skipped = state.skippedQuestionIds.includes(slotId);
    const hasExplicitAnswer = slotId in state.explicitAnswers;

    const redFlag = state.redFlagStatus[slotId];
    const redFlagResolved =
      redFlag && (redFlag.status === "positive" || redFlag.status === "negative");

    return !(answered || skipped || hasExplicitAnswer || redFlagResolved);
  });
}

function inferUrgencyFromRedFlag(redFlagId: string): UrgencyLevel {
  const emergencyFlags = [
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
  ];

  if (emergencyFlags.includes(redFlagId)) {
    return "emergency";
  }

  return "unknown";
}

function computeUrgencyTrajectory(
  previous: UrgencyLevel,
  current: UrgencyLevel,
  existing: "unknown" | "stable" | "worsening" | "improving"
): "unknown" | "stable" | "worsening" | "improving" {
  const urgencyOrder: UrgencyLevel[] = [
    "unknown",
    "routine",
    "same_day",
    "urgent",
    "emergency",
  ];

  const prevIdx = urgencyOrder.indexOf(previous);
  const currIdx = urgencyOrder.indexOf(current);

  if (prevIdx === -1 || currIdx === -1) {
    return existing;
  }

  if (currIdx > prevIdx) {
    return "worsening";
  }

  if (currIdx < prevIdx) {
    return "improving";
  }

  return "stable";
}
