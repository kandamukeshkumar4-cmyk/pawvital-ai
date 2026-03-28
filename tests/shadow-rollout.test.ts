import { buildShadowRolloutSummary } from "@/lib/shadow-rollout";
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
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      service_timeouts: [],
      service_observations: [],
      shadow_comparisons: [],
      ambiguity_flags: [],
    },
    ...partial,
  };
}

describe("shadow rollout summary", () => {
  it("reports insufficient data when there are no sidecar observations yet", () => {
    const summary = buildShadowRolloutSummary(makeSession());

    expect(summary.overallStatus).toBe("insufficient_data");
    expect(summary.shadowModeDataPresent).toBe(false);
    expect(summary.services.every((service) => service.status === "insufficient_data")).toBe(true);
  });

  it("marks a service as blocked when timeout rate is too high", () => {
    const session = makeSession({
      case_memory: {
        turn_count: 1,
        chief_complaints: [],
        active_focus_symptoms: [],
        confirmed_facts: {},
        image_findings: [],
        red_flag_notes: [],
        unresolved_question_ids: [],
        timeline_notes: [],
        visual_evidence: [],
        retrieval_evidence: [],
        service_timeouts: [],
        service_observations: [
          {
            service: "text-retrieval-service",
            stage: "retrieve",
            latencyMs: 1200,
            outcome: "timeout",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:00:00.000Z",
          },
          {
            service: "text-retrieval-service",
            stage: "retrieve",
            latencyMs: 1300,
            outcome: "success",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:01:00.000Z",
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

  it("treats shadow-mode fallbackUsed flags as non-failures and stays ready with healthy samples", () => {
    const session = makeSession({
      case_memory: {
        turn_count: 2,
        chief_complaints: [],
        active_focus_symptoms: [],
        confirmed_facts: {},
        image_findings: [],
        red_flag_notes: [],
        unresolved_question_ids: [],
        timeline_notes: [],
        visual_evidence: [],
        retrieval_evidence: [],
        service_timeouts: [],
        service_observations: [
          {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 1800,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:00:00.000Z",
          },
          {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: 2200,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:01:00.000Z",
          },
        ],
        shadow_comparisons: [
          {
            service: "vision-preprocess-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-vision-preprocess",
            summary: "Same domain and body region.",
            disagreementCount: 1,
            recordedAt: "2026-03-27T00:01:30.000Z",
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

  it("surfaces disagreement-heavy services as watch status", () => {
    const session = makeSession({
      case_memory: {
        turn_count: 3,
        chief_complaints: [],
        active_focus_symptoms: [],
        confirmed_facts: {},
        image_findings: [],
        red_flag_notes: [],
        unresolved_question_ids: [],
        timeline_notes: [],
        visual_evidence: [],
        retrieval_evidence: [],
        service_timeouts: [],
        service_observations: [
          {
            service: "multimodal-consult-service",
            stage: "consult",
            latencyMs: 4200,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:00:00.000Z",
          },
          {
            service: "multimodal-consult-service",
            stage: "consult",
            latencyMs: 3900,
            outcome: "shadow",
            shadowMode: true,
            fallbackUsed: true,
            recordedAt: "2026-03-27T00:01:00.000Z",
          },
        ],
        shadow_comparisons: [
          {
            service: "multimodal-consult-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-consult",
            summary: "Different lesion severity framing.",
            disagreementCount: 2,
            recordedAt: "2026-03-27T00:02:00.000Z",
          },
          {
            service: "multimodal-consult-service",
            usedStrategy: "nvidia",
            shadowStrategy: "hf-consult",
            summary: "Different recommended follow-up.",
            disagreementCount: 2,
            recordedAt: "2026-03-27T00:03:00.000Z",
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
});
