import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
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
      { error: "You must be authenticated to mark notifications as read" },
      { status: 401 }
    );
  }

  const { data: unreadNotifications, error: unreadError } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", user.id)
    .eq("read", false);

  if (unreadError) {
    console.error(
      "[Notifications] Failed to load unread notifications before mark-all-read:",
      unreadError
    );
    return NextResponse.json(
      { error: "Unable to mark notifications as read" },
      { status: 500 }
    );
  }

  const unreadCount = unreadNotifications?.length ?? 0;
  if (unreadCount === 0) {
    return NextResponse.json({
      success: true,
      updatedCount: 0,
      alreadyRead: true,
    });
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) {
    console.error("[Notifications] Failed to mark all as read:", error);
    return NextResponse.json(
      { error: "Unable to mark notifications as read" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    updatedCount: unreadCount,
    alreadyRead: false,
  });
}
