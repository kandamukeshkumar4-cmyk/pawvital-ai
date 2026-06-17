"use client";

import { useMemo } from "react";
import { Search } from "lucide-react";
import Card from "@/components/ui/card";
import type { DifferentialDiagnosis, SymptomReport } from "./types";

type ScoredDifferential = NonNullable<
  SymptomReport["bayesian_differentials"]
>[number];

interface WhatItCouldBeProps {
  bayesian?: ScoredDifferential[] | null;
  differentials?: DifferentialDiagnosis[] | null;
}

interface RankedItem {
  condition: string;
  description: string;
  fraction: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function likelihoodToFraction(
  likelihood: DifferentialDiagnosis["likelihood"],
): number {
  if (likelihood === "high") return 0.88;
  if (likelihood === "moderate") return 0.55;
  return 0.28;
}

function rankLabel(index: number): "Most likely" | "Possible" | "Less likely" {
  if (index === 0) return "Most likely";
  if (index === 1) return "Possible";
  return "Less likely";
}

function rankStyle(index: number): { badge: string; bar: string } {
  if (index === 0) {
    return { badge: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" };
  }
  if (index === 1) {
    return { badge: "bg-amber-100 text-amber-800", bar: "bg-amber-500" };
  }
  return { badge: "bg-gray-100 text-gray-600", bar: "bg-gray-400" };
}

export function WhatItCouldBeSection({
  bayesian,
  differentials,
}: WhatItCouldBeProps) {
  const items = useMemo<RankedItem[]>(() => {
    const fromBayesian = bayesian ?? [];
    if (fromBayesian.length > 0) {
      return [...fromBayesian]
        .map((item) => ({
          condition: item.condition,
          description: "",
          fraction: clamp01(item.probability),
        }))
        .sort((a, b) => b.fraction - a.fraction);
    }
    const fromDiagnoses = differentials ?? [];
    return fromDiagnoses
      .map((dx) => ({
        condition: dx.condition,
        description: dx.description,
        fraction: likelihoodToFraction(dx.likelihood),
      }))
      // Sort so the index-based rank label (Most likely / Possible / Less
      // likely) always agrees with the likelihood-derived bar width.
      .sort((a, b) => b.fraction - a.fraction);
  }, [bayesian, differentials]);

  if (items.length === 0) return null;

  return (
    <Card className="border border-gray-200 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Search className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-600" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
              What it could be
            </h3>
            <p className="text-sm text-gray-600">
              The most likely explanations, ranked. A vet exam confirms the cause.
            </p>
          </div>
          <ul className="space-y-3.5">
            {items.map((item, i) => {
              const style = rankStyle(i);
              return (
                <li key={`${item.condition}-${i}`} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {item.condition}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}
                    >
                      {rankLabel(i)}
                    </span>
                  </div>
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
                    role="presentation"
                  >
                    <div
                      className={`h-full rounded-full ${style.bar}`}
                      style={{ width: `${Math.round(item.fraction * 100)}%` }}
                    />
                  </div>
                  {item.description ? (
                    <p className="text-sm leading-relaxed text-gray-600">
                      {item.description}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}
