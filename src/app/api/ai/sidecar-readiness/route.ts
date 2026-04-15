import { NextResponse } from "next/server";
import { buildSidecarReadinessSnapshot } from "@/lib/sidecar-readiness";
import type { TriageSession } from "@/lib/triage-engine";

export const dynamic = "force-dynamic";

const SIDECAR_READINESS_SECRET =
  process.env.HF_SIDECAR_API_KEY?.trim() ||
  process.env.ASYNC_REVIEW_WEBHOOK_SECRET?.trim() ||
  "";

function normalizeConfiguredSecret(value: string): string {
  return value.replace(/(?:\\r\\n|\\n|\\r)+$/g, "").trim();
}

interface ReadinessRequestBody {
  session?: TriageSession;
}

function isAuthorized(request: Request): boolean {
  if (!SIDECAR_READINESS_SECRET) {
    return process.env.NODE_ENV !== "production";
  }

  const acceptedSecrets = new Set(
    [SIDECAR_READINESS_SECRET, normalizeConfiguredSecret(SIDECAR_READINESS_SECRET)]
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const directSecret =
    request.headers.get("x-sidecar-readiness-secret")?.trim() || "";

  return (
    acceptedSecrets.has(bearerToken) || acceptedSecrets.has(directSecret)
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await buildSidecarReadinessSnapshot();
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

  const readiness = await buildSidecarReadinessSnapshot({
    session:
      body.session && typeof body.session === "object" ? body.session : null,
  });

  return NextResponse.json({ ok: true, readiness });
}
