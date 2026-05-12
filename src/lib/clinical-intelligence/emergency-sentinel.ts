import type { ClinicalCaseState } from "./case-state";
import { isEmergencyRedFlagId } from "./emergency-red-flags";
import { getQuestionCardById } from "./question-card-registry";
import {
  getEmergencyScreenRules,
  getRuleCategoriesForModule,
  type EmergencyScreenRule,
  type EmergencySentinelCategory,
} from "./emergency-screen-rules";

const FALLBACK_QUESTION_ID = "emergency_global_screen";
const QUESTION_ID_PATTERN = /^[a-z0-9_]+$/;

const QUESTION_RED_FLAG_COVERAGE: Record<string, readonly string[]> = {
  breathing_difficulty_check: ["breathing_difficulty", "stridor_present", "allergic_with_breathing"],
  gum_color_check: ["blue_gums", "pale_gums"],
  collapse_weakness_check: ["collapse", "unresponsive"],
  gi_blood_check: ["hematemesis", "melena", "hematochezia"],
  gi_keep_water_down_check: ["unable_to_retain_water"],
  toxin_exposure_check: ["toxin_confirmed", "rat_poison_confirmed", "toxin_with_symptoms"],
  bloat_retching_abdomen_check: [
    "gastric_dilatation_volvulus",
    "unproductive_retching",
    "rapid_onset_distension",
    "bloat_with_restlessness",
    "distended_abdomen_painful",
  ],
  urinary_blockage_check: ["urinary_blockage", "no_urine_24h"],
  limping_weight_bearing: ["non_weight_bearing"],
  limping_trauma_onset: ["post_trauma_lameness"],
  seizure_neuro_check: [
    "seizure_activity",
    "seizure_prolonged",
    "post_ictal_prolonged",
    "sudden_paralysis",
  ],
  skin_emergency_allergy_screen: [
    "face_swelling",
    "hives_widespread",
    "allergic_with_breathing",
  ],
  panting_excess_check: ["heatstroke_signs", "brachycephalic_heat"],
  bleeding_volume_check: ["large_blood_volume"],
  laceration_depth_check: ["wound_deep_bleeding"],
  emergency_global_screen: [],
};

export type EmergencySentinelDecision =
  | {
      action: "emergency_result";
      urgency: "emergency";
      matchedCategory: EmergencySentinelCategory | "current_urgency";
      matchedRedFlags: string[];
      evidence: string[];
    }
  | {
      action: "ask_emergency_screen";
      questionId: string;
      reason: string;
      missingRedFlags: string[];
    }
  | {
      action: "proceed_to_module";
      reason: string;
    };

export interface EmergencyRuleMatch {
  rule: EmergencyScreenRule;
  positiveRedFlags: string[];
  unresolvedRedFlags: string[];
  clinicalSignalIds: string[];
}

type ComplaintModuleInput = string | { id: string } | null | undefined;

export function matchEmergencyRules(
  state: ClinicalCaseState,
  rules: readonly EmergencyScreenRule[] = getApplicableRules(state),
): EmergencyRuleMatch[] {
  return rules.map((rule) => {
    const clinicalSignalIds = state.clinicalSignals
      .filter((signal) => rule.clinicalSignalIds.includes(signal.id))
      .filter((signal) => signal.severity === "high" || signal.severity === "critical")
      .map((signal) => signal.id);
    const positiveRedFlags = rule.requiredRedFlags.filter(
      (redFlagId) => state.redFlagStatus[redFlagId]?.status === "positive",
    );
    const unresolvedRedFlags =
      rule.triggerOnlyOnClinicalSignal && clinicalSignalIds.length === 0
        ? []
        : rule.requiredRedFlags.filter((redFlagId) => {
            const status = state.redFlagStatus[redFlagId]?.status;
            return !status || status === "unknown" || status === "not_sure";
          });

    return {
      rule,
      positiveRedFlags,
      unresolvedRedFlags,
      clinicalSignalIds,
    };
  });
}

export function evaluateEmergencySentinel(
  state: ClinicalCaseState,
  options: { complaintModule?: ComplaintModuleInput } = {},
): EmergencySentinelDecision {
  const activeModuleId = getComplaintModuleId(options.complaintModule) ?? state.activeComplaintModule;
  const applicableRules = getApplicableRules(state, activeModuleId);

  const matches = matchEmergencyRules(state, applicableRules);
  const positiveMatch = matches.find((match) => match.positiveRedFlags.length > 0);
  if (positiveMatch) {
    return {
      action: "emergency_result",
      urgency: "emergency",
      matchedCategory: positiveMatch.rule.category,
      matchedRedFlags: getPositiveEmergencyRedFlags(state),
      evidence: positiveMatch.positiveRedFlags.map((redFlagId) =>
        state.redFlagStatus[redFlagId]?.evidenceText ?? redFlagId
      ),
    };
  }

  if (state.currentUrgency === "emergency") {
    return {
      action: "emergency_result",
      urgency: "emergency",
      matchedCategory: "current_urgency",
      matchedRedFlags: getPositiveEmergencyRedFlags(state),
      evidence: ["current urgency is emergency"],
    };
  }

  const signalMatch = matches.find(
    (match) => match.clinicalSignalIds.length > 0 && match.unresolvedRedFlags.length > 0,
  );
  if (signalMatch) {
    return {
      action: "ask_emergency_screen",
      questionId: chooseQuestionId(state, signalMatch.rule, signalMatch.unresolvedRedFlags),
      reason: signalMatch.rule.reason,
      missingRedFlags: signalMatch.unresolvedRedFlags,
    };
  }

  const unresolvedMatch = matches.find((match) => match.unresolvedRedFlags.length > 0);
  if (unresolvedMatch) {
    return {
      action: "ask_emergency_screen",
      questionId: chooseQuestionId(state, unresolvedMatch.rule, unresolvedMatch.unresolvedRedFlags),
      reason: unresolvedMatch.rule.reason,
      missingRedFlags: unresolvedMatch.unresolvedRedFlags,
    };
  }

  return {
    action: "proceed_to_module",
    reason:
      "Required emergency screens for the active complaint are resolved with no positive red flags or emergency clinical signals.",
  };
}

