/**
 * Uncertainty Contract for VET-921
 *
 * Explicit uncertainty reasons mapped to deterministic actions.
 * Never suppresses true red-flag escalation.
 */

export type UncertaintyReason =
  | "unsupported_pattern"
  | "conflicting_evidence"
  | "missing_critical_sign"
  | "owner_cannot_assess"
  | "out_of_scope";

export type UncertaintyAction =
  | "escalate"
  | "re_ask"
  | "alternate_observable"
  | "abstain_with_safe_next_step";

export interface UncertaintyRule {
  reason: UncertaintyReason;
  action: UncertaintyAction;
  conditions: string[];
  safeNextStep?: string;
}

const UNCERTAINTY_RULES: UncertaintyRule[] = [
  {
    reason: "owner_cannot_assess",
    action: "escalate",
    conditions: ["critical_sign", "no_alternate_observable"],
    safeNextStep: "Seek veterinary assessment - this sign requires professional evaluation",
  },
  {
    reason: "owner_cannot_assess",
    action: "alternate_observable",
    conditions: ["critical_sign", "alternate_observable_available"],
    safeNextStep: "Let's try a different way to assess this",
  },
  {
    reason: "missing_critical_sign",
    action: "re_ask",
    conditions: ["emergency_screen_incomplete"],
    safeNextStep: "I need to confirm this critical sign before proceeding",
  },
  {
    reason: "conflicting_evidence",
    action: "re_ask",
    conditions: ["contradictory_answers"],
    safeNextStep: "Let me clarify - you mentioned earlier that...",
  },
  {
    reason: "unsupported_pattern",
    action: "abstain_with_safe_next_step",
    conditions: ["out_of_distribution", "low_confidence"],
    safeNextStep: "Based on what you've shared, I recommend a veterinary consultation to be safe",
  },
  {
    reason: "out_of_scope",
    action: "abstain_with_safe_next_step",
    conditions: ["non_triage_question"],
    safeNextStep: "I can help with symptom assessment - for treatment advice, please consult your vet",
  },
];

export function resolveUncertainty(
  reason: UncertaintyReason,
  context: {
    isCriticalSign: boolean;
    hasAlternateObservable: boolean;
    isEmergencyScreen: boolean;
    confidenceScore: number;
  }
): UncertaintyRule {
  // Find matching rule based on reason and context
  for (const rule of UNCERTAINTY_RULES) {
    if (rule.reason !== reason) continue;

    // Check if conditions match
    const matches = rule.conditions.every((condition) => {
      switch (condition) {
        case "critical_sign":
          return context.isCriticalSign;
        case "no_alternate_observable":
          return !context.hasAlternateObservable;
        case "alternate_observable_available":
          return context.hasAlternateObservable;
        case "emergency_screen_incomplete":
          return context.isEmergencyScreen;
        case "contradictory_answers":
          return context.confidenceScore < 0.5;
        case "out_of_distribution":
        case "low_confidence":
          return context.confidenceScore < 0.6;
        case "non_triage_question":
          return true;
        default:
          return false;
      }
    });

    if (matches) return rule;
  }

  // Default fallback: escalate if critical, otherwise abstain
  return context.isCriticalSign
    ? UNCERTAINTY_RULES[0] // escalate
    : UNCERTAINTY_RULES[4]; // abstain_with_safe_next_step
}

export function getUncertaintyReasons(): UncertaintyReason[] {
  return [
    "unsupported_pattern",
    "conflicting_evidence",
    "missing_critical_sign",
    "owner_cannot_assess",
    "out_of_scope",
  ];
}
