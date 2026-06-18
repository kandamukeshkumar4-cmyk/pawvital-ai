import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generalApiLimiter, checkRateLimit, getRateLimitId } from "@/lib/rate-limit";
import { buildVetTimeline } from "@/lib/analytics/vet-timeline";
import { symptomCheckRowToEntry, type SymptomCheckDbRow } from "@/lib/symptom-check-entry-map";
import type { HealthLog } from "@/lib/health-log/types";
import type { JournalEntry } from "@/types/journal";

/**
 * GET /api/analytics/vet-timeline?pet_id=...
 *
 * Fetches symptom checks + daily logs + journal entries for a pet and returns
 * a chronological VetTimelineData payload. Auth + RLS enforced; demo-safe.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const limit = await checkRateLimit(generalApiLimiter, getRateLimitId(request));
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const petIdParam = url.searchParams.get("pet_id");
  if (!petIdParam || !UUID_RE.test(petIdParam)) {
    return NextResponse.json({ error: "pet_id required" }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify pet ownership before fetching data.
    const { data: pet } = await supabase
      .from("pets")
      .select("id, name")
      .eq("id", petIdParam)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pet) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    // Fetch all three sources in parallel.
    const [checksResult, logsResult, journalResult] = await Promise.all([
      supabase
        .from("symptom_checks")
        .select("id, pet_id, symptoms, ai_response, severity, recommendation, created_at")
        .eq("pet_id", petIdParam)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("daily_health_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("pet_id", petIdParam)
        .order("log_date", { ascending: false })
        .limit(30),
      supabase
        .from("journal_entries")
        .select("id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary, photo_urls, created_at")
        .eq("user_id", user.id)
        .eq("pet_id", petIdParam)
        .order("entry_date", { ascending: false })
        .limit(10),
    ]);

    const petNameById = new Map([[pet.id as string, pet.name as string]]);
    const checks = (checksResult.data ?? []).map((row) =>
      symptomCheckRowToEntry(row as SymptomCheckDbRow, petNameById.get(petIdParam) ?? "Dog"),
    );
    const logs = (logsResult.data ?? []) as HealthLog[];
    const journal = (journalResult.data ?? []) as JournalEntry[];

    const timeline = buildVetTimeline({
      checks,
      logs,
      journal,
      petName: pet.name as string,
    });

    return NextResponse.json({ data: timeline });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ data: null, code: "DEMO_MODE" });
    }
    console.error("[VetTimeline] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