export function getMissingEmergencyRedFlags(
  state: ClinicalCaseState,
  complaintModule?: ComplaintModuleInput,
): string[] {
  const rules = getApplicableRules(state, complaintModule);
  const missing = new Set<string>();

  for (const match of matchEmergencyRules(state, rules)) {
    for (const redFlagId of match.unresolvedRedFlags) {
      missing.add(redFlagId);
    }
  }

  return [...missing];
}

export function chooseEmergencyScreenQuestion(
  state: ClinicalCaseState,
  complaintModule?: ComplaintModuleInput,
): string | undefined {
  const rules = getApplicableRules(state, complaintModule);
  const matches = matchEmergencyRules(state, rules);
  const signalMatch = matches.find(
    (match) => match.clinicalSignalIds.length > 0 && match.unresolvedRedFlags.length > 0,
  );
  if (signalMatch) {
    return chooseQuestionId(state, signalMatch.rule, signalMatch.unresolvedRedFlags);
  }

  const unresolvedMatch = matches.find((match) => match.unresolvedRedFlags.length > 0);
  if (unresolvedMatch) {
    return chooseQuestionId(state, unresolvedMatch.rule, unresolvedMatch.unresolvedRedFlags);
  }

  return undefined;
}

export function isEmergencyPositive(state: ClinicalCaseState): boolean {
  return state.currentUrgency === "emergency" || getPositiveEmergencyRedFlags(state).length > 0;
}

export { getEmergencyScreenRules };

function getApplicableRules(
  state: ClinicalCaseState,
  complaintModule?: ComplaintModuleInput,
): readonly EmergencyScreenRule[] {
  const moduleId = getComplaintModuleId(complaintModule) ?? state.activeComplaintModule;
  const categories = getRuleCategoriesForModule(moduleId);
  const rulesByCategory = new Map(
    getEmergencyScreenRules().map((rule) => [rule.category, rule]),
  );

  return categories
    .map((category) => rulesByCategory.get(category))
    .filter((rule): rule is EmergencyScreenRule => Boolean(rule));
}

function getComplaintModuleId(complaintModule?: ComplaintModuleInput): string | null {
  if (!complaintModule) {
    return null;
  }

  return typeof complaintModule === "string" ? complaintModule : complaintModule.id;
}

function chooseQuestionId(
  state: ClinicalCaseState,
  rule: EmergencyScreenRule,
  unresolvedRedFlags: readonly string[],
): string {
  const unresolved = new Set(unresolvedRedFlags);
  const cleanSpecificQuestionId = rule.screenQuestionIds.find((questionId) => {
    const coveredRedFlags = QUESTION_RED_FLAG_COVERAGE[questionId] ?? [];
    return (
      coveredRedFlags.some((redFlagId) => unresolved.has(redFlagId)) &&
      !coveredRedFlags.some((redFlagId) => state.redFlagStatus[redFlagId]?.status === "negative") &&
      isRegisteredQuestionId(questionId)
    );
  });

  if (cleanSpecificQuestionId) {
    return cleanSpecificQuestionId;
  }

  const fallbackSpecificQuestionId = rule.screenQuestionIds.find((questionId) => {
    const coveredRedFlags = QUESTION_RED_FLAG_COVERAGE[questionId] ?? [];
    return (
      coveredRedFlags.some((redFlagId) => unresolved.has(redFlagId)) &&
      isRegisteredQuestionId(questionId)
    );
  });

  if (fallbackSpecificQuestionId) {
    return fallbackSpecificQuestionId;
  }

  for (const questionId of rule.screenQuestionIds) {
    if (isRegisteredQuestionId(questionId)) {
      return questionId;
    }
  }

  if (isRegisteredQuestionId(FALLBACK_QUESTION_ID)) {
    return FALLBACK_QUESTION_ID;
  }

  throw new Error("Emergency sentinel fallback question card is not registered.");
}

function isRegisteredQuestionId(questionId: string): boolean {
  return QUESTION_ID_PATTERN.test(questionId) && Boolean(getQuestionCardById(questionId));
}

function getPositiveEmergencyRedFlags(state: ClinicalCaseState): string[] {
  const sentinelRedFlagIds = new Set(
    getEmergencyScreenRules().flatMap((rule) => rule.requiredRedFlags),
  );

  return Object.entries(state.redFlagStatus)
    .filter(([, entry]) => entry.status === "positive")
    .map(([redFlagId]) => redFlagId)
    .filter((redFlagId) => isEmergencyRedFlagId(redFlagId) || sentinelRedFlagIds.has(redFlagId));
}
