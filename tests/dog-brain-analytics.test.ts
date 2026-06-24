/**
 * Dog Brain analytics — privacy-safe usage events.
 *
 * Covers:
 *   - each builder emits the expected event name + enum/count payload
 *   - payloads carry ONLY allow-listed enum keys; values are bounded
 *   - measurements are non-negative integers (counts), defensively normalized
 *   - raw outcome strings coerce into the bounded bucket vocabulary
 *   - routing through the shared sink emits the prefixed name with no free text
 *   - demo mode (no connection string) is a silent no-op
 */

import {
  DOG_BRAIN_EVENTS,
  brainContextLoadedEvent,
  brainQuestionTraceEmittedEvent,
  emergencyTraceSuppressedEvent,
  dogBrainFollowupCreatedEvent,
  dogBrainFollowupOutcomeRecordedEvent,
  supplementTrialStartedEvent,
  supplementTrialMarkedActiveEvent,
  supplementTrialOutcomeRecordedEvent,
  recordDogBrainEvent,
  toOutcomeBucket,
} from "@/lib/dog-brain/analytics";
import type {
  TelemetryEnvelope,
  TelemetryTransportRequest,
  TriageTelemetryEvent,
} from "@/lib/azure/telemetry";
import type { SecretClientLike } from "@/lib/azure";

const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

const TEST_CONNECTION_STRING =
  "InstrumentationKey=test-key-000;IngestionEndpoint=https://test.in.applicationinsights.azure.com/";

function makeConnectedSecretClient(): SecretClientLike {
  return {
    getSecret: async (name: string) => ({
      value:
        name === "appinsights-connection-string" ? TEST_CONNECTION_STRING : null,
    }),
  };
}

function makeMockTransport() {
  return jest.fn(async () => undefined);
}

type EventEnvelope = Extract<
  TelemetryEnvelope,
  { data: { baseType: "EventData" } }
>;

function getEnvelope(transport: jest.Mock): EventEnvelope {
  const request = transport.mock.calls[0]?.[0] as
    | TelemetryTransportRequest
    | undefined;
  if (!request || request.envelope.data.baseType !== "EventData") {
    throw new Error("expected an EventData envelope");
  }
  return request.envelope as EventEnvelope;
}

// Only these property keys are ever allowed on a Dog Brain analytics event.
const ALLOWED_PROPERTY_KEYS = new Set(["questionSource", "outcomeBucket"]);

function assertPrivacySafe(event: TriageTelemetryEvent) {
  for (const key of Object.keys(event.properties ?? {})) {
    expect(ALLOWED_PROPERTY_KEYS.has(key)).toBe(true);
  }
  for (const value of Object.values(event.measurements ?? {})) {
    expect(typeof value).toBe("number");
    expect(Number.isFinite(value as number)).toBe(true);
    expect(value as number).toBeGreaterThanOrEqual(0);
  }
}

describe("Dog Brain analytics builders — enums & counts", () => {
  it("brain_context_loaded carries the four counts and no properties", () => {
    const e = brainContextLoadedEvent({
      signalCount: 3,
      prioritySymptomCount: 2,
      followupCount: 1,
      supplementTrialCount: 1,
    });
    expect(e.name).toBe(DOG_BRAIN_EVENTS.contextLoaded);
    expect(e.measurements).toEqual({
      signalCount: 3,
      prioritySymptomCount: 2,
      followupCount: 1,
      supplementTrialCount: 1,
    });
    expect(e.properties).toBeUndefined();
    assertPrivacySafe(e);
  });

  it("normalizes negative / fractional / missing counts to non-negative integers", () => {
    const e = brainContextLoadedEvent({
      signalCount: -5,
      prioritySymptomCount: 2.9,
      // followupCount missing
      supplementTrialCount: Number.NaN,
    });
    expect(e.measurements).toEqual({
      signalCount: 0,
      prioritySymptomCount: 2,
      followupCount: 0,
      supplementTrialCount: 0,
    });
    assertPrivacySafe(e);
  });

  it("brain_question_trace_emitted carries source enum + evidence count", () => {
    const e = brainQuestionTraceEmittedEvent({ source: "brain_memory", evidenceCount: 4 });
    expect(e.name).toBe(DOG_BRAIN_EVENTS.questionTraceEmitted);
    expect(e.properties).toEqual({ questionSource: "brain_memory" });
    expect(e.measurements).toEqual({ evidenceCount: 4 });
    assertPrivacySafe(e);
  });

  it("emergency_question_trace_suppressed emits with source=emergency, no counts", () => {
    const e = emergencyTraceSuppressedEvent();
    expect(e.name).toBe(DOG_BRAIN_EVENTS.emergencyTraceSuppressed);
    expect(e.properties).toEqual({ questionSource: "emergency" });
    assertPrivacySafe(e);
  });

  it("followup + supplement lifecycle events carry only bounded enums", () => {
    const events = [
      dogBrainFollowupCreatedEvent(),
      dogBrainFollowupOutcomeRecordedEvent({ outcome: "worse" }),
      supplementTrialStartedEvent(),
      supplementTrialMarkedActiveEvent(),
      supplementTrialOutcomeRecordedEvent({ outcome: "side_effect" }),
    ];
    expect(events.map((e) => e.name)).toEqual([
      DOG_BRAIN_EVENTS.followupCreated,
      DOG_BRAIN_EVENTS.followupOutcomeRecorded,
      DOG_BRAIN_EVENTS.supplementTrialStarted,
      DOG_BRAIN_EVENTS.supplementTrialMarkedActive,
      DOG_BRAIN_EVENTS.supplementTrialOutcomeRecorded,
    ]);
    events.forEach(assertPrivacySafe);
    expect(events[1].properties).toEqual({ outcomeBucket: "worse" });
    expect(events[4].properties).toEqual({ outcomeBucket: "side_effect" });
  });
});

describe("toOutcomeBucket — bounded coercion", () => {
  it.each([
    ["improved", "better"],
    ["BETTER", "better"],
    ["unchanged", "same"],
    ["worsening", "worse"],
    ["side effect", "side_effect"],
    ["adverse", "side_effect"],
    ["", "unknown"],
    ["owner typed a long note here", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
  ])("coerces %p → %p", (input, expected) => {
    expect(toOutcomeBucket(input as string | null | undefined)).toBe(expected);
  });
});

describe("recordDogBrainEvent — routing through the shared sink", () => {
  it("is a silent no-op in demo mode (no connection string)", async () => {
    const transport = makeMockTransport();
    await recordDogBrainEvent(brainContextLoadedEvent({ signalCount: 1 }), { transport });
    expect(transport).not.toHaveBeenCalled();
  });

  it("emits the 'pawvital.' prefixed event with only safe fields", async () => {
    const transport = makeMockTransport();
    await recordDogBrainEvent(
      brainQuestionTraceEmittedEvent({ source: "brain_memory", evidenceCount: 2 }),
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      },
    );
    const envelope = getEnvelope(transport);
    expect(envelope.data.baseData.name).toBe(
      "pawvital.dogbrain.question_trace.emitted",
    );
    expect(envelope.data.baseData.properties).toEqual({ questionSource: "brain_memory" });
    expect(envelope.data.baseData.measurements).toEqual({ evidenceCount: 2 });
    // No owner/pet/symptom keys leaked anywhere in the serialized envelope.
    const serialized = JSON.stringify(envelope).toLowerCase();
    for (const banned of ["symptom", "ownername", "petname", "notes", "photo"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});
