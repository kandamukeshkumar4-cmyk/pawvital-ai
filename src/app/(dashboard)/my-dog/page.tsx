"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PawPrint, TrendingUp, TrendingDown, Minus, Calendar, Heart } from "lucide-react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import { loadCare, getChangeScore, BASELINE_CATEGORIES, type CareState } from "@/lib/care-engine/store";

const hydrate = useSyncExternalStore.bind(null, () => () => {}, () => true, () => false);

const RATING_SCORES: Record<string, number> = { better: 100, normal: 70, slightly_worse: 40, much_worse: 10 };

export default function MyDogPage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";
  const breed = activePet?.breed ?? "Senior Dog";
  const age = activePet ? `${activePet.age_years}y${activePet.age_months > 0 ? ` ${activePet.age_months}m` : ""}` : "10y";
  const weight = activePet ? `${activePet.weight} ${activePet.weight_unit}` : "68 lbs";
  const conditions = activePet?.existing_conditions ?? ["Arthritis"];
  const meds = activePet?.medications ?? ["Carprofen", "Glucosamine"];
  const ready = hydrate();

  const care: CareState = useMemo(() => loadCare(petName), [petName]);
  const cs = useMemo(() => getChangeScore(care), [care]);

  const chartData = useMemo(() => {
    return care.baseline.slice(-30).map((e) => {
      const vals = Object.values(e.ratings).map((r) => RATING_SCORES[r] ?? 70);
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 70;
      return {
        label: new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: avg,
      };
    });
  }, [care.baseline]);

  const categoryAverages = useMemo(() => {
    const last14 = care.baseline.slice(-14);
    return BASELINE_CATEGORIES.map((cat) => {
      const vals = last14.map((e) => RATING_SCORES[e.ratings[cat.id] ?? "normal"] ?? 70);
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 70;
      return { ...cat, avg };
    });
  }, [care.baseline]);

  const recentSymptoms = care.symptomLog.slice(0, 8);
  const completedPlans = care.plans.filter((p) => p.status === "completed").length;
  const daysTracked = care.baseline.length;

  if (!ready) return <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      {/* Profile Header */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-3xl">🐕</div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-gray-900">{petName}</h1>
            <p className="text-sm text-gray-500">{breed} · {age} · {weight}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black" style={{ color: cs.score >= 60 ? "#10b981" : cs.score >= 40 ? "#f59e0b" : "#ef4444" }}>{cs.score}</p>
            <div className="flex items-center justify-end gap-1 text-xs">
              {cs.trend === "improving" && <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Improving</span></>}
              {cs.trend === "stable" && <><Minus className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Stable</span></>}
              {cs.trend === "declining" && <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-500">Declining</span></>}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{daysTracked}</p>
            <p className="text-[10px] text-gray-500 uppercase">Days Tracked</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{recentSymptoms.length}</p>
            <p className="text-[10px] text-gray-500 uppercase">Symptoms Logged</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">{completedPlans}</p>
            <p className="text-[10px] text-gray-500 uppercase">Plans Completed</p>
          </div>
        </div>
      </Card>

      {/* Conditions & Meds */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {conditions.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              <PawPrint className="inline h-3 w-3 mr-1" />Conditions
            </p>
            <div className="flex flex-wrap gap-1.5">{conditions.map((c) => <Badge key={c} variant="warning">{c}</Badge>)}</div>
          </Card>
        )}
        {meds.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              <Heart className="inline h-3 w-3 mr-1" />Medications
            </p>
            <div className="flex flex-wrap gap-1.5">{meds.map((m) => <Badge key={m} variant="info">{m}</Badge>)}</div>
          </Card>
        )}
      </div>

      {/* Baseline Trend Chart */}
      {chartData.length > 3 && (
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Health Trend — Last 30 Days</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="mdg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }} formatter={(v: number) => [`${v}`, "Score"]} />
                <Area type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2.5} fill="url(#mdg)" dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Category Breakdown */}
      <Card className="p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">14-Day Category Averages</p>
        <div className="space-y-3">
          {categoryAverages.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="text-lg w-8">{cat.emoji}</span>
              <span className="text-sm font-medium text-gray-800 w-28">{cat.label}</span>
              <div className="flex-1 h-3 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${cat.avg >= 70 ? "bg-emerald-500" : cat.avg >= 45 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${cat.avg}%` }}
                />
              </div>
              <span className="text-xs font-bold text-gray-600 w-8 text-right">{cat.avg}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Changes */}
      {cs.changes.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Patterns Noticed</p>
          {cs.changes.map((c, i) => (
            <p key={i} className="text-sm text-amber-900 flex items-start gap-2 mb-1">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />{c}
            </p>
          ))}
        </Card>
      )}

      {/* Symptom Timeline */}
      {recentSymptoms.length > 0 && (
        <Card className="p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
            <Calendar className="inline h-3 w-3 mr-1" />Recent Symptom Log
          </p>
          <div className="space-y-2">
            {recentSymptoms.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                <span className="text-xs text-gray-400 w-16 shrink-0">{s.date.slice(5)}</span>
                <span className="text-sm text-gray-800 flex-1">{s.symptom}</span>
                <Badge variant={s.verdict === "normal" ? "success" : s.verdict === "urgent" ? "danger" : "warning"}>
                  {s.verdict}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
