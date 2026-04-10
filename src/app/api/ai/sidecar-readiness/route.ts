import { NextResponse } from "next/server";
import { buildSidecarReadinessSnapshot } from "@/lib/sidecar-readiness";
import type { TriageSession } from "@/lib/triage-engine";

export const dynamic = "force-dynamic";

const SIDECAR_READINESS_SECRET =
  process.env.HF_SIDECAR_API_KEY?.trim() ||
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
  "";

interface ReadinessRequestBody {
  session?: TriageSession;
}

function isAuthorized(request: Request): boolean {
  if (!SIDECAR_READINESS_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const directSecret =
    request.headers.get("x-sidecar-readiness-secret")?.trim() || "";

  return (
    bearerToken === SIDECAR_READINESS_SECRET ||
    directSecret === SIDECAR_READINESS_SECRET
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await buildSidecarReadinessSnapshot();
  const readiness = snapshot.aggregation;
  return NextResponse.json({ ok: true, readiness });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ReadinessRequestBody;
  try {
    body = (await request.json()) as ReadinessRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const snapshot = await buildSidecarReadinessSnapshot({
    session:
      body.session && typeof body.session === "object" ? body.session : null,
  });
  const readiness = snapshot.aggregation;

  return NextResponse.json({ ok: true, readiness });
}
