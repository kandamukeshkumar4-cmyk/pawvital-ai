import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json(
      { error: "Invalid notification id" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as Record<string, unknown>).read !== true
  ) {
    return NextResponse.json(
      { error: "Only { read: true } is supported" },
      { status: 400 }
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
      { error: "You must be authenticated to update a notification" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, read")
    .maybeSingle();

  if (error) {
    console.error("[Notifications] Failed to update notification:", error);
    return NextResponse.json(
      { error: "Unable to update notification" },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Notification not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data });
}
