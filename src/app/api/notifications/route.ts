import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const rateLimitResult = await checkRateLimit(
    generalApiLimiter,
    getRateLimitId(request)
  );
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimitResult.reset - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Database access is not configured", code: "DEMO_MODE" },
        { status: 503 }
      );
    }
    console.error("[Notifications] Failed to create Supabase client:", error);
    return NextResponse.json(
      { error: "Unable to connect to the database" },
      { status: 500 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must be authenticated to view notifications" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const rawLimit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(1, rawLimit), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const rawOffset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

  let query = supabase
    .from("notifications")
    .select("id, type, title, body, metadata, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Notifications] Failed to fetch notifications:", error);
    return NextResponse.json(
      { error: "Unable to fetch notifications" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: data ?? [] });
}
