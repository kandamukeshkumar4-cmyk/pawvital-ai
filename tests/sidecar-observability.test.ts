import type { TriageSession } from "@/lib/triage-engine";

function makeSession(partial?: Partial<TriageSession>): TriageSession {
  return {
    known_symptoms: [],
    answered_questions: [],
    extracted_answers: {},
    red_flags_triggered: [],
    candidate_diseases: [],
    body_systems_involved: [],
    case_memory: {
      turn_count: 0,
      chief_complaints: [],
      active_focus_symptoms: [],
      confirmed_facts: {},
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: [],
      clarification_reasons: {},
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: [],
      service_timeouts: [],
      service_observations: [],
      shadow_comparisons: [],
      ambiguity_flags: [],
    },
    ...partial,
  };
}

describe("sidecar observability", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it("builds observability snapshots from structured timeout and shadow memory", async () => {
    process.env = {
      ...originalEnv,
      HF_SHADOW_TEXT_RETRIEVAL: "1",
    };

    const now = new Date().toISOString();
    const {
      buildObservabilitySnapshot,
    } = await import("@/lib/sidecar-observability");

    const snapshot = buildObservabilitySnapshot(
      makeSession({
        case_memory: {
          turn_count: 1,
          chief_complaints: [],
          active_focus_symptoms: [],
          confirmed_facts: {},
          image_findings: [],
          red_flag_notes: [],
          unresolved_question_ids: [],
          clarification_reasons: {},
          timeline_notes: [],
          visual_evidence: [],
          retrieval_evidence: [],
          consult_opinions: [],
          evidence_chain: [],
          service_timeouts: [
            {
              service: "text-retrieval-service",
              stage: "report-retrieval",
              reason: "timeout",
            },
            {
              service: "vision-preprocess-service",
              stage: "preprocess",
              reason: "timeout",
            },
          ],
          service_observations: [
            {
              service: "text-retrieval-service",
              stage: "report-retrieval",
              latencyMs: 140,
              outcome: "shadow",
              shadowMode: true,
              fallbackUsed: true,
              recordedAt: now,
            },
            {
              service: "image-retrieval-service",
              stage: "report-retrieval",
              latencyMs: 90,
              outcome: "success",
              shadowMode: false,
              fallbackUsed: false,
              recordedAt: now,
            },
            {
              service: "image-retrieval-service",
              stage: "report-retrieval",
              latencyMs: 95,
              outcome: "fallback",
              shadowMode: false,
              fallbackUsed: true,
              recordedAt: now,
            },
          ],
          shadow_comparisons: [
            {
              service: "text-retrieval-service",
              usedStrategy: "fallback-retrieval",
              shadowStrategy: "hf-text-retrieval",
              summary: "Fallback text=2; shadow text=3",
              disagreementCount: 1,
              recordedAt: now,
            },
          ],
          ambiguity_flags: [],
        },
      })
    );

    expect(snapshot.shadowModeActive).toBe(true);
    expect(snapshot.timeoutCount).toBe(2);
    expect(snapshot.recentShadowComparisons).toHaveLength(1);
    expect(snapshot.serviceCallCounts).toEqual({
      "text-retrieval-service": 1,
      "image-retrieval-service": 2,
    });
    expect(snapshot.fallbackCount).toBe(1);
    expect(snapshot.shadowConfig.routineSampleRate).toBe(0.05);
  });

  it("can include internal async-review telemetry for persisted shadow baselines", async () => {
    const now = new Date().toISOString();
    const { buildObservabilitySnapshot } = await import(
      "@/lib/sidecar-observability"
    );

    const snapshot = buildObservabilitySnapshot(
      makeSession({
        case_memory: {
          turn_count: 1,
          chief_complaints: [],
          active_focus_symptoms: [],
          confirmed_facts: {},
          image_findings: [],
          red_flag_notes: [],
          unresolved_question_ids: [],
          clarification_reasons: {},
          timeline_notes: [],
          visual_evidence: [],
          retrieval_evidence: [],
          consult_opinions: [],
          evidence_chain: [],
          service_timeouts: [],
          service_observations: [
            {
              service: "async-review-service",
              stage: "review",
              latencyMs: 2100,
              outcome: "shadow",
              shadowMode: true,
              fallbackUsed: false,
              recordedAt: now,
            },
          ],
          shadow_comparisons: [
            {
              service: "async-review-service",
              usedStrategy: "nvidia-primary",
              shadowStrategy: "hf-async-review",
              summary: "Escalation framing aligned.",
              disagreementCount: 0,
              recordedAt: now,
            },
          ],
          ambiguity_flags: [],
        },
      }),
      { includeInternalTelemetry: true }
    );

    expect(snapshot.serviceCallCounts).toEqual({
      "async-review-service": 1,
    });
    expect(snapshot.recentServiceCalls).toHaveLength(1);
    expect(snapshot.recentShadowComparisons).toHaveLength(1);
  });

  it("forces shadow sampling for urgent cases when a service is enabled", async () => {
    process.env = {
      ...originalEnv,
      HF_SHADOW_TEXT_RETRIEVAL: "1",
      HF_SHADOW_SAMPLE_RATE: "0",
    };

    const { getShadowModeDecision } = await import(
      "@/lib/sidecar-observability"
    );

    const decision = getShadowModeDecision({
      service: "text-retrieval-service",
      session: makeSession(),
      urgencyHint: "high",
    });

    expect(decision.enabled).toBe(true);
    expect(decision.mode).toBe("urgent_all");
    expect(decision.urgency).toBe("high");
  });

  it("auto-disables routine sampling when recent shadow error rate exceeds the ceiling", async () => {
    process.env = {
      ...originalEnv,
      HF_SHADOW_TEXT_RETRIEVAL: "1",
      HF_SHADOW_SAMPLE_RATE: "1",
    };

    const { getShadowModeDecision } = await import(
      "@/lib/sidecar-observability"
    );
    const now = new Date().toISOString();

    const decision = getShadowModeDecision({
      service: "text-retrieval-service",
      session: makeSession({
        case_memory: {
          turn_count: 1,
          chief_complaints: [],
          active_focus_symptoms: [],
          confirmed_facts: {},
          image_findings: [],
          red_flag_notes: [],
          unresolved_question_ids: [],
          clarification_reasons: {},
          timeline_notes: [],
          visual_evidence: [],
          retrieval_evidence: [],
          consult_opinions: [],
          evidence_chain: [],
          service_timeouts: [],
          service_observations: [
            {
              service: "text-retrieval-service",
              stage: "report-retrieval",
              latencyMs: 100,
              outcome: "success",
              shadowMode: false,
              fallbackUsed: false,
              recordedAt: now,
            },
            {
              service: "text-retrieval-service",
              stage: "report-retrieval",
              latencyMs: 135,
              outcome: "error",
              shadowMode: true,
              fallbackUsed: true,
              recordedAt: now,
            },
          ],
          shadow_comparisons: [],
          ambiguity_flags: [],
        },
      }),
      urgencyHint: "low",
    });

    expect(decision.enabled).toBe(false);
    expect(decision.mode).toBe("routine_auto_disabled");
    expect(decision.autoDisabled).toBe(true);
    expect(decision.autoDisableReason).toContain("shadow error rate");
  });

  it("can lock routine traffic out when emergency-only mode is enabled", async () => {
    process.env = {
      ...originalEnv,
      HF_SHADOW_TEXT_RETRIEVAL: "1",
      HF_SHADOW_SAMPLE_RATE: "1",
      HF_SHADOW_EMERGENCY_ONLY: "1",
    };

    const { getShadowModeDecision } = await import(
      "@/lib/sidecar-observability"
    );

    const decision = getShadowModeDecision({
      service: "text-retrieval-service",
      session: makeSession(),
      urgencyHint: "low",
    });

    expect(decision.enabled).toBe(false);
    expect(decision.mode).toBe("emergency_only");
  });

  it("disables live traffic when the configured live split is 0%", async () => {
    process.env = {
      ...originalEnv,
      SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL: "0",
    };

    const { getLiveTrafficDecision } = await import(
      "@/lib/sidecar-observability"
    );

    const decision = getLiveTrafficDecision({
      service: "text-retrieval-service",
      session: makeSession(),
      additionalKey: "split-zero",
    });

    expect(decision.configured).toBe(true);
    expect(decision.liveSplitPct).toBe(0);
    expect(decision.enabled).toBe(false);
    expect(decision.mode).toBe("disabled");
  });

  it("falls back to the legacy live path when no live split env is configured", async () => {
    process.env = {
      ...originalEnv,
    };
    delete process.env.SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL;

    const { getLiveTrafficDecision } = await import(
      "@/lib/sidecar-observability"
    );

    const decision = getLiveTrafficDecision({
      service: "text-retrieval-service",
      session: makeSession(),
      additionalKey: "legacy-default",
    });

    expect(decision.configured).toBe(false);
    expect(decision.enabled).toBe(true);
    expect(decision.mode).toBe("legacy_default");
  });

  it("treats invalid live split values as an explicit 0% rollout", async () => {
    process.env = {
      ...originalEnv,
      SIDECAR_LIVE_SPLIT_TEXT_RETRIEVAL: "17",
    };

    const { getLiveTrafficDecision } = await import(
      "@/lib/sidecar-observability"
    );

    const decision = getLiveTrafficDecision({
      service: "text-retrieval-service",
      session: makeSession(),
      additionalKey: "invalid-split",
    });

    expect(decision.configured).toBe(true);
    expect(decision.liveSplitPct).toBe(0);
    expect(decision.enabled).toBe(false);
    expect(decision.mode).toBe("disabled");
  });
});
