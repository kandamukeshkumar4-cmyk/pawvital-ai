/**
 * AZ-003 regression tests — App Insights telemetry wrapper
 *
 * Covers:
 *   - demo-mode no-op (no connection string → silent return)
 *   - event sent with correct prefixed name and properties
 *   - numeric/boolean properties serialised to strings
 *   - measurements passed through unchanged
 *   - never throws even when the telemetry transport throws
 *   - trackException sends stable error-code context only
 *   - exception tracking is a no-op in demo mode
 */

import {
  trackEvent,
  trackException,
  trackRouteTelemetry,
  type TelemetryEnvelope,
  type TelemetryTransportRequest,
} from "@/lib/azure/telemetry";
import type { SecretClientLike } from "@/lib/azure";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fake SP credentials — required by getAzureRuntimeConfig before the
 *  secretClientFactory is ever invoked. Must be present in every non-demo test. */
const CONFIGURED_ENV = {
  AZURE_TENANT_ID: "test-tenant-id",
  AZURE_CLIENT_ID: "test-client-id",
  AZURE_CLIENT_SECRET: "test-client-secret",
  AZURE_KEY_VAULT_NAME: "test-vault",
};

const TEST_CONNECTION_STRING =
  "InstrumentationKey=test-key-000;IngestionEndpoint=https://test.in.applicationinsights.azure.com/";

function makeSecretClient(
  secrets: Record<string, string>
): SecretClientLike {
  return {
    getSecret: async (name: string) => ({ value: secrets[name] ?? null }),
  };
}

function makeConnectedSecretClient(): SecretClientLike {
  return makeSecretClient({
    "appinsights-connection-string": TEST_CONNECTION_STRING,
  });
}

type EventEnvelope = Extract<
  TelemetryEnvelope,
  { data: { baseType: "EventData" } }
>;
type ExceptionEnvelope = Extract<
  TelemetryEnvelope,
  { data: { baseType: "ExceptionData" } }
>;

function makeMockTransport() {
  return jest.fn(async () => undefined);
}

function getEventEnvelope(transport: jest.Mock): EventEnvelope {
  const request = transport.mock.calls[0]?.[0] as
    | TelemetryTransportRequest
    | undefined;
  if (!request || request.envelope.data.baseType !== "EventData") {
    throw new Error("Expected EventData envelope");
  }
  return request.envelope as EventEnvelope;
}

