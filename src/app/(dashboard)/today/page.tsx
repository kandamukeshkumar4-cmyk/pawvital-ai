"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { Check, ChevronRight, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";
import {
  loadCare, logBaseline, checkInPlan, getChangeScore,
  BASELINE_CATEGORIES,
  type CareState, type BaselineCategory, type DailyRating,
} from "@/lib/care-engine/store";

const hydrate = useSyncExternalStore.bind(null, () => () => {}, () => true, () => false);

const RATING_OPTIONS: { value: DailyRating; label: string; color: string }[] = [
  { value: "better", label: "Better", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "normal", label: "Normal", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "slightly_worse", label: "A bit off", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "much_worse", label: "Worse", color: "bg-red-100 text-red-700 border-red-300" },
];

export default function TodayPage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "Cooper";
  const ready = hydrate();

  const [care, setCare] = useState<CareState>(() => loadCare(petName));
  const [ratings, setRatings] = useState<Partial<Record<BaselineCategory, DailyRating>>>({});
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [activeCheckIn, setActiveCheckIn] = useState<string | null>(null);
  const [checkInAnswers, setCheckInAnswers] = useState<Record<string, string>>({});
  const [checkInSaved, setCheckInSaved] = useState(false);

  const changeScore = getChangeScore(care);
  const activePlans = care.plans.filter((p) => p.status === "active");
  const todayEntry = care.baseline.find((e) => e.date === new Date().toISOString().split("T")[0]);
  const filledCount = Object.keys(ratings).length;

  const handleRate = useCallback((cat: BaselineCategory, val: DailyRating) => {
    setRatings((prev) => ({ ...prev, [cat]: val }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    const next = logBaseline(care, ratings, note);
    setCare(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [care, ratings, note]);

  const handleCheckInAnswer = useCallback((q: string, a: string) => {
    setCheckInAnswers((prev) => ({ ...prev, [q]: a }));
  }, []);

  const handleSubmitCheckIn = useCallback(() => {
    if (!activeCheckIn) return;
    const next = checkInPlan(care, activeCheckIn, checkInAnswers);
    setCare(next);
    setCheckInSaved(true);
    setActiveCheckIn(null);
    setCheckInAnswers({});
    setTimeout(() => setCheckInSaved(false), 3000);
  }, [care, activeCheckIn, checkInAnswers]);

  if (!ready) return <div className="flex items-center justify-center py-24 text-gray-400">Loading...</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      {/* Change Score */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Today</h1>
          <p className="text-sm text-gray-500">How is {petName} doing?</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <span className="text-3xl font-black" style={{ color: changeScore.score >= 60 ? "#10b981" : changeScore.score >= 40 ? "#f59e0b" : "#ef4444" }}>
              {changeScore.score}
            </span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            {changeScore.trend === "improving" && <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600 font-semibold">Improving</span></>}
            {changeScore.trend === "stable" && <><Minus className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Stable</span></>}
            {changeScore.trend === "declining" && <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-500 font-semibold">Declining</span></>}
          </div>
        </div>
      </div>

      {/* Changes noticed */}
      {changeScore.changes.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Changes Noticed</p>
          {changeScore.changes.map((c, i) => (
            <p key={i} className="text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />{c}
            </p>
          ))}
        </Card>
      )}

      {/* Active Care Plans */}
      {activePlans.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Active Care Plans</h2>
          {activePlans.map((plan) => (
            <Card key={plan.id} className="p-4 mb-3 border-indigo-200 bg-indigo-50/50">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">{plan.title}</p>
                  <p className="text-xs text-gray-500">{plan.checkIns.length} check-in{plan.checkIns.length !== 1 ? "s" : ""} completed</p>
                </div>
                <Badge variant="info">Active</Badge>
              </div>

              {plan.nextCheckInAt && (
                <div className="flex items-center gap-2 text-xs text-indigo-700 mb-3">
                  <Clock className="h-3 w-3" />
                  Next check-in: {new Date(plan.nextCheckInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}

              {activeCheckIn === plan.id ? (
                <div className="space-y-3 rounded-xl bg-white p-4 border border-indigo-200">
                  {plan.questions.map((q) => (
                    <div key={q}>
                      <p className="text-sm font-medium text-gray-800 mb-1.5">{q}</p>
                      <div className="flex gap-2">
                        {["No", "Yes", "Not sure"].map((opt) => (
                          <button key={opt} onClick={() => handleCheckInAnswer(q, opt)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                              checkInAnswers[q] === opt
                                ? "bg-indigo-600 text-white border-indigo-600"
                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                            }`}
                          >{opt}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <Button onClick={handleSubmitCheckIn} size="sm" disabled={Object.keys(checkInAnswers).length < plan.questions.length}>
                    <Check className="mr-1 h-3 w-3" />Submit Check-in
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => { setActiveCheckIn(plan.id); setCheckInAnswers({}); }}>
                  Do Check-in Now <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </Card>
          ))}
          {checkInSaved && (
            <p className="text-sm text-emerald-600 font-medium">✓ Check-in saved to {petName}&apos;s timeline</p>
          )}
        </section>
      )}

      {/* Daily Baseline Check-in */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Quick Check-in</h2>
          {filledCount > 0 && <span className="text-xs text-gray-400">{filledCount}/{BASELINE_CATEGORIES.length}</span>}
        </div>

        {todayEntry && Object.keys(ratings).length === 0 ? (
          <Card className="p-4 border-emerald-200 bg-emerald-50">
            <p className="text-sm text-emerald-800">✅ Already logged today. Come back tomorrow, or update below.</p>
          </Card>
        ) : null}

        <Card className="p-4">
          <p className="text-sm text-gray-600 mb-4">How is {petName} right now?</p>
          <div className="space-y-4">
            {BASELINE_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <p className="text-sm font-medium text-gray-800 mb-1.5">
                  <span className="mr-1.5">{cat.emoji}</span>{cat.label}
                </p>
                <div className="flex gap-2">
                  {RATING_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => handleRate(cat.id, opt.value)}
                      className={`flex-1 rounded-lg border-2 py-2 text-xs font-semibold transition-all ${
                        ratings[cat.id] === opt.value
                          ? `${opt.color} shadow-sm`
                          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <textarea value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }}
            placeholder="Anything else worth noting today?"
            rows={2} className="mt-4 w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="mt-3 flex items-center gap-3">
            <Button onClick={handleSave} disabled={filledCount === 0}>
              {saved ? <><Check className="mr-2 h-4 w-4" />Saved!</> : "Save Check-in"}
            </Button>
            {saved && <span className="text-sm text-emerald-600 font-medium">Baseline updated · Score: {getChangeScore(care).score}</span>}
          </div>
        </Card>
      </section>

      {activePlans.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400">No active care plans.</p>
          <a href="/check-now" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Check a symptom to start one →
          </a>
        </div>
      )}
    </div>
  );
}
