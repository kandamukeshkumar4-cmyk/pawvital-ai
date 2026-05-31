/**
 * AZ-003 — App Insights telemetry wrapper
 *
 * Privacy rules (enforced at the type level):
 *   - Only allow-listed SafePropertyKey values can be tracked.
 *   - Raw symptom text, owner names, pet names, and full chat transcripts
 *     are structurally excluded — they cannot appear in SafeProperties.
 *   - Tracking is a silent no-op when the connection string is absent
 *     (demo mode, CI, any environment without Azure credentials).
 *   - Telemetry must never throw or disrupt clinical behavior.
 *
 * Usage:
 *   import { trackEvent, trackException } from '@/lib/azure/telemetry';
 *   await trackEvent({ name: 'triage.urgency.determined', properties: { urgencyTier: 'emergency' } });
 */

import type { AzureClientOptions } from "@/lib/azure";
import { getAppInsightsConnectionString } from "@/lib/azure";

// ---------------------------------------------------------------------------
// Safe event names — operational events only, never raw clinical content
// ---------------------------------------------------------------------------
export type SafeEventName =
  | "route.request"
  | "route.error"
  | "triage.session.started"
  | "triage.urgency.determined"
  | "ai.model.called"
  | "sidecar.health.checked"
  | "azure.service.called"
  | "feature.flag.checked";

// ---------------------------------------------------------------------------
// Allow-listed property keys — PII boundary enforced at the type level.
// Adding a new key here is a deliberate, reviewable act.
// Raw user input keys (symptomText, ownerName, petName, chatHistory, etc.)
// are intentionally absent and must never be added.
// ---------------------------------------------------------------------------
export type SafePropertyKey =
  | "routeName"
  | "statusCode"
  | "durationMs"
  | "urgencyTier"
  | "complaintFamily"
  | "modelUsed"
  | "sidecarsHealthy"
  | "featureFlag"
  | "flagValue"
  | "azureService"
  | "sessionId" // opaque ID only — never an owner or user identifier
  | "errorCode"
  | "demoMode";

export type SafeProperties = Partial<
  Record<SafePropertyKey, string | number | boolean>
>;

// ---------------------------------------------------------------------------
// Public event shape
// ---------------------------------------------------------------------------
export interface TriageTelemetryEvent {
  name: SafeEventName;
  properties?: SafeProperties;
  measurements?: Record<string, number>;
}

