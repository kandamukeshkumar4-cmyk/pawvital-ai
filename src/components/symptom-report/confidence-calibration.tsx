"use client";

import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import type { ConfidenceCalibrationSummary } from "./types";

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
    </Card>
  );
}
