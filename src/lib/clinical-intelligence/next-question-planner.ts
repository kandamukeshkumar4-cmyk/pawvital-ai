import type { ClinicalCaseState } from "./case-state";
import type { ClinicalQuestionCard } from "./question-card-types";
import { getAllQuestionCards } from "./question-card-registry";

export type SelectedBecause =
  | "emergency_screen"
  | "highest_information_gain"
  | "urgency_changing"
  | "report_value"
  | "clarification";

export interface PlannedQuestion {
  questionId: string;
  ownerText: string;
  shortReason: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  screenedRedFlags: string[];
  selectedBecause: SelectedBecause;
}

export interface PlannerOptions {
  allowClarification?: boolean;
  activeComplaintModule?: string | null;
  maxQuestionsPerTurn?: number;
}

export interface PlannerFallbackResult {
  type: "emergency_handoff" | "no_valid_questions" | "clarification_needed";
  reason: string;
}

const MODULE_PHASE_PRIORITY: Record<ClinicalQuestionCard["phase"], number> = {
  emergency_screen: 30,
  characterize: 15,
  discriminate: 12,
  timeline: 8,
  history: 5,
  handoff_detail: 3,
};

const REPETITION_PENALTY = 50;
const ALREADY_KNOWN_PENALTY = 20;
const OFF_TOPIC_PENALTY = 15;
const TOO_MANY_QUESTIONS_PENALTY = 10;

function isQuestionAlreadyAnswered(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState
): boolean {
  if (caseState.answeredQuestionIds.includes(card.id)) {
    return true;
  }

  for (const depKey of card.skipIfAnswered) {
    if (depKey in caseState.explicitAnswers) {
      return true;
    }
  }

  return false;
}

function shouldSkipDueToAnsweredDependencies(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState
): boolean {
  for (const depKey of card.skipIfAnswered) {
    if (caseState.answeredQuestionIds.includes(depKey)) {
      return true;
    }
    if (depKey in caseState.explicitAnswers) {
      return true;
    }
  }
  return false;
}

function getUnknownRedFlagsForCard(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState
): string[] {
  return card.screensRedFlags.filter(
    (flagId) =>
      !caseState.redFlagStatus[flagId] ||
      caseState.redFlagStatus[flagId].status === "unknown"
  );
}

function hasPositiveRedFlagsForCard(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState
): boolean {
  return card.screensRedFlags.some(
    (flagId) => caseState.redFlagStatus[flagId]?.status === "positive"
  );
}

export function filterAnsweredOrAskedQuestions(
  cards: readonly ClinicalQuestionCard[],
  caseState: ClinicalCaseState,
  options?: { allowClarification?: boolean }
): ClinicalQuestionCard[] {
  return cards.filter((card) => {
    const isAnswered = isQuestionAlreadyAnswered(card, caseState);
    const isAsked = caseState.askedQuestionIds.includes(card.id);
    const isSkipped = shouldSkipDueToAnsweredDependencies(card, caseState);

    if (isAnswered || isSkipped) {
      return false;
    }

    if (isAsked && !options?.allowClarification) {
      return false;
    }

    return true;
  });
}

export function getCandidateQuestionCards(
  caseState: ClinicalCaseState,
  options?: PlannerOptions
): ClinicalQuestionCard[] {
  let cards = [...getAllQuestionCards()];

  if (caseState.activeComplaintModule || options?.activeComplaintModule) {
    const activeModule = options?.activeComplaintModule ?? caseState.activeComplaintModule;
    if (activeModule) {
      const moduleCards = cards.filter((c) =>
        c.complaintFamilies.includes(activeModule)
      );
      const emergencyCards = cards.filter((c) =>
        c.complaintFamilies.includes("emergency")
      );
      cards = [...emergencyCards, ...moduleCards.filter(
        (c) => !c.complaintFamilies.includes("emergency")
      )];
    }
  }

  cards = filterAnsweredOrAskedQuestions(cards, caseState, {
    allowClarification: options?.allowClarification,
  });

  return cards;
}

