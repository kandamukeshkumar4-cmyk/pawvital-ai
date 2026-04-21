import { NextResponse } from "next/server";

const DEPRECATION_PAYLOAD = {
  error: "The legacy triage proxy endpoint has been retired.",
  code: "LEGACY_TRIAGE_ENDPOINT_DISABLED",
  message:
    "Use /api/ai/symptom-chat for active symptom-check conversations.",
} as const;

export async function GET() {
  return NextResponse.json(DEPRECATION_PAYLOAD, { status: 410 });
}

export async function POST() {
  return NextResponse.json(DEPRECATION_PAYLOAD, { status: 410 });
}
