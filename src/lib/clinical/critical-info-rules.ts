import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import {
  buildAlternateObservableRecoveryOutcome,
  buildCannotAssessOutcome,
  type AlternateObservableRecoveryOutcome,
  type UncertaintyTerminalOutcome,
} from "./uncertainty-routing";

export interface CriticalInfoRule {
  questionId: string;
  reportBlocksWhenUnknown: true;
  allowAlternateObservableRetry: boolean;
}

export const CRITICAL_INFO_ESCALATION_REASON =
  "owner_cannot_assess_critical_indicator";

const CRITICAL_INFO_RULES: Record<string, CriticalInfoRule> = {
  breathing_onset: {
    questionId: "breathing_onset",
    reportBlocksWhenUnknown: true,
    allowAlternateObservableRetry: false,
  },
  breathing_pattern: {
    questionId: "breathing_pattern",
    reportBlocksWhenUnknown: true,
    allowAlternateObservableRetry: false,
  },
  consciousness_level: {
    questionId: "consciousness_level",
    reportBlocksWhenUnknown: true,
    allowAlternateObservableRetry: false,
  },
  gum_color: {
    questionId: "gum_color",
    reportBlocksWhenUnknown: true,
    allowAlternateObservableRetry: true,
  },
  seizure_duration: {
    questionId: "seizure_duration",
    reportBlocksWhenUnknown: true,
    allowAlternateObservableRetry: false,
  },
};

export interface EvaluateCriticalInfoRuleInput {
  questionId: string;
  rawMessage: string;
  hasRecoveredAnswer: boolean;
  ambiguityFlags: readonly string[];
  alternateObservablePetName: string;
  cannotAssessPetName: string;
  questionText?: string | null;
}

export type CriticalInfoRuleDecision =
  | {
      kind: "alternate_observable";
      rule: CriticalInfoRule;
      outcome: AlternateObservableRecoveryOutcome;
    }
  | {
      kind: "cannot_assess";
      rule: CriticalInfoRule;
      outcome: UncertaintyTerminalOutcome;
      redFlag: string;
      telemetryReason: typeof CRITICAL_INFO_ESCALATION_REASON;
      transitionReason: typeof CRITICAL_INFO_ESCALATION_REASON;
    };

export function getCriticalInfoRule(
  questionId: string
): CriticalInfoRule | null {
  return CRITICAL_INFO_RULES[questionId] ?? null;
}

export function listCriticalInfoRules(): CriticalInfoRule[] {
  return Object.values(CRITICAL_INFO_RULES);
}

export function evaluateCriticalInfoRule(
  input: EvaluateCriticalInfoRuleInput
): CriticalInfoRuleDecision | null {
  const rule = getCriticalInfoRule(input.questionId);
  if (!rule) {
    return null;
  }

  const isAmbiguousReply =
    coerceAmbiguousReplyToUnknown(input.rawMessage) !== null;
  const alternateObservableOutcome = rule.allowAlternateObservableRetry
    ? buildAlternateObservableRecoveryOutcome({
        petName: input.alternateObservablePetName,
        questionId: input.questionId,
      })
    : null;
  const alternateAlreadyOffered = Boolean(
    alternateObservableOutcome &&
      input.ambiguityFlags.includes(alternateObservableOutcome.retryMarker)
  );
  const shouldEscalateAfterAlternateRetry = Boolean(
    alternateObservableOutcome &&
      alternateAlreadyOffered &&
      !input.hasRecoveredAnswer
  );

  if (!isAmbiguousReply && !shouldEscalateAfterAlternateRetry) {
    return null;
  }

  if (alternateObservableOutcome && !alternateAlreadyOffered) {
    return {
      kind: "alternate_observable",
      rule,
      outcome: alternateObservableOutcome,
    };
  }

  return {
    kind: "cannot_assess",
    rule,
    outcome: buildCannotAssessOutcome({
      petName: input.cannotAssessPetName,
      questionId: input.questionId,
      questionText: input.questionText,
    }),
    redFlag: `cannot_assess_${input.questionId}`,
    telemetryReason: CRITICAL_INFO_ESCALATION_REASON,
    transitionReason: CRITICAL_INFO_ESCALATION_REASON,
  };
}
