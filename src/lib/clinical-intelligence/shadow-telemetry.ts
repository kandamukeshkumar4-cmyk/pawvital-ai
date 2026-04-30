import {
  createEmptyShadowPlannerComparisonResult,
  isShadowPlannerComparisonReady,
  type ShadowPlannerComparisonResult,
} from "./shadow-planner";

export const SHADOW_TELEMETRY_EVENT_NAME =
  "clinical_intelligence.shadow_planner_comparison";
export const SHADOW_TELEMETRY_CONTRACT_VERSION =
  "shadow_planner_scaffold.v1";

export interface ShadowTelemetryRecord {
  eventName: typeof SHADOW_TELEMETRY_EVENT_NAME;
  contractVersion: typeof SHADOW_TELEMETRY_CONTRACT_VERSION;
  ownerFacingImpact: "none";
  activeComplaintModule: string | null;
  comparisonReady: boolean;
  comparison: ShadowPlannerComparisonResult;
}

export interface BuildShadowTelemetryRecordInput {
  activeComplaintModule?: string | null;
  comparison?: ShadowPlannerComparisonResult | null;
}

function cloneComparison(
  comparison: ShadowPlannerComparisonResult
): ShadowPlannerComparisonResult {
  return {
    ...comparison,
    screenedRedFlags: [...comparison.screenedRedFlags],
    safetyNotes: [...comparison.safetyNotes],
  };
}

export function createEmptyShadowTelemetryRecord(): ShadowTelemetryRecord {
  const comparison = createEmptyShadowPlannerComparisonResult();

  return {
    eventName: SHADOW_TELEMETRY_EVENT_NAME,
    contractVersion: SHADOW_TELEMETRY_CONTRACT_VERSION,
    ownerFacingImpact: "none",
    activeComplaintModule: null,
    comparisonReady: false,
    comparison,
  };
}

export function buildShadowTelemetryRecord(
  input: BuildShadowTelemetryRecordInput
): ShadowTelemetryRecord {
  const comparison = cloneComparison(
    input.comparison ?? createEmptyShadowPlannerComparisonResult()
  );

  return {
    eventName: SHADOW_TELEMETRY_EVENT_NAME,
    contractVersion: SHADOW_TELEMETRY_CONTRACT_VERSION,
    ownerFacingImpact: "none",
    activeComplaintModule: input.activeComplaintModule ?? null,
    comparisonReady: isShadowPlannerComparisonReady(comparison),
    comparison,
  };
}
