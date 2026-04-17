import { NextResponse } from "next/server";
import type { Ratelimit } from "@upstash/ratelimit";
import type { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  checkRateLimit,
  generalApiLimiter,
  getRateLimitId,
} from "@/lib/rate-limit";
import { getCanonicalAppUrl, isProductionEnvironment } from "@/lib/env";

const DEFAULT_JSON_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonError(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    code ? { error: message, code } : { error: message },
    {
      status,
      headers: DEFAULT_JSON_HEADERS,
    }
  );
}

export function jsonOk<T>(body: T, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  Object.entries(DEFAULT_JSON_HEADERS).forEach(([key, value]) =>
    headers.set(key, value)
  );

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export async function enforceRateLimit(
  request: Request,
  limiter: Ratelimit | null = generalApiLimiter
): Promise<NextResponse | null> {
  if (!limiter && isProductionEnvironment()) {
    return jsonError(
      "Rate limiting is not configured",
      503,
      "RATE_LIMIT_UNAVAILABLE"
    );
  }

  const result = await checkRateLimit(limiter, getRateLimitId(request));
  if (
    result.success &&
    result.degraded &&
    isProductionEnvironment()
  ) {
    return jsonError(
      "Rate limiting is temporarily unavailable",
      503,
      "RATE_LIMIT_DEGRADED"
    );
  }

  if (result.success) {
    return null;
  }

  return buildRateLimitError();
}

function buildRateLimitError() {
  return jsonError(
    "Too many requests. Please slow down.",
    429,
    "RATE_LIMITED"
  );
}

function buildAllowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const requestOrigin = new URL(request.url).origin;
  origins.add(requestOrigin);

  const canonicalAppUrl = getCanonicalAppUrl();
  if (canonicalAppUrl) {
    origins.add(canonicalAppUrl);
  }

  if (!isProductionEnvironment()) {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return origins;
}

export function enforceTrustedOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) {
    return null;
  }

  if (buildAllowedOrigins(request).has(origin)) {
    return null;
  }

  return jsonError("Cross-origin request blocked", 403, "UNTRUSTED_ORIGIN");
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonError("Invalid JSON body", 400, "INVALID_JSON"),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const firstIssueRaw = parsed.error.issues[0]?.message?.trim();
    const firstIssue =
      firstIssueRaw === "Required" ? "required" : firstIssueRaw;
    return {
      ok: false,
      response: jsonError(
        firstIssue
          ? `Invalid request body: ${firstIssue}`
          : "Invalid request body",
        400,
        "VALIDATION_ERROR"
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export async function requireAuthenticatedUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { response: jsonError("Unauthorized", 401, "UNAUTHORIZED") };
    }

    return { supabase, user };
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return {
        response: jsonError(
          "Database access is not configured",
          503,
          "DEMO_MODE"
        ),
      };
    }

    return {
      response: jsonError(
        "Unable to connect to the database",
        500,
        "DATABASE_UNAVAILABLE"
      ),
    };
  }
}
