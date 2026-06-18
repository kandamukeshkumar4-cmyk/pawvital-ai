import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { HealthLog } from "./types";
import { summarizeDailyLogsForContext } from "./context";

/**
 * Load a compact owner-reported daily-log summary for the symptom-checker AI.
 *
 * Best-effort and fully graceful: returns null in demo mode, when the table
 * isn't applied, when the pet can't be resolved, or on any error — the symptom
 * checker must never fail because logs are unavailable. RLS still scopes the
 * read to the authenticated owner; we also filter by user_id + pet_id.
 */
export async function loadDailyLogContext({
  userId,
  petName,
}: {
  userId: string | null;
  petName: string;
}): Promise<string | null> {
  if (!userId || !petName.trim()) return null;
  try {
    const supabase = await createServerSupabaseClient();

    // Resolve the pet by name. Only inject when the name maps to EXACTLY one
    // pet — if the owner has two same-named pets we skip rather than risk
    // mixing a sibling's logs into another pet's report.
    const { data: pets } = await supabase
      .from("pets")
      .select("id")
      .eq("user_id", userId)
      .eq("name", petName)
      .limit(2);
    if (!pets || pets.length !== 1) return null;
    const petId = pets[0].id as string;

    const { data: logs, error } = await supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .order("log_date", { ascending: false })
      .limit(14);
    if (error || !logs || logs.length === 0) return null;

    const summary = summarizeDailyLogsForContext(logs as HealthLog[], petName);
    return summary || null;
  } catch {
    return null;
  }
}
