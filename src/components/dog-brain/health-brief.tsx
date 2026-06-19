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
  Upload,
  ClipboardList,
  ChevronRight,
  Bell,
  Camera,
  TrendingDown,
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
  const reason =
    signals.length > 0
      ? signals.slice(0, 2).map((s) => s.owner_message).join(" · ")
      : `${petName}'s logs look good — keep the daily check-ins going.`;

  return (
    <div
      className="rounded-2xl border border-[#eef1ef] bg-white overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: meta.line, borderLeftStyle: "solid" }}
    >
      <div className="px-5 pt-5 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-4">
          Today&apos;s Health Brief
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: meta.bg, color: meta.fg }}
          >
            <meta.Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-2xl font-semibold" style={{ color: meta.fg }}>
            {meta.label}
          </span>
          {signals.length > 0 && (
            <span
              className="ml-auto rounded-full px-3 py-1 text-[11px] font-semibold shrink-0"
              style={{ background: meta.bg, color: meta.fg }}
            >
              Pattern detected by PawVital AI
            </span>
          )}
        </div>
        <p className="text-[15px] font-medium text-[#1c2522] leading-snug">{reason}</p>
      </div>
      <div
        className="px-5 py-3.5 flex flex-wrap gap-2.5"
        style={{ borderTop: "1px solid #eef1ef" }}
      >
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
  );
}

// ─── WHAT PAWVITAL NOTICED — signal cards ─────────────────────────────────────

function SignalDetailCard({ signal, logs }: { signal: DetectedSignal; logs: HealthLog[] }) {
  const meta = SEVERITY_META[signal.severity];
  const Icon = SIGNAL_ICON[signal.signal_type];
  const series = buildSeries(logs, signal.signal_type);

  return (
    <div className="rounded-xl border border-[#eef1ef] bg-white p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0"
          style={{ background: meta.bg, color: meta.fg }}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#1c2522]">{SIGNAL_TITLE[signal.signal_type]}</p>
        <p className="text-xs leading-relaxed text-[#8a978f] mt-0.5">{signal.owner_message}</p>
      </div>
      {series.length >= 2 && (
        <div className="h-7 -mx-1">
          <Sparkline data={series} color={meta.line} />
        </div>
      )}
      <a
        href="/analytics"
        target="_top"
        className="inline-flex items-center gap-1 text-xs font-medium text-[#1f9d6b] hover:underline"
      >
        View details <ChevronRight className="h-3 w-3" aria-hidden />
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
  timeLabel: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
}

function formatTimelineDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0)
    return `Today, ${d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)
    return d.toLocaleDateString("en", { weekday: "long" });
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

const TIMELINE_ICONS: Record<TimelineEventType, typeof ClipboardList> = {
  log: ClipboardList,
  photo: Camera,
  symptom: Stethoscope,
  reminder: Bell,
};

function TimelineCard({ event }: { event: TimelineEvent }) {
  const Icon = TIMELINE_ICONS[event.type];
  return (
    <div className="shrink-0 w-48 rounded-xl border border-[#eef1ef] bg-white p-4 flex flex-col gap-2.5">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ background: "#f3f9f6", color: "#1f9d6b" }}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#1c2522]">{event.title}</p>
        <p className="text-[11px] text-[#8a978f] mt-0.5">{event.timeLabel}</p>
      </div>
      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ background: event.statusBg, color: event.statusColor }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: event.statusColor }}
        />
        {event.statusLabel}
      </span>
    </div>
  );
}

function PatternTimeline({ logs }: { logs: HealthLog[] }) {
  const events: TimelineEvent[] = logs.slice(0, 6).map((log, i) => ({
    id: `log-${i}`,
    type: "log" as const,
    title: "Daily log",
    timeLabel: formatTimelineDate((log as { log_date?: string; created_at?: string }).log_date ?? (log as { log_date?: string; created_at?: string }).created_at ?? ""),
    statusLabel: "Logged",
    statusColor: "#15795a",
    statusBg: "#e7f4ee",
  }));

  if (events.length === 0) return null;

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-3">
        Pattern Timeline
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {events.map((event) => (
          <TimelineCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

// ─── RIGHT SIDEBAR ────────────────────────────────────────────────────────────

const STATIC_REMINDERS = [
  { label: "Heartworm check-up", timing: "Today", timingBg: "#e7f4ee", timingFg: "#15795a" },
  { label: "Flea & tick prevention", timing: "3 days", timingBg: "#fbf0db", timingFg: "#c1852a" },
  { label: "Annual vaccination", timing: "15 days", timingBg: "#f3f4f6", timingFg: "#6b7280" },
];

function RightSidebar({
  actions,
  petName,
}: {
  actions: string[];
  petName: string;
}) {
  return (
    <div className="space-y-4">
      <a
        href="/analytics"
        target="_top"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#cfe6da] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6] transition-colors"
      >
        <Upload className="h-4 w-4" aria-hidden />
        Share summary
      </a>

      <div className="rounded-2xl border border-[#eef1ef] bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-3">
          Next Best Action
        </p>
        <ul className="space-y-2.5">
          {actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-[#3f4a45]">
              {i === 0 ? (
                <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-[#1f9d6b]" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#c3cfc9]" aria-hidden />
              )}
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[#eef1ef] bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#8a978f] mb-3">
          Upcoming Reminders
        </p>
        <ul className="space-y-2.5">
          {STATIC_REMINDERS.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-[#3f4a45]">{r.label}</span>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: r.timingBg, color: r.timingFg }}
              >
                {r.timing}
              </span>
            </li>
          ))}
        </ul>
        <a
          href="/reminders"
          target="_top"
          className="mt-3 block text-center text-xs font-medium text-[#1f9d6b] hover:underline"
        >
          View all reminders
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

  useEffect(() => {
    if (!petId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [sigRes, logRes] = await Promise.all([
          fetch(`/api/dog-brain/signals?pet_id=${petId}`),
          fetch(`/api/health-log?pet_id=${petId}&limit=14`),
        ]);
        const sig = (await sigRes.json().catch(() => null)) as DogBrainSignalsResponse | null;
        const lg = (await logRes.json().catch(() => null)) as { data?: HealthLog[] } | null;
        if (cancelled) return;
        setSignals(sig?.signals ?? []);
        setState(sig?.state ?? "stable");
        setLogs(Array.isArray(lg?.data) ? lg!.data : []);
      } catch {
        if (!cancelled) {
          setSignals([]);
          setState("stable");
          setLogs([]);
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
    const fromSignals = signals.map((s) => s.next_action).filter(Boolean);
    const defaults = ["Log today's check-in", "Start a symptom check if any new signs"];
    return Array.from(new Set([...fromSignals, ...defaults])).slice(0, 5) as string[];
  }, [signals]);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      {/* Main left column */}
      <div className="space-y-5">
        <TodaysHealthBriefCard state={state} signals={signals} petName={petName} />
        {signals.length > 0 && <NoticedSignalsSection signals={signals} logs={logs} />}
        <PatternTimeline logs={logs} />
      </div>

      {/* Right sidebar */}
      <RightSidebar actions={actions} petName={petName} />
    </div>
  );
}
