"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Heart,
  Sun,
  Moon,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Card from "@/components/ui/card";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { useAppStore } from "@/store/app-store";

type DayRating = "great" | "good" | "okay" | "bad" | "terrible";

interface QoLEntry {
  date: string;
  overallRating: DayRating;
  dimensions: Record<string, number>;
  notes: string;
}

const DIMENSIONS: { id: string; label: string; description: string }[] = [
  { id: "appetite", label: "Appetite", description: "Eating normally?" },
  { id: "water", label: "Water Intake", description: "Drinking enough?" },
  { id: "mobility", label: "Mobility", description: "Moving around okay?" },
  { id: "pain", label: "Comfort / Pain", description: "Showing pain signs?" },
  { id: "breathing", label: "Breathing", description: "Breathing comfortably?" },
  { id: "confusion", label: "Alertness", description: "Aware and responsive?" },
  { id: "bathroom", label: "Bathroom", description: "Normal bathroom habits?" },
  { id: "joy", label: "Joy / Engagement", description: "Interested in life?" },
];

const RATING_CONFIG: Record<
  DayRating,
  { label: string; emoji: string; color: string; bgColor: string; borderColor: string }
> = {
  great: {
    label: "Great Day",
    emoji: "🌟",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-300",
  },
  good: {
    label: "Good Day",
    emoji: "😊",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-300",
  },
  okay: {
    label: "Okay Day",
    emoji: "😐",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
  },
  bad: {
    label: "Tough Day",
    emoji: "😟",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-300",
  },
  terrible: {
    label: "Very Hard Day",
    emoji: "😢",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-300",
  },
};

