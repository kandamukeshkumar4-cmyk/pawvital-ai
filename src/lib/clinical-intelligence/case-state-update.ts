import type {
  ClinicalCaseState,
  ClinicalSignal,
  RedFlagEntry,
  RedFlagStatusValue,
  RedFlagSource,
  UrgencyLevel,
} from "./case-state";
import { isEmergencyRedFlagId } from "./emergency-red-flags";

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
  if (isEmergencyRedFlagId(redFlagId)) {
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

  if (current === "unknown") {
    return existing;
  }

  return "stable";
}
