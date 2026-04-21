import { NextResponse } from "next/server";

const DEPRECATION_PAYLOAD = {
  error: "The legacy triage proxy endpoint has been retired.",
  code: "LEGACY_TRIAGE_ENDPOINT_DISABLED",
  message:
    "Use /api/ai/symptom-chat for active symptom-check conversations.",
} as const;

const DEPRECATION_HEADERS = {
  "Cache-Control": "no-store",
} as const;

function buildRetiredRouteResponse() {
  return NextResponse.json(DEPRECATION_PAYLOAD, {
    status: 410,
    headers: DEPRECATION_HEADERS,
  });
}

// Ignore caller-controlled request data so this retired endpoint cannot proxy or bind sessions.
export async function GET(_request: Request) {
  return buildRetiredRouteResponse();
}

export async function POST(_request: Request) {
  return buildRetiredRouteResponse();
}
