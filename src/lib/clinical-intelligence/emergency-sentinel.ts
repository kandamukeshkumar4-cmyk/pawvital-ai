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
    const positiveRedFlags = rule.requiredRedFlags.filter(
      (redFlagId) => state.redFlagStatus[redFlagId]?.status === "positive",
    );
    const unresolvedRedFlags = rule.requiredRedFlags.filter((redFlagId) => {
      const status = state.redFlagStatus[redFlagId]?.status;
      return !status || status === "unknown" || status === "not_sure";
    });
    const clinicalSignalIds = state.clinicalSignals
      .filter((signal) => rule.clinicalSignalIds.includes(signal.id))
      .filter((signal) => signal.severity === "high" || signal.severity === "critical")
      .map((signal) => signal.id);

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

  const signalMatch = matches.find((match) => match.clinicalSignalIds.length > 0);
  if (signalMatch) {
    return {
      action: "ask_emergency_screen",
      questionId: chooseQuestionId(signalMatch.rule.screenQuestionIds),
      reason: signalMatch.rule.reason,
      missingRedFlags: signalMatch.unresolvedRedFlags,
    };
  }

  const unresolvedMatch = matches.find((match) => match.unresolvedRedFlags.length > 0);
  if (unresolvedMatch) {
    return {
      action: "ask_emergency_screen",
      questionId: chooseQuestionId(unresolvedMatch.rule.screenQuestionIds),
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
  const signalMatch = matches.find((match) => match.clinicalSignalIds.length > 0);
  if (signalMatch) {
    return chooseQuestionId(signalMatch.rule.screenQuestionIds);
  }

  const unresolvedMatch = matches.find((match) => match.unresolvedRedFlags.length > 0);
  if (unresolvedMatch) {
    return chooseQuestionId(unresolvedMatch.rule.screenQuestionIds);
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

function chooseQuestionId(questionIds: readonly string[]): string {
  for (const questionId of questionIds) {
    if (getQuestionCardById(questionId)) {
      return questionId;
    }
  }

  if (getQuestionCardById(FALLBACK_QUESTION_ID)) {
    return FALLBACK_QUESTION_ID;
  }

  throw new Error("Emergency sentinel fallback question card is not registered.");
}

function getPositiveEmergencyRedFlags(state: ClinicalCaseState): string[] {
  return Object.entries(state.redFlagStatus)
    .filter(([, entry]) => entry.status === "positive")
    .map(([redFlagId]) => redFlagId)
    .filter((redFlagId) => isEmergencyRedFlagId(redFlagId));
}
