import type { ClinicalCaseState } from "./case-state";
import type { ConcernBucketDefinition, ScoredConcernBucket } from "./concern-buckets";
import { getConcernBucketDefinitions } from "./concern-buckets";

const SCORE_CLAMP_MIN = 0;
const SCORE_CLAMP_MAX = 100;

const POSITIVE_RED_FLAG_SCORE = 35;
const CLINICAL_SIGNAL_SCORE = 20;
const EXPLICIT_ANSWER_SCORE = 15;
const UNKNOWN_EMERGENCY_SLOT_SCORE = 5;

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
      evidence.push(`Positive red flag: ${redFlagId}${entry.evidenceText ? ` — ${entry.evidenceText}` : ""}`);
    }
  }

  for (const signalId of definition.signalIds) {
    const matchingSignal = caseState.clinicalSignals.find(
      (s) => s.id === signalId || s.type === signalId
    );
    if (matchingSignal) {
      score += CLINICAL_SIGNAL_SCORE;
      evidence.push(`Clinical signal: ${matchingSignal.type} — ${matchingSignal.evidenceText}`);
    }
  }

  for (const answerKey of definition.answerKeys) {
    if (answerKey in caseState.explicitAnswers) {
      score += EXPLICIT_ANSWER_SCORE;
      const value = caseState.explicitAnswers[answerKey];
      evidence.push(`Explicit answer: ${answerKey} = ${String(value)}`);
    }
  }

  const hasPositiveRedFlag = definition.redFlagIds.some(
    (id) => caseState.redFlagStatus[id]?.status === "positive"
  );

  if (!hasPositiveRedFlag && definition.mustNotMiss) {
    const allUnknown = definition.redFlagIds.every(
      (id) => !caseState.redFlagStatus[id] || caseState.redFlagStatus[id].status === "unknown"
    );
    if (allUnknown && definition.redFlagIds.length > 0) {
      score += UNKNOWN_EMERGENCY_SLOT_SCORE;
      evidence.push(`Must-not-miss bucket with unknown red flags — kept at low score`);
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
