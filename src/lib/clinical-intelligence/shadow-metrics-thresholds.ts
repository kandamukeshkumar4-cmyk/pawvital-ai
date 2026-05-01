import type { ShadowMetricsSummary } from "./shadow-metrics";

export interface ShadowMetricsThresholdConfig {
  maxOldGenericQuestionRate: number;
  minPlannedQuestionAvailableRate: number;
  minNewScreensEmergencyEarlierRate: number;
  minRepeatedQuestionAvoidedRate: number;
  maxSafetyNoteRate: number;
  minimumComparisonsForStrictGate: number;
}

export type ShadowMetricsThresholdStatus = "pass" | "warn" | "fail";

export type ShadowMetricsThresholdCheckKey =
  | "minimumComparisonsForStrictGate"
  | "oldGenericQuestionRate"
  | "plannedQuestionAvailableRate"
  | "newScreensEmergencyEarlierRate"
  | "repeatedQuestionAvoidedRate"
  | "safetyNoteRate";

export interface ShadowMetricsThresholdCheck {
  key: ShadowMetricsThresholdCheckKey;
  status: ShadowMetricsThresholdStatus;
  actualValue: number;
  thresholdValue: number;
  comparison: "max" | "min";
  note: string;
}

export interface ShadowMetricsThresholdEvaluation {
  status: ShadowMetricsThresholdStatus;
  totalComparisons: number;
  checks: ShadowMetricsThresholdCheck[];
  failedChecks: ShadowMetricsThresholdCheckKey[];
  warningChecks: ShadowMetricsThresholdCheckKey[];
  summaryNotes: string[];
}

type ShadowMetricsThresholdInput =
  | Partial<ShadowMetricsSummary>
  | null
  | undefined;

const ZERO = 0;

export const DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG = Object.freeze({
  maxOldGenericQuestionRate: 0.25,
  minPlannedQuestionAvailableRate: 0.8,
  minNewScreensEmergencyEarlierRate: 0.1,
  minRepeatedQuestionAvoidedRate: 0.75,
  maxSafetyNoteRate: 0.5,
  minimumComparisonsForStrictGate: 20,
} satisfies ShadowMetricsThresholdConfig);

function safeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ZERO;
  }

  return value < ZERO ? ZERO : value;
}

function safeInteger(value: unknown): number {
  return Math.floor(safeNumber(value));
}

function safeRate(count: number, total: number): number {
  if (total <= ZERO) {
    return ZERO;
  }

  return count / total;
}

function sumCountMap(
  counts: ShadowMetricsSummary["safetyNoteCounts"] | undefined
): number {
  if (!counts || typeof counts !== "object") {
    return ZERO;
  }

  return Object.values(counts).reduce<number>(
    (total, value) => total + safeInteger(value),
    ZERO
  );
}

function cloneCheck(
  check: ShadowMetricsThresholdCheck
): ShadowMetricsThresholdCheck {
  return { ...check };
}

function cloneEvaluation(
  evaluation: ShadowMetricsThresholdEvaluation
): ShadowMetricsThresholdEvaluation {
  return {
    ...evaluation,
    checks: evaluation.checks.map(cloneCheck),
    failedChecks: [...evaluation.failedChecks],
    warningChecks: [...evaluation.warningChecks],
    summaryNotes: [...evaluation.summaryNotes],
  };
}

function resolveThresholdConfig(
  overrides?: Partial<ShadowMetricsThresholdConfig>
): ShadowMetricsThresholdConfig {
  return {
    maxOldGenericQuestionRate: safeNumber(
      overrides?.maxOldGenericQuestionRate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.maxOldGenericQuestionRate
    ),
    minPlannedQuestionAvailableRate: safeNumber(
      overrides?.minPlannedQuestionAvailableRate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.minPlannedQuestionAvailableRate
    ),
    minNewScreensEmergencyEarlierRate: safeNumber(
      overrides?.minNewScreensEmergencyEarlierRate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.minNewScreensEmergencyEarlierRate
    ),
    minRepeatedQuestionAvoidedRate: safeNumber(
      overrides?.minRepeatedQuestionAvoidedRate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.minRepeatedQuestionAvoidedRate
    ),
    maxSafetyNoteRate: safeNumber(
      overrides?.maxSafetyNoteRate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.maxSafetyNoteRate
    ),
    minimumComparisonsForStrictGate: safeInteger(
      overrides?.minimumComparisonsForStrictGate ??
        DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG.minimumComparisonsForStrictGate
    ),
  };
}

