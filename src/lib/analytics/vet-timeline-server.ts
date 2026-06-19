import type { SupabaseClient } from "@supabase/supabase-js";
import { buildVetTimeline, type VetTimelineData } from "./vet-timeline";
import {
  symptomCheckRowToEntry,
  type SymptomCheckDbRow,
} from "@/lib/symptom-check-entry-map";
import type { HealthLog } from "@/lib/health-log/types";
import type { JournalEntry } from "@/types/journal";

/**
 * Owner-scoped server fetch for the vet timeline. Verifies pet ownership, pulls
 * symptom checks + daily logs + journal entries, and builds the VetTimelineData.
 * Shared by the JSON route and the PDF export so they can't drift.
 *
 * Returns null when the pet isn't owned by the user (caller maps to 404).
 */
export async function loadVetTimelineForPet(
  supabase: SupabaseClient,
  userId: string,
  petId: string,
): Promise<{ petName: string; timeline: VetTimelineData } | null> {
  const { data: pet } = await supabase
    .from("pets")
    .select("id, name")
    .eq("id", petId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!pet) return null;

  const petName = (pet.name as string) ?? "Dog";

  const [checksResult, logsResult, journalResult] = await Promise.all([
    supabase
      .from("symptom_checks")
      .select("id, pet_id, symptoms, ai_response, severity, recommendation, created_at")
      .eq("pet_id", petId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .order("log_date", { ascending: false })
      .limit(90),
    supabase
      .from("journal_entries")
      .select(
        "id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary, photo_urls, created_at",
      )
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .order("entry_date", { ascending: false })
      .limit(30),
  ]);

  const checks = (checksResult.data ?? []).map((row) =>
    symptomCheckRowToEntry(row as SymptomCheckDbRow, petName),
  );
  const logs = (logsResult.data ?? []) as HealthLog[];
  const journal = (journalResult.data ?? []) as JournalEntry[];

  const timeline = buildVetTimeline({ checks, logs, journal, petName });
  return { petName, timeline };
}
