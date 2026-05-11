import type { ClinicalCaseState } from "./case-state";
import {
  findComplaintModulesForText,
} from "./complaint-modules";
import {
  planNextClinicalQuestion,
  type PlannedQuestion,
  type PlannerFallbackResult,
} from "./next-question-planner";
import {
  getQuestionCardById,
  getQuestionCardsByPhase,
} from "./question-card-registry";
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

type PlannerQuestionRoutingHints = {
  preferredQuestionIds: string[];
  discouragedQuestionIds: string[];
};

const ALL_EMERGENCY_SCREEN_QUESTION_IDS = getQuestionCardsByPhase(
  "emergency_screen"
).map((card) => card.id);

function buildRoutingHints(
  preferredQuestionIds: string[]
): PlannerQuestionRoutingHints {
  const uniquePreferredQuestionIds = [...new Set(preferredQuestionIds)];
  const preferredQuestionIdSet = new Set(uniquePreferredQuestionIds);

  return {
    preferredQuestionIds: uniquePreferredQuestionIds,
    discouragedQuestionIds: ALL_EMERGENCY_SCREEN_QUESTION_IDS.filter(
      (questionId) => !preferredQuestionIdSet.has(questionId)
    ),
  };
}

function buildPlannerQuestionRoutingHints(
  ownerText: string,
  activeComplaintModuleId: string | null
): PlannerQuestionRoutingHints {
  const normalizedOwnerText = ownerText.trim().toLowerCase();

  if (!normalizedOwnerText || !activeComplaintModuleId) {
    return {
      preferredQuestionIds: [],
      discouragedQuestionIds: [],
    };
  }

  const hasAnyPattern = (patterns: RegExp[]): boolean =>
    patterns.some((pattern) => pattern.test(normalizedOwnerText));

  if (activeComplaintModuleId === "skin_itching_allergy") {
    const hasRoutineSkinCue = hasAnyPattern([
      /\blick(?:ing)?\b.*\bpaws?\b/,
      /\bscratch(?:ing)?\b.*\bbelly\b/,
      /\bskin looks red\b/,
      /\bred(?:ness)?\b.*\bskin\b/,
    ]);
    const matchesTargetRoutineSkinProfile =
      hasAnyPattern([/\blick(?:ing)?\b.*\bpaws?\b/]) &&
      hasAnyPattern([/\bscratch(?:ing)?\b.*\bbelly\b/]);
    const hasSkinEmergencyCue = hasAnyPattern([
      /\bswell(?:ing|en)?\b/,
      /\bhives?\b/,
      /\bwelts?\b/,
      /\braised bumps?\b/,
      /\bsting\b/,
      /\bvaccine\b/,
      /\btrouble breathing\b/,
      /\bvomit(?:ed|ing)?\b/,
      /\bcollaps(?:e|ed)\b/,
    ]);

    if (
      matchesTargetRoutineSkinProfile &&
      hasRoutineSkinCue &&
      !hasSkinEmergencyCue
    ) {
      return buildRoutingHints([
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
      ]);
    }
  }

  if (activeComplaintModuleId === "limping_mobility_pain") {
    const hasWoundConfuserCue = hasAnyPattern([
      /\bsmall cut\b/,
      /\bbetween the toes\b/,
      /\bthrough brush\b/,
      /\bcut\b.*\btoes?\b/,
    ]);

    if (hasWoundConfuserCue) {
      return buildRoutingHints([
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check",
      ]);
    }

    const hasSuddenLimpingCue = hasAnyPattern([
      /\btoe-touch(?:ing)?\b/,
      /\bafter a jump\b/,
      /\bjump(?:ed)? off\b/,
      /\boff the couch\b/,
      /\blimping\b.*\bafter\b/,
    ]);

    if (hasSuddenLimpingCue) {
      return buildRoutingHints([
        "limping_weight_bearing",
        "limping_trauma_onset",
        "trauma_mechanism_check",
      ]);
    }
  }

  if (activeComplaintModuleId === "trauma_bleeding_wound") {
    const hasModerateBleedingCue = hasAnyPattern([
      /\bsteady line of blood\b/,
      /\bsteady drip\b/,
      /\bscrap(?:e|ed)\b/,
      /\bfence\b/,
      /\bsmall\b.*\bscrape\b/,
    ]);

    if (hasModerateBleedingCue) {
      return buildRoutingHints([
        "bleeding_volume_check",
        "wound_characterization_check",
        "laceration_depth_check",
        "trauma_mechanism_check",
      ]);
    }
  }

  return {
    preferredQuestionIds: [],
    discouragedQuestionIds: [],
  };
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
  const routingHints = buildPlannerQuestionRoutingHints(
    input.ownerText,
    activeComplaintModuleId
  );

  const plannerResult = planNextClinicalQuestion(input.caseState, {
    activeComplaintModule: plannerActiveComplaintModule,
    preferredQuestionIds: routingHints.preferredQuestionIds,
    discouragedQuestionIds: routingHints.discouragedQuestionIds,
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
