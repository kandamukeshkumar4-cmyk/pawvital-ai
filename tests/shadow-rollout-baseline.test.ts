const mockGetServiceSupabase = jest.fn();
const mockListShadowTelemetrySnapshots = jest.fn();
const mockIsShadowTelemetryStoreConfigured = jest.fn();
const mockReadShadowLoadTestSummary = jest.fn();
const mockShouldPreferShadowTelemetryFileStore = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

jest.mock("@/lib/shadow-telemetry-store", () => ({
  listShadowTelemetrySnapshots: (...args: unknown[]) =>
    mockListShadowTelemetrySnapshots(...args),
  isShadowTelemetryStoreConfigured: (...args: unknown[]) =>
    mockIsShadowTelemetryStoreConfigured(...args),
  readShadowLoadTestSummary: (...args: unknown[]) =>
    mockReadShadowLoadTestSummary(...args),
  shouldPreferShadowTelemetryFileStore: (...args: unknown[]) =>
    mockShouldPreferShadowTelemetryFileStore(...args),
}));

describe("shadow rollout baseline persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadShadowLoadTestSummary.mockResolvedValue(null);
    mockShouldPreferShadowTelemetryFileStore.mockReturnValue(false);
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(false);
  });

  it("treats zero persisted symptom checks as a healthy empty readout", async () => {
    const limit = jest.fn().mockResolvedValue({ data: [], error: null });
    const order = jest.fn(() => ({ limit }));
    const gte = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ gte }));
    const from = jest.fn(() => ({ select }));
    mockGetServiceSupabase.mockReturnValue({ from });

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.reportCount).toBe(0);
    expect(snapshot.parsedReportCount).toBe(0);
    expect(snapshot.malformedReportCount).toBe(0);
    expect(snapshot.observationCount).toBe(0);
    expect(snapshot.shadowComparisonCount).toBe(0);
    expect(snapshot.warning).toBeNull();
    expect(from).toHaveBeenCalledWith("symptom_checks");
    expect(mockListShadowTelemetrySnapshots).not.toHaveBeenCalled();
  });

  it("builds the readout from sanitized aggregate system observability in symptom checks", async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: "check-1",
          ai_response: JSON.stringify({
            system_observability: {
              timeoutCount: 2,
              fallbackCount: 1,
              shadowReadout: {
                reportPresent: true,
                sessionPresent: true,
                observationCount: 4,
                shadowComparisonCount: 2,
                timeoutCount: 2,
                fallbackCount: 1,
                providerErrorCount: 1,
                budgetExceededCount: 1,
              },
            },
          }),
        },
      ],
      error: null,
    });
    const order = jest.fn(() => ({ limit }));
    const gte = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ gte }));
    const from = jest.fn(() => ({ select }));
    mockGetServiceSupabase.mockReturnValue({ from });

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.reportCount).toBe(1);
    expect(snapshot.parsedReportCount).toBe(1);
    expect(snapshot.malformedReportCount).toBe(0);
    expect(snapshot.reportPresenceCount).toBe(1);
    expect(snapshot.sessionPresenceCount).toBe(1);
    expect(snapshot.observationCount).toBe(4);
    expect(snapshot.shadowComparisonCount).toBe(2);
    expect(snapshot.timeoutCount).toBe(2);
    expect(snapshot.fallbackCount).toBe(1);
    expect(snapshot.providerErrorCount).toBe(1);
    expect(snapshot.budgetExceededCount).toBe(1);
    expect(snapshot.warning).toBeNull();
    expect(snapshot.serviceMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: "async-review-service",
          observationCount: 0,
          comparisonCount: 0,
        }),
      ])
    );
    expect(mockListShadowTelemetrySnapshots).not.toHaveBeenCalled();
  });

  it("ignores non-numeric persisted aggregate counts in symptom checks", async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: "check-1",
          ai_response: JSON.stringify({
            system_observability: {
              shadowReadout: {
                reportPresent: true,
                sessionPresent: true,
                observationCount: "4",
                shadowComparisonCount: "2.7",
                timeoutCount: "1",
                fallbackCount: "0",
                providerErrorCount: "not-a-number",
                budgetExceededCount: true,
              },
            },
          }),
        },
        {
          id: "check-2",
          ai_response: JSON.stringify({
            system_observability: {
              timeoutCount: 7,
              fallbackCount: 8,
              shadowReadout: {
                reportPresent: "true",
                sessionPresent: 1,
                observationCount: true,
                shadowComparisonCount: ["3"],
                timeoutCount: {},
                fallbackCount: "",
                providerErrorCount: null,
                budgetExceededCount: -1,
              },
            },
          }),
        },
      ],
      error: null,
    });
    const order = jest.fn(() => ({ limit }));
    const gte = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ gte }));
    const from = jest.fn(() => ({ select }));
    mockGetServiceSupabase.mockReturnValue({ from });

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.reportCount).toBe(2);
    expect(snapshot.parsedReportCount).toBe(2);
    expect(snapshot.reportPresenceCount).toBe(1);
    expect(snapshot.sessionPresenceCount).toBe(1);
    expect(snapshot.observationCount).toBe(4);
    expect(snapshot.shadowComparisonCount).toBe(2);
    expect(snapshot.timeoutCount).toBe(1);
    expect(snapshot.fallbackCount).toBe(0);
    expect(snapshot.providerErrorCount).toBe(0);
    expect(snapshot.budgetExceededCount).toBe(0);
    expect(snapshot.warning).toBeNull();
  });

  it("falls back to Redis telemetry when Supabase is unavailable", async () => {
    mockGetServiceSupabase.mockReturnValue(null);
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockListShadowTelemetrySnapshots.mockResolvedValue([
      {
        generatedAt: new Date().toISOString(),
        recentServiceCalls: [
          {
            service: "text-retrieval-service",
            stage: "report-retrieval",
            latencyMs: 120,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: false,
            recordedAt: new Date().toISOString(),
          },
        ],
        recentShadowComparisons: [
          {
            service: "text-retrieval-service",
            usedStrategy: "nvidia-primary",
            shadowStrategy: "hf-sidecar",
            summary: "Aligned",
            disagreementCount: 0,
            recordedAt: new Date().toISOString(),
          },
        ],
      },
    ]);

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.reportCount).toBe(1);
    expect(snapshot.parsedReportCount).toBe(1);
    expect(snapshot.observationCount).toBe(1);
    expect(snapshot.shadowComparisonCount).toBe(1);
    expect(snapshot.warning).toContain("Upstash");
    expect(snapshot.loadTest).toBeNull();
  });

  it("uses the local file-backed store immediately when file fallback is preferred", async () => {
    const supabase = {
      from: jest.fn(),
    };
    mockGetServiceSupabase.mockReturnValue(supabase);
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockShouldPreferShadowTelemetryFileStore.mockReturnValue(true);
    mockListShadowTelemetrySnapshots.mockResolvedValue([
      {
        generatedAt: new Date().toISOString(),
        recentServiceCalls: [
          {
            service: "async-review-service",
            stage: "report-review",
            latencyMs: 1200,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: false,
            recordedAt: new Date().toISOString(),
          },
        ],
        recentShadowComparisons: [],
      },
    ]);

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.observationCount).toBe(1);
    expect(snapshot.warning).toContain("local shadow telemetry file store");
    expect(mockListShadowTelemetrySnapshots).toHaveBeenCalledWith(100);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("uses Redis telemetry when Supabase reads fail", async () => {
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockListShadowTelemetrySnapshots.mockResolvedValue([
      {
        generatedAt: new Date().toISOString(),
        recentServiceCalls: [],
        recentShadowComparisons: [],
      },
    ]);
    mockGetServiceSupabase.mockReturnValue({
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => ({
                data: null,
                error: { message: "lookup failed" },
              }),
            }),
          }),
        }),
      }),
    });

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.warning).toContain("lookup failed");
    expect(mockListShadowTelemetrySnapshots).toHaveBeenCalledWith(100);
  });

  it("uses Redis telemetry when the Supabase client throws", async () => {
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockListShadowTelemetrySnapshots.mockResolvedValue([
      {
        generatedAt: new Date().toISOString(),
        recentServiceCalls: [],
        recentShadowComparisons: [],
      },
    ]);
    mockGetServiceSupabase.mockReturnValue({
      from: () => ({
        select: () => ({
          gte: () => ({
            order: () => ({
              limit: async () => {
                throw new Error("fetch failed");
              },
            }),
          }),
        }),
      }),
    });

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.warning).toContain("fetch failed");
    expect(mockListShadowTelemetrySnapshots).toHaveBeenCalledWith(100);
  });

  it("returns an empty snapshot when the Redis fallback read throws", async () => {
    mockGetServiceSupabase.mockReturnValue(null);
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockListShadowTelemetrySnapshots.mockRejectedValue(
      new Error("getaddrinfo ENOTFOUND national-quagga-38433.upstash.io")
    );

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot({
      windowHours: 24,
      limit: 100,
    });

    expect(snapshot.reportCount).toBe(0);
    expect(snapshot.parsedReportCount).toBe(0);
    expect(snapshot.warning).toContain(
      "Upstash shadow telemetry fallback failed"
    );
    expect(snapshot.loadTest).toBeNull();
  });

  it("merges a persisted load test summary into the rollout status", async () => {
    mockGetServiceSupabase.mockReturnValue(null);
    mockIsShadowTelemetryStoreConfigured.mockReturnValue(true);
    mockReadShadowLoadTestSummary.mockResolvedValue({
      targetRoute: "/api/ai/shadow-rollout",
      baselineRps: 2,
      targetRps: 4,
      durationSeconds: 60,
      totalRequests: 240,
      successCount: 240,
      failureCount: 0,
      errorRate: 0,
      p50LatencyMs: 20,
      p95LatencyMs: 40,
      p99LatencyMs: 60,
      passed: true,
      blockers: [],
    });
    mockListShadowTelemetrySnapshots.mockResolvedValue([
      {
        generatedAt: new Date().toISOString(),
        recentServiceCalls: [
          {
            service: "async-review-service",
            stage: "report-review",
            latencyMs: 1200,
            outcome: "success",
            shadowMode: false,
            fallbackUsed: false,
            recordedAt: new Date().toISOString(),
          },
        ],
        recentShadowComparisons: [],
      },
    ]);

    const { buildPersistedShadowBaselineSnapshot } = await import(
      "@/lib/shadow-rollout-baseline"
    );
    const snapshot = await buildPersistedShadowBaselineSnapshot();

    expect(snapshot.loadTest?.passed).toBe(true);
    expect(snapshot.summary.loadTest?.passed).toBe(true);
    expect(snapshot.summary.services[0]?.loadTestStatus).not.toBe("missing");
  });
});
