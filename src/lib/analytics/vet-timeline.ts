import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";
import type { JournalEntry } from "@/types/journal";
import { SELECT_FIELDS } from "@/lib/health-log/types";

/**
 * Vet Timeline — a chronological, vet-ready story from all owner data sources.
 *
 * Pure and side-effect free. Takes already-fetched data; the server route owns
 * fetching. Output is owner language only: never a diagnosis, never a verdict,
 * always with "what to tell the vet" framing.
 */

export type VetTimelineSource =
  | "symptom_check"
  | "daily_log"
  | "journal"
  | "medication";

export type VetTimelineTone = "normal" | "changed" | "alert";

export interface VetTimelineEntry {
  /** YYYY-MM-DD */
  date: string;
  source: VetTimelineSource;
  /** One-line plain owner summary with source label */
  summary: string;
  tone: VetTimelineTone;
  /** Optional detail bullets (what changed, what to tell the vet) */
  details: string[];
  /** True when this entry has photos attached */
  hasPhotos: boolean;
}

/** What to tell the vet about a given urgency level. */
const URGENCY_VET_NOTE: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "Watch at home — mention at next routine visit.",
  schedule: "Worth booking a vet visit.",
  urgent: "Flagged as needing same-day vet input.",
  emergency: "Emergency care was recommended.",
};

const URGENCY_TONE: Record<SymptomCheckEntry["urgency"], VetTimelineTone> = {
  monitor: "normal",
  schedule: "changed",
  urgent: "alert",
  emergency: "alert",
};

function symptomCheckEntry(e: SymptomCheckEntry): VetTimelineEntry {
  const symptom = (e.primary_symptom ?? "").trim() || "Symptom check";
  return {
    date: e.created_at.slice(0, 10),
    source: "symptom_check",
    summary: `Symptom check: ${symptom}`,
    tone: URGENCY_TONE[e.urgency],
    details: [
      `Urgency: ${e.urgency} — ${URGENCY_VET_NOTE[e.urgency]}`,
      `Severity logged: ${e.severity}`,
    ],
    hasPhotos: false,
  };
}

