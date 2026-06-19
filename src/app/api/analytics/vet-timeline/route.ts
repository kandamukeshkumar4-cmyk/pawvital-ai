import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generalApiLimiter, checkRateLimit, getRateLimitId } from "@/lib/rate-limit";
import { loadVetTimelineForPet } from "@/lib/analytics/vet-timeline-server";

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

    const result = await loadVetTimelineForPet(supabase, user.id, petIdParam);
    if (!result) {
      return NextResponse.json({ error: "Pet not found" }, { status: 404 });
    }

    return NextResponse.json({ data: result.timeline });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DEMO_MODE") {
      return NextResponse.json({ data: null, code: "DEMO_MODE" });
    }
    console.error("[VetTimeline] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