function buildCheck(
  key: ShadowMetricsThresholdCheckKey,
  comparison: "max" | "min",
  actualValue: number,
  thresholdValue: number,
  status: ShadowMetricsThresholdStatus,
  note: string
): ShadowMetricsThresholdCheck {
  return {
    key,
    status,
    actualValue,
    thresholdValue,
    comparison,
    note,
  };
}

function createSampleSizeNote(
  totalComparisons: number,
  minimumComparisonsForStrictGate: number
): string {
  return `Strict threshold gate skipped because total comparisons ${totalComparisons} is below minimumComparisonsForStrictGate ${minimumComparisonsForStrictGate}.`;
}

export function evaluateShadowMetricsThresholds(
  summary: ShadowMetricsThresholdInput,
  configOverrides?: Partial<ShadowMetricsThresholdConfig>
): ShadowMetricsThresholdEvaluation {
  const config = resolveThresholdConfig(configOverrides);
  const totalComparisons = safeInteger(summary?.totalComparisons);
  const strictGateReady =
    totalComparisons >= config.minimumComparisonsForStrictGate;

  const oldGenericQuestionRate = safeRate(
    safeInteger(summary?.oldGenericQuestionCount),
    totalComparisons
  );
  const plannedQuestionAvailableRate = safeRate(
    safeInteger(summary?.plannedQuestionAvailableCount),
    totalComparisons
  );
  const newScreensEmergencyEarlierRate = safeRate(
    safeInteger(summary?.newScreensEmergencyEarlierCount),
    totalComparisons
  );
  const repeatedQuestionAvoidedRate = safeRate(
    safeInteger(summary?.repeatedQuestionAvoidedCount),
    totalComparisons
  );
  const safetyNoteRate = safeRate(
    sumCountMap(summary?.safetyNoteCounts),
    totalComparisons
  );

  const checks: ShadowMetricsThresholdCheck[] = [];
  const failedChecks: ShadowMetricsThresholdCheckKey[] = [];
  const warningChecks: ShadowMetricsThresholdCheckKey[] = [];
  const summaryNotes: string[] = [];

  const sampleSizeStatus: ShadowMetricsThresholdStatus = strictGateReady
    ? "pass"
    : "warn";
  checks.push(
    buildCheck(
      "minimumComparisonsForStrictGate",
      "min",
      totalComparisons,
      config.minimumComparisonsForStrictGate,
      sampleSizeStatus,
      strictGateReady
        ? "Strict threshold gate has enough comparisons."
        : createSampleSizeNote(
            totalComparisons,
            config.minimumComparisonsForStrictGate
          )
    )
  );
  if (!strictGateReady) {
    warningChecks.push("minimumComparisonsForStrictGate");
    summaryNotes.push(
      createSampleSizeNote(
        totalComparisons,
        config.minimumComparisonsForStrictGate
      )
    );
  }

  const oldGenericQuestionStatus: ShadowMetricsThresholdStatus =
    oldGenericQuestionRate <= config.maxOldGenericQuestionRate
      ? "pass"
      : strictGateReady
        ? "fail"
        : "warn";
  checks.push(
    buildCheck(
      "oldGenericQuestionRate",
      "max",
      oldGenericQuestionRate,
      config.maxOldGenericQuestionRate,
      oldGenericQuestionStatus,
      "Old generic-question rate should stay at or below the configured maximum."
    )
  );
  if (oldGenericQuestionStatus === "fail") {
    failedChecks.push("oldGenericQuestionRate");
    summaryNotes.push(
      "Old generic-question rate exceeded the strict threshold."
    );
  } else if (oldGenericQuestionStatus === "warn") {
    warningChecks.push("oldGenericQuestionRate");
    summaryNotes.push(
      "Old generic-question rate exceeded the threshold but did not trigger a strict failure."
    );
  }

  const plannedQuestionAvailableStatus: ShadowMetricsThresholdStatus =
    plannedQuestionAvailableRate >= config.minPlannedQuestionAvailableRate
      ? "pass"
      : strictGateReady
        ? "fail"
        : "warn";
  checks.push(
    buildCheck(
      "plannedQuestionAvailableRate",
      "min",
      plannedQuestionAvailableRate,
      config.minPlannedQuestionAvailableRate,
      plannedQuestionAvailableStatus,
      "Planned-question availability should stay at or above the configured minimum."
    )
  );
  if (plannedQuestionAvailableStatus === "fail") {
    failedChecks.push("plannedQuestionAvailableRate");
    summaryNotes.push(
      "Planned-question availability fell below the strict threshold."
    );
  } else if (plannedQuestionAvailableStatus === "warn") {
    warningChecks.push("plannedQuestionAvailableRate");
    summaryNotes.push(
      "Planned-question availability fell below the threshold but did not trigger a strict failure."
    );
  }

  const newScreensEmergencyEarlierStatus: ShadowMetricsThresholdStatus =
    newScreensEmergencyEarlierRate >=
    config.minNewScreensEmergencyEarlierRate
      ? "pass"
      : "warn";
  checks.push(
    buildCheck(
      "newScreensEmergencyEarlierRate",
      "min",
      newScreensEmergencyEarlierRate,
      config.minNewScreensEmergencyEarlierRate,
      newScreensEmergencyEarlierStatus,
      "Emergency-earlier improvement rate is advisory and warns below the configured minimum."
    )
  );
  if (newScreensEmergencyEarlierStatus === "warn") {
    warningChecks.push("newScreensEmergencyEarlierRate");
    summaryNotes.push(
      "Emergency-earlier improvement rate is below the advisory threshold."
    );
  }

  const repeatedQuestionAvoidedStatus: ShadowMetricsThresholdStatus =
    repeatedQuestionAvoidedRate >= config.minRepeatedQuestionAvoidedRate
      ? "pass"
      : "warn";
  checks.push(
    buildCheck(
      "repeatedQuestionAvoidedRate",
      "min",
      repeatedQuestionAvoidedRate,
      config.minRepeatedQuestionAvoidedRate,
      repeatedQuestionAvoidedStatus,
      "Repeated-question avoidance rate is advisory and warns below the configured minimum."
    )
  );
  if (repeatedQuestionAvoidedStatus === "warn") {
    warningChecks.push("repeatedQuestionAvoidedRate");
    summaryNotes.push(
      "Repeated-question avoidance rate is below the advisory threshold."
    );
  }

  const safetyNoteStatus: ShadowMetricsThresholdStatus =
    safetyNoteRate <= config.maxSafetyNoteRate ? "pass" : "warn";
  checks.push(
    buildCheck(
      "safetyNoteRate",
      "max",
      safetyNoteRate,
      config.maxSafetyNoteRate,
      safetyNoteStatus,
      "Safety-note rate is advisory and warns above the configured maximum."
    )
  );
  if (safetyNoteStatus === "warn") {
    warningChecks.push("safetyNoteRate");
    summaryNotes.push("Safety-note rate is above the advisory threshold.");
  }

  const evaluation: ShadowMetricsThresholdEvaluation = {
    status:
      failedChecks.length > ZERO
        ? "fail"
        : warningChecks.length > ZERO
          ? "warn"
          : "pass",
    totalComparisons,
    checks,
    failedChecks,
    warningChecks,
    summaryNotes,
  };

  return cloneEvaluation(evaluation);
}
