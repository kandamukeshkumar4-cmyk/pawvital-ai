"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, Copy, CheckCheck } from "lucide-react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import type { SymptomReport } from "./types";
import { severityConfig } from "./constants";
import type { HeaderBannerCopy, ReportTone } from "./report-presentation";

type CopyState = "idle" | "copied" | "error";

interface SeverityHeaderProps {
  banner: HeaderBannerCopy | null;
  recommendationLabel: string;
  report: SymptomReport;
  tone: ReportTone;
  urgencyBody: string;
  urgencyLabel: string;
  copyState: CopyState;
  onCopyVetSummary: () => void | Promise<void>;
  onJumpToHandoff?: () => void;
  /** Extra controls (e.g. PDF / share) shown in the header row */
  headerActions?: ReactNode;
}

const TONE_STYLES: Record<
  ReportTone,
  { button: string; helperPill: string; urgencyPill: string }
> = {
  emergency: {
    button:
      "border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50",
    helperPill: "bg-red-600 text-white",
    urgencyPill: "bg-red-600 text-white",
  },
  routine: {
    button:
      "border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50",
    helperPill: "bg-emerald-600 text-white",
    urgencyPill: "bg-emerald-600 text-white",
  },
  urgent: {
    button:
      "border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-50",
    helperPill: "bg-orange-600 text-white",
    urgencyPill: "bg-orange-600 text-white",
  },
};

export function SeverityHeader({
  banner,
  recommendationLabel,
  report,
  tone,
  urgencyBody,
  urgencyLabel,
  copyState,
  onCopyVetSummary,
  onJumpToHandoff,
  headerActions,
}: SeverityHeaderProps) {
  const calibratedConfidence =
    report.calibrated_confidence ?? report.confidence_calibration;
  const toneStyles = TONE_STYLES[tone];

  return (
    <Card
      className={`border-2 p-4 sm:p-6 ${severityConfig[report.severity].bg}`}
    >
      <div className="flex items-start gap-3">
        {(() => {
          const config = severityConfig[report.severity];
          const IconComponent = config.icon;
          return <IconComponent className="w-7 h-7 text-current mt-0.5" />;
        })()}
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
              Urgency level
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneStyles.urgencyPill}`}
            >
              {urgencyLabel}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="text-lg font-bold text-gray-900 sm:text-xl">
                {report.title}
              </h3>
              <Badge variant={severityConfig[report.severity].color}>
                {severityConfig[report.severity].label}
              </Badge>
              {typeof report.confidence === "number" && (
                <Badge variant="info">
                  Confidence {(report.confidence * 100).toFixed(0)}%
                </Badge>
              )}
              {calibratedConfidence && (
                <Badge variant="default">
                  {formatConfidenceLevelLabel(
                    calibratedConfidence.confidence_level
                  )}{" "}
                  confidence
                </Badge>
              )}
              {report.async_review_scheduled && (
                <Badge variant="info">Specialist review queued</Badge>
              )}
            </div>
            {headerActions ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
                {headerActions}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Urgency Guidance
        </p>
        <p className="mt-2 text-base font-semibold text-gray-900 sm:text-lg">
          {urgencyLabel}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-700">
          {recommendationLabel}
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-700">
          {urgencyBody}
        </p>
      </div>
      {banner && (
        <div
          className={`mt-4 rounded-xl border bg-white/90 p-4 ${tone === "emergency" ? "border-red-300" : "border-orange-300"}`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${toneStyles.helperPill}`}
                >
                  Act before you travel
                </span>
                <p className="font-semibold text-gray-900">
                  {banner.title}
                </p>
              </div>
              <p className="mt-2 text-sm text-gray-800">{banner.helper}</p>
              <p className="text-xs text-gray-600 mt-2">
                The copied clinic packet includes the recommendation, handoff
                summary, top differentials, recommended diagnostics, and
                escalation signs.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {report.vet_handoff_summary && (
                <button
                  type="button"
                  onClick={onCopyVetSummary}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full transition-colors sm:w-auto ${toneStyles.button}`}
                >
                  {copyState === "copied" ? (
                    <CheckCheck className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copyState === "copied"
                    ? "Clinic Handoff Copied"
                    : "Copy Clinic Handoff"}
                </button>
              )}
              {onJumpToHandoff ? (
                <button
                  type="button"
                  onClick={onJumpToHandoff}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full transition-colors sm:w-auto ${toneStyles.button}`}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  Jump to Handoff
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