export function buildQuestionScoreBreakdown(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState,
  options?: PlannerOptions
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  const emergencyValue =
    card.phase === "emergency_screen" ||
    hasPositiveRedFlagsForCard(card, caseState)
      ? 3
      : card.screensRedFlags.length > 0 &&
        getUnknownRedFlagsForCard(card, caseState).length > 0
      ? 2
      : 0;
  breakdown["emergencyValue"] = emergencyValue * 5;

  breakdown["urgencyImpact"] = card.urgencyImpact * 4;

  breakdown["discriminativeValue"] = card.discriminativeValue * 3;

  breakdown["reportValue"] = card.reportValue * 2;

  breakdown["ownerAnswerability"] = card.ownerAnswerability * 2;

  breakdown["modulePhasePriority"] = MODULE_PHASE_PRIORITY[card.phase] ?? 0;

  const isAsked = caseState.askedQuestionIds.includes(card.id);
  if (isAsked) {
    breakdown["repetitionPenalty"] = -REPETITION_PENALTY;
  } else {
    breakdown["repetitionPenalty"] = 0;
  }

  if (shouldSkipDueToAnsweredDependencies(card, caseState)) {
    breakdown["alreadyKnownPenalty"] = -ALREADY_KNOWN_PENALTY;
  } else {
    breakdown["alreadyKnownPenalty"] = 0;
  }

  const activeModule = options?.activeComplaintModule ?? caseState.activeComplaintModule;
  if (
    activeModule &&
    !card.complaintFamilies.includes("emergency") &&
    !card.complaintFamilies.includes(activeModule)
  ) {
    breakdown["offTopicPenalty"] = -OFF_TOPIC_PENALTY;
  } else {
    breakdown["offTopicPenalty"] = 0;
  }

  if (caseState.askedQuestionIds.length >= (options?.maxQuestionsPerTurn ?? 10)) {
    breakdown["tooManyQuestionsPenalty"] = -TOO_MANY_QUESTIONS_PENALTY;
  } else {
    breakdown["tooManyQuestionsPenalty"] = 0;
  }

  return breakdown;
}

export function scoreQuestionCard(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState,
  options?: PlannerOptions
): number {
  const breakdown = buildQuestionScoreBreakdown(card, caseState, options);
  return Object.values(breakdown).reduce((sum, val) => sum + val, 0);
}

function determineSelectedBecause(
  card: ClinicalQuestionCard,
  caseState: ClinicalCaseState,
  breakdown: Record<string, number>
): SelectedBecause {
  if (card.phase === "emergency_screen") {
    return "emergency_screen";
  }

  if (breakdown["urgencyImpact"] >= 8 && caseState.urgencyTrajectory === "worsening") {
    return "urgency_changing";
  }

  if (breakdown["reportValue"] >= breakdown["discriminativeValue"] && breakdown["reportValue"] >= 4) {
    return "report_value";
  }

  if (caseState.askedQuestionIds.includes(card.id)) {
    return "clarification";
  }

  return "highest_information_gain";
}

export function selectHighestScoringQuestion(
  scoredQuestions: Array<{
    card: ClinicalQuestionCard;
    score: number;
    breakdown: Record<string, number>;
  }>
): {
  card: ClinicalQuestionCard;
  score: number;
  breakdown: Record<string, number>;
} | null {
  if (scoredQuestions.length === 0) {
    return null;
  }

  return scoredQuestions.reduce((best, current) =>
    current.score > best.score ? current : best
  );
}

export function fallbackToSafeEmergencyQuestion(
  caseState: ClinicalCaseState
): PlannedQuestion | PlannerFallbackResult {
  const emergencyCards = getAllQuestionCards().filter(
    (c) => c.phase === "emergency_screen"
  );

  const available = filterAnsweredOrAskedQuestions(emergencyCards, caseState, {
    allowClarification: false,
  });

  if (available.length > 0) {
    const card = available[0];
    const breakdown = buildQuestionScoreBreakdown(card, caseState);
    const score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    return {
      questionId: card.id,
      ownerText: card.ownerText,
      shortReason: card.shortReason,
      score,
      scoreBreakdown: breakdown,
      screenedRedFlags: card.screensRedFlags,
      selectedBecause: "emergency_screen",
    };
  }

  return {
    type: "no_valid_questions",
    reason: "No valid emergency questions available for triage",
  };
}

export function planNextClinicalQuestion(
  caseState: ClinicalCaseState,
  options?: PlannerOptions
): PlannedQuestion | PlannerFallbackResult {
  if (caseState.currentUrgency === "emergency") {
    const emergencyResult = fallbackToSafeEmergencyQuestion(caseState);
    if ("type" in emergencyResult) {
      return {
        type: "emergency_handoff",
        reason: "Current urgency is emergency — handoff to vet recommended",
      };
    }
    return emergencyResult;
  }

  const candidates = getCandidateQuestionCards(caseState, options);

  if (candidates.length === 0) {
    return {
      type: "no_valid_questions",
      reason: "No valid candidate questions remaining",
    };
  }

  const scored = candidates.map((card) => ({
    card,
    score: scoreQuestionCard(card, caseState, options),
    breakdown: buildQuestionScoreBreakdown(card, caseState, options),
  }));

  const best = selectHighestScoringQuestion(scored);

  if (!best) {
    return {
      type: "no_valid_questions",
      reason: "No valid candidate questions remaining after scoring",
    };
  }

  const unknownFlags = getUnknownRedFlagsForCard(best.card, caseState);
  const selectedBecause = determineSelectedBecause(
    best.card,
    caseState,
    best.breakdown
  );

  return {
    questionId: best.card.id,
    ownerText: best.card.ownerText,
    shortReason: best.card.shortReason,
    score: best.score,
    scoreBreakdown: best.breakdown,
    screenedRedFlags: unknownFlags,
    selectedBecause,
  };
}
