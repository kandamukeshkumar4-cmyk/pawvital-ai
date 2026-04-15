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

function buildTelemetryPayload() {
  return {
    dataMode: "live" as const,
    generatedAt: "2026-04-15T12:00:00.000Z",
    historyWindowDays: 7,
    notes: ["Read-only aggregates only."],
    pipeline: {
      extractionSuccess: {
        availability: "available" as const,
        denominator24h: 4,
        denominator7d: 9,
        note: "Counts only persisted extraction telemetry.",
        numerator24h: 3,
        numerator7d: 8,
        rate24h: 0.75,
        rate7d: 0.889,
      },
      pendingQuestionRescue: {
        availability: "available" as const,
        denominator24h: 2,
        denominator7d: 6,
        note: "Rescue succeeds when pending_after=false.",
        numerator24h: 1,
        numerator7d: 4,
        rate24h: 0.5,
        rate7d: 0.667,
      },
      repeatQuestionAttempt: {
        availability: "available" as const,
        denominator24h: 4,
        denominator7d: 9,
        note: "Suppressed repeats per extraction turn.",
        numerator24h: 1,
        numerator7d: 2,
        rate24h: 0.25,
        rate7d: 0.222,
      },
    },
    sidecars: [
      {
        errorRate24h: 0.1,
        lastSeenAt: "2026-04-15T11:59:00.000Z",
        observationCount24h: 10,
        p95LatencyMs: 420,
        service: "text-retrieval-service" as const,
        shadowComparisonCount24h: 4,
        shadowDisagreementCount24h: 1,
        shadowDisagreementRate24h: 0.25,
        timeoutRate24h: 0.2,
      },
    ],
    sources: ["Persisted symptom-check reports"],
    symptomCheckCount7d: 12,
  };
}

describe("admin telemetry route", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAdminRequestContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toContain("Unauthorized");
  });

  it("returns the production telemetry contract for admins", async () => {
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockLoadAdminTelemetryDashboardData.mockResolvedValue(buildTelemetryPayload());

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.pipeline.extractionSuccess.rate24h).toBe(0.75);
    expect(payload.sidecars[0].service).toBe("text-retrieval-service");
    expect(payload.recentServiceCalls).toBeUndefined();
    expect(payload.recentShadowComparisons).toBeUndefined();
    expect(serialized).not.toContain("question_state=");
  });

  it("returns 500 when telemetry loading throws", async () => {
    mockGetAdminRequestContext.mockResolvedValue({
      email: "admin@pawvital.ai",
      isDemo: false,
      userId: "admin-1",
    });
    mockLoadAdminTelemetryDashboardData.mockRejectedValue(new Error("boom"));

    const { GET } = await import("@/app/api/admin/telemetry/route");
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toContain("Internal Server Error");
  });
});