function dailyLogEntries(log: HealthLog): VetTimelineEntry[] {
  const offSigns: string[] = [];
  let worstTone: VetTimelineTone = "normal";

  for (const def of SELECT_FIELDS) {
    const value = (log as unknown as Record<string, string>)[def.key];
    if (value === "normal") continue;
    const opt = def.options.find((o) => o.value === value);
    if (!opt) continue;
    offSigns.push(`${def.label}: ${opt.label}`);
    if (opt.tone === "alert") worstTone = "alert";
    else if (opt.tone === "watch" && worstTone !== "alert") worstTone = "changed";
  }

  if (log.vomiting_count > 0) {
    offSigns.push(`Vomiting: ${log.vomiting_count} time(s)`);
    if (worstTone !== "alert") worstTone = "changed";
  }

  // Context signals — from structured pack data.
  const signals: string[] = [];
  const cs = log.context_signals;
  if (cs) {
    if (cs.gi?.blood_in_stool) { signals.push("Blood in stool"); worstTone = "alert"; }
    if (cs.gi?.straining) { signals.push("Straining"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.urinary?.accidents) { signals.push("Urinary accidents"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.urinary?.increased_thirst) { signals.push("Increased thirst"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.mobility?.limping) { signals.push(cs.mobility.limb ? `Limping (${cs.mobility.limb})` : "Limping"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.skin_ear?.scratching) signals.push("Scratching");
    if (cs.skin_ear?.head_shaking) signals.push("Head shaking");
    if (cs.skin_ear?.hot_spot) { signals.push("Hot spot"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.breathing?.coughing) { signals.push("Coughing"); if (worstTone !== "alert") worstTone = "changed"; }
    if (cs.breathing?.labored) { signals.push("Labored breathing"); worstTone = "alert"; }
    if (cs.seizure?.occurred) { signals.push("Episode/seizure observed"); worstTone = "alert"; }
  }

  // Always emit the log, even when all normal (so the vet sees the full picture).
  const allNormal = offSigns.length === 0 && signals.length === 0;
  const parts = [...offSigns, ...signals];

  const details: string[] = [];
  if (parts.length > 0) details.push(...parts.map((s) => `Changed from normal: ${s}`));
  if (log.notes?.trim()) details.push(`Owner note: ${log.notes.trim()}`);
  if (log.weight_kg != null) details.push(`Weight logged: ${log.weight_kg.toFixed(1)} kg`);

  const medEntry: VetTimelineEntry[] = [];
  if (cs?.medication?.name || log.meds_given) {
    const medName = cs?.medication?.name ?? "medication";
    const doseNote = cs?.medication?.dose_notes ? ` — ${cs.medication.dose_notes}` : "";
    medEntry.push({
      date: log.log_date,
      source: "medication",
      summary: `Medication given: ${medName}${doseNote} (history only — not dosing advice)`,
      tone: "normal",
      details: [],
      hasPhotos: false,
    });
  }

  const logEntry: VetTimelineEntry = {
    date: log.log_date,
    source: "daily_log",
    summary: allNormal
      ? "Daily check-in: all signs normal"
      : `Daily check-in: ${parts.slice(0, 2).join(", ")}${parts.length > 2 ? ` +${parts.length - 2} more` : ""}`,
    tone: worstTone,
    details,
    hasPhotos: (log.photo_urls?.length ?? 0) > 0,
  };

  return [logEntry, ...medEntry];
}

function journalEntry(j: JournalEntry): VetTimelineEntry | null {
  if (!j.notes?.trim() && !j.photo_urls?.length) return null;
  const mood = j.mood ? ` (mood: ${j.mood})` : "";
  const note = j.notes?.trim().slice(0, 200) ?? "";
  return {
    date: j.entry_date,
    source: "journal",
    summary: `Owner journal${mood}${note ? `: ${note}` : ""}`,
    tone: j.mood === "sick" ? "alert" : j.mood === "low" ? "changed" : "normal",
    details: j.photo_urls?.length ? [`${j.photo_urls.length} photo(s) attached`] : [],
    hasPhotos: (j.photo_urls?.length ?? 0) > 0,
  };
}

export interface VetTimelineData {
  entries: VetTimelineEntry[];
  /** One-sentence "what to tell the vet" summary built from the most notable entry. */
  vetSummary: string;
  /** Recurring symptoms (appeared in 2+ checks). */
  recurringSymptoms: string[];
  /** Things to log next based on the pattern. */
  logNext: string[];
}

export function buildVetTimeline({
  checks,
  logs,
  journal,
  petName,
}: {
  checks: SymptomCheckEntry[];
  logs: HealthLog[];
  journal: JournalEntry[];
  petName: string;
}): VetTimelineData {
  const all: VetTimelineEntry[] = [];

  for (const e of checks) all.push(symptomCheckEntry(e));
  for (const l of logs) all.push(...dailyLogEntries(l));
  for (const j of journal) {
    const e = journalEntry(j);
    if (e) all.push(e);
  }

  // Chronological newest-first for the timeline display.
  all.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  // Recurring symptoms from check history.
  const symptomCounts = new Map<string, number>();
  for (const e of checks) {
    const s = (e.primary_symptom ?? "").trim().toLowerCase();
    if (s) symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
  }
  const recurringSymptoms = [...symptomCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([s]) => s);

  // Vet summary from the most notable recent entry.
  const mostAlert = all.find((e) => e.tone === "alert");
  const mostChanged = all.find((e) => e.tone === "changed");
  const notable = mostAlert ?? mostChanged ?? all[0];
  const vetSummary = notable
    ? `Tell your vet: ${notable.summary}${recurringSymptoms.length > 0 ? `. Also mention recurring ${recurringSymptoms.slice(0, 2).join(" and ")}.` : "."}`
    : `No recent signs logged for ${petName}.`;

  // "Log next" prompts based on current pattern.
  const logNext: string[] = [];
  const hasAlert = all.some((e) => e.tone === "alert");
  const hasChanged = all.some((e) => e.tone === "changed");
  if (hasAlert) logNext.push("Log how your dog is doing today — your vet will want to know if things improve or worsen.");
  if (hasChanged) logNext.push("Keep noting changes in appetite, energy, and bathroom habits.");
  if (recurringSymptoms.length > 0)
    logNext.push(`Track whether ${recurringSymptoms[0]} comes back and how long each episode lasts.`);
  if (all.some((e) => e.hasPhotos)) logNext.push("Add a photo today if there are visible signs.");
  if (logNext.length === 0) logNext.push("Everything looks normal — keep checking in weekly.");

  return { entries: all, vetSummary, recurringSymptoms, logNext };
}
