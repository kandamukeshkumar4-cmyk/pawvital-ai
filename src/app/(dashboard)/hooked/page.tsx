"use client";

import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  ArrowUpRight, ArrowDownRight, ChevronRight, Check, Share2, Lock,
  Sparkles, Printer, Copy, Flame, Trophy, Shield, AlertTriangle, Heart,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import {
  load, logToday, getIsNormalResponse, getInsightForDay, getNextInsightDay,
  QUICK_SYMPTOMS, DAILY_BEHAVIORS,
  type HookedState,
} from "./store";

const hydrate = useSyncExternalStore.bind(null, () => () => {}, () => true, () => false);

function scoreColor(s: number) {
  if (s >= 75) return "#10b981";
  if (s >= 55) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}
function scoreLabel(s: number) {
  if (s >= 75) return "Good";
  if (s >= 55) return "Fair";
  if (s >= 35) return "Tough";
  return "Needs Attention";
}

/* ─── IS THIS NORMAL? ─── */

function IsThisNormal({ petName, state, onCheckSymptom }: {
  petName: string;
  state: HookedState;
  onCheckSymptom: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof getIsNormalResponse> | null>(null);

  const handleTap = useCallback((id: string) => {
    setSelected(id);
    const r = getIsNormalResponse(id, petName, state.history);
    setResult(r);
    onCheckSymptom(id);
  }, [petName, state.history, onCheckSymptom]);

  const verdictStyles = {
    normal: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-800", badge: "success" as const, label: "Likely Normal" },
    watch: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-800", badge: "warning" as const, label: "Worth Watching" },
    concern: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800", badge: "warning" as const, label: "Monitor Closely" },
    urgent: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", badge: "danger" as const, label: "Call Your Vet" },
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-lg shadow-violet-500/20">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">Is This Normal?</h2>
          <p className="text-xs text-gray-500">One tap. Instant context-aware answer for {petName}.</p>
        </div>
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">What are you seeing right now?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {QUICK_SYMPTOMS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleTap(s.id)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left transition-all ${
                selected === s.id
                  ? "border-indigo-500 bg-indigo-50 shadow-sm"
                  : "border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
              }`}
            >
              <span className="text-lg">{s.emoji}</span>
              <span className="text-sm font-medium text-gray-800">{s.label}</span>
            </button>
          ))}
        </div>

        {result && (
          <div className={`mt-4 rounded-2xl ${verdictStyles[result.verdict].bg} ${verdictStyles[result.verdict].border} border-2 p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={verdictStyles[result.verdict].badge} className="text-sm px-3 py-1">
                {verdictStyles[result.verdict].label}
              </Badge>
              {result.verdict === "urgent" && <span className="text-sm">🚨</span>}
              {result.verdict === "normal" && <span className="text-sm">✅</span>}
            </div>
            <p className={`text-sm leading-relaxed ${verdictStyles[result.verdict].text}`}>
              {result.message}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <Shield className="h-3 w-3" />
              <span>Based on {petName}&apos;s 14-day history and profile. Not a diagnosis.</span>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

/* ─── CARE STREAK ─── */

function CareStreak({ state, petName }: { state: HookedState; petName: string }) {
  const nextInsight = getNextInsightDay(state.streak);
  const daysUntil = nextInsight - state.streak;
  const insight = getInsightForDay(state.streak);
  const progressToNext = ((state.streak % 7) / 7) * 100;

  const streakDots = useMemo(() => {
    const dots: { day: number; filled: boolean; isToday: boolean; hasInsight: boolean }[] = [];
    for (let i = Math.max(1, state.streak - 6); i <= state.streak + 7; i++) {
      dots.push({
        day: i,
        filled: i <= state.streak,
        isToday: i === state.streak + 1,
        hasInsight: !!getInsightForDay(i),
      });
    }
    return dots;
  }, [state.streak]);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/20">
          <Flame className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">Care Streak</h2>
          <p className="text-xs text-gray-500">Log daily to unlock insights about {petName}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-orange-100 px-4 py-2">
          <Flame className="h-4 w-4 text-orange-600" />
          <span className="text-lg font-black text-orange-700">{state.streak}</span>
          <span className="text-xs font-semibold text-orange-600">days</span>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
          {streakDots.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1 shrink-0">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  d.filled
                    ? d.hasInsight
                      ? "bg-gradient-to-br from-yellow-400 to-orange-500 text-white shadow-md"
                      : "bg-gradient-to-br from-orange-400 to-red-500 text-white"
                    : d.isToday
                      ? "border-2 border-dashed border-orange-400 text-orange-500"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {d.filled ? (d.hasInsight ? "★" : "✓") : d.day}
              </div>
              {d.isToday && (
                <span className="text-[9px] font-bold text-orange-500 uppercase">Today</span>
              )}
            </div>
          ))}
        </div>

        {insight && (
          <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-4 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-yellow-600" />
              <span className="text-xs font-bold text-yellow-700 uppercase">Day {state.streak} Insight Unlocked</span>
            </div>
            <p className="text-sm text-yellow-900">{insight}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <Trophy className="inline h-3 w-3 mr-1 text-gray-400" />
            Next insight in <strong className="text-gray-800">{daysUntil} day{daysUntil !== 1 ? "s" : ""}</strong>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-700" style={{ width: `${progressToNext}%` }} />
            </div>
            <span className="text-[10px] text-gray-400">{Math.round(progressToNext)}%</span>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          <span>{state.insightsUnlocked} insights unlocked · {7 - state.insightsUnlocked} more to discover</span>
        </div>
      </Card>
    </section>
  );
}

/* ─── VET REPORT PREVIEW ─── */

function VetReportPreview({ state, petName }: { state: HookedState; petName: string }) {
  const [copied, setCopied] = useState(false);
  const strength = state.vetReportStrength;
  const hist = state.history;
  const last7 = hist.slice(-7);
  const goodDays = last7.filter((d) => d.score >= 60).length;
  const symptoms = last7.flatMap((d) => d.symptomChecks);
  const uniqueSymptoms = [...new Set(symptoms)];
  const medsGiven = last7.filter((d) => d.behaviors.includes("meds_given")).length;

  const chartData = hist.slice(-14).map((d) => ({
    label: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    score: d.score,
  }));

  const handleCopy = useCallback(async () => {
    try { await navigator.clipboard.writeText(`${petName}'s PawVital Vet Report — ${hist.length} days tracked`); } catch { /* */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [petName, hist.length]);

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
          <Heart className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">Vet Report</h2>
          <p className="text-xs text-gray-500">Grows stronger every day you log</p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Strength bar */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white/80">Report Strength</span>
            <span className="text-2xl font-black text-white">{strength}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-1000 ease-out"
              style={{ width: `${strength}%` }}
            />
          </div>
          <p className="text-xs text-white/60 mt-2">
            {strength < 50
              ? `Keep logging! ${Math.ceil((15 - hist.length) * 1)} more days until your report is vet-ready.`
              : strength < 80
                ? "Getting strong. A few more weeks of data will make this really useful for your vet."
                : "Your vet report is comprehensive. Share it before your next visit."}
          </p>
        </div>

        <div className="p-5">
          {/* Mini preview */}
          <div className="rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{petName}&apos;s Health Summary</span>
              <span className="text-xs text-gray-400">{hist.length} days tracked</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">{goodDays}/7</p>
                <p className="text-[10px] text-gray-500">Good Days</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-blue-600">{medsGiven}/7</p>
                <p className="text-[10px] text-gray-500">Meds Given</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-amber-600">{uniqueSymptoms.length}</p>
                <p className="text-[10px] text-gray-500">Symptoms</p>
              </div>
            </div>
            {chartData.length > 2 && (
              <div className="h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vrg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={2} axisLine={false} tickLine={false} />
                    <YAxis domain={[20, 100]} hide />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 11 }} formatter={(v: number) => [`${v}`, "Score"]} />
                    <Area type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} fill="url(#vrg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Locked sections preview */}
          {strength < 100 && (
            <div className="space-y-2 mb-4">
              {[
                { label: "Medication Reaction Analysis", need: 21 },
                { label: "Behavior-to-Pain Correlations", need: 25 },
                { label: "Full Monthly Comparison", need: 30 },
              ].filter((s) => hist.length < s.need).map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 opacity-60">
                  <Lock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{s.label}</span>
                  <span className="ml-auto text-[10px] text-gray-400">Unlocks at day {s.need}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" size="sm">
              {copied ? <><Check className="mr-1 h-3 w-3" />Copied</> : <><Copy className="mr-1 h-3 w-3" />Copy Report</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1 h-3 w-3" />Print
            </Button>
            <Button size="sm">
              <Share2 className="mr-1 h-3 w-3" />Share with Vet
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

/* ─── DEVIATION ALERT PREVIEW ─── */

function DeviationAlerts({ petName, state }: { petName: string; state: HookedState }) {
  const hist = state.history;
  const alerts: { id: string; title: string; body: string; severity: "info" | "warn" | "alert" }[] = [];

  const last7 = hist.slice(-7);
  const prev7 = hist.slice(-14, -7);
  if (last7.length >= 5 && prev7.length >= 5) {
    const avgNow = last7.reduce((s, d) => s + d.score, 0) / last7.length;
    const avgPrev = prev7.reduce((s, d) => s + d.score, 0) / prev7.length;
    if (avgNow < avgPrev - 5) {
      alerts.push({
        id: "score_drop",
        title: `${petName}'s score is trending down`,
        body: `Average dropped from ${Math.round(avgPrev)} to ${Math.round(avgNow)} over the past week. Consider mentioning this to your vet.`,
        severity: "warn",
      });
    }

    const painDays = last7.filter((d) => d.behaviors.includes("pain_signs")).length;
    if (painDays >= 3) {
      alerts.push({
        id: "pain_freq",
        title: "Pain signs detected 3+ days this week",
        body: `${petName} showed pain signs on ${painDays} of the last 7 days. This frequency is worth a vet conversation.`,
        severity: "alert",
      });
    }

    const noWalk = last7.filter((d) => !d.behaviors.includes("walk")).length;
    if (noWalk >= 5) {
      alerts.push({
        id: "low_walks",
        title: "Activity is lower than usual",
        body: `${petName} only walked ${7 - noWalk} of the last 7 days. Reduced activity in a senior dog can signal discomfort.`,
        severity: "info",
      });
    }
  }

  if (alerts.length === 0 && hist.length >= 14) {
    alerts.push({
      id: "all_good",
      title: `${petName} is within normal range`,
      body: "No significant deviations detected this week. Keep logging — early detection is the whole point.",
      severity: "info",
    });
  }

  const severityStyles = {
    info: { bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500" },
    warn: { bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
    alert: { bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  };

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-gray-900">{petName} Changed</h2>
          <p className="text-xs text-gray-500">Alerts when something deviates from {petName}&apos;s baseline</p>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.map((a) => {
          const s = severityStyles[a.severity];
          return (
            <Card key={a.id} className={`p-4 ${s.bg} ${s.border} border`}>
              <div className="flex items-start gap-3">
                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{a.body}</p>
                </div>
              </div>
            </Card>
          );
        })}

        {hist.length < 14 && (
          <Card className="p-4 border-dashed border-gray-300">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-semibold text-gray-500">Deviation alerts activate at day 14</p>
                <p className="text-xs text-gray-400">{14 - hist.length} more days of logging needed to build {petName}&apos;s baseline</p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}

/* ─── DAILY CHECK-IN ─── */

function DailyCheckin({ petName, state, onSave }: {
  petName: string;
  state: HookedState;
  onSave: (behaviors: string[], symptoms: string[], note: string) => void;
}) {
  const [behaviors, setBehaviors] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const score = useMemo(() => {
    return 50 + Array.from(behaviors).reduce((sum, id) => {
      const b = DAILY_BEHAVIORS.find((x) => x.id === id);
      return sum + (b?.effect ?? 0);
    }, 0);
  }, [behaviors]);

  const toggle = useCallback((id: string) => {
    setBehaviors((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    onSave(Array.from(behaviors), [], note);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [behaviors, note, onSave]);

  return (
    <Card className="p-5 border-2 border-indigo-200 bg-gradient-to-b from-indigo-50/50 to-white">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-gray-900">Log {petName}&apos;s Day</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Today&apos;s score:</span>
          <span className="text-lg font-black" style={{ color: scoreColor(score) }}>{score}</span>
          <span className="text-xs" style={{ color: scoreColor(score) }}>{scoreLabel(score)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {DAILY_BEHAVIORS.map((b) => (
          <button key={b.id} onClick={() => toggle(b.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-all ${
              behaviors.has(b.id)
                ? b.effect >= 0
                  ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300"
                  : "bg-red-100 text-red-800 ring-2 ring-red-300"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span>{b.emoji}</span><span>{b.label}</span>
            {behaviors.has(b.id) && (
              <span className={`text-[10px] font-bold ${b.effect >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {b.effect >= 0 ? "+" : ""}{b.effect}
              </span>
            )}
          </button>
        ))}
      </div>

      <textarea value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        placeholder={`Anything else about ${petName} today?`} rows={2}
        className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
      />

      <div className="flex items-center gap-3">
        <Button onClick={handleSave}>
          {saved ? <><Check className="mr-2 h-4 w-4" />Saved!</> : <>Save Check-in <ChevronRight className="ml-1 h-4 w-4" /></>}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">
            Streak: {state.streak + 1} days 🔥 · Report strength grew!
          </span>
        )}
      </div>
    </Card>
  );
}

/* ─── MAIN PAGE ─── */

export default function HookedPrototype() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";
  const ready = hydrate();

  const [state, setState] = useState<HookedState>(() => load());

  const handleSave = useCallback((behaviors: string[], symptoms: string[], note: string) => {
    setState((prev) => logToday(prev, behaviors, symptoms, note));
  }, []);

  const handleCheckSymptom = useCallback((id: string) => {
    setState((prev) => {
      const todayDate = new Date().toISOString().split("T")[0];
      const todayEntry = prev.history.find((e) => e.date === todayDate);
      if (todayEntry && !todayEntry.symptomChecks.includes(id)) {
        const updated = prev.history.map((e) =>
          e.date === todayDate ? { ...e, symptomChecks: [...e.symptomChecks, id] } : e,
        );
        return { ...prev, history: updated };
      }
      return prev;
    });
  }, []);

  const todayScore = useMemo(() => {
    const todayDate = new Date().toISOString().split("T")[0];
    const entry = state.history.find((e) => e.date === todayDate);
    return entry?.score ?? state.history[state.history.length - 1]?.score ?? 50;
  }, [state.history]);

  const yesterdayScore = state.history.length >= 2
    ? state.history[state.history.length - 2]?.score ?? todayScore : todayScore;
  const delta = todayScore - yesterdayScore;

  if (!ready) return <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      {/* Hero */}
      <div className="text-center pt-2">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/20 mb-4">
          <span className="text-3xl">🐾</span>
        </div>
        <h1 className="text-3xl font-black text-gray-900">{petName}&apos;s Health Hub</h1>
        <p className="text-sm text-gray-500 mt-1">Your senior dog&apos;s daily health operating system</p>
      </div>

      {/* Live score strip */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-4xl font-black" style={{ color: scoreColor(todayScore) }}>{todayScore}</p>
          <p className="text-xs text-gray-500">Today&apos;s Score</p>
        </div>
        <div className="h-10 w-px bg-gray-200" />
        <div className="text-center">
          <div className={`flex items-center gap-1 text-lg font-bold ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {delta >= 0 ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
            {delta >= 0 ? "+" : ""}{delta}
          </div>
          <p className="text-xs text-gray-500">vs Yesterday</p>
        </div>
        <div className="h-10 w-px bg-gray-200" />
        <div className="text-center">
          <p className="text-lg font-bold text-orange-600">🔥 {state.streak}</p>
          <p className="text-xs text-gray-500">Day Streak</p>
        </div>
        <div className="h-10 w-px bg-gray-200" />
        <div className="text-center">
          <p className="text-lg font-bold text-emerald-600">{state.vetReportStrength}%</p>
          <p className="text-xs text-gray-500">Vet Report</p>
        </div>
      </div>

      {/* Feature 1: Is This Normal? */}
      <IsThisNormal petName={petName} state={state} onCheckSymptom={handleCheckSymptom} />

      {/* Feature 2: Daily Check-in */}
      <DailyCheckin petName={petName} state={state} onSave={handleSave} />

      {/* Feature 3: Care Streak */}
      <CareStreak state={state} petName={petName} />

      {/* Feature 4: Vet Report */}
      <VetReportPreview state={state} petName={petName} />

      {/* Feature 5: Deviation Alerts */}
      <DeviationAlerts petName={petName} state={state} />

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-sm text-gray-400">From symptom panic to vet-ready clarity.</p>
        <p className="text-xs text-gray-300 mt-1">You carry the love. PawVital helps carry the details.</p>
      </div>
    </div>
  );
}
