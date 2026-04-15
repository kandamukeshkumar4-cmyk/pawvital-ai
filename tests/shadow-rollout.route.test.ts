const mockBuildShadowRolloutSummary = jest.fn();
const mockBuildInternalShadowTelemetrySnapshot = jest.fn();
const mockBuildObservabilitySnapshot = jest.fn();
const mockBuildPersistedShadowBaselineSnapshot = jest.fn();
const mockAppendShadowTelemetrySnapshot = jest.fn();
const mockPersistShadowLoadTestSummary = jest.fn();

jest.mock("@/lib/shadow-rollout", () => ({
  buildShadowRolloutSummary: (...args: unknown[]) =>
    mockBuildShadowRolloutSummary(...args),
}));

jest.mock("@/lib/sidecar-observability", () => ({
  buildInternalShadowTelemetrySnapshot: (...args: unknown[]) =>
    mockBuildInternalShadowTelemetrySnapshot(...args),
  buildObservabilitySnapshot: (...args: unknown[]) =>
    mockBuildObservabilitySnapshot(...args),
}));

jest.mock("@/lib/shadow-rollout-baseline", () => ({
  buildPersistedShadowBaselineSnapshot: (...args: unknown[]) =>
    mockBuildPersistedShadowBaselineSnapshot(...args),
}));

