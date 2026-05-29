import { NextResponse } from "next/server";
import { findNearestEmergencyVets } from "@/lib/azure/maps";

export const runtime = "nodejs";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonNoStore(body: unknown, status: number) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      { clinics: [], enabled: false, reason: "invalid_location" },
      400
    );
  }

  const record = body && typeof body === "object" ? body : {};
  const location = record as { latitude?: unknown; longitude?: unknown };
  const latitude = asNumber(location.latitude);
  const longitude = asNumber(location.longitude);
  if (latitude === null || longitude === null) {
    return jsonNoStore(
      { clinics: [], enabled: false, reason: "invalid_location" },
      400
    );
  }

  const result = await findNearestEmergencyVets({ latitude, longitude });
  const status = !result.enabled && result.reason === "invalid_location" ? 400 : 200;
  return jsonNoStore(result, status);
}
