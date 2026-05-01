"use client";

import { useState, useCallback, useMemo, useSyncExternalStore } from "react";
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, BarChart, Bar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Copy, Check, Share2, UserPlus,
  ChevronRight, Sparkles, ArrowUpRight, ArrowDownRight,
  Shield, Printer, Heart, Zap, Save,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import {
  ALL_BEHAVIORS, computeScore, loadState, saveTodayLog, getTodayLog,
  getScoreHistory, getStats, getCorrelations, addFeedItem,
  type HubState,
} from "./paw-hub-store";

function getScoreColor(s: number) {
  if (s >= 80) return "#10b981";
  if (s >= 60) return "#f59e0b";
  if (s >= 40) return "#f97316";
  return "#ef4444";
}
function getScoreLabel(s: number) {
  if (s >= 80) return "Great";
  if (s >= 65) return "Good";
  if (s >= 50) return "Fair";
  if (s >= 35) return "Tough";
  return "Needs Attention";
}
function getScoreBg(s: number) {
  if (s >= 80) return "from-emerald-500 to-emerald-600";
  if (s >= 60) return "from-amber-500 to-amber-600";
  if (s >= 40) return "from-orange-500 to-orange-600";
  return "from-red-500 to-red-600";
}

function PawScoreRing({ score }: { score: number }) {
  const sz = 180, sw = 12;
  const r = (sz - sw) / 2, c = r * 2 * Math.PI;
  const offset = c - (score / 100) * c;
  const color = getScoreColor(score);
  return (
    <div className="relative" style={{ width: sz, height: sz }}>
      <svg width={sz} height={sz} className="-rotate-90">
        <circle cx={sz/2} cy={sz/2} r={r} stroke="#1f2937" strokeWidth={sw} fill="none" opacity={0.1} />
        <circle cx={sz/2} cy={sz/2} r={r} stroke={color} strokeWidth={sw} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black transition-colors duration-500" style={{ color }}>{score}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

function ScoreChart({ data }: { data: { label: string; score: number }[] }) {
  const avg = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.score, 0) / data.length) : 0;
  const wk = data.slice(-7);
  const avg7 = wk.length > 0 ? Math.round(wk.reduce((s, d) => s + d.score, 0) / wk.length) : 0;
  const prev = data.slice(-14, -7);
  const avgP = prev.length > 0 ? Math.round(prev.reduce((s, d) => s + d.score, 0) / prev.length) : avg7;
  const wd = avg7 - avgP;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">30-Day Trend</span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">30d avg: <strong className="text-gray-900">{avg}</strong></span>
          <span className="text-gray-500">7d avg: <strong className="text-gray-900">{avg7}</strong></span>
          <span className={`flex items-center gap-0.5 font-semibold ${wd >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {wd >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {wd >= 0 ? "+" : ""}{wd}
          </span>
        </div>
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} axisLine={false} tickLine={false} />
            <YAxis domain={[30, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v: number) => [`${v}/100`, "Paw Score"]} />
            <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fill="url(#sg)" dot={false} activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CorrelationCard({ c }: { c: ReturnType<typeof getCorrelations>[number] }) {
  const s = c.impact === "positive"
    ? { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "success" as const }
    : { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "danger" as const };
  return (
    <div className={`rounded-xl ${s.bg} ${s.border} border p-3`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${s.text} leading-snug`}>{c.insight}</p>
        <Badge variant={s.badge} className="shrink-0 text-[10px]">{c.delta}</Badge>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-400">
        <span>{c.confidence}% confidence</span>
        <span className="text-gray-300">·</span>
        <span>{c.behavior} → {c.metric}</span>
      </div>
    </div>
  );
}

const CIRCLE_MEMBERS = [
  { id: "m1", name: "You", role: "Primary caregiver", avatar: "👩", color: "bg-blue-500" },
  { id: "m2", name: "Mike", role: "Partner", avatar: "👨", color: "bg-emerald-500" },
  { id: "m3", name: "Sarah", role: "Pet sitter", avatar: "👩‍🦰", color: "bg-purple-500" },
  { id: "m4", name: "Dr. Wilson", role: "Veterinarian", avatar: "👨‍⚕️", color: "bg-amber-500" },
];

