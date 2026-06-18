import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";

/**
 * Pure builders for the Health Signals tab — a status timeline from symptom
 * checks and a 7-day daily-signals grid from daily logs. Plain owner language;
 * never diagnostic.
 */

export type SignalTone = "good" | "watch" | "alert";

export interface TimelineStep {
  date: string;
  label: string;
  tone: SignalTone;
}

const URGENCY_STEP: Record<
  SymptomCheckEntry["urgency"],
  { label: string; tone: SignalTone }
> = {
  monitor: { label: "Monitor", tone: "good" },
  schedule: { label: "Plan vet", tone: "watch" },
  urgent: { label: "Call vet", tone: "watch" },
  emergency: { label: "Emergency", tone: "alert" },
};

/** Simple "the story so far" — urgency of each check over time, oldest→newest. */
export function buildStatusTimeline(
  entries: SymptomCheckEntry[],
  max = 6,
): TimelineStep[] {
  return [...entries]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-max)
    .map((e) => ({
      date: e.created_at.slice(0, 10),
      label: URGENCY_STEP[e.urgency].label,
      tone: URGENCY_STEP[e.urgency].tone,
    }));
}

export type CellState = "normal" | "changed" | "missing";

export interface SignalRow {
  key: string;
  label: string;
  cells: { date: string; state: CellState }[];
}

export interface DailySignalsGrid {
  dates: string[];
  rows: SignalRow[];
  /** True when at least one day in the window has a log. */
  hasData: boolean;
}

const SIGNAL_DEFS = [
  { key: "appetite", label: "Appetite" },
  { key: "water", label: "Water" },
  { key: "bathroom", label: "Bathroom" },
  { key: "energy", label: "Energy" },
  { key: "vomiting", label: "Vomiting" },
] as const;

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isOff(log: HealthLog, key: string): boolean {
  if (key === "bathroom") return log.stool !== "normal" || log.urination !== "normal";
  if (key === "vomiting") return log.vomiting_count > 0;
  return (log as unknown as Record<string, string>)[key] !== "normal";
}

/** 7-day (default) grid of daily signals: each cell is normal / changed / missing. */
export function buildDailySignalsGrid(
  logs: HealthLog[],
  now: Date,
  days = 7,
): DailySignalsGrid {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localDateString(d));
  }

  const byDate = new Map(logs.map((l) => [l.log_date, l] as const));
  const hasData = dates.some((d) => byDate.has(d));

  const rows: SignalRow[] = SIGNAL_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    cells: dates.map((date) => {
      const log = byDate.get(date);
      if (!log) return { date, state: "missing" as CellState };
      return { date, state: isOff(log, def.key) ? "changed" : "normal" };
    }),
  }));

  return { dates, rows, hasData };
}
