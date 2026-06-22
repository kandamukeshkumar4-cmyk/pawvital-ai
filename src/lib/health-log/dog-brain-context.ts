import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { HealthLog, ContextSignals } from "./types";
import {
  summarizeDailyLogsForContext,
  summarizeFollowupsForContext,
  type FollowupContextRow,
} from "./context";
import { detectDogBrainSignals } from "@/lib/dog-brain/signals";
import { brainPrioritySymptomsFromSignals } from "@/lib/dog-brain/question-priority";

export interface DogBrainContextData {
  /** Supportive narrative for the report prompt; null = skip context. */
  context: string | null;
  /** Recurring-signal symptom keys for the symptom-checker question tiebreak. */
  prioritySymptoms: string[];
}

const EMPTY_DOG_BRAIN_DATA: DogBrainContextData = {
  context: null,
  prioritySymptoms: [],
};

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

// 90-day Dog Brain memory window (supportive report context only — never feeds
// deterministic triage/urgency). Roughly one log/day → ~90 logs covers 90 days.
const MAX_LOGS = 90;
const MAX_CHECKS = 30;
const MAX_JOURNAL = 30;

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

export async function loadDogBrainContextWithSignals({
  userId,
  petName,
  petId: petIdArg,
}: {
  userId: string | null;
  petName: string;
  /** Pass when available to skip the name-lookup query and avoid duplicate-name null context. */
  petId?: string;
}): Promise<DogBrainContextData> {
  if (!userId) return EMPTY_DOG_BRAIN_DATA;

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
      if (!ownedPets || ownedPets.length === 0) return EMPTY_DOG_BRAIN_DATA;
      petId = (ownedPets[0] as { id: string }).id;
    } else {
      if (!petName.trim()) return EMPTY_DOG_BRAIN_DATA;
      const { data: pets } = await supabase
        .from("pets")
        .select("id")
        .eq("user_id", userId)
        .eq("name", petName)
        .limit(2);
      if (!pets || pets.length !== 1) return EMPTY_DOG_BRAIN_DATA;
      petId = pets[0].id as string;
    }

    // Fetch all sources in parallel — single round-trip set. The vet-record
    // query is best-effort: a missing table returns {data:null} (never throws),
    // so it degrades cleanly until the migration is applied.
    const [
      logsResult,
      checksResult,
      journalResult,
      vetRecordsResult,
      followupsResult,
    ] = await Promise.all([
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
        supabase
          .from("vet_record_summaries")
          .select("file_name, context_text, created_at")
          .eq("user_id", userId)
          .eq("pet_id", petId)
          .order("created_at", { ascending: false })
          .limit(5),
        // Active-concern pack: pending follow-ups + recent owner outcomes
        // (better/worse/same) so an owner's answer feeds back into Brain
        // reasoning. Best-effort — a missing table returns {data:null}.
        supabase
          .from("dog_brain_followups")
          .select("prompt, status, due_at, updated_at, created_at")
          .eq("user_id", userId)
          .eq("pet_id", petId)
          .order("updated_at", { ascending: false })
          .limit(20),
      ]);

    const sections: string[] = [];
    const disclaimer =
      "Owner-reported observations, not clinical measurements; supportive context only — do not override clinical assessment.";

    // ── Daily logs ──
    const logs = (logsResult.data ?? []) as HealthLog[];
    if (logs.length > 0) {
      // Long-window (full 90-day) trend summary — not just the last 14 days.
      const logSummary = summarizeDailyLogsForContext(logs, petName, MAX_LOGS);
      if (logSummary) sections.push(logSummary);

      // Pack signals from the recent window (last ~14 days, newest first) — the
      // detailed GI/urinary/mobility/etc. notes that matter most right now.
      const RECENT_PACK_WINDOW = 14;
      const signalParts: string[] = [];
      for (const log of logs.slice(0, RECENT_PACK_WINDOW)) {
        const sig = log.context_signals;
        if (!sig) continue;
        const summary = contextSignalsSummary(sig);
        if (summary) signalParts.push(`${log.log_date}: ${summary}`);
      }
      if (signalParts.length > 0) {
        sections.push(
          `Owner-logged pack signals — recent ${RECENT_PACK_WINDOW} days (${disclaimer}): ${signalParts.join(" | ")}`,
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

    // ── Imported vet records (#3) ──
    const vetRecords = (vetRecordsResult.data ?? []) as Array<{
      file_name: string | null;
      context_text: string | null;
      created_at: string;
    }>;
    if (vetRecords.length > 0) {
      const vrLines = vetRecords.map((v) => {
        const date = formatDate(v.created_at);
        const snippet = (v.context_text ?? "").replace(/\s+/g, " ").slice(0, 220);
        return `${date} — ${v.file_name ?? "vet record"}${snippet ? `: ${snippet}` : ""}`;
      });
      sections.push(
        `Imported vet records (extracted from owner-uploaded documents; ${disclaimer}):\n${vrLines.join("\n")}`,
      );
    }

    // ── Follow-up loop (#E: owner outcomes feed Brain reasoning) ──
    const followups = (followupsResult.data ?? []) as FollowupContextRow[];
    const followupSummary = summarizeFollowupsForContext(followups, petName);
    if (followupSummary) sections.push(followupSummary);

    // Recurring-signal symptom keys for the symptom-checker question tiebreak,
    // derived from the SAME logs already loaded above (detectDogBrainSignals
    // uses the 14 newest internally) — no extra query, no duplicate ownership
    // check. Replaces the former standalone loadDogBrainPrioritySymptoms loader.
    const prioritySymptoms = brainPrioritySymptomsFromSignals(
      detectDogBrainSignals(logs).signals,
    );

    return {
      context: sections.length === 0 ? null : sections.join("\n\n"),
      prioritySymptoms,
    };
  } catch {
    return EMPTY_DOG_BRAIN_DATA;
  }
}

/**
 * Backwards-compatible string view — the supportive narrative only. Used by the
 * report path (and tests) that don't need the question-planning priority keys.
 */
export async function loadDogBrainContext(args: {
  userId: string | null;
  petName: string;
  petId?: string;
}): Promise<string | null> {
  return (await loadDogBrainContextWithSignals(args)).context;
}
