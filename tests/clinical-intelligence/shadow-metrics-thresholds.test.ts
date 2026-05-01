import type { ShadowMetricsSummary } from "@/lib/clinical-intelligence/shadow-metrics";
import {
  DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG,
  evaluateShadowMetricsThresholds,
  type ShadowMetricsThresholdConfig,
} from "@/lib/clinical-intelligence/shadow-metrics-thresholds";

const TEST_THRESHOLD_CONFIG = {
  maxOldGenericQuestionRate: 0.25,
  minPlannedQuestionAvailableRate: 0.8,
  minNewScreensEmergencyEarlierRate: 0.3,
  minRepeatedQuestionAvoidedRate: 0.75,
  maxSafetyNoteRate: 0.5,
  minimumComparisonsForStrictGate: 4,
} satisfies ShadowMetricsThresholdConfig;

function makeSummary(
  overrides: Partial<ShadowMetricsSummary> = {}
): ShadowMetricsSummary {
  return {
    totalComparisons: 0,
    oldGenericQuestionCount: 0,
    oldGenericQuestionRate: 0,
    newScreensEmergencyEarlierCount: 0,
    newScreensEmergencyEarlierRate: 0,
    repeatedQuestionAvoidedCount: 0,
    repeatedQuestionAvoidedRate: 0,
    plannedQuestionAvailableCount: 0,
    plannedQuestionAvailableRate: 0,
    selectedBecauseCounts: {},
    screenedRedFlagCounts: {},
    safetyNoteCounts: {},
    ...overrides,
  };
}

describe("shadow metrics threshold evaluator scaffold", () => {
  it("exports a conservative default threshold config", () => {
    expect(DEFAULT_SHADOW_METRICS_THRESHOLD_CONFIG).toEqual({
      maxOldGenericQuestionRate: 0.25,
      minPlannedQuestionAvailableRate: 0.8,
      minNewScreensEmergencyEarlierRate: 0.1,
      minRepeatedQuestionAvoidedRate: 0.75,
      maxSafetyNoteRate: 0.5,
      minimumComparisonsForStrictGate: 20,
    });
  });

  it("returns warn for empty input instead of failing", () => {
    const result = evaluateShadowMetricsThresholds(
      makeSummary(),
      TEST_THRESHOLD_CONFIG
    );

    expect(result.status).toBe("warn");
    expect(result.totalComparisons).toBe(0);
    expect(result.failedChecks).toEqual([]);
    expect(result.warningChecks).toContain("minimumComparisonsForStrictGate");
    expect(result.summaryNotes).toContain(
      "Strict threshold gate skipped because total comparisons 0 is below minimumComparisonsForStrictGate 4."
    );
  });

  it("passes when strict thresholds are met with enough comparisons", () => {
    const result = evaluateShadowMetricsThresholds(
      makeSummary({
        totalComparisons: 8,
        oldGenericQuestionCount: 2,
        plannedQuestionAvailableCount: 7,
        newScreensEmergencyEarlierCount: 3,
        repeatedQuestionAvoidedCount: 7,
        safetyNoteCounts: {
          "internal-note-a": 1,
          "internal-note-b": 1,
        },
      }),
      TEST_THRESHOLD_CONFIG
    );

    expect(result.status).toBe("pass");
    expect(result.failedChecks).toEqual([]);
    expect(result.warningChecks).toEqual([]);
    expect(result.summaryNotes).toEqual([]);
  });

  it("fails strict gate checks and warns on advisory checks when sample size is sufficient", () => {
    const result = evaluateShadowMetricsThresholds(
      makeSummary({
        totalComparisons: 10,
        oldGenericQuestionCount: 4,
        plannedQuestionAvailableCount: 6,
        newScreensEmergencyEarlierCount: 2,
        repeatedQuestionAvoidedCount: 6,
        safetyNoteCounts: {
          "internal-note-a": 4,
          "internal-note-b": 2,
        },
      }),
      TEST_THRESHOLD_CONFIG
    );

    expect(result.status).toBe("fail");
    expect(result.failedChecks).toEqual([
      "oldGenericQuestionRate",
      "plannedQuestionAvailableRate",
    ]);
    expect(result.warningChecks).toEqual([
      "newScreensEmergencyEarlierRate",
      "repeatedQuestionAvoidedRate",
      "safetyNoteRate",
    ]);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "oldGenericQuestionRate",
          status: "fail",
        }),
        expect.objectContaining({
          key: "plannedQuestionAvailableRate",
          status: "fail",
        }),
        expect.objectContaining({
          key: "newScreensEmergencyEarlierRate",
          status: "warn",
        }),
        expect.objectContaining({
          key: "repeatedQuestionAvoidedRate",
          status: "warn",
        }),
        expect.objectContaining({
          key: "safetyNoteRate",
          status: "warn",
        }),
      ])
    );
  });

  it("downgrades strict gate failures to warnings when the sample size is too small", () => {
    const result = evaluateShadowMetricsThresholds(
      makeSummary({
        totalComparisons: 3,
        oldGenericQuestionCount: 2,
        plannedQuestionAvailableCount: 1,
      }),
      TEST_THRESHOLD_CONFIG
    );

    expect(result.status).toBe("warn");
    expect(result.failedChecks).toEqual([]);
    expect(result.warningChecks).toEqual(
      expect.arrayContaining([
        "minimumComparisonsForStrictGate",
        "oldGenericQuestionRate",
        "plannedQuestionAvailableRate",
      ])
    );
  });

  it("returns defensive clones for checks and note arrays", () => {
    const firstResult = evaluateShadowMetricsThresholds(
      makeSummary({
        totalComparisons: 6,
        oldGenericQuestionCount: 1,
        plannedQuestionAvailableCount: 5,
        newScreensEmergencyEarlierCount: 2,
        repeatedQuestionAvoidedCount: 5,
        safetyNoteCounts: {
          "internal-note-a": 1,
        },
      }),
      TEST_THRESHOLD_CONFIG
    );

    firstResult.checks[0].status = "fail";
    firstResult.failedChecks.push("mutated");
    firstResult.warningChecks.push("mutated");
    firstResult.summaryNotes.push("mutated");

    const secondResult = evaluateShadowMetricsThresholds(
      makeSummary({
        totalComparisons: 6,
        oldGenericQuestionCount: 1,
        plannedQuestionAvailableCount: 5,
        newScreensEmergencyEarlierCount: 2,
        repeatedQuestionAvoidedCount: 5,
        safetyNoteCounts: {
          "internal-note-a": 1,
        },
      }),
      TEST_THRESHOLD_CONFIG
    );

    expect(secondResult.checks[0].status).not.toBe("fail");
    expect(secondResult.failedChecks).not.toContain("mutated");
    expect(secondResult.warningChecks).not.toContain("mutated");
    expect(secondResult.summaryNotes).not.toContain("mutated");
  });

  it("does not emit owner text even when unexpected extra fields are present on the input object", () => {
    const result = evaluateShadowMetricsThresholds(
      {
        ...makeSummary({
          totalComparisons: 5,
          plannedQuestionAvailableCount: 5,
          newScreensEmergencyEarlierCount: 1,
          repeatedQuestionAvoidedCount: 5,
        }),
        ownerText: "do not leak",
      } as never,
      TEST_THRESHOLD_CONFIG
    );

    expect(JSON.stringify(result)).not.toContain("do not leak");
    expect(result.summaryNotes.join(" ")).not.toContain("do not leak");
  });
});