function getExceptionEnvelope(transport: jest.Mock): ExceptionEnvelope {
  const request = transport.mock.calls[0]?.[0] as
    | TelemetryTransportRequest
    | undefined;
  if (!request || request.envelope.data.baseType !== "ExceptionData") {
    throw new Error("Expected ExceptionData envelope");
  }
  return request.envelope as ExceptionEnvelope;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// trackEvent
// ---------------------------------------------------------------------------

describe("trackEvent", () => {
  it("is a silent no-op in demo mode (no connection string)", async () => {
    const transport = makeMockTransport();
    await trackEvent(
      { name: "route.request" },
      { transport }
      // no secretClientFactory => getAppInsightsConnectionString returns null
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends event prefixed with 'pawvital.' when connection string is present", async () => {
    const transport = makeMockTransport();
    await trackEvent(
      { name: "triage.urgency.determined" },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://test.in.applicationinsights.azure.com/v2.1/track",
      })
    );
    expect(getEventEnvelope(transport).data.baseData.name).toBe(
      "pawvital.triage.urgency.determined"
    );
  });

  it("serialises numeric and boolean properties to strings", async () => {
    const transport = makeMockTransport();
    await trackEvent(
      {
        name: "route.request",
        properties: { statusCode: 200, demoMode: true, urgencyTier: "emergency" },
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );
    expect(getEventEnvelope(transport).data.baseData.properties).toEqual({
      statusCode: "200",
      demoMode: "true",
      urgencyTier: "emergency",
    });
  });

  it("passes measurements through unchanged", async () => {
    const transport = makeMockTransport();
    await trackEvent(
      { name: "ai.model.called", measurements: { durationMs: 123, tokens: 42 } },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );
    expect(getEventEnvelope(transport).data.baseData.measurements).toEqual({
      durationMs: 123,
      tokens: 42,
    });
  });

  it("never throws even when the telemetry transport throws", async () => {
    const brokenTransport = () => {
      throw new Error("simulated network failure");
    };
    await expect(
      trackEvent(
        { name: "route.error" },
        {
          env: CONFIGURED_ENV,
          secretClientFactory: () => makeConnectedSecretClient(),
          transport: brokenTransport,
        }
      )
    ).resolves.toBeUndefined();
  });

  it("omits properties key entirely when no properties are given", async () => {
    const transport = makeMockTransport();
    await trackEvent(
      { name: "sidecar.health.checked" },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );
    expect(getEventEnvelope(transport).data.baseData.properties).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// trackRouteTelemetry
// ---------------------------------------------------------------------------

describe("trackRouteTelemetry", () => {
  it("tracks sanitized route status and latency without request payloads", async () => {
    const transport = makeMockTransport();
    jest.spyOn(Date, "now").mockReturnValue(1_250);

    await trackRouteTelemetry(
      {
        routeName: "api.ai.symptom-chat",
        statusCode: 200,
        startedAtMs: 1_000,
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );

    const envelope = getEventEnvelope(transport);
    expect(envelope.data.baseData).toEqual({
      ver: 2,
      name: "pawvital.route.request",
      properties: {
        routeName: "api.ai.symptom-chat",
        statusCode: "200",
        durationMs: "250",
      },
      measurements: { durationMs: 250 },
    });
  });

  it("merges per-stage durations into measurements alongside total durationMs", async () => {
    const transport = makeMockTransport();
    jest.spyOn(Date, "now").mockReturnValue(1_250);

    await trackRouteTelemetry(
      {
        routeName: "api.ai.symptom-chat",
        statusCode: 200,
        startedAtMs: 1_000,
        stageDurationsMs: { extractionMs: 40, secondOpinionMs: 120 },
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );

    expect(getEventEnvelope(transport).data.baseData.measurements).toEqual({
      durationMs: 250,
      extractionMs: 40,
      secondOpinionMs: 120,
    });
  });

  it("keeps the total durationMs authoritative even if a stage key collides", async () => {
    const transport = makeMockTransport();
    jest.spyOn(Date, "now").mockReturnValue(1_250);

    await trackRouteTelemetry(
      {
        routeName: "api.ai.symptom-chat",
        statusCode: 200,
        startedAtMs: 1_000,
        // A stage must never be able to overwrite the authoritative total.
        stageDurationsMs: { durationMs: 9_999, extractionMs: 40 },
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );

    const measurements = getEventEnvelope(transport).data.baseData.measurements;
    expect(measurements?.durationMs).toBe(250);
    expect(measurements?.extractionMs).toBe(40);
  });

  it("tracks route errors with fixed error codes only", async () => {
    const transport = makeMockTransport();
    jest.spyOn(Date, "now").mockReturnValue(2_010);

    await trackRouteTelemetry(
      {
        routeName: "api.admin.telemetry",
        statusCode: 500,
        startedAtMs: 2_000,
        errorCode: "admin_telemetry_unhandled",
      },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );

    const envelope = getEventEnvelope(transport);
    expect(envelope.data.baseData.name).toBe("pawvital.route.error");
    expect(envelope.data.baseData.properties).toEqual({
      routeName: "api.admin.telemetry",
      statusCode: "500",
      durationMs: "10",
      errorCode: "admin_telemetry_unhandled",
    });
    expect(JSON.stringify(envelope)).not.toContain("symptom");
  });
});

// ---------------------------------------------------------------------------
// trackException
// ---------------------------------------------------------------------------

describe("trackException", () => {
  it("is a silent no-op in demo mode", async () => {
    const transport = makeMockTransport();
    await trackException("clinical_error", undefined, {
      transport,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends exception with safe context when connection string is present", async () => {
    const transport = makeMockTransport();
    await trackException(
      "route_handler_crashed",
      { routeName: "symptom-chat" },
      {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport,
      }
    );
    const exceptionData = getExceptionEnvelope(transport).data.baseData;
    expect(exceptionData.exceptions).toEqual([
      {
        typeName: "PawVitalTelemetryError",
        message: "route_handler_crashed",
        hasFullStack: false,
      },
    ]);
    expect(exceptionData.properties).toEqual({
      routeName: "symptom-chat",
      errorCode: "route_handler_crashed",
    });
  });

  it("sends exception with error code only when context is omitted", async () => {
    const transport = makeMockTransport();
    await trackException("unhandled", undefined, {
      env: CONFIGURED_ENV,
      secretClientFactory: () => makeConnectedSecretClient(),
      transport,
    });
    expect(getExceptionEnvelope(transport).data.baseData.properties).toEqual({
      errorCode: "unhandled",
    });
  });

  it("never throws even when the telemetry transport throws", async () => {
    const brokenTransport = () => {
      throw new Error("transport crash");
    };
    await expect(
      trackException("test", { routeName: "triage" }, {
        env: CONFIGURED_ENV,
        secretClientFactory: () => makeConnectedSecretClient(),
        transport: brokenTransport,
      })
    ).resolves.toBeUndefined();
  });
});
