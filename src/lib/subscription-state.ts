import type { SubscriptionPlanTier, SubscriptionRow, UserProfile } from "@/types";

const DEFAULT_FREE_TIER_SYMPTOM_CHECKS_PER_MONTH = 5;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const CHECKOUT_LOCKED_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "paused",
  "unpaid",
]);

export interface UsageLimits {
  symptomChecksPerMonth: number | null;
}

export interface SymptomCheckUsageGateInput {
  completedChecksThisMonth: number;
  conversationStarted: boolean;
  freeTierLimit?: number;
  isEmergency: boolean;
  plan: SubscriptionPlanTier;
}

export interface SymptomCheckUsageGateResult {
  allowed: boolean;
  limit: number | null;
  reason:
    | "conversation_in_progress"
    | "emergency_bypass"
    | "free_tier_limit_reached"
    | "free_tier_under_limit"
    | "plan_unlimited";
  remaining: number | null;
  requiresUpgrade: boolean;
}

function sanitizeUsageCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function getFreeTierSymptomCheckLimit() {
  const parsed = Number.parseInt(
    process.env.FREE_TIER_SYMPTOM_CHECKS_PER_MONTH ?? "",
    10
  );

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_FREE_TIER_SYMPTOM_CHECKS_PER_MONTH;
}

export function getUsageLimitsForPlan(
  plan: SubscriptionPlanTier,
  freeTierLimit = getFreeTierSymptomCheckLimit()
): UsageLimits {
  if (plan === "clinic" || plan === "pro") {
    return {
      symptomChecksPerMonth: null,
    };
  }

  return {
    symptomChecksPerMonth: freeTierLimit,
  };
}

export function isActiveSubscriptionStatus(status: string | null | undefined) {
  return typeof status === "string" && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

export function blocksAdditionalCheckout(status: string | null | undefined) {
  return typeof status === "string" && CHECKOUT_LOCKED_STATUSES.has(status);
}

export function getPlanFromSubscription(
  subscription: SubscriptionRow | null
): SubscriptionPlanTier {
  if (!subscription || !isActiveSubscriptionStatus(subscription.status)) {
    return "free";
  }

  return subscription.plan === "clinic" || subscription.plan === "pro"
    ? subscription.plan
    : "free";
}

export function mapStripeStatusToProfileStatus(
  status: string | null | undefined
): UserProfile["subscription_status"] {
  switch (status) {
    case "trialing":
      return "free_trial";
    case "active":
      return "active";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "past_due":
    case "paused":
    case "unpaid":
      return "expired";
    default:
      return "expired";
  }
}

export function evaluateSymptomCheckUsageGate(
  input: SymptomCheckUsageGateInput
): SymptomCheckUsageGateResult {
  if (input.isEmergency) {
    return {
      allowed: true,
      limit: null,
      reason: "emergency_bypass",
      remaining: null,
      requiresUpgrade: false,
    };
  }

  if (input.conversationStarted) {
    return {
      allowed: true,
      limit: null,
      reason: "conversation_in_progress",
      remaining: null,
      requiresUpgrade: false,
    };
  }

  const { symptomChecksPerMonth } = getUsageLimitsForPlan(
    input.plan,
    input.freeTierLimit
  );

  if (symptomChecksPerMonth === null) {
    return {
      allowed: true,
      limit: null,
      reason: "plan_unlimited",
      remaining: null,
      requiresUpgrade: false,
    };
  }

  const usageCount = sanitizeUsageCount(input.completedChecksThisMonth);
  const remaining = Math.max(0, symptomChecksPerMonth - usageCount);

  if (usageCount >= symptomChecksPerMonth) {
    return {
      allowed: false,
      limit: symptomChecksPerMonth,
      reason: "free_tier_limit_reached",
      remaining: 0,
      requiresUpgrade: true,
    };
  }

  return {
    allowed: true,
    limit: symptomChecksPerMonth,
    reason: "free_tier_under_limit",
    remaining,
    requiresUpgrade: false,
  };
}
