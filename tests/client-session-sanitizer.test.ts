import type { SidecarObservation } from "@/lib/clinical-evidence";
import {
  isInternalTelemetryObservationForClient,
  sanitizeServiceObservationsForClient,
  sanitizeSessionForClient,
} from "@/lib/client-session-sanitizer";
import { createSession } from "@/lib/triage-engine";

const RECORDED_AT = "2026-04-09T00:00:00.000Z";

function createObservation(
  overrides: Partial<SidecarObservation> = {}
): SidecarObservation {
  return {
    service: "vision-preprocess-service",
    stage: "preprocess",
    latencyMs: 42,
    outcome: "success",
    shadowMode: false,
    fallbackUsed: false,
    note: "Owner-safe photo preprocessing completed.",
    recordedAt: RECORDED_AT,
    ...overrides,
  };
}

describe("client session sanitizer", () => {
  it("marks async review observations as internal telemetry", () => {
    const observation = createObservation({
      service: "async-review-service",
    });

    expect(isInternalTelemetryObservationForClient(observation)).toBe(true);
  });

  it("marks internal telemetry stages as internal even when the service looks safe", () => {
    const observation = createObservation({
      stage: "state_transition",
    });

    expect(isInternalTelemetryObservationForClient(observation)).toBe(true);
  });

  it("marks question-state note markers as internal telemetry", () => {
    const observation = createObservation({
      note: "question_state=unanswered->answered",
    });

    expect(isInternalTelemetryObservationForClient(observation)).toBe(true);
  });

  it("marks conversation-state note markers as internal telemetry", () => {
    const observation = createObservation({
      note: "conversation_state=asking->confirmed",
    });

    expect(isInternalTelemetryObservationForClient(observation)).toBe(true);
  });

  it("preserves user-safe observations and non-internal stages", () => {
    const observation = createObservation({
      stage: "preprocess",
      note: "Owner-safe photo preprocessing completed.",
    });

    expect(isInternalTelemetryObservationForClient(observation)).toBe(false);
    expect(sanitizeServiceObservationsForClient([observation])).toEqual([
      observation,
    ]);
  });

  it("strips internal observations while preserving safe ones", () => {
    const observations = [
      createObservation({ service: "async-review-service" }),
      createObservation({ stage: "state_transition" }),
      createObservation({ note: "question_state=unanswered->answered" }),
      createObservation({ note: "conversation_state=asking->confirmed" }),
      createObservation({
        service: "vision-preprocess-service",
        stage: "preprocess",
        note: "Owner-safe photo preprocessing completed.",
      }),
    ];

    expect(sanitizeServiceObservationsForClient(observations)).toEqual([
      observations[4],
    ]);
  });

  it("preserves non-observation session fields while clearing internal client-only arrays", () => {
    const session = createSession();
    session.known_symptoms = ["limping"];
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left leg" };
    session.last_question_asked = "limping_onset";
    session.case_memory = {
      ...(session.case_memory ?? {}),
      turn_count: 3,
      chief_complaints: ["limping"],
      active_focus_symptoms: ["limping"],
      confirmed_facts: { mobility: "reduced" },
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: ["limping_onset"],
      timeline_notes: ["Started yesterday"],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: ["Owner reported limping"],
      service_timeouts: [
        {
          service: "vision-preprocess-service",
          stage: "preprocess",
          reason: "timeout",
        },
      ],
      service_observations: [
        createObservation({
          service: "async-review-service",
          note: "question_state=unanswered->answered",
        }),
        createObservation(),
      ],
      shadow_comparisons: [
        {
          service: "vision-preprocess-service",
          usedStrategy: "fallback-domain-inference",
          shadowStrategy: "hf-vision-preprocess",
          summary: "Fallback domain=skin_wound; shadow domain=skin_wound",
          disagreementCount: 0,
          recordedAt: RECORDED_AT,
        },
      ],
      ambiguity_flags: ["owner phrasing ambiguous"],
      latest_owner_turn: "My dog has been limping.",
      compressed_summary: "Compressed.",
      compression_model: "MiniMax-M2.7",
      last_compressed_turn: 2,
    };

    const sanitized = sanitizeSessionForClient(session);

    expect(sanitized).toEqual({
      ...session,
      case_memory: {
        ...session.case_memory,
        service_observations: [createObservation()],
        shadow_comparisons: [],
        service_timeouts: [],
      },
    });
  });

  it("handles empty and missing service observations", () => {
    expect(sanitizeServiceObservationsForClient(undefined)).toEqual([]);

    const session = createSession();
    session.case_memory = {
      ...(session.case_memory ?? {}),
      service_observations: undefined as unknown as SidecarObservation[],
    };

    const sanitized = sanitizeSessionForClient(session);

    expect(sanitized.case_memory?.service_observations).toEqual([]);
  });
});