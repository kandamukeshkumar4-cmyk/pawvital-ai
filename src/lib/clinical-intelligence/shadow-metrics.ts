import {
  createEmptyShadowPlannerComparisonResult,
  isShadowPlannerComparisonReady,
  type ShadowPlannerComparisonResult,
} from "./shadow-planner";
import { type ShadowTelemetryRecord } from "./shadow-telemetry";

type CountMap = Record<string, number>;

export interface ShadowMetricsSummary {
  totalComparisons: number;
  oldGenericQuestionCount: number;
  oldGenericQuestionRate: number;
  newScreensEmergencyEarlierCount: number;
  newScreensEmergencyEarlierRate: number;
  repeatedQuestionAvoidedCount: number;
  repeatedQuestionAvoidedRate: number;
  plannedQuestionAvailableCount: number;
  plannedQuestionAvailableRate: number;
  selectedBecauseCounts: CountMap;
  screenedRedFlagCounts: CountMap;
  safetyNoteCounts: CountMap;
}

export type ShadowMetricsInputRecord =
  | ShadowPlannerComparisonResult
  | ShadowTelemetryRecord
  | Partial<ShadowPlannerComparisonResult>
  | Partial<ShadowTelemetryRecord>
  | null
  | undefined;

const ZERO_RATE = 0;
const INTERNAL_ONLY_OWNER_FACING_IMPACT = "none";

function createEmptyCountMap(): CountMap {
  return {};
}

function cloneCountMap(counts: CountMap): CountMap {
  return { ...counts };
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((entry) => safeString(entry)).filter((entry): entry is string => Boolean(entry)))];
}

function safeBoolean(value: unknown): boolean {
  return value === true;
}

function safeRate(count: number, total: number): number {
  if (total <= 0) {
    return ZERO_RATE;
  }

  return count / total;
}

function incrementCount(counts: CountMap, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isTelemetryLikeRecord(
  record: ShadowMetricsInputRecord
): record is Partial<ShadowTelemetryRecord> {
  return Boolean(record && typeof record === "object" && "comparison" in record);
}

function normalizeComparison(
  record: ShadowMetricsInputRecord
): ShadowPlannerComparisonResult | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const comparisonSource = isTelemetryLikeRecord(record)
    ? record.comparison
    : record;

  if (!comparisonSource || typeof comparisonSource !== "object") {
    return createEmptyShadowPlannerComparisonResult();
  }

  const existingQuestionId = safeString(
    (comparisonSource as Partial<ShadowPlannerComparisonResult>).existingQuestionId
  );
  const plannedQuestionId = safeString(
    (comparisonSource as Partial<ShadowPlannerComparisonResult>).plannedQuestionId
  );
  const plannedShortReason = safeString(
    (comparisonSource as Partial<ShadowPlannerComparisonResult>).plannedShortReason
  );
  const selectedBecause = safeString(
    (comparisonSource as Partial<ShadowPlannerComparisonResult>).selectedBecause
  ) as ShadowPlannerComparisonResult["selectedBecause"];

  return {
    existingQuestionId,
    plannedQuestionId,
    plannedShortReason,
    screenedRedFlags: safeStringArray(
      (comparisonSource as Partial<ShadowPlannerComparisonResult>).screenedRedFlags
    ),
    selectedBecause: selectedBecause ?? null,
    oldWasGeneric: safeBoolean(
      (comparisonSource as Partial<ShadowPlannerComparisonResult>).oldWasGeneric
    ),
    newScreensEmergencyEarlier: safeBoolean(
      (comparisonSource as Partial<ShadowPlannerComparisonResult>).newScreensEmergencyEarlier
    ),
    repeatedQuestionAvoided: safeBoolean(
      (comparisonSource as Partial<ShadowPlannerComparisonResult>).repeatedQuestionAvoided
    ),
    safetyNotes: safeStringArray(
      (comparisonSource as Partial<ShadowPlannerComparisonResult>).safetyNotes
    ),
  };
}

