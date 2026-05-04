import type { ClinicalCaseState } from "./case-state";
import {
  findComplaintModulesForText,
} from "./complaint-modules";
import {
  planNextClinicalQuestion,
  type PlannedQuestion,
  type PlannerFallbackResult,
} from "./next-question-planner";
import { getQuestionCardById } from "./question-card-registry";
import {
  buildShadowPlannerComparison,
  type ShadowPlannerComparisonResult,
} from "./shadow-planner";
import {
  buildShadowTelemetryRecord,
  type ShadowTelemetryRecord,
} from "./shadow-telemetry";

const COMPLAINT_MODULE_TO_PLANNER_FAMILY: Readonly<Record<string, string>> = {
  skin_itching_allergy: "skin",
  gi_vomiting_diarrhea: "gi",
  limping_mobility_pain: "limping",
  respiratory_distress: "respiratory",
  seizure_collapse_neuro: "neuro",
  urinary_obstruction: "urinary",
  toxin_poisoning_exposure: "emergency",
  bloat_gdv: "gi",
  collapse_weakness: "emergency",
  heatstroke_heat_exposure: "heat",
  trauma_bleeding_wound: "trauma",
};

export interface BuildShadowPlannerComplaintIntegrationInput {
  ownerText: string;
  caseState: ClinicalCaseState;
  existingQuestionId?: string | null;
}

export interface ShadowPlannerComplaintIntegrationResult {
  activeComplaintModuleId: string | null;
  plannerActiveComplaintModule: string | null;
  plannerResult: PlannedQuestion | PlannerFallbackResult;
  comparison: ShadowPlannerComparisonResult;
  telemetry: ShadowTelemetryRecord;
}

function isPlannerFallbackResult(
  result: PlannedQuestion | PlannerFallbackResult
): result is PlannerFallbackResult {
  return "type" in result;
}

function toShadowPlannedQuestion(plannedQuestion: PlannedQuestion | PlannerFallbackResult) {
  if (isPlannerFallbackResult(plannedQuestion)) {
    return null;
  }

  const plannedQuestionCard = getQuestionCardById(plannedQuestion.questionId);
  if (!plannedQuestionCard) {
    return null;
  }

  return {
    questionId: plannedQuestion.questionId,
    shortReason: plannedQuestion.shortReason,
    screenedRedFlags: [...plannedQuestion.screenedRedFlags],
    selectedBecause: plannedQuestion.selectedBecause,
  };
}

export function detectShadowComplaintModuleId(ownerText: string): string | null {
  const normalizedOwnerText = ownerText.trim();
  if (normalizedOwnerText.length === 0) {
    return null;
  }

  const [firstMatch] = findComplaintModulesForText(normalizedOwnerText);
  return firstMatch?.id ?? null;
}

export function resolveShadowPlannerComplaintFamily(
  activeComplaintModuleId: string | null | undefined
): string | null {
  if (!activeComplaintModuleId) {
    return null;
  }

  return (
    COMPLAINT_MODULE_TO_PLANNER_FAMILY[activeComplaintModuleId] ??
    activeComplaintModuleId
  );
}

export function buildShadowPlannerComplaintIntegration(
  input: BuildShadowPlannerComplaintIntegrationInput
): ShadowPlannerComplaintIntegrationResult {
  const activeComplaintModuleId =
    detectShadowComplaintModuleId(input.ownerText) ??
    input.caseState.activeComplaintModule;
  const plannerActiveComplaintModule =
    resolveShadowPlannerComplaintFamily(activeComplaintModuleId);

  const plannerResult = planNextClinicalQuestion(input.caseState, {
    activeComplaintModule: plannerActiveComplaintModule,
  });

  const shadowPlannedQuestion = toShadowPlannedQuestion(plannerResult);
  const comparison = buildShadowPlannerComparison({
    existingQuestionId: input.existingQuestionId ?? null,
    plannedQuestion: shadowPlannedQuestion,
    askedQuestionIds: input.caseState.askedQuestionIds,
    answeredQuestionIds: input.caseState.answeredQuestionIds,
    skippedQuestionIds: input.caseState.skippedQuestionIds,
    lookupQuestionCard: getQuestionCardById,
  });
  const telemetry = buildShadowTelemetryRecord({
    activeComplaintModule: activeComplaintModuleId ?? null,
    comparison,
  });

  return {
    activeComplaintModuleId: activeComplaintModuleId ?? null,
    plannerActiveComplaintModule,
    plannerResult,
    comparison,
    telemetry,
  };
}
