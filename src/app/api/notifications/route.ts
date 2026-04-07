import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fieldsOnly = url.searchParams.get("fields") === "count";

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json({ notifications: [], unread_count: 0 });
    }
    throw error;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (fieldsOnly) {
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[notifications] count error:", error);
      return NextResponse.json({ unread_count: 0 });
    }

    return NextResponse.json({ unread_count: count ?? 0 });
  }

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, title, body, type, link_url, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[notifications] list error:", error);
    return NextResponse.json({ notifications: [], unread_count: 0 });
  }

  const notifications = rows ?? [];
  const unread_count = notifications.filter((n) => !n.read_at).length;

  return NextResponse.json({ notifications, unread_count });
}

export async function PATCH(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = json as { id?: string; read?: boolean };
  if (!body.id || body.read !== true) {
    return NextResponse.json({ error: "Expected { id, read: true }" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Not available in demo mode" }, { status: 503 });
    }
    throw error;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select("id, read_at")
    .maybeSingle();

  if (error) {
    console.error("[notifications] patch error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, notification: data });
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = json as { markAllRead?: boolean };
  if (body.markAllRead !== true) {
    return NextResponse.json({ error: "Expected { markAllRead: true }" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Not available in demo mode" }, { status: 503 });
    }
    throw error;
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[notifications] mark-all-read error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
