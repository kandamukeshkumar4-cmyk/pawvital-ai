const mockGetServiceSupabase = jest.fn();
const mockListShadowTelemetrySnapshots = jest.fn();
const mockIsShadowTelemetryStoreConfigured = jest.fn();

jest.mock("@/lib/supabase-admin", () => ({
  getServiceSupabase: (...args: unknown[]) => mockGetServiceSupabase(...args),
}));

jest.mock("@/lib/shadow-telemetry-store", () => ({
  listShadowTelemetrySnapshots: (...args: unknown[]) =>
    mockListShadowTelemetrySnapshots(...args),
  isShadowTelemetryStoreConfigured: (...args: unknown[]) =>
    mockIsShadowTelemetryStoreConfigured(...args),
}));

describe("shadow rollout baseline persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
