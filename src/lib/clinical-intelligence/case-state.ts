export type RedFlagStatusValue = "unknown" | "negative" | "positive" | "not_sure";
export type RedFlagSource = "explicit_answer" | "clinical_signal" | "visual_signal" | "unset";
export type UrgencyLevel = "unknown" | "routine" | "same_day" | "urgent" | "emergency";
export type UrgencyTrajectory = "unknown" | "stable" | "worsening" | "improving";

export interface RedFlagEntry {
  status: RedFlagStatusValue;
  source: RedFlagSource;
  evidenceText?: string;
  updatedAtTurn: number;
}

export interface ClinicalSignal {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  evidenceText: string;
  turnDetected: number;
}

export interface ConcernBucket {
  id: string;
  score: number;
  evidence: string[];
  mustNotMiss: boolean;
}

export interface ClinicalCaseState {
  species: "dog";
  activeComplaintModule: string | null;

  explicitAnswers: Record<string, unknown>;

  redFlagStatus: Record<string, RedFlagEntry>;

  clinicalSignals: ClinicalSignal[];

  concernBuckets: ConcernBucket[];

  missingCriticalSlots: string[];
  askedQuestionIds: string[];
  answeredQuestionIds: string[];
  skippedQuestionIds: string[];

  currentUrgency: UrgencyLevel;
  urgencyTrajectory: UrgencyTrajectory;

  nextQuestionReason: string | null;
}

export function createInitialClinicalCaseState(
  activeComplaintModule?: string | null
): ClinicalCaseState {
  return {
    species: "dog",
    activeComplaintModule: activeComplaintModule ?? null,
    explicitAnswers: {},
    redFlagStatus: {},
    clinicalSignals: [],
    concernBuckets: [],
    missingCriticalSlots: [],
    askedQuestionIds: [],
    answeredQuestionIds: [],
    skippedQuestionIds: [],
    currentUrgency: "unknown",
    urgencyTrajectory: "unknown",
    nextQuestionReason: null,
  };
}

export function serializeClinicalCaseState(state: ClinicalCaseState): string {
  return JSON.stringify(state);
}

export function deserializeClinicalCaseState(serialized: string): ClinicalCaseState {
  const parsed = JSON.parse(serialized) as ClinicalCaseState;

  if (parsed.species !== "dog") {
    throw new Error("Invalid ClinicalCaseState: species must be 'dog'");
  }

  return {
    species: parsed.species,
    activeComplaintModule: parsed.activeComplaintModule ?? null,
    explicitAnswers: parsed.explicitAnswers ?? {},
    redFlagStatus: parsed.redFlagStatus ?? {},
    clinicalSignals: Array.isArray(parsed.clinicalSignals) ? parsed.clinicalSignals : [],
    concernBuckets: Array.isArray(parsed.concernBuckets) ? parsed.concernBuckets : [],
    missingCriticalSlots: Array.isArray(parsed.missingCriticalSlots) ? parsed.missingCriticalSlots : [],
    askedQuestionIds: Array.isArray(parsed.askedQuestionIds) ? parsed.askedQuestionIds : [],
    answeredQuestionIds: Array.isArray(parsed.answeredQuestionIds) ? parsed.answeredQuestionIds : [],
    skippedQuestionIds: Array.isArray(parsed.skippedQuestionIds) ? parsed.skippedQuestionIds : [],
    currentUrgency: parsed.currentUrgency ?? "unknown",
    urgencyTrajectory: parsed.urgencyTrajectory ?? "unknown",
    nextQuestionReason: parsed.nextQuestionReason ?? null,
  };
}
