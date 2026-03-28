const mockBuildShadowRolloutSummary = jest.fn();
const mockBuildObservabilitySnapshot = jest.fn();

jest.mock("@/lib/shadow-rollout", () => ({
  buildShadowRolloutSummary: (...args: unknown[]) =>
    mockBuildShadowRolloutSummary(...args),
}));

jest.mock("@/lib/sidecar-observability", () => ({
  buildObservabilitySnapshot: (...args: unknown[]) =>
    mockBuildObservabilitySnapshot(...args),
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
    expect(mockBuildShadowRolloutSummary).toHaveBeenCalledWith(session);
    expect(mockBuildObservabilitySnapshot).toHaveBeenCalledWith(session);
    expect(payload.summary.overallStatus).toBe("watch");
    expect(payload.observability).toEqual({
      shadowModeActive: true,
      timeoutCount: 0,
      fallbackCount: 0,
      serviceCallCounts: { "text-retrieval-service": 3 },
      recentServiceCallCount: 1,
      recentShadowComparisonCount: 1,
    });
  });

  it("rejects requests without a session body", async () => {
    const { POST } = await import("@/app/api/ai/shadow-rollout/route");
    const response = await POST(
      makeRequest({}, { "x-shadow-rollout-secret": "shadow-secret" })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("session");
  });
});
