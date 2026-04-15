import { NextResponse } from "next/server";
import {
  buildInternalShadowTelemetrySnapshot,
  buildObservabilitySnapshot,
} from "@/lib/sidecar-observability";
import { buildPersistedShadowBaselineSnapshot } from "@/lib/shadow-rollout-baseline";
import {
  appendShadowTelemetrySnapshot,
  persistShadowLoadTestSummary,
} from "@/lib/shadow-telemetry-store";
import {
  buildShadowRolloutSummary,
  type ShadowLoadTestSummary,
} from "@/lib/shadow-rollout";
import type { TriageSession } from "@/lib/triage-engine";

const SHADOW_ROLLOUT_DEBUG_SECRET =
  process.env.HF_SIDECAR_API_KEY?.trim() ||
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
  "";

function normalizeConfiguredSecret(value: string): string {
  return value.replace(/(?:\\r\\n|\\n|\\r)+$/g, "").trim();
}

interface ShadowRolloutRequestBody {
  session?: TriageSession;
  loadTest?: ShadowLoadTestSummary | null;
}

function isAuthorized(request: Request): boolean {
  if (!SHADOW_ROLLOUT_DEBUG_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const acceptedSecrets = new Set(
    [SHADOW_ROLLOUT_DEBUG_SECRET, normalizeConfiguredSecret(SHADOW_ROLLOUT_DEBUG_SECRET)]
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const directSecret =
    request.headers.get("x-shadow-rollout-secret")?.trim() || "";

  return (
    acceptedSecrets.has(bearerToken) || acceptedSecrets.has(directSecret)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ShadowRolloutRequestBody;
  try {
    body = (await request.json()) as ShadowRolloutRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasSession = Boolean(body.session && typeof body.session === "object");
  const hasLoadTest = Boolean(body.loadTest && typeof body.loadTest === "object");

  if (!hasSession && !hasLoadTest) {
    return NextResponse.json(
      { error: "session or loadTest is required" },
      { status: 400 }
    );
  }

  let persistedLoadTest = false;
  if (hasLoadTest) {
    persistedLoadTest = await persistShadowLoadTestSummary(
      body.loadTest as ShadowLoadTestSummary
    );
  }

  if (!hasSession) {
    return NextResponse.json({
      ok: true,
      persistedLoadTest,
      loadTest: body.loadTest || null,
    });
  }

  const summary = buildShadowRolloutSummary(body.session!, {
    loadTest: body.loadTest || null,
  });
  const observability = buildObservabilitySnapshot(body.session!);
  const persistedTelemetry = await appendShadowTelemetrySnapshot(
    buildInternalShadowTelemetrySnapshot(body.session!)
  );

  return NextResponse.json({
    ok: true,
    persistedLoadTest,
    persistedTelemetry,
    summary,
    observability: {
      shadowModeActive: observability.shadowModeActive,
      timeoutCount: observability.timeoutCount,
      fallbackCount: observability.fallbackCount,
      serviceCallCounts: observability.serviceCallCounts,
      recentServiceCallCount: observability.recentServiceCalls.length,
      recentShadowComparisonCount:
        observability.recentShadowComparisons.length,
    },
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const baseline = await buildPersistedShadowBaselineSnapshot();
    return NextResponse.json({
      ok: true,
      summary: baseline.summary,
      baseline: {
        generatedAt: baseline.generatedAt,
        windowHours: baseline.windowHours,
        reportCount: baseline.reportCount,
        parsedReportCount: baseline.parsedReportCount,
        malformedReportCount: baseline.malformedReportCount,
        observationCount: baseline.observationCount,
        shadowComparisonCount: baseline.shadowComparisonCount,
        loadTest: baseline.loadTest,
        serviceMetrics: baseline.serviceMetrics,
        warning: baseline.warning,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to build persisted shadow baseline",
      },
      { status: 500 }
    );
  }
}
