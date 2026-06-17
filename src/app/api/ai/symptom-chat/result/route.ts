import { NextResponse } from "next/server";
import { resolveVerifiedUserId } from "@/lib/symptom-chat/server-identity";
import {
  getTriageJobInput,
  getTriageJobResult,
} from "@/lib/symptom-chat/async-turn-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function noStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

// Fetches the result of an async symptom-chat turn. The client calls this after
// a Web PubSub response_ready/report_ready ping (or polls as a fallback).
// Ownership is enforced against the verified user on every read.
export async function GET(request: Request) {
  const jobId =
    new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
  if (!UUID_PATTERN.test(jobId)) {
    return noStore({ error: "invalid_job_id" }, 400);
  }

  const userId = await resolveVerifiedUserId();
  if (!userId) {
    return noStore({ error: "unauthorized" }, 401);
  }

  const result = await getTriageJobResult(jobId);
  if (result) {
    if (result.userId !== userId) {
      return noStore({ error: "forbidden" }, 403);
    }
    return noStore({ body: result.body, status: result.status }, 200);
  }

  // No result yet — distinguish "still processing" (owned job) from "unknown".
  const input = await getTriageJobInput(jobId);
  if (!input) {
    return noStore({ status: "not_found" }, 404);
  }
  if (input.userId !== userId) {
    return noStore({ error: "forbidden" }, 403);
  }
  return noStore({ status: "processing" }, 202);
}

export function POST() {
  return NextResponse.json(
    { error: "Method Not Allowed" },
    { headers: { Allow: "GET" }, status: 405 }
  );
}
