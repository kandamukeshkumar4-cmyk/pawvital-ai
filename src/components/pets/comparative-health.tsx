"use client";

import { useMemo, useState } from "react";
import type { Pet } from "@/types";
import { ArrowUpRight, ArrowDownRight, ArrowRight, AlertTriangle } from "lucide-react";

export type PetHealthSummary = {
  pet: Pet;
  lastSeverity: "low" | "medium" | "high" | "emergency" | "urgent" | null;
  lastCheckDate: string | null;
  daysSinceLastCheck: number | null;
  checkCount: number;
  trend: "up" | "down" | "stable" | null;
};

interface ComparativeHealthProps {
  stats: PetHealthSummary[];
}

export function ComparativeHealth({ stats }: ComparativeHealthProps) {
  const [sortParam, setSortParam] = useState<"date" | "severity" | "name">("severity");

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      if (sortParam === "name") {
        return a.pet.name.localeCompare(b.pet.name);
      }
      if (sortParam === "severity") {
        const severityScores: Record<string, number> = { emergency: 4, urgent: 4, high: 3, medium: 2, low: 1, "null": 0 };
        const scoreA = severityScores[a.lastSeverity || "null"] || 0;
        const scoreB = severityScores[b.lastSeverity || "null"] || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      if (sortParam === "date") {
        const dateA = a.lastCheckDate ? new Date(a.lastCheckDate).getTime() : 0;
        const dateB = b.lastCheckDate ? new Date(b.lastCheckDate).getTime() : 0;
        return dateB - dateA; // newest first
      }
      return 0;
    });
  }, [stats, sortParam]);

  if (stats.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Comparative Health</h2>
          <p className="text-sm text-slate-500">Compare status across your pets</p>
        </div>
        <select 
          className="mt-3 sm:mt-0 text-sm border-slate-200 rounded-lg bg-slate-50 text-slate-700"
          value={sortParam}
          onChange={(e) =>
            setSortParam(e.target.value as "date" | "severity" | "name")
          }
        >
          <option value="severity">Sort by Urgency</option>
          <option value="date">Sort by Last Check</option>
          <option value="name">Sort by Name</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {sortedStats.slice(0, 4).map(({ pet, lastSeverity, daysSinceLastCheck, trend }) => {
          const isUrgent = lastSeverity === "urgent" || lastSeverity === "emergency" || lastSeverity === "high"; // Adjust for DB schema if 'urgent' maps to 'high/emergency'
          const needsAttention = daysSinceLastCheck !== null && daysSinceLastCheck >= 30;

          return (
            <div 
              key={pet.id}
              className={`p-4 rounded-xl border ${isUrgent ? "border-red-500 bg-red-50" : "border-slate-200 bg-white"} relative flex flex-col`}
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-slate-800">{pet.name}</h3>
                {trend === "up" && (
                  <span className="inline-flex" title="Severity trending up">
                    <ArrowDownRight className="w-4 h-4 text-rose-500" aria-hidden />
                  </span>
                )}
                {trend === "down" && (
                  <span className="inline-flex" title="Severity trending down">
                    <ArrowUpRight className="w-4 h-4 text-emerald-500" aria-hidden />
                  </span>
                )}
                {trend === "stable" && (
                  <span className="inline-flex" title="Severity stable">
                    <ArrowRight className="w-4 h-4 text-slate-400" aria-hidden />
                  </span>
                )}
              </div>

              {needsAttention && (
                <div className="absolute -top-2 -right-2 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium shadow-sm border border-amber-200 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Needs attention
                </div>
              )}

              <div className="mt-auto pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className={`font-medium capitalize ${
                    isUrgent ? "text-red-700" : 
                    lastSeverity === "medium" ? "text-amber-600" : 
                    lastSeverity === "low" ? "text-emerald-600" : 
                    "text-slate-400"
                  }`}>
                    {lastSeverity || "No data"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Last check</span>
                  <span className="font-medium text-slate-700">
                    {daysSinceLastCheck === null ? "Never" : daysSinceLastCheck === 0 ? "Today" : `${daysSinceLastCheck}d ago`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
