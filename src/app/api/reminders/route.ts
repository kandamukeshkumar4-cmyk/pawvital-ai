import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generalApiLimiter, checkRateLimit, getRateLimitId } from "@/lib/rate-limit";
import { isMissingTable } from "@/lib/api/table-missing";

/**
 * Reminders API.
 *
 * GET  /api/reminders?pet_id=...&limit=...  → active reminders for the user
 *                                             (RLS-scoped), soonest-due first.
 * POST /api/reminders                       → create a reminder.
 *
 * Mirrors the health-log / notifications routes: auth + RLS enforced, demo mode
 * (no Supabase) and missing-table both degrade to empty/503 gracefully so the
 * dashboard and reminders page never 500.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateSchema = z.object({
  pet_id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["medication", "vet_appointment", "flea_tick", "vaccination", "custom"]).default("custom"),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly", "once"]).default("daily"),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  next_due: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function GET(request: Request) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const petId = url.searchParams.get("pet_id")?.trim() || null;
  const rows = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ data: [] });

    let query = supabase
      .from("reminders")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("next_due", { ascending: true, nullsFirst: false })
      .limit(rows);
    if (petId && UUID_RE.test(petId)) query = query.eq("pet_id", petId);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ data: [], code: "TABLE_MISSING" });
      throw error;
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ data: [], code: "DEMO_MODE" });
    }
    console.error("[Reminders] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify pet ownership before writing.
    const { data: pet } = await supabase
      .from("pets")
      .select("id")
      .eq("id", parsed.data.pet_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pet) return NextResponse.json({ error: "Pet not found" }, { status: 404 });

    const { data, error } = await supabase
      .from("reminders")
      .insert({
        user_id: user.id,
        pet_id: parsed.data.pet_id,
        title: parsed.data.title,
        type: parsed.data.type,
        frequency: parsed.data.frequency,
        time: parsed.data.time ?? null,
        next_due: parsed.data.next_due ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select()
      .single();
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ error: "Reminders aren't set up yet.", code: "TABLE_MISSING" }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ error: "Database not configured", code: "DEMO_MODE" }, { status: 503 });
    }
    console.error("[Reminders] POST failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
