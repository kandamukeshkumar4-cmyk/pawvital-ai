import { NextResponse } from "next/server";
import {
  negotiateTriageLiveUpdates,
  normalizeWebPubSubSafeId,
} from "@/lib/azure/web-pubsub";
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

function jsonNoStore(body: unknown, status = 200, headers = {}) {
  return NextResponse.json(body, {
    headers: {
      ...NO_STORE_HEADERS,
      ...headers,
    },
    status,
  });
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedApiUser({
    demoMessage: "Live updates are unavailable in demo mode",
  });
  if ("response" in auth) {
    return auth.response;
  }

  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request, auth.user.id),
  );
  if (!rateLimitResult.success) {
    return jsonNoStore(
      { error: "Too many requests. Please slow down." },
      429,
      {
        "Retry-After": String(
          Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
        ),
      },
    );
  }

  const unsafeSessionId =
    new URL(request.url).searchParams.get("sessionId") ?? "";
  const sessionId = normalizeWebPubSubSafeId(unsafeSessionId);
  if (!sessionId) {
    return jsonNoStore({ enabled: false, reason: "invalid_request" }, 400);
  }

  const result = await negotiateTriageLiveUpdates({
    sessionId,
    userId: auth.user.id,
  });

  if (!result.enabled && result.reason === "feature_disabled") {
    return jsonNoStore({ enabled: false, reason: "feature_disabled" });
  }

  if (!result.enabled && result.reason === "invalid_request") {
    return jsonNoStore({ enabled: false, reason: "invalid_request" }, 400);
  }

  if (!result.enabled) {
    return jsonNoStore({ enabled: false, reason: "webpubsub_unavailable" }, 503);
  }

  return jsonNoStore({
    enabled: true,
    sessionId: result.sessionId,
    url: result.url,
  });
}
