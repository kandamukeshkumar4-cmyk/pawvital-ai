"use client";

import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import type { ConfidenceAdjustment, ConfidenceCalibrationSummary } from "./types";

function formatAdjustmentDelta(delta: number): string {
  const percent = Math.abs(delta) * 100;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${percent.toFixed(0)} pts`;
}

function adjustmentTone(
  adjustment: ConfidenceAdjustment
): "success" | "warning" | "default" {
  if (adjustment.direction === "increase") {
    return "success";
  }
  if (adjustment.direction === "decrease") {
    return "warning";
  }
  return "default";
}

export function ConfidenceCalibrationSection({
  calibration,
}: {
  calibration?: ConfidenceCalibrationSummary;
}) {
  if (!calibration) {
    return null;
  }

  return (
    <Card className="border border-sky-100 bg-sky-50/60 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Confidence calibration
          </p>
          <h4 className="mt-1 text-lg font-semibold text-slate-900">
            {formatConfidenceLevelLabel(calibration.confidence_level)} confidence
          </h4>
          <p className="mt-2 text-sm text-slate-700">
            {calibration.recommendation}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">
            Final {(calibration.final_confidence * 100).toFixed(0)}%
          </Badge>
          <Badge variant="default">
            Base {(calibration.base_confidence * 100).toFixed(0)}%
          </Badge>
        </div>
      </div>

      {calibration.adjustments.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {calibration.adjustments.map((adjustment) => (
            <div
              key={`${adjustment.factor}-${adjustment.reason}`}
              className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">
                  {adjustment.reason}
                </p>
                <Badge variant={adjustmentTone(adjustment)}>
                  {formatAdjustmentDelta(adjustment.delta)}
                </Badge>
              </div>
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                {adjustment.factor.replace(/_/g, " ")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
