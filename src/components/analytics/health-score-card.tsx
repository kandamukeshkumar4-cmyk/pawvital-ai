"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, HeartPulse } from "lucide-react";
import type { SymptomCheckEntry } from "@/components/timeline/types";

const WELLNESS_BY_SEVERITY: Record<SymptomCheckEntry["severity"], number> = {
  mild: 92,
  moderate: 76,
  serious: 58,
  critical: 34,
};

export type HealthTrendDirection = "up" | "down" | "stable";

function computeWellnessTrend(entries: SymptomCheckEntry[]): {
  score: number;
  deltaPct: number;
  direction: HealthTrendDirection;
} {
  if (entries.length === 0) {
    return { score: 0, deltaPct: 0, direction: "stable" };
  }

  const scores = entries.map((e) => WELLNESS_BY_SEVERITY[e.severity]);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (entries.length < 2) {
    return { score: Math.round(avg), deltaPct: 0, direction: "stable" };
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid);
  const second = sorted.slice(mid);
  const avgFirst =
    first.reduce((s, e) => s + WELLNESS_BY_SEVERITY[e.severity], 0) / first.length;
  const avgSecond =
    second.reduce((s, e) => s + WELLNESS_BY_SEVERITY[e.severity], 0) / second.length;
  const delta = avgSecond - avgFirst;
  const deltaPct =
    avgFirst !== 0 ? Math.round(Math.abs((delta / avgFirst) * 100)) : Math.round(Math.abs(delta));

  let direction: HealthTrendDirection = "stable";
  if (delta > 1.5) direction = "up";
  else if (delta < -1.5) direction = "down";

  return {
    score: Math.round(avg),
    deltaPct,
    direction,
  };
}

export default function HealthScoreCard({ entries }: { entries: SymptomCheckEntry[] }) {
  const { score, deltaPct, direction } = computeWellnessTrend(entries);

  const Icon =
    direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  const trendLabel =
    direction === "up"
      ? "Improving"
      : direction === "down"
        ? "Needs attention"
        : "Steady";

  const trendColor =
    direction === "up"
      ? "text-emerald-600"
      : direction === "down"
        ? "text-amber-600"
        : "text-gray-500";

  return (
    <div className="flex flex-col justify-between h-full min-h-[200px] p-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Wellness index
          </p>
          <p className="mt-3 text-4xl font-bold text-gray-900 tabular-nums">{score}</p>
          <p className="mt-1 text-sm text-gray-500">Based on check severity in this period</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
          <HeartPulse className="h-7 w-7" aria-hidden />
        </div>
      </div>
      <div className={`mt-6 flex items-center gap-2 text-sm font-semibold ${trendColor}`}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        <span>
          {trendLabel}
          {deltaPct > 0 && direction !== "stable" ? (
            <>
              {" "}
              · {deltaPct}% vs earlier in range
            </>
          ) : direction === "stable" && entries.length >= 2 ? (
            <> · little change vs earlier in range</>
          ) : null}
        </span>
      </div>
    </div>
  );
}