export interface RouteTelemetryInput {
  routeName: string;
  statusCode: number;
  startedAtMs: number;
  /**
   * Optional response-time timestamp (ms). When the call is deferred past the
   * response (e.g. via `after()`), pass the time the response was produced so
   * `durationMs` reflects the real turn latency and is not inflated by
   * post-response scheduling delay. Defaults to `Date.now()`.
   */
  endedAtMs?: number;
  errorCode?: string;
  /**
   * Optional per-stage latencies (ms) for the route, e.g. { extractionMs,
   * secondOpinionMs }. Emitted as App Insights measurements alongside the
   * authoritative total `durationMs`. Internal-only: measurements never enter
   * the route response payload.
   */
  stageDurationsMs?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Injectable transport interface — used for testing without network calls
// ---------------------------------------------------------------------------
type EventEnvelope = {
  name: string;
  time: string;
  iKey: string;
  data: {
    baseType: "EventData";
    baseData: {
      ver: 2;
      name: string;
      properties?: Record<string, string>;
      measurements?: Record<string, number>;
    };
  };
};

type ExceptionEnvelope = {
  name: string;
  time: string;
  iKey: string;
  data: {
    baseType: "ExceptionData";
    baseData: {
      ver: 2;
      exceptions: Array<{
        typeName: "PawVitalTelemetryError";
        message: string;
        hasFullStack: false;
      }>;
      properties?: Record<string, string>;
    };
  };
};

export type TelemetryEnvelope = EventEnvelope | ExceptionEnvelope;

export interface TelemetryTransportRequest {
  endpoint: string;
  envelope: TelemetryEnvelope;
}

export type TelemetryTransport = (
  request: TelemetryTransportRequest
) => Promise<void> | void;

export interface TrackOptions extends AzureClientOptions {
  /** Inject a mock transport in tests instead of sending to Azure Monitor. */
  transport?: TelemetryTransport;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function serializeProperties(
  properties?: SafeProperties
): Record<string, string> | undefined {
  if (!properties) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseConnectionString(
  connectionString: string
): { instrumentationKey: string; ingestionEndpoint: string } | null {
  const parts = new Map<string, string>();
  for (const part of connectionString.split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();
    if (key && value) parts.set(key.toLowerCase(), value);
  }

  const instrumentationKey = parts.get("instrumentationkey");
  if (!instrumentationKey) return null;

  return {
    instrumentationKey,
    ingestionEndpoint:
      parts.get("ingestionendpoint") ?? "https://dc.services.visualstudio.com/",
  };
}

function buildIngestionEndpoint(connectionString: string): {
  endpoint: string;
  instrumentationKey: string;
} | null {
  const parsed = parseConnectionString(connectionString);
  if (!parsed) return null;

  return {
    instrumentationKey: parsed.instrumentationKey,
    endpoint: `${parsed.ingestionEndpoint.replace(/\/+$/, "")}/v2.1/track`,
  };
}

async function defaultTransport(
  request: TelemetryTransportRequest
): Promise<void> {
  await fetch(request.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.envelope),
  });
}

async function sendEnvelope(
  connectionString: string,
  envelope: (instrumentationKey: string) => TelemetryEnvelope,
  transport: TelemetryTransport = defaultTransport
): Promise<void> {
  const target = buildIngestionEndpoint(connectionString);
  if (!target) return;

  await transport({
    endpoint: target.endpoint,
    envelope: envelope(target.instrumentationKey),
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Track an operational event.
 * Silent no-op when the App Insights connection string is unavailable.
 * Never throws — telemetry must not affect clinical behavior.
 */
export async function trackEvent(
  event: TriageTelemetryEvent,
  options: TrackOptions = {}
): Promise<void> {
  try {
    const connectionString = await getAppInsightsConnectionString(options);
    if (!connectionString) return;

    await sendEnvelope(
      connectionString,
      (instrumentationKey) => ({
        name: `Microsoft.ApplicationInsights.${instrumentationKey}.Event`,
        time: new Date().toISOString(),
        iKey: instrumentationKey,
        data: {
          baseType: "EventData",
          baseData: {
            ver: 2,
            name: `pawvital.${event.name}`,
            properties: serializeProperties(event.properties),
            measurements: event.measurements,
          },
        },
      }),
      options.transport
    );
  } catch {
    // Intentionally swallowed — telemetry must never throw
  }
}

/**
 * Track sanitized route latency/status. The caller must pass a stable route name
 * only; never include owner text, request paths with IDs, or query strings.
 */
export function trackRouteTelemetry(
  input: RouteTelemetryInput,
  options: TrackOptions = {}
): Promise<void> {
  const durationMs = Math.max(0, (input.endedAtMs ?? Date.now()) - input.startedAtMs);
  const properties: SafeProperties = {
    routeName: input.routeName,
    statusCode: input.statusCode,
    durationMs,
  };

  if (input.errorCode) {
    properties.errorCode = input.errorCode;
  }

  // Merge per-stage latencies, then set the total last so a stage key can never
  // overwrite the authoritative `durationMs`.
  const measurements: Record<string, number> = {};
  for (const [stage, ms] of Object.entries(input.stageDurationsMs ?? {})) {
    if (Number.isFinite(ms)) {
      measurements[stage] = Math.max(0, ms);
    }
  }
  measurements.durationMs = durationMs;

  return trackEvent(
    {
      name: input.errorCode ? "route.error" : "route.request",
      properties,
      measurements,
    },
    options
  );
}

/**
 * Track an unhandled exception by stable error code only.
 * Raw Error objects are intentionally not accepted because their messages or
 * stacks can contain owner-provided text.
 * Silent no-op in demo mode.
 */
export async function trackException(
  errorCode: string,
  context?: Pick<SafeProperties, "routeName">,
  options: TrackOptions = {}
): Promise<void> {
  try {
    const connectionString = await getAppInsightsConnectionString(options);
    if (!connectionString) return;

    await sendEnvelope(
      connectionString,
      (instrumentationKey) => ({
        name: `Microsoft.ApplicationInsights.${instrumentationKey}.Exception`,
        time: new Date().toISOString(),
        iKey: instrumentationKey,
        data: {
          baseType: "ExceptionData",
          baseData: {
            ver: 2,
            exceptions: [
              {
                typeName: "PawVitalTelemetryError",
                message: errorCode,
                hasFullStack: false,
              },
            ],
            properties: serializeProperties({
              ...context,
              errorCode,
            }),
          },
        },
      }),
      options.transport
    );
  } catch {
    // Intentionally swallowed
  }
}