jest.mock("@/lib/shadow-telemetry-store", () => ({
  appendShadowTelemetrySnapshot: (...args: unknown[]) =>
    mockAppendShadowTelemetrySnapshot(...args),
  persistShadowLoadTestSummary: (...args: unknown[]) =>
    mockPersistShadowLoadTestSummary(...args),
}));
function makeRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>
) {
  return new Request("http://localhost/api/ai/shadow-rollout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

describe("shadow-rollout route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "shadow-secret",
    };
    mockAppendShadowTelemetrySnapshot.mockResolvedValue(true);
    mockPersistShadowLoadTestSummary.mockResolvedValue(true);

    mockBuildShadowRolloutSummary.mockReturnValue({
      overallStatus: "watch",
      shadowModeDataPresent: true,
      services: [
        {
          service: "text-retrieval-service",
          sampleMode: "shadow",
          totalObservations: 3,
          shadowObservations: 3,
          successfulObservations: 3,
          timeoutObservations: 0,
          errorObservations: 0,
          fallbackObservations: 0,
          averageLatencyMs: 1200,
          maxLatencyMs: 1500,
          shadowComparisonCount: 2,
          disagreementCount: 1,
          status: "ready",
          blockers: [],
        },
      ],
      blockers: [],
    });

    mockBuildObservabilitySnapshot.mockReturnValue({
      shadowModeActive: true,
      recentServiceCalls: [{ service: "text-retrieval-service" }],
      recentShadowComparisons: [{ service: "text-retrieval-service" }],
      timeoutCount: 0,
      serviceCallCounts: { "text-retrieval-service": 3 },
      fallbackCount: 0,
    });
    mockBuildInternalShadowTelemetrySnapshot.mockReturnValue({
      generatedAt: "2026-04-15T00:00:00.000Z",
      recentServiceCalls: [
        { service: "text-retrieval-service" },
        { service: "async-review-service" },
      ],
      recentShadowComparisons: [
        { service: "text-retrieval-service" },
        { service: "async-review-service" },
      ],
    });

    mockBuildPersistedShadowBaselineSnapshot.mockResolvedValue({
      generatedAt: "2026-04-14T00:00:00.000Z",
      windowHours: 24,
      reportCount: 12,
      parsedReportCount: 10,
      malformedReportCount: 2,
      observationCount: 18,
      shadowComparisonCount: 5,
      loadTest: null,
      summary: {
        overallStatus: "watch",
        shadowModeDataPresent: true,
        services: [
          {
            service: "text-retrieval-service",
            sampleMode: "shadow",
            totalObservations: 18,
            shadowObservations: 18,
            successfulObservations: 18,
            timeoutObservations: 0,
            errorObservations: 0,
            fallbackObservations: 0,
            averageLatencyMs: 1200,
            maxLatencyMs: 1500,
            shadowComparisonCount: 5,
            disagreementCount: 1,
            status: "watch",
            blockers: [],
            window: {
              windowHours: 24,
              sampleIntervalMinutes: 5,
              requiredHealthySamples: 288,
              requiredHealthyRatio: 0.95,
              observedWindowSamples: 18,
              observedHealthySamples: 18,
              healthySampleRatio: 1,
            },
            loadTestStatus: "missing",
          },
        ],
        blockers: [],
        gateConfig: {
          windowHours: 24,
          sampleIntervalMinutes: 5,
          requiredHealthyRatio: 0.95,
          requiredHealthySamples: 288,
          loadTestRequired: true,
          minTargetRpsMultiplier: 2,
          maxLoadTestErrorRate: 0.05,
          maxLoadTestP99LatencyMs: 2500,
        },
        loadTest: null,
      },
      serviceMetrics: [
        {
          service: "text-retrieval-service",
          observationCount: 18,
          shadowObservationCount: 18,
          successfulObservationCount: 18,
          comparisonCount: 5,
          disagreementComparisonCount: 1,
          timeoutRate: 0,
          errorRate: 0,
          fallbackRate: 0,
          disagreementRate: 0.2,
          p95LatencyMs: 1400,
        },
      ],
      warning: null,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("rejects unauthorized requests when a debug secret is configured", async () => {
    const { POST } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await POST(makeRequest({ session: {} }));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toContain("Unauthorized");
  });

  it("returns rollout summaries for authorized debug requests", async () => {
    const session = { extracted_answers: { cough_type: "dry_honking" } };

    const { POST } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await POST(
      makeRequest(
        { session },
        { Authorization: "Bearer shadow-secret" }
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockBuildShadowRolloutSummary).toHaveBeenCalledWith(session, {
      loadTest: null,
    });
    expect(mockBuildObservabilitySnapshot).toHaveBeenCalledWith(session);
    expect(mockBuildInternalShadowTelemetrySnapshot).toHaveBeenCalledWith(
      session
    );
    expect(mockAppendShadowTelemetrySnapshot).toHaveBeenCalledWith({
      generatedAt: "2026-04-15T00:00:00.000Z",
      recentServiceCalls: [
        { service: "text-retrieval-service" },
        { service: "async-review-service" },
      ],
      recentShadowComparisons: [
        { service: "text-retrieval-service" },
        { service: "async-review-service" },
      ],
    });
    expect(payload.summary.overallStatus).toBe("watch");
    expect(payload.persistedTelemetry).toBe(true);
    expect(payload.observability).toEqual({
      shadowModeActive: true,
      timeoutCount: 0,
      fallbackCount: 0,
      serviceCallCounts: { "text-retrieval-service": 3 },
      recentServiceCallCount: 1,
      recentShadowComparisonCount: 1,
    });
  });

  it("accepts normalized tokens when the configured secret has an escaped newline suffix", async () => {
    process.env = {
      ...originalEnv,
      HF_SIDECAR_API_KEY: "shadow-secret\\r\\n",
    };

    const { GET } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await GET(
      new Request("http://localhost/api/ai/shadow-rollout", {
        headers: { Authorization: "Bearer shadow-secret" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockBuildPersistedShadowBaselineSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rejects requests without a session body", async () => {
    const { POST } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await POST(
      makeRequest({}, { "x-shadow-rollout-secret": "shadow-secret" })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("session or loadTest");
  });

  it("persists load test summaries without requiring a session body", async () => {
    const loadTest = {
      targetRoute: "/api/ai/shadow-rollout",
      baselineRps: 2,
      targetRps: 4,
      durationSeconds: 60,
      totalRequests: 240,
      successCount: 240,
      failureCount: 0,
      errorRate: 0,
      p50LatencyMs: 10,
      p95LatencyMs: 20,
      p99LatencyMs: 30,
      passed: true,
      blockers: [],
    };

    const { POST } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await POST(
      makeRequest({ loadTest }, { Authorization: "Bearer shadow-secret" })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.persistedLoadTest).toBe(true);
    expect(mockPersistShadowLoadTestSummary).toHaveBeenCalledWith(loadTest);
  });

  it("returns the persisted baseline summary for authorized GET requests", async () => {
    const { GET } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await GET(
      new Request("http://localhost/api/ai/shadow-rollout", {
        headers: { Authorization: "Bearer shadow-secret" },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(mockBuildPersistedShadowBaselineSnapshot).toHaveBeenCalledTimes(1);
    expect(payload.baseline).toEqual(
      expect.objectContaining({
        windowHours: 24,
        reportCount: 12,
        observationCount: 18,
        loadTest: null,
      })
    );
  });
});
