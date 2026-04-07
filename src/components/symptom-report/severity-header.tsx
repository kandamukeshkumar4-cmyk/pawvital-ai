"use client";

import { Phone, Copy, CheckCheck } from "lucide-react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import type { SymptomReport } from "./types";
import { severityConfig } from "./constants";

type CopyState = "idle" | "copied" | "error";

interface SeverityHeaderProps {
  report: SymptomReport;
  copyState: CopyState;
  onCopyVetSummary: () => void | Promise<void>;
}

export function SeverityHeader({
  report,
  copyState,
  onCopyVetSummary,
}: SeverityHeaderProps) {
  const isEmergencyReport =
    report.recommendation === "emergency_vet" || report.severity === "emergency";

  return (
    <Card className={`p-6 border-2 ${severityConfig[report.severity].bg}`}>
      <div className="flex items-start gap-3">
        {(() => {
          const config = severityConfig[report.severity];
          const IconComponent = config.icon;
          return <IconComponent className="w-7 h-7 text-current mt-0.5" />;
        })()}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-gray-900">{report.title}</h3>
            <Badge variant={severityConfig[report.severity].color}>
              {severityConfig[report.severity].label}
            </Badge>
            {typeof report.confidence === "number" && (
              <Badge variant="info">
                Confidence {(report.confidence * 100).toFixed(0)}%
              </Badge>
            )}
            {report.async_review_scheduled && (
              <Badge variant="info">Specialist review queued</Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Recommendation:{" "}
            <span className="font-semibold">
              {report.recommendation === "emergency_vet"
                ? "Seek Emergency Veterinary Care Immediately"
                : report.recommendation === "vet_24h"
                  ? "Schedule Veterinary Visit Within 24 Hours"
                  : report.recommendation === "vet_48h"
                    ? "Schedule Veterinary Visit Within 48 Hours"
                    : "Monitor at Home with Parameters Below"}
            </span>
          </p>
        </div>
      </div>
      <p className="text-gray-700 leading-relaxed mt-4 text-[15px]">
        {report.explanation}
      </p>
      {isEmergencyReport && (
        <div className="mt-4 rounded-xl border border-red-300 bg-white/80 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-red-900">
                This should be treated as an emergency.
              </p>
              <p className="text-sm text-red-800 mt-1">
                Call an emergency veterinary hospital now and bring the handoff
                summary below with you.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="tel:"
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                <Phone className="w-4 h-4" />
                Open Phone Dialer
              </a>
              {report.vet_handoff_summary && (
                <button
                  type="button"
                  onClick={onCopyVetSummary}
                  className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 transition-colors"
                >
                  {copyState === "copied" ? (
                    <CheckCheck className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copyState === "copied" ? "Summary Copied" : "Copy Vet Summary"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
