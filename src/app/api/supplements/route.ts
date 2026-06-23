import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  generalApiLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import { isMissingTable } from "@/lib/api/table-missing";

/**
 * Tracked Supplements API.
 *
 * GET /api/supplements?pet_id=...  → a pet's tracked supplement rows (RLS-scoped)
 *
 * Auth + RLS enforced, mirroring the daily health-log route. Demo mode (no
 * Supabase) returns an empty list gracefully, and a not-yet-applied table or
 * column degrades to empty instead of 500-ing so the page falls back to the
 * AI-generated plan.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detect a missing COLUMN (Postgres 42703 / PostgREST PGRST204 schema-cache
 * miss) so the `notes` / `created_at` columns degrading to empty behaves like a
 * missing table rather than 500-ing before the migration is applied.
 */
function isMissingColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(
    error.message ?? "",
  );
}

export async function GET(request: Request) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const petIdParam = url.searchParams.get("pet_id");
  if (!petIdParam || !UUID_RE.test(petIdParam)) {
    return NextResponse.json(
      { error: "Invalid or missing pet_id", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  const petId = petIdParam;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("supplements")
      .select(
        "id,name,purpose,dosage,frequency,brand,notes,priority,is_active,created_at",
      )
      .eq("pet_id", petId)
      .order("created_at", { ascending: false });

    if (error) {
      // Table/column not applied yet → behave like demo (empty), don't 500.
      if (isMissingTable(error) || isMissingColumn(error)) {
        return NextResponse.json({ data: [] });
      }
      throw error;
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ data: [] });
    }
    console.error("[Supplements] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
