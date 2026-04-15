import {
  buildServiceShadowRolloutControl,
  evaluateLiveSplitChange,
  type LiveSplitPct,
} from "@/lib/admin-shadow-rollout";

describe("admin shadow rollout helpers", () => {
  function buildControl(overrides?: {
    currentLiveSplitPct?: LiveSplitPct;
    healthStatus?: "healthy" | "unhealthy";
    shadowStatus?: "ready" | "watch" | "blocked" | "insufficient_data";
  }) {
    return buildServiceShadowRolloutControl({
      config: {
        configured: true,
        env: "HF_TEXT_RETRIEVAL_URL",
        expectedPath: "/search",
        service: "text-retrieval-service",
        url: "https://example.com/search",
        valid: true,
        warning: null,
      },
      currentLiveSplitPct: overrides?.currentLiveSplitPct ?? 5,
      health: {
        detail: null,
        mode: "real",
        model: "bge-m3",
        service: "text-retrieval-service",
        status: overrides?.healthStatus ?? "healthy",
        statusCode: 200,
      },
      shadow: {
        averageLatencyMs: 420,
        blockers:
          overrides?.shadowStatus && overrides.shadowStatus !== "ready"
            ? ["Shadow gate is not ready."]
            : [],
        errorObservations: 0,
        fallbackObservations: 0,
        loadTestStatus: "passed",
        maxLatencyMs: 450,
        metrics: {
          comparisonCount: 14,
          disagreementComparisonCount: 0,
          disagreementRate: 0,
          errorRate: 0,
          fallbackRate: 0,
          observationCount: 24,
          p95LatencyMs: 420,
          service: "text-retrieval-service",
          shadowObservationCount: 24,
          successfulObservationCount: 24,
          timeoutRate: 0,
        },
        sampleMode: "shadow",
        service: "text-retrieval-service",
        shadowComparisonCount: 14,
        shadowObservations: 24,
        status: overrides?.shadowStatus ?? "ready",
        successfulObservations: 24,
        timeoutObservations: 0,
        totalObservations: 24,
        window: {
          healthySampleRatio: 1,
          observedHealthySamples: 24,
          observedWindowSamples: 24,
          requiredHealthyRatio: 0.95,
          requiredHealthySamples: 12,
          sampleIntervalMinutes: 5,
          windowHours: 24,
        },
      },
    });
  }

  it("allows live split increases for healthy ready services", () => {
    const control = buildControl();
    const evaluation = evaluateLiveSplitChange(control, 10);

    expect(control.rollout.canIncrease).toBe(true);
    expect(evaluation.allowed).toBe(true);
    expect(evaluation.mode).toBe("increase");
  });

  it("blocks live split increases when the shadow gate is not ready", () => {
    const control = buildControl({ shadowStatus: "watch" });
    const evaluation = evaluateLiveSplitChange(control, 10);

    expect(control.rollout.canIncrease).toBe(false);
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reason).toContain("Shadow rollout gate is watch");
  });

  it("always allows exposure reduction and kill switch actions", () => {
    const control = buildControl({
      currentLiveSplitPct: 15,
      healthStatus: "unhealthy",
      shadowStatus: "blocked",
    });

    expect(evaluateLiveSplitChange(control, 5)).toEqual(
      expect.objectContaining({
        allowed: true,
        mode: "decrease",
      })
    );
    expect(evaluateLiveSplitChange(control, 0)).toEqual(
      expect.objectContaining({
        allowed: true,
        mode: "kill_switch",
      })
    );
  });
});
