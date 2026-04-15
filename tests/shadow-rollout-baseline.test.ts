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
