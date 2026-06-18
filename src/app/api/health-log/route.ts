import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

/**
 * Daily Health Log API.
 *
 * GET  /api/health-log?pet_id=...&limit=...  → recent logs for a pet (RLS-scoped)
 * POST /api/health-log                       → upsert today's (or given-date) log
 *
 * Auth + RLS + pet-ownership enforced, mirroring the journal / product-
 * intelligence routes. Demo mode (no Supabase) returns empty / 503 gracefully.
 */

const LogBodySchema = z.object({
  pet_id: z.string().uuid(),
  log_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  appetite: z.enum(["normal", "reduced", "none", "increased"]),
  water: z.enum(["normal", "less", "more"]),
  stool: z.enum(["normal", "soft", "diarrhea", "none", "blood"]),
  urination: z.enum(["normal", "less", "more", "straining", "none"]),
  vomiting_count: z.number().int().min(0).max(100),
  energy: z.enum(["normal", "low", "high"]),
  weight_kg: z.number().positive().max(200).nullable().optional(),
  meds_given: z.boolean(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rateLimited(request: Request) {
  return checkRateLimit(generalApiLimiter, getRateLimitId(request));
}

/**
 * Detect "table not applied yet" so the feature degrades gracefully until the
 * migration is run. Matches both the Postgres code (42P01) and PostgREST's
 * schema-cache miss (PGRST205), plus the human-readable fallbacks.
 */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /relation .* does not exist|could not find the table/i.test(
    error.message ?? "",
  );
}

export async function GET(request: Request) {
  const limit = await rateLimited(request);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const petIdParam = url.searchParams.get("pet_id");
  const petId = petIdParam && UUID_RE.test(petIdParam) ? petIdParam : null;
  const limitParam = Number(url.searchParams.get("limit") ?? "30");
  const rows = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), 90)
    : 30;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let query = supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("log_date", { ascending: false })
      .limit(rows);
    if (petId) {
      query = query.eq("pet_id", petId);
    }

    const { data, error } = await query;
    if (error) {
      // Table not applied yet → behave like demo (empty), don't 500.
      if (isMissingTable(error)) {
        return NextResponse.json({ data: [], code: "TABLE_MISSING" }, { status: 200 });
      }
      throw error;
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ data: [], code: "DEMO_MODE" });
    }
    console.error("[HealthLog] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limit = await rateLimited(request);
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = LogBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the pet belongs to this user before writing.
    const { data: pet, error: petError } = await supabase
      .from("pets")
      .select("id")
      .eq("id", parsed.data.pet_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (petError) throw petError;
    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    const row = {
      user_id: user.id,
      pet_id: parsed.data.pet_id,
      log_date: parsed.data.log_date ?? todayIso(),
      appetite: parsed.data.appetite,
      water: parsed.data.water,
      stool: parsed.data.stool,
      urination: parsed.data.urination,
      vomiting_count: parsed.data.vomiting_count,
      energy: parsed.data.energy,
      weight_kg: parsed.data.weight_kg ?? null,
      meds_given: parsed.data.meds_given,
      notes: parsed.data.notes ?? null,
    };

    // One log per pet per day — upsert so re-saving the same day updates it.
    const { data, error } = await supabase
      .from("daily_health_logs")
      .upsert(row, { onConflict: "user_id,pet_id,log_date" })
      .select()
      .single();
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Health log isn't set up yet.", code: "TABLE_MISSING" },
          { status: 503 },
        );
      }
      throw error;
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json(
        { error: "Database not configured", code: "DEMO_MODE" },
        { status: 503 },
      );
    }
    console.error("[HealthLog] POST failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
