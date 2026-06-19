import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { HealthLog } from "@/lib/health-log/types";

/**
 * Health Signals board — the owner-facing "health evidence" model.
 *
 * This is a *presentation* layer only. It re-phrases what the owner has already
 * logged (symptom checks + daily logs) into a plain-language story that answers
 * four questions:
 *   1. What changed from my dog's normal?
 *   2. Is it getting better or worse?
 *   3. What should I log next?
 *   4. What should I tell the vet?
 *
 * It never makes a medical decision. The decision state still comes straight
 * from the latest symptom check's deterministic `urgency` (see owner-readout).
 * Everything here is derived from owner-logged values; nothing diagnoses, and
 * the vet path is always kept open.
 */

export type SignalTone = "good" | "watch" | "alert" | "info" | "muted";
export type ChangeDirection = "worse" | "better" | "none";

/** One day's reading of one signal in the 7-day grid. */
export interface SignalCell {
  /** YYYY-MM-DD */
  date: string;
  /** Plain label, e.g. "Normal", "Reduced", "Diarrhea", "Given", "—". */
  label: string;
  tone: SignalTone;
  /** False when nothing was logged that day. */
  logged: boolean;
}

export interface SignalRow {
  key: string;
  label: string;
  cells: SignalCell[];
  /** Recent vs earlier change across the window. */
  change: ChangeDirection;
}

export interface GridDay {
  /** YYYY-MM-DD */
  date: string;
  /** "Sat" */
  weekday: string;
  /** "May 11" */
  monthDay: string;
  isToday: boolean;
}

export interface SignalGridModel {
  days: GridDay[];
  rows: SignalRow[];
  /** True when at least one day in the window has a log. */
  hasData: boolean;
}

/** A single "changed from normal" item for the top insight tile. */
export interface ChangedSignal {
  label: string;
  value: string;
  tone: SignalTone;
  /** Glyph hint for the UI: down = lower/less, up = higher/more, flag = abnormal. */
  arrow: "down" | "up" | "flag";
}

export interface EvidenceCounts {
  symptomChecks: number;
  dailyLogs: number;
  photos: number;
}

export interface NextBestLog {
  /** Short headline, e.g. "Food, stool, vomiting, energy". */
  title: string;
  /** When to do it, e.g. "tonight". */
  when: string;
  /** Reassuring one-liner. */
  detail: string;
}

export type TimelineSource =
  | "symptom_check"
  | "daily_log"
  | "journal"
  | "medication"
  | "photo";

export interface TimelineEvent {
  /** YYYY-MM-DD */
  date: string;
  /** "May 13" */
  monthDay: string;
  source: TimelineSource;
  title: string;
  detail: string;
  tone: SignalTone;
}

export interface TrendPoint {
  date: string;
  /** Bar magnitude, 0..1 (higher = more notable / more concerning). */
  magnitude: number;
  /** Display value for the point, e.g. "Reduced", "2×", "12.4 kg". */
  label: string;
  tone: SignalTone;
  /** True when nothing was logged that day. */
  empty: boolean;
}

export interface TrendCard {
  key: string;
  label: string;
  points: TrendPoint[];
  change: ChangeDirection;
  /** Plain-language change label, e.g. "Trending down", "Stable". */
  changeLabel: string;
  /** One-line caption under the sparkline. */
  caption: string;
  /** True for weight — rendered as a value line, not severity bars. */
  isMeasure: boolean;
}

export interface VetPacketModel {
  /** Owner-language bullets — the "what to tell the vet" list. */
  bullets: string[];
  /** Footer line, e.g. "Based on 1 symptom check and 2 daily logs." */
  basedOn: string;
  /** Plain-text block for the clipboard / share. */
  copyText: string;
}

export interface LogNextItem {
  label: string;
  why: string;
  when: string;
}

