"use client";

import { useState, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Copy,
  Check,
  Share2,
  UserPlus,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Shield,
  Printer,
  Heart,
  Zap,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import {
  DEMO_SCORE_HISTORY,
  DEMO_TODAY_SCORE,
  DEMO_BEHAVIORS,
  DEMO_CORRELATIONS,
  DEMO_CARE_CIRCLE,
  DEMO_ACTIVITY_FEED,
  DEMO_MONTHLY_REPORT,
  type BehaviorLog,
  type AICorrelation,
} from "./demo-data";

function getScoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Great";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 35) return "Tough";
  return "Needs Attention";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "from-emerald-500 to-emerald-600";
  if (score >= 60) return "from-amber-500 to-amber-600";
  if (score >= 40) return "from-orange-500 to-orange-600";
  return "from-red-500 to-red-600";
}

/* ──────────────────────────────────────────────
   SECTION 1: Daily Paw Score
   ────────────────────────────────────────────── */

function PawScoreRing({ score }: { score: number }) {
  const size = 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#1f2937" strokeWidth={strokeWidth} fill="none" opacity={0.1}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black" style={{ color }}>{score}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest mt-1">
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

function ScoreSparkline() {
  const data = DEMO_SCORE_HISTORY;
  const avg = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);
  const weekData = data.slice(-7);
  const weekAvg = Math.round(weekData.reduce((s, d) => s + d.score, 0) / weekData.length);
  const prevWeekData = data.slice(-14, -7);
  const prevWeekAvg = prevWeekData.length > 0
    ? Math.round(prevWeekData.reduce((s, d) => s + d.score, 0) / prevWeekData.length)
    : weekAvg;
  const weekDelta = weekAvg - prevWeekAvg;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          30-Day Trend
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">30d avg: <strong className="text-gray-900">{avg}</strong></span>
          <span className="text-gray-500">7d avg: <strong className="text-gray-900">{weekAvg}</strong></span>
          <span className={`flex items-center gap-0.5 font-semibold ${weekDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {weekDelta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {weekDelta >= 0 ? "+" : ""}{weekDelta}
          </span>
        </div>
      </div>
      <div className="h-[140px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }}
              interval={4} axisLine={false} tickLine={false}
            />
            <YAxis
              domain={[40, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false} tickLine={false} width={30}
            />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
              formatter={(value: number) => [`${value}/100`, "Paw Score"]}
            />
            <Area
              type="monotone" dataKey="score"
              stroke="#6366f1" strokeWidth={2.5}
              fill="url(#scoreGradient)"
              dot={false}
              activeDot={{ r: 5, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DailyPawScore({ petName }: { petName: string }) {
  const score = DEMO_TODAY_SCORE;
  const yesterday = DEMO_SCORE_HISTORY[DEMO_SCORE_HISTORY.length - 2]?.score ?? score;
  const delta = score - yesterday;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${getScoreBg(score)} text-white`}>
          <Zap className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Daily Paw Score</h2>
        <Badge variant="info" className="ml-auto">
          {delta >= 0 ? "+" : ""}{delta} vs yesterday
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2 p-6 flex flex-col items-center justify-center bg-gradient-to-b from-gray-50/50 to-white">
          <PawScoreRing score={score} />
          <p className="mt-3 text-sm text-gray-600 text-center max-w-[200px]">
            {petName}&apos;s overall wellness today
          </p>
          <div className="mt-3 flex items-center gap-1 text-xs">
            {delta > 0 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
            {delta < 0 && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
            {delta === 0 && <Minus className="h-3.5 w-3.5 text-gray-400" />}
            <span className={delta > 0 ? "text-emerald-600 font-semibold" : delta < 0 ? "text-red-500 font-semibold" : "text-gray-500"}>
              {delta > 0 ? `Up ${delta} from yesterday` : delta < 0 ? `Down ${Math.abs(delta)} from yesterday` : "Same as yesterday"}
            </span>
          </div>
        </Card>

        <Card className="lg:col-span-3 p-5">
          <ScoreSparkline />
        </Card>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   SECTION 2: Behavior Journal
   ────────────────────────────────────────────── */

function BehaviorJournal({ petName }: { petName: string }) {
  const [behaviors, setBehaviors] = useState<BehaviorLog[]>(DEMO_BEHAVIORS);
  const [note, setNote] = useState("");
  const [showCorrelations, setShowCorrelations] = useState(true);

  const toggleBehavior = useCallback((id: string) => {
    setBehaviors(prev => prev.map(b => b.id === id ? { ...b, active: !b.active } : b));
  }, []);

  const activeCount = behaviors.filter(b => b.active).length;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{petName}&apos;s Journal</h2>
        {activeCount > 0 && (
          <Badge variant="info">{activeCount} logged today</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Quick-tap behaviors */}
        <Card className="p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Today&apos;s Check-in
          </p>
          <div className="flex flex-wrap gap-2">
            {behaviors.map(b => (
              <button
                key={b.id}
                onClick={() => toggleBehavior(b.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                  b.active
                    ? "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-300 shadow-sm"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                <span>{b.emoji}</span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`Anything else about ${petName} today?`}
            rows={2}
            className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </Card>

        {/* AI Correlations */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              AI-Discovered Patterns
            </p>
            <button
              onClick={() => setShowCorrelations(!showCorrelations)}
              className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
            >
              {showCorrelations ? "Hide" : "Show"}
            </button>
          </div>
          {showCorrelations && (
            <div className="space-y-2.5">
              {DEMO_CORRELATIONS.slice(0, 4).map(c => (
                <CorrelationCard key={c.id} correlation={c} />
              ))}
            </div>
          )}
          <p className="mt-3 text-[10px] text-gray-400">
            Based on 30 days of {petName}&apos;s logged data. Correlations require 5+ entries.
          </p>
        </Card>
      </div>
    </section>
  );
}

function CorrelationCard({ correlation: c }: { correlation: AICorrelation }) {
  const colors = {
    positive: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "success" as const },
    negative: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "danger" as const },
    neutral: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", badge: "default" as const },
  };
  const s = colors[c.impact];

  return (
    <div className={`rounded-xl ${s.bg} ${s.border} border p-3`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-medium ${s.text} leading-snug`}>{c.insight}</p>
        <Badge variant={s.badge} className="shrink-0 text-[10px]">{c.delta}</Badge>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[10px] text-gray-400">{c.confidence}% confidence</span>
        <span className="text-[10px] text-gray-300">·</span>
        <span className="text-[10px] text-gray-400">{c.behavior} → {c.metric}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   SECTION 3: Monthly Health Report
   ────────────────────────────────────────────── */

function MonthlyReport({ petName }: { petName: string }) {
  const r = DEMO_MONTHLY_REPORT;
  const [copied, setCopied] = useState(false);
  const scoreDelta = r.avgScore - r.prevAvgScore;

  const weeklyScores = useMemo(() => [
    { week: "Week 1", score: 76 },
    { week: "Week 2", score: 73 },
    { week: "Week 3", score: 68 },
    { week: "Week 4", score: 71 },
  ], []);

  const handleCopy = useCallback(async () => {
    const text = [
      `${petName}'s ${r.month} Health Report — PawVital`,
      `Average Paw Score: ${r.avgScore}/100 (${scoreDelta >= 0 ? "+" : ""}${scoreDelta} vs last month)`,
      `Good days: ${r.goodDays} | Tough days: ${r.toughDays} | Logged: ${r.totalDays}/30`,
      `Medication adherence: ${r.medAdherence}%`,
      `Top concern: ${r.topConcern}`,
      `Key insight: ${r.topInsight}`,
      `Symptom episodes: ${r.symptomCount} | Vet visits: ${r.vetVisits}`,
      "",
      "Generated by PawVital AI — pawvital.com",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* fallback not needed for prototype */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [petName, r, scoreDelta]);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 text-white">
          <Heart className="h-4 w-4" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">{r.month} Report</h2>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <><Check className="mr-1 h-3 w-3" />Copied</> : <><Copy className="mr-1 h-3 w-3" />Copy</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-3 w-3" />Print
          </Button>
          <Button size="sm">
            <Share2 className="mr-1 h-3 w-3" />Share with Vet
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">{petName}&apos;s Monthly Health Report</p>
              <p className="text-2xl font-black text-white mt-0.5">{r.month}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/80">Average Paw Score</p>
              <div className="flex items-center justify-end gap-2">
                <span className="text-4xl font-black text-white">{r.avgScore}</span>
                <span className={`flex items-center gap-0.5 text-sm font-bold ${scoreDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {scoreDelta >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {scoreDelta >= 0 ? "+" : ""}{scoreDelta}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5">
            <div className="rounded-xl bg-green-50 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{r.goodDays}</p>
              <p className="text-xs text-green-600">Good Days</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{r.toughDays}</p>
              <p className="text-xs text-red-600">Tough Days</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{r.medAdherence}%</p>
              <p className="text-xs text-blue-600">Med Adherence</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{r.symptomCount}</p>
              <p className="text-xs text-purple-600">Symptom Episodes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekly Score Trend</p>
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
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Top Concern</p>
                <p className="text-sm text-amber-900">{r.topConcern}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Key Insight</p>
                <p className="text-sm text-emerald-900">{r.topInsight}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Vet Visits</p>
                <p className="text-sm text-gray-900">{r.vetVisits} visit{r.vetVisits !== 1 ? "s" : ""} this month</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">Generated by PawVital AI</p>
          <p className="text-[10px] text-gray-400">pawvital.com</p>
        </div>
      </Card>
    </section>
  );
}

/* ──────────────────────────────────────────────
   SECTION 4: Care Circle
   ────────────────────────────────────────────── */

function CareCircle({ petName }: { petName: string }) {
  return (
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
        {/* Members */}
        <Card className="lg:col-span-2 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {DEMO_CARE_CIRCLE.length} Members
          </p>
          <div className="space-y-3">
            {DEMO_CARE_CIRCLE.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${m.color} text-white text-lg`}>
                  {m.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.role}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {m.lastActive}
                </div>
              </div>
            ))}
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
            <UserPlus className="h-4 w-4" />
            Add pet sitter, family, or vet
          </button>
        </Card>

        {/* Activity feed */}
        <Card className="lg:col-span-3 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Activity Feed
          </p>
          <div className="space-y-0.5">
            {DEMO_ACTIVITY_FEED.map((item) => {
              const member = DEMO_CARE_CIRCLE.find(m => m.id === item.memberId);
              return (
                <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${member?.color ?? "bg-gray-400"} text-white text-sm`}>
                    {member?.avatar ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-semibold">{item.memberName}</span>{" "}
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
  );
}

/* ──────────────────────────────────────────────
   MAIN PAGE
   ────────────────────────────────────────────── */

export default function PawHubPage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      {/* Hero header */}
      <div>
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
            <a
              href="/triage"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/25 hover:bg-indigo-800 transition-colors"
            >
              🌙 Late-Night Triage
            </a>
            <a
              href="/vet-prep"
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-emerald-600 px-4 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              Vet Prep <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 text-sm">💊</div>
            <div>
              <p className="text-lg font-bold text-gray-900">93%</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Med Adherence</p>
            </div>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 text-sm">☀️</div>
            <div>
              <p className="text-lg font-bold text-gray-900">18</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Good Days / 30</p>
            </div>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 text-sm">⚠️</div>
            <div>
              <p className="text-lg font-bold text-gray-900">12</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Symptom Episodes</p>
            </div>
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-sm">👥</div>
            <div>
              <p className="text-lg font-bold text-gray-900">4</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Care Circle</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Section 1: Paw Score */}
      <DailyPawScore petName={petName} />

      {/* Section 2: Behavior Journal */}
      <BehaviorJournal petName={petName} />

      {/* Section 3: Monthly Report */}
      <MonthlyReport petName={petName} />

      {/* Section 4: Care Circle */}
      <CareCircle petName={petName} />

      {/* Bottom tagline */}
      <div className="text-center py-6">
        <p className="text-sm text-gray-400">
          You carry the love. PawVital helps carry the details.
        </p>
      </div>
    </div>
  );
}
