import {
  getModelFeatureConfig,
  type ModelFallbackReason,
  type ModelFeature,
  type ModelFeatureMode,
} from "./model-router";

export interface ModelBudgetState {
  callCounts: Partial<Record<ModelFeature, number>>;
  circuitOpen: Partial<Record<ModelFeature, boolean>>;
}

export interface ModelBudgetPolicy {
  maxCallsPerSession: number;
  timeoutMs: number;
}

type BudgetBlockReason = Extract<
  ModelFallbackReason,
  "budget_exceeded" | "feature_disabled" | "circuit_open"
>;

export function createModelBudgetState(
  state?: Partial<ModelBudgetState> | null
): ModelBudgetState {
  return {
    callCounts: { ...(state?.callCounts ?? {}) },
    circuitOpen: { ...(state?.circuitOpen ?? {}) },
  };
}

export function hasNonEmptyModelBudgetState(
  state: ModelBudgetState | undefined
): boolean {
  if (!state) {
    return false;
  }

  return (
    Object.keys(state.callCounts ?? {}).length > 0 ||
    Object.keys(state.circuitOpen ?? {}).length > 0
  );
}

export function getModelBudgetPolicy(feature: ModelFeature): ModelBudgetPolicy {
  const config = getModelFeatureConfig(feature);
  return {
    maxCallsPerSession: config.maxCallsPerSession,
    timeoutMs: config.timeoutMs,
  };
}

export function getModelBudgetCallCount(
  state: ModelBudgetState | undefined,
  feature: ModelFeature
): number {
  return state?.callCounts?.[feature] ?? 0;
}

export function openModelBudgetCircuit(
  state: ModelBudgetState | undefined,
  feature: ModelFeature
): ModelBudgetState {
  const nextState = createModelBudgetState(state);
  nextState.circuitOpen[feature] = true;
  return nextState;
}

export function reserveModelBudgetCall({
  feature,
  mode,
  state,
}: {
  feature: ModelFeature;
  mode: ModelFeatureMode;
  state?: ModelBudgetState;
}):
  | { allowed: true; state: ModelBudgetState }
  | {
      allowed: false;
      reason: BudgetBlockReason;
      state: ModelBudgetState;
    } {
  const nextState = createModelBudgetState(state);

  if (mode === "off") {
    return {
      allowed: false,
      reason: "feature_disabled",
      state: nextState,
    };
  }

  if (nextState.circuitOpen[feature]) {
    return {
      allowed: false,
      reason: "circuit_open",
      state: nextState,
    };
  }

  const policy = getModelBudgetPolicy(feature);
  const currentCount = getModelBudgetCallCount(nextState, feature);
  if (currentCount >= policy.maxCallsPerSession) {
    return {
      allowed: false,
      reason: "budget_exceeded",
      state: nextState,
    };
  }

  nextState.callCounts[feature] = currentCount + 1;
  return {
    allowed: true,
    state: nextState,
  };
}