export interface HealthBoardModel {
  petName: string;
  /** Friendly "Last checked" line, or null when there are no checks. */
  lastCheckedLabel: string | null;
  changedFromNormal: ChangedSignal[];
  evidence: EvidenceCounts;
  nextBestLog: NextBestLog;
  grid: SignalGridModel;
  timeline: TimelineEvent[];
  trends: TrendCard[];
  vetPacket: VetPacketModel;
  logNext: LogNextItem[];
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "May 11" from a YYYY-MM-DD string (parsed as a local calendar date). */
function monthDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
  if (!y || !m || !d) return dateStr;
  return `${MONTHS[m - 1]} ${d}`;
}

function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((p) => parseInt(p, 10));
  const date = new Date(y, m - 1, d);
  return WEEKDAYS[date.getDay()];
}

/** good=0, watch=1, alert=2. info/muted contribute nothing to severity math. */
function toneScore(tone: SignalTone): number | null {
  switch (tone) {
    case "good":
      return 0;
    case "watch":
      return 1;
    case "alert":
      return 2;
    default:
      return null;
  }
}

type CellRead = { label: string; tone: SignalTone };

function appetiteRead(v: string): CellRead {
  switch (v) {
    case "reduced":
      return { label: "Reduced", tone: "watch" };
    case "none":
      return { label: "None", tone: "alert" };
    case "increased":
      return { label: "Increased", tone: "watch" };
    default:
      return { label: "Normal", tone: "good" };
  }
}

function waterRead(v: string): CellRead {
  switch (v) {
    case "less":
      return { label: "Less", tone: "watch" };
    case "more":
      return { label: "More", tone: "watch" };
    default:
      return { label: "Normal", tone: "good" };
  }
}

function stoolRead(v: string): CellRead {
  switch (v) {
    case "soft":
      return { label: "Soft", tone: "watch" };
    case "diarrhea":
      return { label: "Diarrhea", tone: "alert" };
    case "blood":
      return { label: "Blood", tone: "alert" };
    case "none":
      return { label: "None", tone: "watch" };
    default:
      return { label: "Normal", tone: "good" };
  }
}

function urinationRead(v: string): CellRead {
  switch (v) {
    case "less":
      return { label: "Less", tone: "watch" };
    case "more":
      return { label: "More", tone: "watch" };
    case "straining":
      return { label: "Straining", tone: "alert" };
    case "none":
      return { label: "None", tone: "alert" };
    default:
      return { label: "Normal", tone: "good" };
  }
}

function energyRead(v: string): CellRead {
  switch (v) {
    case "low":
      return { label: "Low", tone: "watch" };
    case "high":
      return { label: "High", tone: "watch" };
    default:
      return { label: "Normal", tone: "good" };
  }
}

function vomitingRead(count: number): CellRead {
  if (count <= 0) return { label: "None", tone: "good" };
  if (count > 2) return { label: `${count}×`, tone: "alert" };
  return { label: `${count}×`, tone: "watch" };
}

function medicationRead(given: boolean): CellRead {
  return given ? { label: "Given", tone: "info" } : { label: "None", tone: "muted" };
}

/** Read one signal off a daily log. Returns the cell label + tone. */
function readSignal(key: string, log: HealthLog): CellRead {
  switch (key) {
    case "appetite":
      return appetiteRead(log.appetite);
    case "water":
      return waterRead(log.water);
    case "stool":
      return stoolRead(log.stool);
    case "urination":
      return urinationRead(log.urination);
    case "vomiting":
      return vomitingRead(log.vomiting_count);
    case "energy":
      return energyRead(log.energy);
    case "medication":
      return medicationRead(log.meds_given);
    default:
      return { label: "Normal", tone: "good" };
  }
}

const GRID_SIGNALS: { key: string; label: string }[] = [
  { key: "appetite", label: "Appetite" },
  { key: "water", label: "Water" },
  { key: "stool", label: "Stool" },
  { key: "urination", label: "Urination" },
  { key: "vomiting", label: "Vomiting" },
  { key: "energy", label: "Energy" },
  { key: "medication", label: "Medication" },
];

