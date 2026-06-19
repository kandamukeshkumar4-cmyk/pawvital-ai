"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import {
  Utensils,
  Waves,
  Scale,
  AlertCircle,
  Pill,
  Brain,
  Stethoscope,
  ClipboardPlus,
  CircleCheckBig,
  Circle,
  FileText,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  ChevronRight,
  Bell,
  Camera,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import type {
  BriefState,
  DetectedSignal,
  DogBrainSignalsResponse,
  SignalSeverity,
  SignalType,
} from "@/lib/dog-brain/types";
import type { HealthLog } from "@/lib/health-log/types";

const STATE_META: Record<
  BriefState,
  { label: string; line: string; fg: string; bg: string; Icon: typeof ShieldCheck }
> = {
  stable: { label: "Stable", line: "#1f9d6b", fg: "#15795a", bg: "#e7f4ee", Icon: ShieldCheck },
  watch: { label: "Watch", line: "#e8a23c", fg: "#c1852a", bg: "#fbf0db", Icon: ShieldAlert },
  needs_attention: { label: "Needs attention", line: "#e2675b", fg: "#b8473c", bg: "#fbeae8", Icon: AlertCircle },
};

const SEVERITY_META: Record<SignalSeverity, { label: string; fg: string; bg: string; line: string }> = {
  info: { label: "Info", fg: "#4f7fb8", bg: "#e9f1fa", line: "#4f7fb8" },
  watch: { label: "Watch", fg: "#c1852a", bg: "#fbf0db", line: "#e8a23c" },
  alert: { label: "Alert", fg: "#b8473c", bg: "#fbeae8", line: "#e2675b" },
};

const SIGNAL_ICON: Record<SignalType, typeof Utensils> = {
  appetite_drop: Utensils,
  stool_change: Waves,
  vomiting_trend: AlertCircle,
  weight_downtrend: Scale,
  possible_med_side_effect: Pill,
};

const SIGNAL_TITLE: Record<SignalType, string> = {
  appetite_drop: "Appetite trend",
  stool_change: "Stool changed",
  vomiting_trend: "Vomiting trend",
  weight_downtrend: "Weight check",
  possible_med_side_effect: "Medication note",
};

const APPETITE_SCORE: Record<string, number> = { normal: 4, increased: 3, reduced: 2, none: 1 };
const STOOL_SCORE: Record<string, number> = { normal: 4, soft: 2, none: 2, diarrhea: 1, blood: 1 };

function buildSeries(logs: HealthLog[], type: SignalType): { v: number }[] {
  const chrono = [...logs].reverse();
  const pick = (l: HealthLog): number | null => {
    switch (type) {
      case "appetite_drop": return APPETITE_SCORE[l.appetite] ?? null;
      case "stool_change": return STOOL_SCORE[l.stool] ?? null;
      case "vomiting_trend": return l.vomiting_count ?? 0;
      case "weight_downtrend": return typeof l.weight_kg === "number" ? l.weight_kg : null;
      default: return null;
    }
  };
  return chrono.map(pick).filter((v): v is number => v !== null).map((v) => ({ v }));
}

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={28}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── TODAY'S HEALTH BRIEF card ────────────────────────────────────────────────

const SIGNAL_REASON: Record<SignalType, string> = {
  appetite_drop: "appetite reduced",
  stool_change: "stool changed",
  vomiting_trend: "repeated vomiting",
  weight_downtrend: "weight trending down",
  possible_med_side_effect: "medication note",
};

