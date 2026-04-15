import {
  buildAdminTelemetryDashboardData,
  buildDemoAdminTelemetryDashboardData,
  type AdminTelemetryAggregateInput,
} from "@/lib/admin-telemetry";

function buildInput(
  overrides: Partial<AdminTelemetryAggregateInput> = {}
): AdminTelemetryAggregateInput {
  return {
    distributions: {
      feedback30d: { no: 4, partly: 3, yes: 13 },
      notificationTypes7d: {
        outcome_reminder: 2,
        report_ready: 8,
        subscription: 1,
        system: 0,
        urgency_alert: 3,
      },
      proposalStatus30d: {
        approved: 2,
        draft: 3,
        rejected: 1,
        superseded: 0,
      },
      severity30d: {
        emergency: 4,
        high: 12,
        low: 20,
        medium: 9,
      },
    },
    generatedAt: "2026-04-14T12:00:00.000Z",
    isDemo: false,
    series7d: [
      {
        date: "2026-04-08T00:00:00.000Z",
        label: "Apr 8",
        notifications: 1,
        outcomeFeedback: 0,
        shareLinks: 0,
        symptomChecks: 4,
      },
    ],
    totals: {
      activeSharedReports: 2,
      approvedProposals30d: 2,
      feedbackMismatch30d: 4,
      notifications7d: 14,
      outcomeFeedback30d: 20,
      sharedReports30d: 5,
      symptomChecks24h: 7,
      symptomChecks30d: 45,
      symptomChecks7d: 18,
      thresholdProposals30d: 6,
      unreadNotifications: 3,
    },
    ...overrides,
  };
}

describe("admin telemetry helpers", () => {
  it("derives ratio summaries from persisted counts", () => {
    const payload = buildAdminTelemetryDashboardData(buildInput());

    expect(payload.ratios.feedbackCoverage30d).toBeCloseTo(20 / 45, 3);
    expect(payload.ratios.mismatchRate30d).toBeCloseTo(4 / 20, 3);
    expect(payload.ratios.proposalApprovalRate30d).toBeCloseTo(2 / 6, 3);
    expect(payload.ratios.shareRate30d).toBeCloseTo(5 / 45, 3);
    expect(payload.sources).toEqual(
      expect.arrayContaining(["symptom_checks", "notifications"])
    );
  });

  it("adds honest notes when feedback and proposal loops are empty", () => {
    const baseInput = buildInput();
    const payload = buildAdminTelemetryDashboardData(
      buildInput({
        totals: {
          ...baseInput.totals,
          activeSharedReports: 0,
          outcomeFeedback30d: 0,
          symptomChecks30d: 12,
          thresholdProposals30d: 0,
        },
      })
    );

    expect(payload.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Outcome feedback has not entered the quality loop"),
      ])
    );
    expect(payload.notes).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("share link(s) are currently live"),
      ])
    );
  });

  it("builds a clearly flagged demo payload", () => {
    const payload = buildDemoAdminTelemetryDashboardData(
      "2026-04-14T12:00:00.000Z"
    );

    expect(payload.isDemo).toBe(true);
    expect(payload.series7d).toHaveLength(7);
    expect(payload.totals.symptomChecks30d).toBeGreaterThan(0);
  });
});
