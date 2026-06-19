"use client";

/**
 * Dashboard "Today's Health Brief" — the Dog Brain centerpiece.
 *
 * Fetches REAL data from live endpoints (no mock):
 *  - GET /api/dog-brain/signals?pet_id= → { state, signals }
 *  - GET /api/health-log?pet_id=&limit=14 → recent logs (for sparklines)
 *
 * Renders four states:
 *  - loading        → calm skeleton
 *  - no logs yet    → first-time "meet your dog's brain" hand-holding
 *  - stable         → quiet, reassuring brief
 *  - watch/alert    → state card + signal cards with real sparklines + actions
 *
 * SAFETY: purely presentational over owner logs/signals. Never touches triage.
 */

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
  ChartSpline,
  FileText,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { DetectedSignal, SignalSeverity, SignalType } from "@/lib/dog-brain/types";
import type { HealthLog } from "@/lib/health-log/types";

type BriefState = "stable" | "watch" | "needs_attention";

interface SignalsResponse {
  state: BriefState;
  signals: DetectedSignal[];
}

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

/** Build a numeric sparkline series (oldest→newest) from real logs for a signal type. */
function buildSeries(logs: HealthLog[], type: SignalType): { v: number }[] {
  const chrono = [...logs].reverse(); // logs arrive newest-first
  const pick = (l: HealthLog): number | null => {
    switch (type) {
      case "appetite_drop":
        return APPETITE_SCORE[l.appetite] ?? null;
      case "stool_change":
        return STOOL_SCORE[l.stool] ?? null;
      case "vomiting_trend":
        return l.vomiting_count ?? 0;
      case "weight_downtrend":
        return typeof l.weight_kg === "number" ? l.weight_kg : null;
      default:
        return null;
    }
  };
  return chrono.map(pick).filter((v): v is number => v !== null).map((v) => ({ v }));
}

function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width="100%" height={34}>
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SignalCard({ signal, logs }: { signal: DetectedSignal; logs: HealthLog[] }) {
  const meta = SEVERITY_META[signal.severity];
  const Icon = SIGNAL_ICON[signal.signal_type];
  const series = buildSeries(logs, signal.signal_type);
  return (
    <div className="rounded-xl border border-[#eef1ef] bg-white p-3">
      <div className="flex items-center justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-[#1c2522]">{SIGNAL_TITLE[signal.signal_type]}</p>
      <p className="text-xs leading-snug text-[#8a978f]">{signal.owner_message}</p>
      <div className="mt-2">
        <Sparkline data={series} color={meta.line} />
      </div>
    </div>
  );
}