function buildZeroSummary(): ShadowMetricsSummary {
  return {
    totalComparisons: 0,
    oldGenericQuestionCount: 0,
    oldGenericQuestionRate: ZERO_RATE,
    newScreensEmergencyEarlierCount: 0,
    newScreensEmergencyEarlierRate: ZERO_RATE,
    repeatedQuestionAvoidedCount: 0,
    repeatedQuestionAvoidedRate: ZERO_RATE,
    plannedQuestionAvailableCount: 0,
    plannedQuestionAvailableRate: ZERO_RATE,
    selectedBecauseCounts: createEmptyCountMap(),
    screenedRedFlagCounts: createEmptyCountMap(),
    safetyNoteCounts: createEmptyCountMap(),
  };
}

function cloneSummary(summary: ShadowMetricsSummary): ShadowMetricsSummary {
  return {
    ...summary,
    selectedBecauseCounts: cloneCountMap(summary.selectedBecauseCounts),
    screenedRedFlagCounts: cloneCountMap(summary.screenedRedFlagCounts),
    safetyNoteCounts: cloneCountMap(summary.safetyNoteCounts),
  };
}

export function summarizeShadowMetrics(
  records: readonly ShadowMetricsInputRecord[]
): ShadowMetricsSummary {
  if (!Array.isArray(records) || records.length === 0) {
    return buildZeroSummary();
  }

  const summary = buildZeroSummary();

  for (const record of records) {
    const comparison = normalizeComparison(record);
    if (!comparison) {
      continue;
    }

    summary.totalComparisons += 1;

    if (comparison.oldWasGeneric) {
      summary.oldGenericQuestionCount += 1;
    }

    if (comparison.newScreensEmergencyEarlier) {
      summary.newScreensEmergencyEarlierCount += 1;
    }

    if (comparison.repeatedQuestionAvoided) {
      summary.repeatedQuestionAvoidedCount += 1;
    }

    if (isShadowPlannerComparisonReady(comparison)) {
      summary.plannedQuestionAvailableCount += 1;
    }

    if (comparison.selectedBecause) {
      incrementCount(summary.selectedBecauseCounts, comparison.selectedBecause);
    }

    for (const redFlag of comparison.screenedRedFlags) {
      incrementCount(summary.screenedRedFlagCounts, redFlag);
    }

    for (const safetyNote of comparison.safetyNotes) {
      incrementCount(summary.safetyNoteCounts, safetyNote);
    }
  }

  summary.oldGenericQuestionRate = safeRate(
    summary.oldGenericQuestionCount,
    summary.totalComparisons
  );
  summary.newScreensEmergencyEarlierRate = safeRate(
    summary.newScreensEmergencyEarlierCount,
    summary.totalComparisons
  );
  summary.repeatedQuestionAvoidedRate = safeRate(
    summary.repeatedQuestionAvoidedCount,
    summary.totalComparisons
  );
  summary.plannedQuestionAvailableRate = safeRate(
    summary.plannedQuestionAvailableCount,
    summary.totalComparisons
  );

  return cloneSummary(summary);
}

export function isShadowOutputSafeForInternalDisplay(
  record: ShadowMetricsInputRecord
): boolean {
  if (!record || typeof record !== "object") {
    return false;
  }

  const pollutedKeys = [
    "ownerText",
    "rawMessageText",
    "rawOwnerMessage",
    "ownerFacingText",
    "messageText",
  ];

  for (const key of pollutedKeys) {
    if (safeString((record as Record<string, unknown>)[key])) {
      return false;
    }
  }

  const ownerFacingImpact = safeString(
    (record as Record<string, unknown>).ownerFacingImpact
  );
  if (
    ownerFacingImpact !== null &&
    ownerFacingImpact !== INTERNAL_ONLY_OWNER_FACING_IMPACT
  ) {
    return false;
  }

  return true;
}
