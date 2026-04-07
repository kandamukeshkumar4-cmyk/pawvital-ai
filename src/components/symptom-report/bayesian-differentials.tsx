"use client";

import { useMemo, useState } from "react";

export interface ScoredDifferential {
  condition: string;
  probability: number;
  evidence_count: number;
}

interface BayesianDifferentialsProps {
  bayesian_differentials?: ScoredDifferential[] | null;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function confidenceLabel(evidenceCount: number): "High" | "Medium" | "Low" {
  if (evidenceCount >= 6) return "High";
  if (evidenceCount >= 3) return "Medium";
  return "Low";
}

function probabilityColor(probability: number): string {
  const pct = probability * 100;
  if (pct > 70) return "bg-green-500";
  if (pct > 40) return "bg-amber-500";
  return "bg-gray-400";
}

export function BayesianDifferentials({
  bayesian_differentials,
}: BayesianDifferentialsProps) {
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const list = bayesian_differentials ?? [];
    return [...list]
      .map((item) => ({
        ...item,
        probability: clampProbability(item.probability),
      }))
      .sort((a, b) => b.probability - a.probability);
  }, [bayesian_differentials]);

  if (sorted.length === 0) return null;

  const visibleItems = expanded ? sorted : sorted.slice(0, 3);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bayesian Differential Display</h3>
          <p className="text-xs text-gray-500">Ranked by posterior probability</p>
        </div>
        {sorted.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {expanded ? "Collapse" : `Expand (${sorted.length})`}
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {visibleItems.map((item, idx) => {
          const pct = Math.round(item.probability * 100);
          const confidence = confidenceLabel(item.evidence_count);
          return (
            <li key={`${item.condition}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{item.condition}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {confidence}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${probabilityColor(item.probability)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{pct}% probability</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
