"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, Copy, CheckCheck } from "lucide-react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import type { SymptomReport } from "./types";
import { severityConfig } from "./constants";
import {
  getRecommendationLabel,
  getUrgencyLevelBody,
  getUrgencyLevelLabel,
  isEmergencyReport,
  isEscalatedReport,
} from "@/lib/report-handoff";

type CopyState = "idle" | "copied" | "error";

interface SeverityHeaderProps {
  report: SymptomReport;
  copyState: CopyState;
  onCopyVetSummary: () => void | Promise<void>;
  onJumpToHandoff?: () => void;
  /** Extra controls (e.g. PDF / share) shown in the header row */
  headerActions?: ReactNode;
}

export function SeverityHeader({
  report,
  copyState,
  onCopyVetSummary,
  onJumpToHandoff,
  headerActions,
}: SeverityHeaderProps) {
  const calibratedConfidence =
    report.calibrated_confidence ?? report.confidence_calibration;
  const emergencyReport = isEmergencyReport(report);
  const escalatedReport = isEscalatedReport(report);
  const urgencyLevelLabel = getUrgencyLevelLabel(report);
  const urgencyLevelBody = getUrgencyLevelBody(report);
  const bannerTone = emergencyReport
    ? {
        border: "border-red-300",
        button:
          "border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50",
        helper:
          "Leave now if you can travel safely. Call the clinic on the way and use the clinic handoff below at intake.",
        pill: "bg-red-600 text-white",
        title: "Emergency clinic handoff",
      }
    : {
        border: "border-orange-300",
        button:
          "border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-900 hover:bg-orange-50",
        helper:
          "Arrange same-day veterinary follow-up and copy the clinic handoff before you leave.",
        pill: "bg-orange-600 text-white",
        title: "Same-day veterinary follow-up",
      };

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
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                emergencyReport
                  ? "bg-red-600 text-white"
                  : escalatedReport
                    ? "bg-orange-600 text-white"
                    : "bg-emerald-600 text-white"
              }`}
            >
              {urgencyLevelLabel}
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
          {urgencyLevelLabel}
        </p>
        <p className="mt-1 text-sm font-medium text-gray-700">
          {getRecommendationLabel(report)}
        </p>
        <p className="mt-2 text-sm leading-6 text-gray-700">
          {urgencyLevelBody}
        </p>
      </div>
      {escalatedReport && (
        <div
          className={`mt-4 rounded-xl border bg-white/90 p-4 ${bannerTone.border}`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${bannerTone.pill}`}
                >
                  Act before you travel
                </span>
                <p className="font-semibold text-gray-900">
                  {bannerTone.title}
                </p>
              </div>
              <p className="text-sm text-gray-800 mt-2">{bannerTone.helper}</p>
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
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full transition-colors sm:w-auto ${bannerTone.button}`}
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
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-full transition-colors sm:w-auto ${bannerTone.button}`}
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