/**
 * Compare the recent half of a window against the earlier half. More severity
 * recently → "worse"; less → "better"; otherwise "none". Medication/missing
 * days (null score) are ignored. Needs >= 2 scored days to call a direction.
 */
function detectChange(scores: (number | null)[]): ChangeDirection {
  const indexed = scores
    .map((s, i) => ({ s, i }))
    .filter((x): x is { s: number; i: number } => x.s !== null);
  if (indexed.length < 2) return "none";

  const mid = Math.floor(indexed.length / 2);
  const earlier = indexed.slice(0, mid);
  const recent = indexed.slice(mid);
  if (earlier.length === 0 || recent.length === 0) return "none";

  const avg = (arr: { s: number }[]) =>
    arr.reduce((sum, x) => sum + x.s, 0) / arr.length;
  const delta = avg(recent) - avg(earlier);
  if (delta > 0.25) return "worse";
  if (delta < -0.25) return "better";
  return "none";
}

function buildGrid(logs: HealthLog[], now: Date, days = 14): SignalGridModel {
  const todayStr = localDateString(now);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localDateString(d));
  }
  const byDate = new Map(logs.map((l) => [l.log_date, l] as const));
  const hasData = dates.some((d) => byDate.has(d));

  const gridDays: GridDay[] = dates.map((date) => ({
    date,
    weekday: weekdayLabel(date),
    monthDay: monthDayLabel(date),
    isToday: date === todayStr,
  }));

  const rows: SignalRow[] = GRID_SIGNALS.map((def) => {
    const cells: SignalCell[] = dates.map((date) => {
      const log = byDate.get(date);
      if (!log) return { date, label: "—", tone: "muted", logged: false };
      const read = readSignal(def.key, log);
      return { date, label: read.label, tone: read.tone, logged: true };
    });
    const change = detectChange(
      cells.map((c) => (c.logged ? toneScore(c.tone) : null)),
    );
    return { key: def.key, label: def.label, cells, change };
  });

  return { days: gridDays, rows, hasData };
}

/** Most-recent logged day, or null. */
function latestLog(logs: HealthLog[]): HealthLog | null {
  if (logs.length === 0) return null;
  return [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1))[0];
}

/** How many consecutive most-recent days (ending at the latest log) were "off". */
function offStreak(
  logs: HealthLog[],
  predicate: (log: HealthLog) => boolean,
): number {
  const sorted = [...logs].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
  let streak = 0;
  for (const log of sorted) {
    if (predicate(log)) streak += 1;
    else break;
  }
  return streak;
}

const CHANGED_ARROW: Record<string, "down" | "up" | "flag"> = {
  reduced: "down",
  none: "down",
  less: "down",
  low: "down",
  increased: "up",
  more: "up",
  high: "up",
};

function buildChangedFromNormal(log: HealthLog | null): ChangedSignal[] {
  if (!log) return [];
  const out: ChangedSignal[] = [];

  const push = (label: string, value: string, raw: string, read: CellRead) => {
    out.push({
      label,
      value: read.label,
      tone: read.tone,
      arrow: CHANGED_ARROW[raw] ?? "flag",
    });
  };

  if (log.appetite !== "normal") push("Appetite", log.appetite, log.appetite, appetiteRead(log.appetite));
  if (log.energy !== "normal") push("Energy", log.energy, log.energy, energyRead(log.energy));
  if (log.stool !== "normal") push("Stool", log.stool, log.stool, stoolRead(log.stool));
  if (log.urination !== "normal") push("Urination", log.urination, log.urination, urinationRead(log.urination));
  if (log.water !== "normal") push("Water", log.water, log.water, waterRead(log.water));
  if (log.vomiting_count > 0) {
    const read = vomitingRead(log.vomiting_count);
    out.push({ label: "Vomiting", value: read.label, tone: read.tone, arrow: "flag" });
  }

  return out;
}

