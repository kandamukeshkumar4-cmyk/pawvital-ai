import type { ServiceTimeoutRecord } from "@/lib/clinical-evidence";

export const SYMPTOM_CHAT_MAX_DURATION_SECONDS = 60;
export const SYMPTOM_CHAT_ROUTE_DEADLINE_SAFETY_MS = 5_000;
export const SYMPTOM_CHAT_ROUTE_BUDGET_MS =
  SYMPTOM_CHAT_MAX_DURATION_SECONDS * 1_000 -
  SYMPTOM_CHAT_ROUTE_DEADLINE_SAFETY_MS;
export const MANDATORY_MODEL_DEADLINE_SAFETY_MS = 1_000;
export const OPTIONAL_EXTERNAL_STAGE_DEADLINE_SAFETY_MS = 750;

export type OptionalModelStage =
  | "question_plan_review"
  | "question_phrasing"
  | "question_verification"
  | "memory_compression";

export interface TurnBudget {
  startedAtMs: number;
  deadlineAtMs: number;
}

const OPTIONAL_STAGE_ESTIMATES_MS: Record<OptionalModelStage, number> = {
  question_plan_review: 1_500,
  question_phrasing: 3_000,
  question_verification: 1_500,
  memory_compression: 8_000,
};

const OPTIONAL_STAGE_SERVICE: Record<OptionalModelStage, string> = {
  question_plan_review: "nvidia-nemotron",
  question_phrasing: "nvidia-llama",
  question_verification: "nvidia-nemotron",
  memory_compression: "minimax",
};

export function createTurnBudget(startedAtMs: number): TurnBudget {
  return {
    startedAtMs,
    deadlineAtMs: startedAtMs + SYMPTOM_CHAT_ROUTE_BUDGET_MS,
  };
}

export function getRemainingTurnBudgetMs(
  budget: TurnBudget | null | undefined,
  nowMs = Date.now()
): number | null {
  if (!budget) {
    return null;
  }

  return budget.deadlineAtMs - nowMs;
}

export function getTurnBudgetDeadlineMs(
  budget: TurnBudget | null | undefined
): number | null {
  return budget?.deadlineAtMs ?? null;
}

export function isTurnBudgetExceeded(
  budget: TurnBudget | null | undefined,
  nowMs = Date.now()
): boolean {
  const remainingMs = getRemainingTurnBudgetMs(budget, nowMs);
  return remainingMs !== null && remainingMs <= 0;
}

export function shouldSkipOptionalModelStage(
  budget: TurnBudget | null | undefined,
  stage: OptionalModelStage,
  nowMs = Date.now()
): boolean {
  const remainingMs = getRemainingTurnBudgetMs(budget, nowMs);
  if (remainingMs === null) {
    return false;
  }

  return remainingMs < OPTIONAL_STAGE_ESTIMATES_MS[stage];
}

export function getMandatoryModelTimeoutMs(
  budget: TurnBudget | null | undefined,
  defaultTimeoutMs: number,
  nowMs = Date.now()
): number {
  const remainingMs = getRemainingTurnBudgetMs(budget, nowMs);
  if (remainingMs === null) {
    return defaultTimeoutMs;
  }

  const boundedRemainingMs = remainingMs - MANDATORY_MODEL_DEADLINE_SAFETY_MS;
  return Math.max(1, Math.min(defaultTimeoutMs, boundedRemainingMs));
}

export function getOptionalExternalStageTimeoutMs(
  budget: TurnBudget | null | undefined,
  defaultTimeoutMs: number,
  nowMs = Date.now()
): number | null {
  if (!Number.isFinite(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
    return null;
  }

  const safeDefaultTimeoutMs = Math.max(1, Math.floor(defaultTimeoutMs));
  const remainingMs = getRemainingTurnBudgetMs(budget, nowMs);
  if (remainingMs === null) {
    return safeDefaultTimeoutMs;
  }

  const boundedRemainingMs =
    remainingMs - OPTIONAL_EXTERNAL_STAGE_DEADLINE_SAFETY_MS;
  if (boundedRemainingMs <= 0) {
    return null;
  }

  return Math.max(1, Math.min(safeDefaultTimeoutMs, boundedRemainingMs));
}

export function buildOptionalModelTimeoutRecord(
  stage: OptionalModelStage,
  reason = "turn_deadline_budget_exhausted"
): ServiceTimeoutRecord {
  return {
    service: OPTIONAL_STAGE_SERVICE[stage],
    stage,
    reason,
  };
}