/** Build the short "main reason" headline shown in the brief card. */
function mainReason(signals: DetectedSignal[], petName: string): string {
  if (signals.length === 0) {
    return `${petName}'s logs look good — keep the daily check-ins going.`;
  }
  const phrases = signals.slice(0, 2).map((s) => SIGNAL_REASON[s.signal_type]);
  const joined = phrases.join(" + ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function TodaysHealthBriefCard({
  state,
  signals,
  petName,
}: {
  state: BriefState;
  signals: DetectedSignal[];
  petName: string;
}) {
  const meta = STATE_META[state];
  const reason = mainReason(signals, petName);
  const hasSignals = signals.length > 0;

  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-white overflow-hidden">
      <div className="px-6 pt-5 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#15795a] mb-5">
          Today&apos;s Health Brief
        </p>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Current state */}
          <div className="sm:w-[200px] sm:shrink-0">
            <p className="text-[13px] text-[#8a978f] mb-2">Current state</p>
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ background: meta.bg, color: meta.fg }}
              >
                <meta.Icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="text-[28px] font-bold leading-none" style={{ color: meta.fg }}>
                {meta.label}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block sm:h-16 sm:w-px sm:bg-[#eef1ef]" aria-hidden />

          {/* Main reason */}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[#8a978f] mb-2">Main reason</p>
            <p className="text-[19px] font-bold leading-snug text-[#1c2522]">{reason}</p>
            {hasSignals && (
              <span
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold"
                style={{ background: meta.bg, color: meta.fg }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Pattern detected by PawVital AI
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 pb-5 pt-1">
        <p className="text-[13px] text-[#8a978f] mb-2.5">What you can do now</p>
        <div className="flex flex-wrap gap-2.5">
          <a
            href="/symptom-checker"
            target="_top"
            className="inline-flex items-center gap-2 rounded-lg bg-[#1f9d6b] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15795a] transition-colors"
          >
            <Stethoscope className="h-4 w-4" aria-hidden />
            Start symptom check
          </a>
          <a
            href="/health-log"
            target="_top"
            className="inline-flex items-center gap-2 rounded-lg border border-[#cfe6da] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6] transition-colors"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            Log tonight
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── WHAT PAWVITAL NOTICED — signal cards ─────────────────────────────────────

function SignalDetailCard({ signal, logs }: { signal: DetectedSignal; logs: HealthLog[] }) {
  const meta = SEVERITY_META[signal.severity];
  const Icon = SIGNAL_ICON[signal.signal_type];
  const series = buildSeries(logs, signal.signal_type);

  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-white p-5 flex flex-col">
      {/* Header: icon circle + title + severity badge */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[#1c2522] leading-tight">
            {SIGNAL_TITLE[signal.signal_type]}
          </p>
          <span
            className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: meta.bg, color: meta.fg }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {/* Body: message (left) + sparkline (right) */}
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="text-[13px] leading-snug text-[#5b665f] max-w-[60%]">
          {signal.owner_message}
        </p>
        {series.length >= 2 && (
          <div className="h-8 w-24 shrink-0">
            <Sparkline data={series} color={meta.line} />
          </div>
        )}
      </div>

      <a
        href="/analytics"
        target="_top"
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#1f9d6b] hover:underline"
      >
        View details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}

function NoticedSignalsSection({
  signals,
  logs,
}: {
  signals: DetectedSignal[];
  logs: HealthLog[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
          What PawVital Noticed
        </p>
        <span className="rounded-full bg-[#e8a23c] px-2 py-0.5 text-[11px] font-semibold text-white">
          {signals.length} {signals.length === 1 ? "signal" : "signals"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {signals.map((s) => (
          <SignalDetailCard key={s.dedupe_key} signal={s} logs={logs} />
        ))}
      </div>
    </div>
  );
}

// ─── PATTERN TIMELINE ─────────────────────────────────────────────────────────

type TimelineEventType = "log" | "photo" | "symptom" | "reminder";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle: string;
  timeLabel: string;
  statusLabel: string;
  sortAt: number;
}

const TIMELINE_STYLE: Record<
  TimelineEventType,
  { card: string; iconBg: string; iconFg: string; Icon: typeof ClipboardList }
> = {
  log: { card: "border-[#eef1ef] bg-white", iconBg: "#eef3f0", iconFg: "#5b665f", Icon: ClipboardList },
  photo: { card: "border-[#eef1ef] bg-white", iconBg: "#e9f1fa", iconFg: "#4f7fb8", Icon: Camera },
  symptom: { card: "border-[#f3e4c6] bg-[#fbf6ec]", iconBg: "#fbf0db", iconFg: "#c1852a", Icon: Stethoscope },
  reminder: { card: "border-[#dbe7f3] bg-[#eef5fb]", iconBg: "#e0ecf8", iconFg: "#4f7fb8", Icon: Bell },
};

function formatTimelineDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString("en", { weekday: "long" })}, ${time}`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/** Short owner-readable summary of a daily log's notable findings. */
function summarizeLog(log: HealthLog): string {
  const parts: string[] = [];
  if (log.appetite === "reduced" || log.appetite === "none") parts.push("appetite low");
  if (log.energy === "low") parts.push("energy low");
  if (log.stool && log.stool !== "normal") parts.push("stool change");
  if ((log.vomiting_count ?? 0) > 0) parts.push("vomiting");
  if (parts.length === 0) return "All normal";
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildTimelineEvents(logs: HealthLog[], reminders: ReminderRow[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  logs.slice(0, 6).forEach((log, i) => {
    const raw = (log as { log_date?: string; created_at?: string });
    const dateStr = raw.created_at ?? raw.log_date ?? "";
    const at = new Date(dateStr).getTime() || 0;
    events.push({
      id: `log-${i}`,
      type: "log",
      title: "Daily log",
      subtitle: summarizeLog(log),
      timeLabel: formatTimelineDate(dateStr),
      statusLabel: "Logged",
      sortAt: at,
    });
    const photos = (log as { photo_urls?: string[] }).photo_urls;
    if (Array.isArray(photos) && photos.length > 0) {
      events.push({
        id: `photo-${i}`,
        type: "photo",
        title: "Journal photo",
        subtitle: `${photos.length} photo${photos.length === 1 ? "" : "s"} added`,
        timeLabel: formatTimelineDate(dateStr),
        statusLabel: "Photo added",
        sortAt: at - 1,
      });
    }
  });

  // The timeline tells the story of recent *activity*. A reminder due in the
  // future shouldn't out-rank today's daily log, so clamp future due dates to
  // just-before-now — past-due reminders keep their real time.
  const recencyFloor = Date.now() - 60_000;
  reminders.slice(0, 3).forEach((r, i) => {
    const due = r.next_due ? new Date(r.next_due).getTime() || 0 : 0;
    events.push({
      id: `rem-${r.id ?? i}`,
      type: "reminder",
      title: "Reminder",
      subtitle: r.title,
      timeLabel: r.next_due ? formatTimelineDate(r.next_due) : "Scheduled",
      statusLabel: "Scheduled",
      sortAt: Math.min(due, recencyFloor),
    });
  });

  return events.sort((a, b) => b.sortAt - a.sortAt).slice(0, 4);
}

function TimelineCard({ event }: { event: TimelineEvent }) {
  const s = TIMELINE_STYLE[event.type];
  return (
    <div className={`flex-1 min-w-[180px] rounded-xl border p-4 flex flex-col gap-2 ${s.card}`}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: s.iconBg, color: s.iconFg }}
        >
          <s.Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1c2522] leading-tight">{event.title}</p>
          <p className="text-[11px] text-[#8a978f]">{event.timeLabel}</p>
        </div>
      </div>
      <p className="text-[13px] text-[#3f4a45] leading-snug">{event.subtitle}</p>
      <span className="mt-auto inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-[#15795a]">
        <CircleCheckBig className="h-3.5 w-3.5" aria-hidden />
        {event.statusLabel}
      </span>
    </div>
  );
}

function PatternTimeline({ logs, reminders }: { logs: HealthLog[]; reminders: ReminderRow[] }) {
  const events = buildTimelineEvents(logs, reminders);
  if (events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-4">
        Pattern Timeline
      </p>
      <div className="flex items-stretch gap-0">
        {events.map((event, i) => (
          <div key={event.id} className="flex flex-1 items-center">
            <TimelineCard event={event} />
            {i < events.length - 1 && (
              <span className="mx-1.5 h-2 w-2 shrink-0 rounded-full bg-[#1c2522]" aria-hidden />
            )}
          </div>
        ))}
      </div>
      <a
        href="/analytics"
        target="_top"
        className="mt-4 block text-center text-[13px] font-medium text-[#1f9d6b] hover:underline"
      >
        View full timeline →
      </a>
    </div>
  );
}

// ─── RIGHT SIDEBAR ────────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  title: string;
  next_due: string | null;
  type?: string | null;
  time?: string | null;
}

const REMINDER_ICON: Record<string, typeof Bell> = {
  medication: Pill,
  vet_appointment: Stethoscope,
  flea_tick: ShieldCheck,
  vaccination: ClipboardPlus,
  custom: Bell,
};

/** "Tonight, 8:00 PM" / "May 22, 2025" subtitle for a reminder row. */
function reminderSubtitle(nextDue: string | null): string {
  if (!nextDue) return "Scheduled";
  const d = new Date(nextDue);
  if (Number.isNaN(d.getTime())) return "Scheduled";
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const time = d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `Tonight, ${time}`;
  if (days <= 7) return `${d.toLocaleDateString("en", { weekday: "long" })}, ${time}`;
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

/** Owner-friendly timing badge from next_due relative to now. */
function reminderTiming(nextDue: string | null): { label: string; bg: string; fg: string } {
  if (!nextDue) return { label: "Scheduled", bg: "#f3f4f6", fg: "#6b7280" };
  const due = new Date(nextDue);
  if (Number.isNaN(due.getTime())) return { label: "Scheduled", bg: "#f3f4f6", fg: "#6b7280" };
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { label: "Today", bg: "#e7f4ee", fg: "#15795a" };
  if (days <= 7) return { label: `${days} day${days === 1 ? "" : "s"}`, bg: "#fbf0db", fg: "#c1852a" };
  return {
    label: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    bg: "#f3f4f6",
    fg: "#6b7280",
  };
}

function RightSidebar({
  actions,
  reminders,
  petName,
}: {
  actions: string[];
  reminders: ReminderRow[];
  petName: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-3.5">
          Next Best Action
        </p>
        <ul className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#3f4a45]">
              {i === 0 ? (
                <CircleCheckBig className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#1f9d6b]" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#c3cfc9]" aria-hidden />
              )}
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[#eef1ef] bg-white p-5">
        <div className="flex items-center gap-2 mb-3.5">
          <Bell className="h-4 w-4 text-[#15795a]" aria-hidden />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
            Upcoming Reminders
          </p>
        </div>
        {reminders.length > 0 ? (
          <ul className="space-y-3.5">
            {reminders.map((r) => {
              const t = reminderTiming(r.next_due);
              const Icon = REMINDER_ICON[r.type ?? "custom"] ?? Bell;
              return (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f6f4] text-[#5b665f]">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[#1c2522] leading-tight truncate">{r.title}</p>
                    <p className="text-[11px] text-[#8a978f]">{reminderSubtitle(r.next_due)}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                    style={{ background: t.bg, color: t.fg }}
                  >
                    {t.label}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-[#8a978f]">No upcoming reminders yet.</p>
        )}
        <a
          href="/reminders"
          target="_top"
          className="mt-4 block text-center text-[13px] font-medium text-[#1f9d6b] hover:underline"
        >
          {reminders.length > 0 ? "View all reminders →" : "Add a reminder"}
        </a>
      </div>

      <div className="rounded-2xl border border-[#d8ebe1] bg-[#f3f9f6] p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-[#15795a]" aria-hidden />
          <span className="text-sm font-semibold text-[#1c2522]">Share with your vet</span>
        </div>
        <p className="text-xs leading-relaxed text-[#6f8579] mb-3">
          A vet-ready report with {petName}&apos;s logs, signals &amp; history — one tap.
        </p>
        <a
          href="/analytics"
          target="_top"
          className="block rounded-lg bg-[#1f9d6b] py-2.5 text-center text-sm font-medium text-white hover:bg-[#15795a] transition-colors"
        >
          Create vet report
        </a>
      </div>
    </div>
  );
}

// ─── FIRST-TIME empty state ───────────────────────────────────────────────────

function FirstTime({ petName }: { petName: string }) {
  const steps = [
    { done: true, label: "Profile created", hint: "Breed, age & weight saved" },
    { done: false, label: "Log your first day", hint: `Teaches the brain ${petName}'s normal` },
    { done: false, label: "Try a symptom check", hint: "Uses your logs as context" },
    { done: false, label: "See your first pattern", hint: "Usually after 3–4 days" },
  ];
  const payoffs = [
    { Icon: TrendingDown, title: "Spot patterns early", body: `"Appetite down 3 days" — before you'd notice.` },
    { Icon: FileText, title: "Vet-ready summaries", body: "Logs, signals & history in one tap." },
    { Icon: Pill, title: "Follow-up nudges", body: `"Any change since the probiotic?"` },
    { Icon: ShieldCheck, title: "Always-on safety net", body: "Emergency red-flags surface instantly." },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-[#15795a] p-5 text-[#eafaf3]">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-5 w-5 text-[#bff0db]" aria-hidden />
          <span className="text-lg font-semibold text-white">This is {petName}&apos;s brain.</span>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-[#cdebdd]">
          Everything you log — meals, stool, energy, weight, photos, symptoms — becomes memory. PawVital
          quietly watches for patterns across days, so you catch the small changes before they become big ones.
        </p>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
        Get {petName}&apos;s brain learning
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-start gap-2.5 rounded-xl border border-[#e9efec] bg-white p-3">
            {s.done ? (
              <CircleCheckBig className="h-5 w-5 shrink-0 text-[#1f9d6b]" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-[#b9c6bf]" aria-hidden />
            )}
            <div>
              <p className="text-sm font-semibold text-[#1c2522]">{s.label}</p>
              <p className="text-[11px] text-[#8a978f]">{s.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/health-log"
          target="_top"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f9d6b] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15795a] transition-colors"
        >
          <ClipboardPlus className="h-4 w-4" aria-hidden />
          Log {petName}&apos;s first day
        </a>
        <a
          href="/symptom-checker"
          target="_top"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#bfe0cf] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6] transition-colors"
        >
          <Stethoscope className="h-4 w-4" aria-hidden />
          Start a symptom check
        </a>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f]">
        What {petName}&apos;s brain will do for you
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {payoffs.map((p) => (
          <div key={p.title} className="rounded-xl border border-[#eef1ef] bg-white p-3">
            <p.Icon className="h-[18px] w-[18px] text-[#1f9d6b]" aria-hidden />
            <p className="mt-1.5 text-[13px] font-semibold text-[#1c2522]">{p.title}</p>
            <p className="text-[11px] leading-snug text-[#8a978f]">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ROOT EXPORT ──────────────────────────────────────────────────────────────

export default function HealthBrief({
  petId,
  petName,
  userDataLoaded,
}: {
  petId: string | null;
  petName: string;
  userDataLoaded: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState<DetectedSignal[]>([]);
  const [state, setState] = useState<BriefState>("stable");
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);

  useEffect(() => {
    if (!petId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [sigRes, logRes, remRes] = await Promise.all([
          fetch(`/api/dog-brain/signals?pet_id=${petId}`),
          fetch(`/api/health-log?pet_id=${petId}&limit=14`),
          fetch(`/api/reminders?pet_id=${petId}&limit=4`),
        ]);
        const sig = (await sigRes.json().catch(() => null)) as DogBrainSignalsResponse | null;
        const lg = (await logRes.json().catch(() => null)) as { data?: HealthLog[] } | null;
        const rem = (await remRes.json().catch(() => null)) as { data?: ReminderRow[] } | null;
        if (cancelled) return;
        setSignals(sig?.signals ?? []);
        setState(sig?.state ?? "stable");
        setLogs(Array.isArray(lg?.data) ? lg!.data : []);
        setReminders(Array.isArray(rem?.data) ? rem!.data : []);
      } catch {
        if (!cancelled) {
          setSignals([]);
          setState("stable");
          setLogs([]);
        setReminders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [petId]);

  const actions = useMemo(() => {
    const has = (t: SignalType) => signals.some((s) => s.signal_type === t);
    const out: string[] = [];
    if (has("appetite_drop")) out.push("Log appetite tonight");
    if (has("stool_change")) out.push("Add stool photo if possible");
    out.push("Monitor water intake");
    if (reminders.length > 0) out.push("Follow up after supplement");
    out.push("Start symptom check if any new signs");
    if (out.length < 2) out.unshift("Log today's check-in");
    return Array.from(new Set(out)).slice(0, 5);
  }, [signals, reminders]);

  if (!userDataLoaded || loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-2xl border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
          <div className="h-36 animate-pulse rounded-2xl border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />
      </div>
    );
  }

  if (!petId || logs.length === 0) {
    return <FirstTime petName={petName} />;
  }

  const displayName = petName.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Main left column */}
      <div className="space-y-5">
        <TodaysHealthBriefCard state={state} signals={signals} petName={displayName} />
        {signals.length > 0 && <NoticedSignalsSection signals={signals} logs={logs} />}
        <PatternTimeline logs={logs} reminders={reminders} />
      </div>

      {/* Right sidebar */}
      <RightSidebar actions={actions} reminders={reminders} petName={displayName} />
    </div>
  );
}
