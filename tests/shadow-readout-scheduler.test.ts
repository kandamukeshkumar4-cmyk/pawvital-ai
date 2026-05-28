import schedulerLogic from "../scripts/shadow-readout-scheduler-logic.cjs";

const { decideStatus, nextActionForStatus, summarizePayload } = schedulerLogic;

describe("shadow readout scheduler decision logic", () => {
  it("holds when production reports and observations exist but shadow comparisons are still zero", () => {
    const decision = decideStatus({
      warning: null,
      reportCount: 2,
      observationCount: 2,
      shadowComparisonCount: 0,
    });

    expect(decision).toEqual({
      status: "blocked_missing_shadow_comparisons",
      decision: "HOLD - production sessions found but no shadow comparisons recorded",
    });
    expect(nextActionForStatus(decision.status)).toContain(
      "Trigger a tester flow that reaches an accepted second-opinion shadow comparison"
    );
  });

  it("marks the scheduler ready only when shadow comparisons are present", () => {
    const decision = decideStatus({
      warning: null,
      reportCount: 2,
      observationCount: 2,
      shadowComparisonCount: 1,
    });

    expect(decision).toEqual({
      status: "ready_for_formal_readout",
      decision: "RUN FORMAL VET-1492C RERUN",
    });
  });

  it("summarizes current baseline service metric fields from the production endpoint", () => {
    const readout = summarizePayload({
      ok: true,
      summary: { overallStatus: "insufficient_data" },
      baseline: {
        windowStart: "2026-05-26T02:00:00.000Z",
        sourceTable: "symptom_checks",
        sourceProjectRef: "gswjpmgxidofwmjngavh",
        queryLimit: 1000,
        rowVisibilityMode: "matched_created_at_window",
        latestWindowReportCreatedAt: "2026-05-27T01:55:00.000Z",
        latestParsedReportCreatedAt: "2026-05-27T01:55:00.000Z",
        latestAnyReportCreatedAt: "2026-05-27T01:55:00.000Z",
        reportCount: 2,
        parsedReportCount: 2,
        malformedReportCount: 0,
        observationCount: 2,
        shadowComparisonCount: 1,
        warning: null,
        secondOpinionTrace: {
          total: 2,
          eligibilityReasonCounts: { eligible: 1, feature_disabled: 1 },
          requestOutcomeCounts: { requested: 1, not_requested: 1 },
          acceptanceOutcomeCounts: { accepted: 1 },
          comparisonAppendOutcomeCounts: { comparison_appended: 1 },
          comparisonWriteOutcomeCounts: { comparison_write_succeeded: 1 },
          extractorReasonCounts: {},
          readoutCountedCount: 1,
        },
        serviceMetrics: [
          {
            service: "async-review-service",
            observationCount: 2,
            comparisonCount: 1,
            errorRate: 0.5,
            timeoutRate: 0,
          },
        ],
      },
    });

    expect(readout.serviceMetrics).toEqual([
      {
        service: "async-review-service",
        observations: 2,
        shadowComparisons: 1,
        errors: 1,
        timeouts: 0,
      },
    ]);
    expect(readout.windowStart).toBe("2026-05-26T02:00:00.000Z");
    expect(readout.sourceTable).toBe("symptom_checks");
    expect(readout.sourceProjectRef).toBe("gswjpmgxidofwmjngavh");
    expect(readout.queryLimit).toBe(1000);
    expect(readout.rowVisibilityMode).toBe("matched_created_at_window");
    expect(readout.latestWindowReportCreatedAt).toBe(
      "2026-05-27T01:55:00.000Z"
    );
    expect(readout.latestParsedReportCreatedAt).toBe(
      "2026-05-27T01:55:00.000Z"
    );
    expect(readout.latestAnyReportCreatedAt).toBe(
      "2026-05-27T01:55:00.000Z"
    );
    expect(readout.secondOpinionTrace).toEqual({
      total: 2,
      eligibilityReasonCounts: { eligible: 1, feature_disabled: 1 },
      requestOutcomeCounts: { requested: 1, not_requested: 1 },
      acceptanceOutcomeCounts: { accepted: 1 },
      comparisonAppendOutcomeCounts: { comparison_appended: 1 },
      comparisonWriteOutcomeCounts: { comparison_write_succeeded: 1 },
      extractorReasonCounts: {},
      readoutCountedCount: 1,
    });
  });
});
