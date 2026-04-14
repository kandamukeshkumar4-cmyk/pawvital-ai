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

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

describe("shadow rollout summary", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      HF_SHADOW_REQUIRED_HEALTH_SAMPLES: "2",
      HF_SHADOW_REQUIRED_HEALTHY_RATIO: "0.5",
      HF_SHADOW_LOAD_TEST_REQUIRED: "0",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("reports insufficient data when there are no sidecar observations yet", async () => {
    const { buildShadowRolloutSummary } = await import("@/lib/shadow-rollout");
    const summary = buildShadowRolloutSummary(makeSession());

    expect(summary.overallStatus).toBe("insufficient_data");
    expect(summary.shadowModeDataPresent).toBe(false);
    expect(
      summary.services.every((service) => service.status === "insufficient_data")
    ).toBe(true);
  });

  it("marks a service as blocked when timeout rate is too high", async () => {
    const { buildShadowRolloutSummary } = await import("@/lib/shadow-rollout");
    const session = makeSession({
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
            stage: "retrieve",
            latencyMs: 1200,
            outcome: "timeout",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(2),
          },
          {
            service: "text-retrieval-service",
            stage: "retrieve",
            latencyMs: 1300,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(1),
          },
        ],
        shadow_comparisons: [],
        ambiguity_flags: [],
      },
    });

    const summary = buildShadowRolloutSummary(session);
    const textService = summary.services.find(
      (service) => service.service === "text-retrieval-service"
    );

    expect(textService?.status).toBe("blocked");
    expect(textService?.blockers.join(" ")).toContain("Timeout rate");
    expect(summary.overallStatus).toBe("blocked");
  });

  it("treats shadow-mode fallbackUsed flags as non-failures and stays ready with healthy samples", async () => {
    const { buildShadowRolloutSummary } = await import("@/lib/shadow-rollout");
    const session = makeSession({
      case_memory: {
        turn_count: 2,
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
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 1800,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(2),
          },
          {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 2200,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(1),
          },
        ],
        shadow_comparisons: [
          {
            service: "vision-preprocess-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-vision-preprocess",
            summary: "Same domain and body region.",
            disagreementCount: 1,
            recordedAt: minutesAgo(1),
          },
        ],
        ambiguity_flags: [],
      },
    });

    const summary = buildShadowRolloutSummary(session);
    const visionService = summary.services.find(
      (service) => service.service === "vision-preprocess-service"
    );

    expect(visionService?.sampleMode).toBe("shadow");
    expect(visionService?.fallbackObservations).toBe(0);
    expect(visionService?.status).toBe("ready");
    expect(summary.shadowModeDataPresent).toBe(true);
  });

  it("surfaces disagreement-heavy services as watch status", async () => {
    const { buildShadowRolloutSummary } = await import("@/lib/shadow-rollout");
    const session = makeSession({
      case_memory: {
        turn_count: 3,
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
            service: "multimodal-consult-service",
            stage: "consult",
            latencyMs: 4200,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(3),
          },
          {
            service: "multimodal-consult-service",
            stage: "consult",
            latencyMs: 3900,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: minutesAgo(2),
          },
        ],
        shadow_comparisons: [
          {
            service: "multimodal-consult-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-consult",
            summary: "Different lesion severity framing.",
            disagreementCount: 2,
            recordedAt: minutesAgo(1),
          },
          {
            service: "multimodal-consult-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-consult",
            summary: "Different recommended follow-up.",
            disagreementCount: 2,
            recordedAt: minutesAgo(1),
          },
        ],
        ambiguity_flags: [],
      },
    });

    const summary = buildShadowRolloutSummary(session);
    const consultService = summary.services.find(
      (service) => service.service === "multimodal-consult-service"
    );

    expect(consultService?.status).toBe("watch");
    expect(consultService?.blockers.join(" ")).toContain("Shadow disagreements");
    expect(summary.overallStatus).toBe("watch");
  });

  it("requires synthetic load-test evidence before a service can stay ready", async () => {
    process.env.HF_SHADOW_LOAD_TEST_REQUIRED = "1";
    const { buildShadowRolloutSummary } = await import("@/lib/shadow-rollout");
    const session = makeSession({
      case_memory: {
        turn_count: 4,
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
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 1800,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: false,
            recordedAt: minutesAgo(2),
          },
          {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 1900,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: false,
            recordedAt: minutesAgo(1),
          },
        ],
        shadow_comparisons: [],
        ambiguity_flags: [],
      },
    });

    const summary = buildShadowRolloutSummary(session);
    const visionService = summary.services.find(
      (service) => service.service === "vision-preprocess-service"
    );

    expect(visionService?.status).toBe("watch");
    expect(visionService?.loadTestStatus).toBe("missing");
    expect(visionService?.blockers.join(" ")).toContain("Synthetic load-test");
  });
});
