import type { SymptomReport } from "@/components/symptom-report/types";
import type { OutcomeFeedbackInput } from "./report-storage";

export interface ThresholdProposalDraft {
  payload: Record<string, unknown>;
  proposalType: "threshold_review" | "calibration_review";
  rationale: string;
  summary: string;
}

function topDifferentials(report: SymptomReport): string[] {
  return (report.differential_diagnoses || [])
    .slice(0, 3)
    .map((entry) => entry.condition.trim())
    .filter(Boolean);
}

export function buildThresholdProposalDraft(input: {
  feedback: OutcomeFeedbackInput;
  report: SymptomReport;
  symptomSummary: string;
}): ThresholdProposalDraft | null {
  if (input.feedback.matchedExpectation === "yes") {
    return null;
  }

  const confirmedDiagnosis =
    input.feedback.confirmedDiagnosis?.trim() || "unconfirmed diagnosis";
  const recommendation = input.report.recommendation || "monitor";
  const severity = input.report.severity || "low";
  const proposalType =
    input.feedback.matchedExpectation === "no"
      ? "threshold_review"
      : "calibration_review";
  const summary =
    proposalType === "threshold_review"
      ? `Review ${recommendation} threshold for ${confirmedDiagnosis}`
      : `Review ${recommendation} calibration for partially matched outcome`;
  const rationale = [
    `Owner-reported feedback was marked "${input.feedback.matchedExpectation}" for a ${severity} / ${recommendation} report.`,
    input.feedback.confirmedDiagnosis
      ? `Confirmed diagnosis: ${input.feedback.confirmedDiagnosis.trim()}.`
      : "",
    input.feedback.vetOutcome
      ? `Vet outcome: ${input.feedback.vetOutcome.trim()}.`
      : "",
    input.symptomSummary
      ? `Symptoms: ${input.symptomSummary}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    proposalType,
    rationale,
    summary,
    payload: {
      confirmedDiagnosis: input.feedback.confirmedDiagnosis?.trim() || null,
      matchedExpectation: input.feedback.matchedExpectation,
      ownerNotes: input.feedback.ownerNotes?.trim() || null,
      recommendation,
      reportSeverity: severity,
      reportTitle: input.report.title,
      symptomSummary: input.symptomSummary,
      topDifferentials: topDifferentials(input.report),
      vetOutcome: input.feedback.vetOutcome?.trim() || null,
      warningSigns: input.report.warning_signs || [],
    },
  };
}