export default function PawHubPage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";

  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  const [hub, setHub] = useState<HubState>(() => loadState());
  const [active, setActive] = useState<Set<string>>(() => {
    const state = loadState();
    const today = getTodayLog(state);
    return today ? new Set(today.behaviors) : new Set();
  });
  const [note, setNote] = useState(() => {
    const state = loadState();
    const today = getTodayLog(state);
    return today?.note ?? "";
  });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggle = useCallback((id: string) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!hub) return;
    const ids = Array.from(active);
    const next = saveTodayLog(hub, ids, note);
    setHub(next);
    setSaved(true);

    const negatives = ids.filter(id => {
      const b = ALL_BEHAVIORS.find(x => x.id === id);
      return b && b.effect < 0;
    });
    if (negatives.length > 0) {
      const labels = negatives.map(id => ALL_BEHAVIORS.find(x => x.id === id)?.label ?? id);
      const withFeed = addFeedItem(next, "You", `Logged: ${labels.join(", ")}`, "📝");
      setHub(withFeed);
    }

    setTimeout(() => setSaved(false), 2000);
  }, [hub, active, note]);

  const score = useMemo(() => computeScore(Array.from(active)), [active]);
  const chartData = useMemo(() => hub ? getScoreHistory(hub) : [], [hub]);

  const todayInChart = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const label = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const withoutToday = chartData.filter(d => d.date !== today);
    return [...withoutToday, { date: today, label, score }];
  }, [chartData, score]);

  const stats = useMemo(() => hub ? getStats(hub) : null, [hub]);
  const correlations = useMemo(() => hub ? getCorrelations(hub) : [], [hub]);

  const yesterday = chartData.length >= 2 ? chartData[chartData.length - 2]?.score ?? score : score;
  const delta = score - yesterday;

  const weeklyScores = useMemo(() => {
    if (!hub) return [];
    const h = hub.history.slice(-28);
    const weeks: { week: string; score: number }[] = [];
    for (let w = 0; w < 4; w++) {
      const slice = h.slice(w * 7, (w + 1) * 7);
      if (slice.length === 0) continue;
      weeks.push({
        week: `Week ${w + 1}`,
        score: Math.round(slice.reduce((s, d) => s + d.score, 0) / slice.length),
      });
    }
    return weeks;
  }, [hub]);

  const handleCopy = useCallback(async () => {
    if (!stats) return;
    const text = [
      `${petName}'s Health Report — PawVital`,
      `Today's Paw Score: ${score}/100`,
      `30-day average: ${stats.avg30} | 7-day average: ${stats.avg7}`,
      `Good days: ${stats.goodDays} | Tough days: ${stats.toughDays}`,
      `Medication adherence: ${stats.medAdherence}%`,
      `Symptom episodes: ${stats.symptomEpisodes}`,
      "",
      "Generated by PawVital AI — pawvital.com",
    ].join("\n");
    try { await navigator.clipboard.writeText(text); } catch { /* */ }
    setCopied(true);
    if (hub) setHub(addFeedItem(hub, "You", "Copied health report", "📋"));
    setTimeout(() => setCopied(false), 2000);
  }, [petName, score, stats, hub]);

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        Loading Paw Hub...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/25">
            <span className="text-xl">🐾</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Paw Hub</h1>
            <p className="text-sm text-gray-500">{petName}&apos;s health command center</p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href="/triage" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/25 hover:bg-indigo-800 transition-colors">
            🌙 Late-Night Triage
          </a>
          <a href="/vet-prep" className="inline-flex items-center gap-1.5 rounded-xl border-2 border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors">
            Vet Prep <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Quick stats — all live */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5"><div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-sm">💊</div>
          <div><p className="text-lg font-bold text-gray-900">{stats.medAdherence}%</p><p className="text-[10px] text-gray-500 uppercase tracking-wide">Med Adherence</p></div>
        </div></Card>
        <Card className="p-3.5"><div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-sm">☀️</div>
          <div><p className="text-lg font-bold text-gray-900">{stats.goodDays}</p><p className="text-[10px] text-gray-500 uppercase tracking-wide">Good Days / {stats.totalDays}</p></div>
        </div></Card>
        <Card className="p-3.5"><div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-sm">⚠️</div>
          <div><p className="text-lg font-bold text-gray-900">{stats.symptomEpisodes}</p><p className="text-[10px] text-gray-500 uppercase tracking-wide">Symptom Episodes</p></div>
        </div></Card>
        <Card className="p-3.5"><div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-sm">👥</div>
          <div><p className="text-lg font-bold text-gray-900">{CIRCLE_MEMBERS.length}</p><p className="text-[10px] text-gray-500 uppercase tracking-wide">Care Circle</p></div>
        </div></Card>
      </div>

      {/* ── SECTION 1: Paw Score ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${getScoreBg(score)} text-white`}>
            <Zap className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Daily Paw Score</h2>
          <Badge variant={delta >= 0 ? "success" : "danger"} className="ml-auto">
            {delta >= 0 ? "+" : ""}{delta} vs yesterday
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2 p-6 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50/50 to-white">
            <PawScoreRing score={score} />
            <p className="mt-3 text-sm text-gray-600 text-center max-w-[200px]">{petName}&apos;s wellness right now</p>
            <div className="mt-2 flex items-center gap-1 text-xs">
              {delta > 0 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
              {delta < 0 && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              {delta === 0 && <Minus className="h-3.5 w-3.5 text-gray-400" />}
              <span className={delta > 0 ? "text-emerald-600 font-semibold" : delta < 0 ? "text-red-500 font-semibold" : "text-gray-500"}>
                {delta > 0 ? `Up ${delta} from yesterday` : delta < 0 ? `Down ${Math.abs(delta)} from yesterday` : "Same as yesterday"}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">Tap behaviors below to see the score change</p>
          </Card>
          <Card className="lg:col-span-3 p-5">
            <ScoreChart data={todayInChart} />
          </Card>
        </div>
      </section>

      {/* ── SECTION 2: Behavior Journal ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{petName}&apos;s Journal</h2>
          {active.size > 0 && <Badge variant="info">{active.size} logged</Badge>}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Today&apos;s Check-in — tap what happened</p>
            <div className="flex flex-wrap gap-2">
              {ALL_BEHAVIORS.map(b => (
                <button key={b.id} onClick={() => toggle(b.id)}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                    active.has(b.id)
                      ? b.effect >= 0
                        ? "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-300 shadow-sm"
                        : "bg-red-100 text-red-800 ring-2 ring-red-300 shadow-sm"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  <span>{b.emoji}</span><span>{b.label}</span>
                  {active.has(b.id) && (
                    <span className={`text-[10px] font-bold ${b.effect >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {b.effect >= 0 ? "+" : ""}{b.effect}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <textarea value={note} onChange={e => { setNote(e.target.value); setSaved(false); }}
              placeholder={`Anything else about ${petName} today?`} rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-3 flex items-center gap-3">
              <Button onClick={handleSave}>
                <Save className="mr-2 h-4 w-4" />
                {saved ? "Saved!" : "Save Today's Log"}
              </Button>
              {saved && <span className="text-sm text-emerald-600 font-medium">Score {score} saved to history ✓</span>}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI-Discovered Patterns</p>
            {correlations.length > 0 ? (
              <div className="space-y-2.5">
                {correlations.map(c => <CorrelationCard key={c.id} c={c} />)}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Keep logging for 5+ days to see AI-discovered patterns
              </div>
            )}
            <p className="mt-3 text-[10px] text-gray-400">
              Computed from {hub.history.length} days of {petName}&apos;s data. Updates when you save.
            </p>
          </Card>
        </div>
      </section>

      {/* ── SECTION 3: Monthly Report ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 text-white">
            <Heart className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Monthly Report</h2>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <><Check className="mr-1 h-3 w-3" />Copied</> : <><Copy className="mr-1 h-3 w-3" />Copy</>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1 h-3 w-3" />Print
            </Button>
            <Button size="sm" onClick={() => { if (hub) setHub(addFeedItem(hub, "You", "Shared report with vet", "📤")); }}>
              <Share2 className="mr-1 h-3 w-3" />Share with Vet
            </Button>
          </div>
        </div>
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80">{petName}&apos;s Health Summary</p>
                <p className="text-2xl font-black text-white mt-0.5">Last 30 Days</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-white/80">Average Paw Score</p>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-4xl font-black text-white">{stats.avg30}</span>
                  <span className={`flex items-center gap-0.5 text-sm font-bold ${stats.weekDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {stats.weekDelta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {stats.weekDelta >= 0 ? "+" : ""}{stats.weekDelta} this week
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
              <div className="rounded-xl bg-green-50 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{stats.goodDays}</p>
                <p className="text-xs text-green-600">Good Days</p>
              </div>
              <div className="rounded-xl bg-red-50 p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{stats.toughDays}</p>
                <p className="text-xs text-red-600">Tough Days</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{stats.medAdherence}%</p>
                <p className="text-xs text-blue-600">Med Adherence</p>
              </div>
              <div className="rounded-xl bg-purple-50 p-3 text-center">
                <p className="text-2xl font-bold text-purple-700">{stats.symptomEpisodes}</p>
                <p className="text-xs text-purple-600">Symptom Episodes</p>
              </div>
            </div>
            {weeklyScores.length > 0 && (
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyScores} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <Bar dataKey="score" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="bg-gray-50 px-5 py-2.5 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">All stats computed live from {petName}&apos;s logged data</p>
            <p className="text-[10px] text-gray-400">PawVital AI</p>
          </div>
        </Card>
      </section>

      {/* ── SECTION 4: Care Circle ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 text-white">
            <Shield className="h-4 w-4" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{petName}&apos;s Care Circle</h2>
          <Button variant="outline" size="sm" className="ml-auto">
            <UserPlus className="mr-1 h-3 w-3" />Invite
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{CIRCLE_MEMBERS.length} Members</p>
            <div className="space-y-3">
              {CIRCLE_MEMBERS.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${m.color} text-white text-lg`}>{m.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
              <UserPlus className="h-4 w-4" />Add pet sitter, family, or vet
            </button>
          </Card>
          <Card className="lg:col-span-3 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity Feed</p>
            <div className="space-y-0.5">
              {hub.feed.slice(0, 10).map(item => {
                const mem = CIRCLE_MEMBERS.find(m => m.name === item.who);
                return (
                  <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mem?.color ?? "bg-gray-400"} text-white text-sm`}>
                      {mem?.avatar ?? "👤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        <span className="font-semibold">{item.who}</span>{" "}
                        <span className="text-gray-600">{item.action}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.time}</p>
                    </div>
                    <span className="text-lg shrink-0">{item.icon}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </section>

      <div className="text-center py-6">
        <p className="text-sm text-gray-400">You carry the love. PawVital helps carry the details.</p>
      </div>
    </div>
  );
}
