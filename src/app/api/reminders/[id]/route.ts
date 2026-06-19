import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generalApiLimiter, checkRateLimit, getRateLimitId } from "@/lib/rate-limit";

/**
 * Single-reminder operations.
 *
 * PATCH  /api/reminders/[id]  → update (title, is_active, next_due, notes, time).
 *                               Used for "complete" (advance next_due) and edits.
 * DELETE /api/reminders/[id]  → remove a reminder.
 *
 * Auth + RLS: only the owner's rows can be touched (filtered by user_id).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    is_active: z.boolean().optional(),
    next_due: z.string().datetime({ offset: true }).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  })
  .strict();

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("reminders")
      .update(parsed.data)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Database not configured", code: "DEMO_MODE" }, { status: 503 });
    }
    console.error("[Reminders] PATCH failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { error } = await supabase.from("reminders").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Database not configured", code: "DEMO_MODE" }, { status: 503 });
    }
    console.error("[Reminders] DELETE failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
