import { NextResponse } from "next/server";
import { getSpeechAuthorizationToken } from "@/lib/azure/speech";
import { requireAuthenticatedApiUser } from "@/lib/api-auth";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function jsonNoStore(
  body: unknown,
  {
    headers = {},
    status = 200,
  }: {
    headers?: Record<string, string>;
    status?: number;
  } = {}
) {
  return NextResponse.json(body, {
    headers: {
      ...NO_STORE_HEADERS,
      ...headers,
    },
    status,
  });
}

function buildDisabledResponse() {
  return jsonNoStore({ enabled: false });
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Speech input is unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id)
  );
  if (!rateLimitResult.success) {
    return jsonNoStore(
      { error: "Too many requests. Please slow down." },
      {
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000))
          ),
        },
        status: 429,
      }
    );
  }

  const token = await getSpeechAuthorizationToken();
  if (!token.enabled && token.reason === "feature_disabled") {
    return buildDisabledResponse();
  }

  if (!token.enabled) {
    return jsonNoStore(
      { enabled: false, code: "SPEECH_UNAVAILABLE" },
      { status: 503 }
    );
  }

  return jsonNoStore({
    enabled: true,
    expiresInSeconds: token.expiresInSeconds,
    region: token.region,
    token: token.token,
  });
}