function countPhotos(logs: HealthLog[]): number {
  return logs.reduce((sum, l) => sum + (l.photo_urls?.length ?? 0), 0);
}

function buildEvidence(
  checks: SymptomCheckEntry[],
  logs: HealthLog[],
): EvidenceCounts {
  return {
    symptomChecks: checks.length,
    dailyLogs: logs.length,
    photos: countPhotos(logs),
  };
}

function buildNextBestLog(
  log: HealthLog | null,
  todayLogged: boolean,
): NextBestLog {
  // Suggest the signals most worth confirming tonight: anything currently off,
  // else the core four.
  const off: string[] = [];
  if (log) {
    if (log.appetite !== "normal") off.push("food");
    if (log.stool !== "normal") off.push("stool");
    if (log.vomiting_count > 0) off.push("vomiting");
    if (log.energy !== "normal") off.push("energy");
  }
  const items = off.length > 0 ? off : ["food", "stool", "vomiting", "energy"];
  const titleCased = items
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(", ");
  return {
    title: titleCased,
    when: "tonight",
    detail: todayLogged
      ? "You've logged today — a quick evening note confirms the pattern."
      : "This helps confirm patterns and gives your vet a clearer story.",
  };
}

const TIMELINE_LABEL: Record<SymptomCheckEntry["urgency"], string> = {
  monitor: "All normal",
  schedule: "Vet visit suggested",
  urgent: "Same-day care recommended",
  emergency: "Urgent care recommended",
};

const URGENCY_TONE: Record<SymptomCheckEntry["urgency"], SignalTone> = {
  monitor: "good",
  schedule: "watch",
  urgent: "alert",
  emergency: "alert",
};

function logTone(log: HealthLog): SignalTone {
  let worst: SignalTone = "good";
  for (const def of GRID_SIGNALS) {
    if (def.key === "medication") continue;
    const read = readSignal(def.key, log);
    if (read.tone === "alert") return "alert";
    if (read.tone === "watch") worst = "watch";
  }
  return worst;
}

function logHeadline(log: HealthLog): string {
  const off: string[] = [];
  if (log.appetite !== "normal") off.push(appetiteRead(log.appetite).label.toLowerCase() + " appetite");
  if (log.stool !== "normal") off.push(stoolRead(log.stool).label.toLowerCase() + " stool");
  if (log.vomiting_count > 0) off.push(`vomited ${log.vomiting_count}×`);
  if (log.energy !== "normal") off.push(energyRead(log.energy).label.toLowerCase() + " energy");
  if (off.length === 0) return "All signs normal";
  return off.slice(0, 2).join(", ") + (off.length > 2 ? ` +${off.length - 2}` : "");
}

/**
 * Merge symptom checks + daily logs into a single dated timeline with source
 * chips. Newest first, capped. Built directly from owner data so it works
 * offline / in demo mode without the vet-timeline API.
 */
function buildTimeline(
  checks: SymptomCheckEntry[],
  logs: HealthLog[],
  max = 6,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const c of checks) {
    const date = c.created_at.slice(0, 10);
    events.push({
      date,
      monthDay: monthDayLabel(date),
      source: "symptom_check",
      title: (c.primary_symptom ?? "Symptom check").trim() || "Symptom check",
      detail: TIMELINE_LABEL[c.urgency],
      tone: URGENCY_TONE[c.urgency],
    });
  }

  for (const log of logs) {
    events.push({
      date: log.log_date,
      monthDay: monthDayLabel(log.log_date),
      source: "daily_log",
      title: "Daily log",
      detail: logHeadline(log),
      tone: logTone(log),
    });
    if (log.meds_given || log.context_signals?.medication?.name) {
      const name = log.context_signals?.medication?.name;
      events.push({
        date: log.log_date,
        monthDay: monthDayLabel(log.log_date),
        source: "medication",
        title: "Medication",
        detail: name ? `${name} given` : "Given",
        tone: "info",
      });
    }
    if ((log.photo_urls?.length ?? 0) > 0) {
      events.push({
        date: log.log_date,
        monthDay: monthDayLabel(log.log_date),
        source: "photo",
        title: "Photo",
        detail: `${log.photo_urls!.length} attached`,
        tone: "muted",
      });
    }
    if (log.notes?.trim()) {
      events.push({
        date: log.log_date,
        monthDay: monthDayLabel(log.log_date),
        source: "journal",
        title: "Note",
        detail: log.notes.trim().slice(0, 60),
        tone: "muted",
      });
    }
  }

  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return events.slice(0, max);
}

