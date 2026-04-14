import type { SymptomReport } from "@/components/symptom-report/types";
import type { OutcomeFeedbackInput } from "./report-storage";

export interface HistoricalOutcomeFeedbackRecord {
  feedback: OutcomeFeedbackInput;
  report: SymptomReport;
  reportRecord: Record<string, unknown>;
  submittedAt: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAiResponseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isObject(value) ? value : null;
}

function normalizeMatchedExpectation(value: unknown): OutcomeFeedbackInput["matchedExpectation"] | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["yes", "match", "matched", "correct", "true"].includes(normalized)) {
    return "yes";
  }

  if (["partly", "partial", "partially", "mixed"].includes(normalized)) {
    return "partly";
  }

  if (["no", "mismatch", "incorrect", "false"].includes(normalized)) {
    return "no";
  }

  return null;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value || "").trim();
  return normalized ? normalized : undefined;
}

function normalizeSubmittedAt(value: unknown): string {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return new Date().toISOString();
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function extractHistoricalOutcomeFeedback(
  symptomCheckId: string,
  aiResponse: unknown
): HistoricalOutcomeFeedbackRecord | null {
  const reportRecord = parseAiResponseRecord(aiResponse);
  if (!reportRecord) {
    return null;
  }

  const rawFeedback = isObject(reportRecord.outcome_feedback)
    ? reportRecord.outcome_feedback
    : isObject(reportRecord.outcomeFeedback)
      ? reportRecord.outcomeFeedback
      : null;

  if (!rawFeedback) {
    return null;
  }

  const matchedExpectation = normalizeMatchedExpectation(
    rawFeedback.matched_expectation ?? rawFeedback.matchedExpectation
  );

  if (!matchedExpectation) {
    return null;
  }

  return {
    feedback: {
      symptomCheckId,
      matchedExpectation,
      confirmedDiagnosis: normalizeOptionalText(
        rawFeedback.confirmed_diagnosis ?? rawFeedback.confirmedDiagnosis
      ),
      ownerNotes: normalizeOptionalText(
        rawFeedback.owner_notes ?? rawFeedback.ownerNotes
      ),
      vetOutcome: normalizeOptionalText(
        rawFeedback.vet_outcome ?? rawFeedback.vetOutcome
      ),
    },
    report: reportRecord as unknown as SymptomReport,
    reportRecord,
    submittedAt: normalizeSubmittedAt(
      rawFeedback.submitted_at ?? rawFeedback.submittedAt
    ),
  };
}
