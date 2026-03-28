import { NextResponse } from "next/server";
import { buildObservabilitySnapshot } from "@/lib/sidecar-observability";
import { buildShadowRolloutSummary } from "@/lib/shadow-rollout";
import type { TriageSession } from "@/lib/triage-engine";

const SHADOW_ROLLOUT_DEBUG_SECRET =
  process.env.HF_SIDECAR_API_KEY?.trim() ||
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
  "";

interface ShadowRolloutRequestBody {
  session?: TriageSession;
}

function isAuthorized(request: Request): boolean {
  if (!SHADOW_ROLLOUT_DEBUG_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const directSecret =
    request.headers.get("x-shadow-rollout-secret")?.trim() || "";

  return (
    bearerToken === SHADOW_ROLLOUT_DEBUG_SECRET ||
    directSecret === SHADOW_ROLLOUT_DEBUG_SECRET
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

  if (!body.session || typeof body.session !== "object") {
    return NextResponse.json(
      { error: "session is required" },
      { status: 400 }
    );
  }

  const summary = buildShadowRolloutSummary(body.session);
  const observability = buildObservabilitySnapshot(body.session);

  return NextResponse.json({
    ok: true,
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
