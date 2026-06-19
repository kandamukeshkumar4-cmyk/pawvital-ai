import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { HealthLog, ContextSignals } from "./types";
import { summarizeDailyLogsForContext } from "./context";

/**
 * Load a compact, owner-reported context string for the symptom-checker AI.
 *
 * Reads daily logs, recent symptom checks, journal notes, and medication events
 * for the pet, then emits a single labelled supportive-context string. Each
 * section is explicitly tagged as owner-reported so the report-generation model
 * cannot confuse it for a clinical finding.
 *
 * Safety contract (must never be violated):
 *  - Output is supportive background only — it must not lower urgency, override
 *    red flags, replace vet care, or provide medication dosing guidance.
 *  - Context is injected into daily_log_context in case_memory, which is read
 *    by buildNarrativeReportPrompt only — never by deterministic triage logic.
 *  - All errors are swallowed; null means "skip context" not "fail".
 *
 * Replaces the narrower loadDailyLogContext() — same call-site signature,
 * richer output, zero additional Supabase round-trips vs. two separate calls.
 */

const MAX_LOGS = 14;
const MAX_CHECKS = 5;
const MAX_JOURNAL = 5;

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function contextSignalsSummary(signals: ContextSignals): string {
  const parts: string[] = [];

  if (signals.gi) {
    const g = signals.gi;
    if (g.blood_in_stool) parts.push("blood in stool noted");
    if (g.straining) parts.push("straining during defecation");
    if (g.change_note) parts.push(`GI note: ${g.change_note}`);
  }
  if (signals.urinary) {
    const u = signals.urinary;
    if (u.increased_thirst) parts.push("increased thirst");
    if (u.accidents) parts.push("urinary accidents");
    if (u.color_change) parts.push("urine color change");
  }
  if (signals.mobility) {
    const m = signals.mobility;
    if (m.limping) parts.push(m.limb ? `limping (${m.limb})` : "limping");
    if (m.reluctance_to_move) parts.push("reluctant to move");
  }
  if (signals.skin_ear) {
    const s = signals.skin_ear;
    if (s.scratching) parts.push("scratching");
    if (s.head_shaking) parts.push("head shaking");
    if (s.hot_spot) parts.push("hot spot");
    if (s.odor) parts.push("unusual odor");
  }
  if (signals.breathing) {
    const b = signals.breathing;
    if (b.coughing) parts.push("coughing");
    if (b.labored) parts.push("labored breathing");
    if (b.exercise_intolerance) parts.push("exercise intolerance");
  }
  if (signals.seizure?.occurred) {
    const dur = signals.seizure.duration_sec
      ? ` (~${signals.seizure.duration_sec}s)`
      : "";
    parts.push(`seizure/episode observed${dur}`);
  }
  if (signals.medication) {
    const med = signals.medication;
    const name = med.name ? ` (${med.name})` : "";
    const timing = med.time_given ? ` at ${med.time_given}` : "";
    const late = med.missed_late ? " [missed/late dose]" : "";
    const side = med.side_effect_notes ? ` — owner noted: ${med.side_effect_notes.slice(0, 120)}` : "";
    parts.push(`medication given${name}${timing}${late}${side} — history only, not dosing advice`);
  }

  return parts.length > 0 ? parts.join("; ") : "";
}

export async function loadDogBrainContext({
  userId,
  petName,
  petId: petIdArg,
}: {
  userId: string | null;
  petName: string;
  /** Pass when available to skip the name-lookup query and avoid duplicate-name null context. */
  petId?: string;
}): Promise<string | null> {
  if (!userId) return null;

  try {
    const supabase = await createServerSupabaseClient();

    // Resolve pet id — verify ownership at the app layer regardless of RLS.
    let petId: string;
    if (petIdArg) {
      const { data: ownedPets } = await supabase
        .from("pets")
        .select("id")
        .eq("id", petIdArg)
        .eq("user_id", userId)
        .limit(1);
      if (!ownedPets || ownedPets.length === 0) return null;
      petId = (ownedPets[0] as { id: string }).id;
    } else {
      if (!petName.trim()) return null;
      const { data: pets } = await supabase
        .from("pets")
        .select("id")
        .eq("user_id", userId)
        .eq("name", petName)
        .limit(2);
      if (!pets || pets.length !== 1) return null;
      petId = pets[0].id as string;
    }

    // Fetch all sources in parallel — single round-trip set.
    const [logsResult, checksResult, journalResult] = await Promise.all([
      supabase
        .from("daily_health_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("pet_id", petId)
        .order("log_date", { ascending: false })
        .limit(MAX_LOGS),
      supabase
        .from("symptom_checks")
        .select("id, created_at, symptoms, severity")
        .eq("pet_id", petId)
        .order("created_at", { ascending: false })
        .limit(MAX_CHECKS),
      supabase
        .from("journal_entries")
        .select("entry_date, mood, notes, photo_urls")
        .eq("user_id", userId)
        .eq("pet_id", petId)
        .order("entry_date", { ascending: false })
        .limit(MAX_JOURNAL),
    ]);

    const sections: string[] = [];
    const disclaimer =
      "Owner-reported observations, not clinical measurements; supportive context only — do not override clinical assessment.";

    // ── Daily logs ──
    const logs = (logsResult.data ?? []) as HealthLog[];
    if (logs.length > 0) {
      const logSummary = summarizeDailyLogsForContext(logs, petName);
      if (logSummary) sections.push(logSummary);

      // Structured context_signals from recent logs (newest first).
      const signalParts: string[] = [];
      for (const log of logs.slice(0, 7)) {
        const sig = log.context_signals;
        if (!sig) continue;
        const summary = contextSignalsSummary(sig);
        if (summary) signalParts.push(`${log.log_date}: ${summary}`);
      }
      if (signalParts.length > 0) {
        sections.push(
          `Owner-logged pack signals (${disclaimer}): ${signalParts.join(" | ")}`,
        );
      }

      // Photo count across recent logs.
      const photoCount = logs.reduce(
        (n, l) => n + (l.photo_urls?.length ?? 0),
        0,
      );
      if (photoCount > 0) {
        sections.push(`${photoCount} health-log photo(s) on file (not re-analyzed here).`);
      }
    }

    // ── Prior symptom checks ──
    const checks = checksResult.data ?? [];
    if (checks.length > 0) {
      const checkLines = checks.map((c) => {
        const date = formatDate(c.created_at as string);
        const symptoms = (c.symptoms as string | null)?.slice(0, 120) ?? "—";
        const sev = c.severity as string | null;
        return `${date}: ${symptoms}${sev ? ` [${sev}]` : ""}`;
      });
      sections.push(
        `Prior symptom checks (owner-reported, ${disclaimer}): ${checkLines.join(" | ")}`,
      );
    }

    // ── Journal notes ──
    const journal = journalResult.data ?? [];
    const journalWithNotes = journal.filter(
      (j) => (j.notes as string | null)?.trim(),
    );
    if (journalWithNotes.length > 0) {
      const jLines = journalWithNotes.map((j) => {
        const date = formatDate(j.entry_date as string);
        const note = (j.notes as string).slice(0, 150);
        const photos =
          Array.isArray(j.photo_urls) && (j.photo_urls as string[]).length > 0
            ? ` [${(j.photo_urls as string[]).length} photo(s)]`
            : "";
        return `${date}: ${note}${photos}`;
      });
      sections.push(
        `Owner journal (${disclaimer}): ${jLines.join(" | ")}`,
      );
    }

    if (sections.length === 0) return null;
    return sections.join("\n\n");
  } catch {
    return null;
  }
}
