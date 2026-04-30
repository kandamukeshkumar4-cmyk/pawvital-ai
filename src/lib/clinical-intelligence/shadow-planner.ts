import type { PlannedQuestion, SelectedBecause } from "./next-question-planner";
import type { ClinicalQuestionCard } from "./question-card-types";

export interface ShadowPlannerComparisonResult {
  existingQuestionId: string | null;
  plannedQuestionId: string | null;
  plannedShortReason: string | null;
  screenedRedFlags: string[];
  selectedBecause: SelectedBecause | null;
  oldWasGeneric: boolean;
  newScreensEmergencyEarlier: boolean;
  repeatedQuestionAvoided: boolean;
  safetyNotes: string[];
}

export type ShadowPlannedQuestionInput = Pick<
  PlannedQuestion,
  "questionId" | "shortReason" | "screenedRedFlags" | "selectedBecause"
>;

export interface BuildShadowPlannerComparisonInput {
  existingQuestionId?: string | null;
  plannedQuestion?: ShadowPlannedQuestionInput | null;
  askedQuestionIds?: readonly string[];
  answeredQuestionIds?: readonly string[];
  skippedQuestionIds?: readonly string[];
  existingQuestionCard?: ClinicalQuestionCard | null;
  plannedQuestionCard?: ClinicalQuestionCard | null;
  lookupQuestionCard?: ((questionId: string) => ClinicalQuestionCard | undefined) | null;
  plannerSafetyNotes?: readonly string[];
}

function cloneStrings(values: readonly string[] | undefined): string[] {
  return values ? [...values] : [];
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function resolveQuestionCard(
  questionId: string | null,
  providedCard: ClinicalQuestionCard | null | undefined,
  lookupQuestionCard: BuildShadowPlannerComparisonInput["lookupQuestionCard"]
): ClinicalQuestionCard | null {
  if (!questionId) {
    return null;
  }

  if (providedCard?.id === questionId) {
    return providedCard;
  }

  return lookupQuestionCard?.(questionId) ?? null;
}

function isGenericQuestionCard(card: ClinicalQuestionCard | null): boolean {
  if (!card) {
    return false;
  }

  return (
    card.complaintFamilies.includes("general") ||
    card.complaintFamilies.includes("global") ||
    card.phase === "timeline" ||
    card.phase === "history" ||
    card.phase === "handoff_detail"
  );
}

function isEmergencyQuestionCard(
  card: ClinicalQuestionCard | null,
  selectedBecause: SelectedBecause | null
): boolean {
  return card?.phase === "emergency_screen" || selectedBecause === "emergency_screen";
}

function hasCompletePlannedQuestion(
  plannedQuestion: ShadowPlannedQuestionInput | null | undefined
): plannedQuestion is ShadowPlannedQuestionInput {
  return Boolean(
    plannedQuestion?.questionId &&
    plannedQuestion.shortReason &&
    plannedQuestion.selectedBecause
  );
}

function buildSeenQuestionIdSet(
  askedQuestionIds: readonly string[] | undefined,
  answeredQuestionIds: readonly string[] | undefined,
  skippedQuestionIds: readonly string[] | undefined
): Set<string> {
  return new Set([
    ...cloneStrings(askedQuestionIds),
    ...cloneStrings(answeredQuestionIds),
    ...cloneStrings(skippedQuestionIds),
  ]);
}

function collectSafetyNotes(
  plannerSafetyNotes: readonly string[] | undefined,
  existingQuestionCard: ClinicalQuestionCard | null,
  plannedQuestionCard: ClinicalQuestionCard | null
): string[] {
  return dedupeStrings([
    ...cloneStrings(plannerSafetyNotes),
    ...cloneStrings(existingQuestionCard?.safetyNotes),
    ...cloneStrings(plannedQuestionCard?.safetyNotes),
  ]);
}

export function createEmptyShadowPlannerComparisonResult(
  existingQuestionId: string | null = null
): ShadowPlannerComparisonResult {
  return {
    existingQuestionId,
    plannedQuestionId: null,
    plannedShortReason: null,
    screenedRedFlags: [],
    selectedBecause: null,
    oldWasGeneric: false,
    newScreensEmergencyEarlier: false,
    repeatedQuestionAvoided: false,
    safetyNotes: [],
  };
}

export function buildShadowPlannerComparison(
  input: BuildShadowPlannerComparisonInput
): ShadowPlannerComparisonResult {
  const existingQuestionId = input.existingQuestionId ?? null;
  const existingQuestionCard = resolveQuestionCard(
    existingQuestionId,
    input.existingQuestionCard,
    input.lookupQuestionCard
  );

  // Shadow scaffolding must never invent plan data when the new planner input is incomplete.
  if (!hasCompletePlannedQuestion(input.plannedQuestion)) {
    return {
      ...createEmptyShadowPlannerComparisonResult(existingQuestionId),
      oldWasGeneric: isGenericQuestionCard(existingQuestionCard),
    };
  }

  const plannedQuestionCard = resolveQuestionCard(
    input.plannedQuestion.questionId,
    input.plannedQuestionCard,
    input.lookupQuestionCard
  );
  const seenQuestionIds = buildSeenQuestionIdSet(
    input.askedQuestionIds,
    input.answeredQuestionIds,
    input.skippedQuestionIds
  );

  return {
    existingQuestionId,
    plannedQuestionId: input.plannedQuestion.questionId,
    plannedShortReason: input.plannedQuestion.shortReason,
    screenedRedFlags: dedupeStrings(input.plannedQuestion.screenedRedFlags),
    selectedBecause: input.plannedQuestion.selectedBecause,
    oldWasGeneric: isGenericQuestionCard(existingQuestionCard),
    newScreensEmergencyEarlier:
      isEmergencyQuestionCard(
        plannedQuestionCard,
        input.plannedQuestion.selectedBecause
      ) && !isEmergencyQuestionCard(existingQuestionCard, null),
    repeatedQuestionAvoided:
      input.plannedQuestion.questionId !== existingQuestionId &&
      !seenQuestionIds.has(input.plannedQuestion.questionId),
    safetyNotes: collectSafetyNotes(
      input.plannerSafetyNotes,
      existingQuestionCard,
      plannedQuestionCard
    ),
  };
}

export function isShadowPlannerComparisonReady(
  comparison: ShadowPlannerComparisonResult
): boolean {
  return Boolean(
    comparison.plannedQuestionId &&
    comparison.plannedShortReason &&
    comparison.selectedBecause
  );
}