function ScoreSlider({
  dimension,
  value,
  onChange,
}: {
  dimension: { id: string; label: string; description: string };
  value: number;
  onChange: (id: string, val: number) => void;
}) {
  const pct = (value / 10) * 100;
  const color =
    value <= 3 ? "bg-red-500" : value <= 5 ? "bg-amber-500" : value <= 7 ? "bg-green-500" : "bg-emerald-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-900">
            {dimension.label}
          </span>
          <span className="ml-2 text-xs text-gray-500">
            {dimension.description}
          </span>
        </div>
        <span className="text-sm font-bold text-gray-700">
          {value}/10
        </span>
      </div>
      <div className="relative">
        <div className="h-2 w-full rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full ${color} transition-all duration-200`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={10}
          value={value}
          onChange={(e) => onChange(dimension.id, Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function computeOverallScore(dims: Record<string, number>): number {
  const vals = Object.values(dims);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function scoreToRating(score: number): DayRating {
  if (score >= 8.5) return "great";
  if (score >= 6.5) return "good";
  if (score >= 4.5) return "okay";
  if (score >= 2.5) return "bad";
  return "terrible";
}

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return <Minus className="h-4 w-4 text-gray-400" />;
  if (diff > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
  return <TrendingDown className="h-4 w-4 text-red-600" />;
}

function DayDot({ entry }: { entry: QoLEntry }) {
  const config = RATING_CONFIG[entry.overallRating];
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${config.bgColor} ${config.borderColor} border`}
      title={`${entry.date}: ${config.label}`}
    >
      {config.emoji}
    </div>
  );
}

function MiniCalendar({
  entries,
  weekOffset,
  onPrev,
  onNext,
}: {
  entries: QoLEntry[];
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const entryMap = useMemo(() => {
    const m = new Map<string, QoLEntry>();
    entries.forEach((e) => m.set(e.date, e));
    return m;
  }, [entries]);

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() - weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          className="rounded-lg p-1 hover:bg-gray-100"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5 text-gray-500" />
        </button>
        <span className="text-sm font-medium text-gray-700">
          Week of {startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <button
          onClick={onNext}
          disabled={weekOffset <= 0}
          className="rounded-lg p-1 hover:bg-gray-100 disabled:opacity-30"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5 text-gray-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const key = d.toISOString().split("T")[0];
          const entry = entryMap.get(key);
          const isToday = key === today.toISOString().split("T")[0];
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-gray-400">{dayNames[i]}</span>
              {entry ? (
                <DayDot entry={entry} />
              ) : (
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "border-2 border-blue-400 text-blue-600 font-bold"
                      : "text-gray-300"
                  }`}
                >
                  {d.getDate()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateDemoEntries(): QoLEntry[] {
  const entries: QoLEntry[] = [];
  const today = new Date();

  const patterns = [
    { appetite: 7, water: 7, mobility: 6, pain: 5, breathing: 8, confusion: 7, bathroom: 7, joy: 7 },
    { appetite: 8, water: 8, mobility: 7, pain: 6, breathing: 8, confusion: 8, bathroom: 8, joy: 8 },
    { appetite: 6, water: 7, mobility: 5, pain: 4, breathing: 7, confusion: 6, bathroom: 6, joy: 5 },
    { appetite: 7, water: 8, mobility: 6, pain: 5, breathing: 8, confusion: 7, bathroom: 7, joy: 6 },
    { appetite: 5, water: 6, mobility: 4, pain: 3, breathing: 7, confusion: 5, bathroom: 5, joy: 4 },
    { appetite: 8, water: 8, mobility: 7, pain: 7, breathing: 9, confusion: 8, bathroom: 8, joy: 8 },
    { appetite: 7, water: 7, mobility: 6, pain: 5, breathing: 8, confusion: 7, bathroom: 7, joy: 7 },
  ];

  const notes = [
    "Good appetite today. Took a short walk.",
    "Seemed happy and energetic this morning!",
    "Didn't want breakfast. Limping more than usual.",
    "Ate well but pacing at night.",
    "Rough night. Wouldn't eat, seemed confused.",
    "Great day! Played with toys, ate everything.",
    "Average day. Some stiffness after the walk.",
  ];

  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const idx = i % patterns.length;
    const dims = patterns[idx];
    const score = computeOverallScore(dims);
    entries.push({
      date: d.toISOString().split("T")[0],
      overallRating: scoreToRating(score),
      dimensions: dims,
      notes: notes[idx],
    });
  }

  return entries.reverse();
}

export default function QualityOfLifePage() {
  const { activePet } = useAppStore();
  const petName = activePet?.name ?? "your dog";

  const [dimensions, setDimensions] = useState<Record<string, number>>(() =>
    Object.fromEntries(DIMENSIONS.map((d) => [d.id, 5])),
  );
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<QoLEntry[]>(generateDemoEntries);
  const [weekOffset, setWeekOffset] = useState(0);
  const [saved, setSaved] = useState(false);

  const overallScore = useMemo(
    () => computeOverallScore(dimensions),
    [dimensions],
  );
  const overallRating = useMemo(
    () => scoreToRating(overallScore),
    [overallScore],
  );
  const ratingConfig = RATING_CONFIG[overallRating];

  const previousEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const previousScore = previousEntry
    ? computeOverallScore(previousEntry.dimensions)
    : overallScore;

  const handleDimensionChange = useCallback((id: string, val: number) => {
    setDimensions((prev) => ({ ...prev, [id]: val }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    const newEntry: QoLEntry = {
      date: today,
      overallRating: scoreToRating(computeOverallScore(dimensions)),
      dimensions: { ...dimensions },
      notes,
    };

    setEntries((prev) => {
      const filtered = prev.filter((e) => e.date !== today);
      return [...filtered, newEntry].sort((a, b) => a.date.localeCompare(b.date));
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [dimensions, notes]);

  const goodDays = entries.filter(
    (e) => e.overallRating === "great" || e.overallRating === "good",
  ).length;
  const totalDays = entries.length;
  const goodDayPct = totalDays > 0 ? Math.round((goodDays / totalDays) * 100) : 0;

  const weeklyAvg = useMemo(() => {
    const last7 = entries.slice(-7);
    if (last7.length === 0) return 0;
    return (
      Math.round(
        (last7.reduce((sum, e) => sum + computeOverallScore(e.dimensions), 0) /
          last7.length) *
          10,
      ) / 10
    );
  }, [entries]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-600 text-white">
            <Heart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Quality of Life
            </h1>
            <p className="text-sm text-gray-500">
              Track {petName}&apos;s daily well-being
            </p>
          </div>
        </div>
        <p className="text-gray-600 text-sm mt-2">
          Rate {petName}&apos;s day across key areas. Over time, this builds a
          picture of good days vs. hard days — something your vet can use for
          care decisions.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Today</p>
          <p className="text-2xl font-bold mt-1">{overallScore}</p>
          <p className="text-xs text-gray-500">/ 10</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            7-Day Avg
          </p>
          <p className="text-2xl font-bold mt-1">{weeklyAvg}</p>
          <div className="flex justify-center mt-1">
            <TrendIcon current={overallScore} previous={previousScore} />
          </div>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Good Days
          </p>
          <p className="text-2xl font-bold mt-1 text-green-600">{goodDayPct}%</p>
          <p className="text-xs text-gray-500">
            {goodDays} of {totalDays}
          </p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Tracked
          </p>
          <p className="text-2xl font-bold mt-1">{totalDays}</p>
          <p className="text-xs text-gray-500">days</p>
        </Card>
      </div>

      {/* Weekly calendar */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-pink-600" />
          Weekly View
        </h2>
        <MiniCalendar
          entries={entries}
          weekOffset={weekOffset}
          onPrev={() => setWeekOffset((w) => w + 1)}
          onNext={() => setWeekOffset((w) => Math.max(0, w - 1))}
        />
      </Card>

      {/* Today's entry */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            How is {petName} doing today?
          </h2>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${ratingConfig.bgColor} ${ratingConfig.borderColor} border`}>
            <span>{ratingConfig.emoji}</span>
            <span className={`text-xs font-semibold ${ratingConfig.color}`}>
              {ratingConfig.label} · {overallScore}/10
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {DIMENSIONS.map((dim) => (
            <ScoreSlider
              key={dim.id}
              dimension={dim}
              value={dimensions[dim.id]}
              onChange={handleDimensionChange}
            />
          ))}
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSaved(false);
            }}
            placeholder={`How did ${petName}'s day go? Any changes worth noting?`}
            rows={2}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave}>
            {saved ? (
              <>
                <Heart className="mr-2 h-4 w-4 fill-white" />
                Saved!
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Save Today&apos;s Entry
              </>
            )}
          </Button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">
              Entry saved for today
            </span>
          )}
        </div>
      </Card>

      {/* Recent entries */}
      {entries.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Moon className="h-4 w-4 text-indigo-500" />
            Recent Entries
          </h2>
          <div className="space-y-2">
            {entries
              .slice(-7)
              .reverse()
              .map((entry) => {
                const config = RATING_CONFIG[entry.overallRating];
                const score = computeOverallScore(entry.dimensions);
                return (
                  <div
                    key={entry.date}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 px-4 py-3"
                  >
                    <span className="text-lg">{config.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <Badge variant={
                          entry.overallRating === "great" || entry.overallRating === "good"
                            ? "success"
                            : entry.overallRating === "okay"
                              ? "warning"
                              : "danger"
                        }>
                          {score}/10
                        </Badge>
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Context card */}
      <Card className="p-4 border-pink-200 bg-pink-50">
        <h3 className="text-sm font-semibold text-pink-900 mb-2 flex items-center gap-2">
          <Heart className="h-4 w-4" />
          Why Track Quality of Life?
        </h3>
        <p className="text-sm text-pink-800 leading-relaxed">
          Senior dog care decisions are hard, and &ldquo;good days vs. bad
          days&rdquo; is one of the most important signals vets use to guide
          treatment changes and quality-of-life conversations. Tracking daily
          helps you see trends you&apos;d otherwise miss — and gives your vet
          real data instead of guesswork.
        </p>
      </Card>
    </div>
  );
}
