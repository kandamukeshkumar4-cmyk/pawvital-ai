"use client";

import type { SymptomReport } from "./types";
import type { ReportTone } from "./report-presentation";

const URGENCY_STEPS = [
  "Monitor at home",
  "Within 48 hours",
  "Within 24 hours",
  "Emergency now",
] as const;

const RECOMMENDATION_TO_STEP: Record<
  SymptomReport["recommendation"],
  number
> = {
  monitor: 0,
  vet_48h: 1,
  vet_24h: 2,
  emergency_vet: 3,
};

const TONE_ACTIVE: Record<ReportTone, string> = {
  emergency: "bg-red-600 text-white border-red-600",
  urgent: "bg-orange-600 text-white border-orange-600",
  routine: "bg-emerald-600 text-white border-emerald-600",
};

export function urgencyStepIndex(
  recommendation: SymptomReport["recommendation"],
): number {
  return RECOMMENDATION_TO_STEP[recommendation] ?? 1;
}

interface UrgencyScaleProps {
  recommendation: SymptomReport["recommendation"];
  tone: ReportTone;
}

export function UrgencyScale({ recommendation, tone }: UrgencyScaleProps) {
  const activeIndex = urgencyStepIndex(recommendation);
  const activeLabel = URGENCY_STEPS[activeIndex];

  return (
    <div
      role="group"
      aria-label="Urgency scale"
      className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
    >
      {URGENCY_STEPS.map((label, i) => {
        const active = i === activeIndex;
        return (
          <div
            key={label}
            aria-current={active ? "step" : undefined}
            className={`rounded-lg border px-2.5 py-2 text-center text-xs font-semibold transition-colors ${
              active
                ? TONE_ACTIVE[tone]
                : "border-gray-200 bg-gray-50 text-gray-400"
            }`}
          >
            <span className="sr-only">
              {active ? "Current urgency level: " : ""}
            </span>
            {label}
          </div>
        );
      })}
      <p className="sr-only">Recommended urgency level: {activeLabel}</p>
    </div>
  );
}