function changeLabelFor(
  direction: ChangeDirection,
  worseWord: string,
  betterWord: string,
): string {
  if (direction === "worse") return worseWord;
  if (direction === "better") return betterWord;
  return "No change";
}

function buildSeverityTrend(
  key: string,
  label: string,
  logs: HealthLog[],
  now: Date,
  worseWord: string,
  betterWord: string,
  days = 7,
): TrendCard {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localDateString(d));
  }
  const byDate = new Map(logs.map((l) => [l.log_date, l] as const));
  const points: TrendPoint[] = dates.map((date) => {
    const log = byDate.get(date);
    if (!log) return { date, magnitude: 0, label: "—", tone: "muted", empty: true };
    const read =
      key === "vomiting"
        ? vomitingRead(log.vomiting_count)
        : readSignal(key, log);
    const score = toneScore(read.tone) ?? 0;
    // Map 0/1/2 → 0.18/0.55/1 so even "normal" shows a faint bar baseline.
    const magnitude = score === 0 ? 0.18 : score === 1 ? 0.58 : 1;
    return { date, magnitude, label: read.label, tone: read.tone, empty: false };
  });

  const change = detectChange(
    points.map((p) => (p.empty ? null : toneScore(p.tone))),
  );
  const offDays = points.filter((p) => !p.empty && p.tone !== "good").length;
  const caption =
    offDays === 0
      ? "Normal across the week"
      : offDays === 1
        ? "1 day off normal"
        : `${offDays} days off normal`;

  return {
    key,
    label,
    points,
    change,
    changeLabel: changeLabelFor(change, worseWord, betterWord),
    caption,
    isMeasure: false,
  };
}

function buildWeightTrend(logs: HealthLog[], now: Date, days = 14): TrendCard {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(localDateString(d));
  }
  const byDate = new Map(logs.map((l) => [l.log_date, l] as const));
  const weights = logs
    .map((l) => l.weight_kg)
    .filter((w): w is number => w != null);
  const min = weights.length ? Math.min(...weights) : 0;
  const max = weights.length ? Math.max(...weights) : 1;
  const span = max - min || 1;

  const points: TrendPoint[] = dates.map((date) => {
    const log = byDate.get(date);
    const w = log?.weight_kg ?? null;
    if (w == null) return { date, magnitude: 0, label: "—", tone: "muted", empty: true };
    return {
      date,
      magnitude: 0.2 + ((w - min) / span) * 0.8,
      label: `${w.toFixed(1)} kg`,
      tone: "good",
      empty: false,
    };
  });

  let change: ChangeDirection = "none";
  if (weights.length >= 2) {
    const delta = weights[weights.length - 1] - weights[0];
    const pct = Math.abs(delta) / (weights[0] || 1);
    if (pct >= 0.03) change = delta > 0 ? "better" : "worse";
  }
  const changeLabel =
    change === "none" ? "Stable" : change === "better" ? "Gaining" : "Losing";
  const caption =
    weights.length === 0
      ? "No weight logged"
      : change === "none"
        ? "Holding steady"
        : `${changeLabel} recently`;

  return {
    key: "weight",
    label: "Weight",
    points,
    change,
    changeLabel,
    caption,
    isMeasure: true,
  };
}

