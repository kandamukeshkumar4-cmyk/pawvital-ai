import { createServerSupabaseClient } from "@/lib/supabase-server";
import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import { brainPrioritySymptomsFromSignals } from "@/lib/dog-brain/question-priority";
import type { HealthLog } from "@/lib/health-log/types";

/**
 * Best-effort: load the owner's recent daily logs, detect Dog Brain signals, and
 * return the SUPPORTIVE symptom keys the symptom checker should consider as a
 * tiebreak when planning the next question.
 *
 * Safety contract (mirrors loadDogBrainContext):
 *  - Output is supportive background only — it can only surface an already-legal
 *    follow-up question, never invent one, never lower urgency / override red
 *    flags, and never override the current turn's complaint.
 *  - All errors are swallowed; an empty array means "no Brain preference", which
 *    leaves deterministic question selection byte-identical to its prior path.
 *  - Verifies pet ownership at the app layer regardless of RLS.
 */
export async function loadDogBrainPrioritySymptoms({
  userId,
  petId,
}: {
  userId: string | null;
  petId: string | null | undefined;
}): Promise<string[]> {
  if (!userId || !petId) return [];

  try {
    const supabase = await createServerSupabaseClient();

    const { data: owned } = await supabase
      .from("pets")
      .select("id")
      .eq("id", petId)
      .eq("user_id", userId)
      .limit(1);
    if (!owned || owned.length === 0) return [];

    const { data, error } = await supabase
      .from("daily_health_logs")
      .select("*")
      .eq("user_id", userId)
      .eq("pet_id", petId)
      .order("log_date", { ascending: false })
      .limit(14);
    if (error || !data) return [];

    const { signals } = detectDogBrainSignals(data as HealthLog[]);
    return brainPrioritySymptomsFromSignals(signals);
  } catch {
    return [];
  }
}
