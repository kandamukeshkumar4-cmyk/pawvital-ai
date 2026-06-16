"use client";

import { TesterFeedbackWidget } from "@/components/tester-feedback";
import { OwnerOutcomeForm } from "./owner-outcome-form";
import type { SymptomReport } from "./types";

interface OutcomeFeedbackSectionProps {
  report: SymptomReport;
}

export function OutcomeFeedbackSection({
  report,
}: OutcomeFeedbackSectionProps) {
  if (!report.report_storage_id) {
    return null;
  }

  return (
    <div className="space-y-4">
      <OwnerOutcomeForm symptomCheckId={report.report_storage_id} />
      <TesterFeedbackWidget
        symptomCheckId={report.report_storage_id}
        reportTitle={report.title}
        urgencyLabel={report.recommendation}
        surface="result_page"
      />
    </div>
  );
}