function buildTrends(logs: HealthLog[], now: Date): TrendCard[] {
  return [
    buildSeverityTrend("appetite", "Appetite", logs, now, "Trending down", "Recovering"),
    buildSeverityTrend("stool", "Stool", logs, now, "Trending worse", "Settling"),
    buildSeverityTrend("vomiting", "Vomiting", logs, now, "More episodes", "Easing"),
    buildSeverityTrend("energy", "Energy", logs, now, "Trending down", "Recovering"),
    buildWeightTrend(logs, now),
  ];
}

function pluralDays(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * Build the "what to tell the vet" bullets from owner-logged data only. These
 * are observations, never a diagnosis.
 */
function buildVetBullets(
  petName: string,
  checks: SymptomCheckEntry[],
  logs: HealthLog[],
): string[] {
  const bullets: string[] = [];
  const log = latestLog(logs);

  const diarrheaDays = offStreak(logs, (l) => l.stool === "diarrhea" || l.stool === "soft" || l.stool === "blood");
  if (log && (log.stool === "diarrhea" || log.stool === "soft" || log.stool === "blood")) {
    const word = log.stool === "diarrhea" ? "diarrhea" : log.stool === "blood" ? "blood in stool" : "soft stool";
    bullets.push(
      diarrheaDays > 1
        ? `${petName} has had ${word} for the past ${pluralDays(diarrheaDays)}.`
        : `${petName} had ${word} today.`,
    );
  }

  const appetiteDays = offStreak(logs, (l) => l.appetite === "reduced" || l.appetite === "none");
  const lowEnergy = log?.energy === "low";
  if (log && (log.appetite === "reduced" || log.appetite === "none")) {
    const word = log.appetite === "none" ? "not eating" : "eating less";
    bullets.push(
      `Appetite ${appetiteDays > 1 ? `${word} for ${pluralDays(appetiteDays)}` : word}${lowEnergy ? " and energy is low" : ""}.`,
    );
  } else if (lowEnergy) {
    bullets.push(`Energy has been low.`);
  }

  const vomitDays = logs.filter((l) => l.vomiting_count > 0);
  if (vomitDays.length > 0) {
    const total = vomitDays.reduce((s, l) => s + l.vomiting_count, 0);
    bullets.push(
      vomitDays.length === 1
        ? `Vomited ${total === 1 ? "once" : `${total}×`} on ${monthDayLabel(vomitDays[0].log_date)}.`
        : `Vomited on ${vomitDays.length} of the last days (${total} episodes total).`,
    );
  }

  if (log && log.water === "normal" && log.urination === "normal") {
    bullets.push("Drinking and urination are normal.");
  } else if (log) {
    const w: string[] = [];
    if (log.water !== "normal") w.push(`drinking ${waterRead(log.water).label.toLowerCase()}`);
    if (log.urination !== "normal") w.push(`${urinationRead(log.urination).label.toLowerCase()} urination`);
    if (w.length) bullets.push(`Noted ${w.join(" and ")}.`);
  }

  if (logs.some((l) => l.meds_given)) {
    const medDays = logs.filter((l) => l.meds_given).length;
    bullets.push(
      medDays === 1 ? "A medication was given once." : `Medication given on ${medDays} days.`,
    );
  }

  const recurring = recurringSymptom(checks);
  if (recurring) {
    bullets.push(`Recurring sign noted before: ${recurring}.`);
  }

  if (bullets.length === 0) {
    bullets.push(`No changes from ${petName}'s normal logged recently.`);
  }
  bullets.push("No known diet change or new exposures.");
  return bullets;
}

function recurringSymptom(checks: SymptomCheckEntry[]): string | null {
  const counts = new Map<string, number>();
  for (const c of checks) {
    const s = (c.primary_symptom ?? "").trim().toLowerCase();
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const top = [...counts.entries()].filter(([, n]) => n >= 2).sort(([, a], [, b]) => b - a)[0];
  return top ? top[0] : null;
}

function buildVetPacket(
  petName: string,
  checks: SymptomCheckEntry[],
  logs: HealthLog[],
): VetPacketModel {
  const bullets = buildVetBullets(petName, checks, logs);
  const checkPart = checks.length === 1 ? "1 symptom check" : `${checks.length} symptom checks`;
  const logPart = logs.length === 1 ? "1 daily log" : `${logs.length} daily logs`;
  const basedOn = `Based on ${checkPart} and ${logPart}.`;

  const copyText = [
    `Health summary for ${petName}`,
    `(Owner-logged observations only — not a diagnosis.)`,
    "",
    ...bullets.map((b) => `• ${b}`),
    "",
    basedOn,
  ].join("\n");

  return { bullets, basedOn, copyText };
}

const LOG_NEXT_CATALOG: Record<string, { label: string; why: string }> = {
  food: { label: "Food (type, amount, time)", why: "Helps identify diet-related patterns" },
  stool: { label: "Stool (consistency, frequency, photo)", why: "Key for digestive changes" },
  vomiting: { label: "Vomiting (number of episodes)", why: "Helps track severity" },
  energy: { label: "Energy / activity", why: "Helps track recovery" },
  water: { label: "Water intake", why: "Flags dehydration risk" },
  urination: { label: "Bathroom habits", why: "Tracks urinary and kidney signs" },
};

function buildLogNext(log: HealthLog | null): LogNextItem[] {
  const keys: string[] = [];
  if (log) {
    if (log.appetite !== "normal") keys.push("food");
    if (log.stool !== "normal") keys.push("stool");
    if (log.vomiting_count > 0) keys.push("vomiting");
    if (log.energy !== "normal") keys.push("energy");
    if (log.water !== "normal") keys.push("water");
    if (log.urination !== "normal") keys.push("urination");
  }
  const ordered = keys.length > 0 ? keys : ["food", "stool", "vomiting", "energy"];
  const seen = new Set<string>();
  const items: LogNextItem[] = [];
  for (const k of ordered) {
    if (seen.has(k)) continue;
    seen.add(k);
    const def = LOG_NEXT_CATALOG[k];
    if (def) items.push({ label: def.label, why: def.why, when: "Tonight" });
  }
  return items.slice(0, 4);
}

/** "Last checked May 17, 2025 · 9:42 AM" from the newest check. */
function buildLastChecked(checks: SymptomCheckEntry[]): string | null {
  if (checks.length === 0) return null;
  const latest = [...checks].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
  const d = new Date(latest.created_at);
  const month = MONTHS[d.getMonth()];
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${d.getDate()}, ${d.getFullYear()} · ${h}:${mm} ${ampm}`;
}

function titleCaseName(name: string | undefined | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed || "your dog";
}

/**
 * Build the full Health Signals board model from filtered symptom checks and
 * daily logs. Pure and side-effect free.
 */
export function buildHealthBoard({
  checks,
  logs,
  now = new Date(),
  fallbackPetName = "your dog",
}: {
  checks: SymptomCheckEntry[];
  logs: HealthLog[];
  now?: Date;
  fallbackPetName?: string;
}): HealthBoardModel {
  const sortedChecks = [...checks].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const latest = sortedChecks[sortedChecks.length - 1] ?? null;
  const petName = titleCaseName(latest?.pet_name ?? fallbackPetName);
  const log = latestLog(logs);
  const todayStr = localDateString(now);
  const todayLogged = logs.some((l) => l.log_date === todayStr);

  return {
    petName,
    lastCheckedLabel: buildLastChecked(checks),
    changedFromNormal: buildChangedFromNormal(log),
    evidence: buildEvidence(checks, logs),
    nextBestLog: buildNextBestLog(log, todayLogged),
    grid: buildGrid(logs, now),
    timeline: buildTimeline(checks, logs),
    trends: buildTrends(logs, now),
    vetPacket: buildVetPacket(petName, checks, logs),
    logNext: buildLogNext(log),
  };
}
