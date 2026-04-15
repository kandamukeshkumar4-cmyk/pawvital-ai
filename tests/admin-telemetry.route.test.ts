const mockGetAdminRequestContext = jest.fn();
const mockLoadAdminTelemetryDashboardData = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/admin-telemetry", () => ({
  loadAdminTelemetryDashboardData: (...args: unknown[]) =>
    mockLoadAdminTelemetryDashboardData(...args),
}));

describe("admin telemetry route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("Unauthorized");
  });

  it("returns telemetry for authorized admins", async () => {
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockLoadAdminTelemetryDashboardData.mockResolvedValue({
      distributions: {
        feedback30d: { no: 1, partly: 0, yes: 2 },
        notificationTypes7d: {
          outcome_reminder: 0,
          report_ready: 2,
          subscription: 0,
          system: 0,
          urgency_alert: 1,
        },
        proposalStatus30d: {
          approved: 1,
          draft: 1,
          rejected: 0,
          superseded: 0,
        },
        severity30d: {
          emergency: 1,
          high: 1,
          low: 2,
          medium: 0,
        },
      },
      generatedAt: "2026-04-14T12:00:00.000Z",
      isDemo: false,
      notes: ["Only persisted application data is shown here."],
      ratios: {
        feedbackCoverage30d: 0.25,
        mismatchRate30d: 0.5,
        proposalApprovalRate30d: 0.5,
        shareRate30d: 0.1,
      },
      series7d: [],
      sources: ["symptom_checks"],
      totals: {
        activeSharedReports: 1,
        approvedProposals30d: 1,
        feedbackMismatch30d: 1,
        notifications7d: 3,
        outcomeFeedback30d: 2,
        sharedReports30d: 1,
        symptomChecks24h: 2,
        symptomChecks30d: 8,
        symptomChecks7d: 4,
        thresholdProposals30d: 2,
        unreadNotifications: 1,
      },
    });

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockLoadAdminTelemetryDashboardData).toHaveBeenCalledWith({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    expect(payload.totals.symptomChecks30d).toBe(8);
  });

  it("returns 500 when telemetry loading throws", async () => {
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockLoadAdminTelemetryDashboardData.mockRejectedValue(
      new Error("boom")
    );

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain("Internal Server Error");
  });
});
