"use client";

import type { ReactNode } from "react";
import Card from "@/components/ui/card";
import type { SymptomReport } from "./types";
import { severityConfig } from "./constants";
import type { ReportTone } from "./report-presentation";
import { UrgencyScale } from "./urgency-scale";

interface UrgencyHeroProps {
  report: SymptomReport;
  tone: ReportTone;
  recommendationLabel: string;
  subtitle: string;
  /** Extra controls (e.g. PDF / share) shown in the header row */
  headerActions?: ReactNode;
}

const TONE_BORDER: Record<ReportTone, string> = {
  emergency: "border-l-red-600",
  urgent: "border-l-orange-600",
  routine: "border-l-emerald-600",
};

const TONE_PILL: Record<ReportTone, string> = {
  emergency: "bg-red-100 text-red-800",
  urgent: "bg-orange-100 text-orange-800",
  routine: "bg-emerald-100 text-emerald-800",
};

const TONE_PILL_COPY: Record<ReportTone, string> = {
  emergency: "Emergency · seek care immediately",
  urgent: "Urgent · same-day veterinary care",
  routine: "Moderate · treatable, not an emergency",
};

export function UrgencyHero({
  report,
  tone,
  recommendationLabel,
  subtitle,
  headerActions,
}: UrgencyHeroProps) {
  const config = severityConfig[report.severity];
  const IconComponent = config.icon;

  return (
    <Card
      className={`border border-l-4 p-4 sm:p-6 ${TONE_BORDER[tone]} ${config.bg}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE_PILL[tone]}`}
            >
              <IconComponent className="h-3.5 w-3.5" />
              {TONE_PILL_COPY[tone]}
            </span>
            {report.async_review_scheduled ? (
              <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                Specialist review queued
              </span>
            ) : null}
          </div>
          <h2 className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">
            {recommendationLabel}
          </h2>
          {subtitle ? (
            <p className="text-sm leading-6 text-gray-700">{subtitle}</p>
          ) : null}
        </div>
        {headerActions ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
            {headerActions}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <UrgencyScale recommendation={report.recommendation} tone={tone} />
      </div>
    </Card>
  );
}