function FirstTime({ petName }: { petName: string }) {
  const steps = [
    { done: true, label: "Profile created", hint: "Breed, age & weight saved" },
    { done: false, label: "Log your first day", hint: "Teaches the brain " + petName + "'s normal" },
    { done: false, label: "Try a symptom check", hint: "Uses your logs as context" },
    { done: false, label: "See your first pattern", hint: "Usually after 3–4 days" },
  ];
  const payoffs = [
    { Icon: ChartSpline, title: "Spot patterns early", body: `"Appetite down 3 days" — before you'd notice.` },
    { Icon: FileText, title: "Vet-ready summaries", body: "Logs, signals & history in one tap." },
    { Icon: Pill, title: "Follow-up nudges", body: `"Any change since the probiotic?"` },
    { Icon: ShieldCheck, title: "Always-on safety net", body: "Emergency red-flags surface instantly." },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#15795a] p-5 text-[#eafaf3]">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-[#bff0db]" aria-hidden />
          <span className="text-lg font-medium text-white">This is {petName}&apos;s brain.</span>
        </div>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#cdebdd]">
          Everything you log — meals, stool, energy, weight, photos, symptoms — becomes memory. PawVital
          quietly watches for patterns across days, so you catch the small changes before they become big ones.
        </p>
      </div>

      <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a978f]">Get {petName}&apos;s brain learning</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <div key={s.label} className="flex items-start gap-2.5 rounded-xl border border-[#e9efec] bg-white p-3">
            {s.done ? (
              <CircleCheckBig className="h-5 w-5 flex-shrink-0 text-[#1f9d6b]" aria-hidden />
            ) : (
              <Circle className="h-5 w-5 flex-shrink-0 text-[#b9c6bf]" aria-hidden />
            )}
            <div>
              <p className="text-sm font-medium text-[#1c2522]">{s.label}</p>
              <p className="text-[11px] text-[#8a978f]">{s.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <a href="/health-log" target="_top" className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1f9d6b] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#15795a]">
          <ClipboardPlus className="h-4 w-4" aria-hidden />
          Log {petName}&apos;s first day
        </a>
        <a href="/symptom-checker" target="_top" className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#bfe0cf] bg-white px-4 py-2.5 text-sm font-medium text-[#15795a] hover:bg-[#f3f9f6]">
          <Stethoscope className="h-4 w-4" aria-hidden />
          Start a symptom check
        </a>
      </div>

      <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a978f]">What {petName}&apos;s brain will do for you</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {payoffs.map((p) => (
          <div key={p.title} className="rounded-xl border border-[#eef1ef] bg-white p-3">
            <p.Icon className="h-[18px] w-[18px] text-[#1f9d6b]" aria-hidden />
            <p className="mt-1.5 text-[13px] font-medium text-[#1c2522]">{p.title}</p>
            <p className="text-[11px] leading-snug text-[#8a978f]">{p.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        const sig = (await sigRes.json().catch(() => null)) as SignalsResponse | null;
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
    return Array.from(new Set([...fromSignals, ...defaults])).slice(0, 5);
  }, [signals]);

  if (!userDataLoaded || loading) {
    return <div className="h-40 animate-pulse rounded-2xl border border-[#eef1ef] bg-[#f6f8f7]" aria-hidden />;
  }

  // No pet yet, or no logs yet → first-time hand-holding.
  if (!petId || logs.length === 0) {
    return <FirstTime petName={petName} />;
  }

  const meta = STATE_META[state];
  const reason =
    signals.length > 0
      ? signals.map((s) => s.owner_message).slice(0, 2).join(" ")
      : `Nothing stands out in ${petName}'s recent logs — keep the daily check-ins going.`;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
      <div className="space-y-3">
        <div
          className="rounded-2xl border border-[#eef1ef] bg-white p-4"
          style={{ borderLeft: `4px solid ${meta.line}` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: meta.bg, color: meta.fg }}>
                <meta.Icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#8a978f]">Current state</p>
                <p className="text-xl font-medium" style={{ color: meta.fg }}>{meta.label}</p>
              </div>
            </div>
            {signals.length > 0 && (
              <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: meta.bg, color: meta.fg }}>
                Pattern detected
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[#3f4a45]">
            <span className="font-medium">Why:</span> {reason}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/symptom-checker" target="_top" className="inline-flex items-center gap-1.5 rounded-lg bg-[#1f9d6b] px-3 py-2 text-xs font-medium text-white hover:bg-[#15795a]">
              <Stethoscope className="h-3.5 w-3.5" aria-hidden />
              Start symptom check
            </a>
            <a href="/health-log" target="_top" className="rounded-lg border border-[#cfe6da] bg-white px-3 py-2 text-xs font-medium text-[#15795a] hover:bg-[#f3f9f6]">
              Log today
            </a>
          </div>
        </div>

        {signals.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8a978f]">What PawVital noticed</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {signals.map((s) => (
                <SignalCard key={s.dedupe_key} signal={s} logs={logs} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-[#eef1ef] bg-white p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8a978f]">Next best action</p>
          <ul className="space-y-2.5">
            {actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[#3f4a45]">
                {i === 0 ? (
                  <CircleCheckBig className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1f9d6b]" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#c3cfc9]" aria-hidden />
                )}
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#d8ebe1] bg-[#f3f9f6] p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#15795a]" aria-hidden />
            <span className="text-sm font-medium text-[#1c2522]">Share with your vet</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[#6f8579]">A vet-ready report with logs, signals &amp; history.</p>
          <a href="/analytics" target="_top" className="mt-2.5 block rounded-lg bg-[#1f9d6b] py-2 text-center text-xs font-medium text-white hover:bg-[#15795a]">
            Create vet report
          </a>
        </div>
      </div>
    </div>
  );
}
