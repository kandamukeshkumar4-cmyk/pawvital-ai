import { NextResponse } from "next/server";
import { findNearestEmergencyVets } from "@/lib/azure/maps";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

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
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Nearby vet lookup is unavailable in demo mode",
  });
  if ("response" in auth) {
    // Demo mode (Supabase unconfigured) returns 503 — preserve the client's
    // graceful hide-on-unavailable contract instead of surfacing an error.
    if (auth.response?.status === 503) {
      return jsonNoStore(
        { clinics: [], enabled: false, reason: "not_configured" },
        200
      );
    }
    // Unauthenticated (401) or server-config error (500): return as-is.
    return auth.response;
  }

  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { clinics: [], enabled: false, reason: "rate_limited" },
      {
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000))
          ),
        },
        status: 429,
      }
    );
  }

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
