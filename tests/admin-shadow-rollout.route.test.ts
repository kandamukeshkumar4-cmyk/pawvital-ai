const mockGetAdminRequestContext = jest.fn();
const mockBuildAdminShadowRolloutDashboardData = jest.fn();
const mockUpdateAdminShadowRolloutControl = jest.fn();

jest.mock("@/lib/admin-auth", () => ({
  getAdminRequestContext: (...args: unknown[]) =>
    mockGetAdminRequestContext(...args),
}));

jest.mock("@/lib/admin-shadow-rollout", () => ({
  buildAdminShadowRolloutDashboardData: (...args: unknown[]) =>
    mockBuildAdminShadowRolloutDashboardData(...args),
  updateAdminShadowRolloutControl: (...args: unknown[]) =>
    mockUpdateAdminShadowRolloutControl(...args),
}));

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/shadow-rollout", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

describe("admin shadow rollout route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
  });

  it("returns dashboard data for admins", async () => {
    mockBuildAdminShadowRolloutDashboardData.mockResolvedValue({
      generatedAt: "2026-04-14T12:00:00.000Z",
      services: [],
      shadow: {
        baseline: {
          generatedAt: "2026-04-14T12:00:00.000Z",
          malformedReportCount: 0,
          observationCount: 24,
          parsedReportCount: 12,
          reportCount: 12,
          shadowComparisonCount: 8,
          warning: null,
          windowHours: 24,
        },
        blockers: [],
        gateConfig: {
          loadTestRequired: true,
          maxLoadTestErrorRate: 0.05,
          maxLoadTestP99LatencyMs: 3500,
          minTargetRpsMultiplier: 2,
          requiredHealthyRatio: 0.95,
          requiredHealthySamples: 12,
          sampleIntervalMinutes: 5,
          windowHours: 24,
        },
        overallStatus: "ready",
        shadowModeDataPresent: true,
      },
      summary: {
        healthyServiceCount: 3,
        promotedLiveCount: 1,
        readyToPromoteCount: 2,
        totalLiveSplitPct: 5,
        totalServices: 5,
      },
      readiness: {
        configuredCount: 5,
        generatedAt: "2026-04-14T12:00:00.000Z",
        healthyCount: 3,
        misconfiguredCount: 0,
        stubCount: 0,
        unconfiguredCount: 0,
        unhealthyCount: 1,
        unreachableCount: 1,
        validCount: 5,
      },
      writeMode: "preview",
      writeReason: "Preview only",
    });

    const { GET } = await import("@/app/api/admin/shadow-rollout/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary.promotedLiveCount).toBe(1);
  });

  it("rejects unauthorized admins", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/admin/shadow-rollout/route");
    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("forwards live split patch requests", async () => {
    mockUpdateAdminShadowRolloutControl.mockResolvedValue({
      control: {
        currentLiveSplitPct: 10,
        liveSplitEnv: "SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL",
        rollout: {
          blockedReason: null,
          canDecrease: true,
          canIncrease: true,
          canKillSwitch: true,
          promotedLive: true,
        },
        service: "text-retrieval-service",
        serviceLabel: "Text Retrieval",
      },
      deployment: null,
      liveSplitPct: 10,
      message: "Preview change.",
      mode: "preview",
      ok: true,
    });

    const { PATCH } = await import("@/app/api/admin/shadow-rollout/route");
    const response = await PATCH(
      makePatchRequest({
        liveSplitPct: 10,
        service: "text-retrieval-service",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.liveSplitPct).toBe(10);
    expect(mockUpdateAdminShadowRolloutControl).toHaveBeenCalledWith({
      liveSplitPct: 10,
      service: "text-retrieval-service",
    });
  });

  it("validates required patch params", async () => {
    const { PATCH } = await import("@/app/api/admin/shadow-rollout/route");
    const response = await PATCH(makePatchRequest({ service: "text-retrieval-service" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("service and liveSplitPct are required");
  });
});
