"use client";

import { TesterFeedbackWidget } from "@/components/tester-feedback";
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
    <TesterFeedbackWidget
      symptomCheckId={report.report_storage_id}
      reportTitle={report.title}
      urgencyLabel={report.recommendation}
      surface="result_page"
    />
  );
}
