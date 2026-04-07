import type { SymptomReport } from "@/components/symptom-report/types";
import type { SymptomCheckEntry } from "@/components/timeline/types";
import type { SymptomCheck } from "@/types";

export type SymptomCheckDbRow = {
  id: string;
  pet_id: string;
  symptoms: string;
  ai_response: string | Record<string, unknown> | null;
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "vet_24h" | "emergency_vet";
  created_at: string;
};

function parseReportPayload(
  raw: string | Record<string, unknown> | null | undefined
): SymptomReport | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (
    typeof o.title !== "string" ||
    typeof o.severity !== "string" ||
    typeof o.recommendation !== "string" ||
    typeof o.explanation !== "string"
  ) {
    return null;
  }
  const actions = Array.isArray(o.actions)
    ? (o.actions as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const warning_signs = Array.isArray(o.warning_signs)
    ? (o.warning_signs as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return {
    ...(o as unknown as SymptomReport),
    actions,
    warning_signs,
  };
}

function mapSeverity(
  s: SymptomCheckDbRow["severity"] | SymptomReport["severity"]
): SymptomCheckEntry["severity"] {
  switch (s) {
    case "low":
      return "mild";
    case "medium":
      return "moderate";
    case "high":
      return "serious";
    case "emergency":
      return "critical";
    default:
      return "moderate";
  }
}

function mapUrgency(
  r: SymptomCheckDbRow["recommendation"] | SymptomReport["recommendation"]
): SymptomCheckEntry["urgency"] {
  switch (r) {
    case "monitor":
      return "monitor";
    case "vet_48h":
      return "schedule";
    case "vet_24h":
      return "urgent";
    case "emergency_vet":
      return "emergency";
    default:
      return "monitor";
  }
}

function likelihoodToConfidence(l?: string): number {
  if (l === "high") return 0.78;
  if (l === "moderate") return 0.55;
  if (l === "low") return 0.35;
  return 0.5;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Maps a symptom_checks row (+ pet display name) to the timeline / analytics entry shape.
 */
/** Map persisted `SymptomCheck` (client types) to the DB row shape for the shared mapper. */
export function symptomCheckTypeToDbRow(c: SymptomCheck): SymptomCheckDbRow {
  return {
    id: c.id,
    pet_id: c.pet_id,
    symptoms: c.symptoms,
    ai_response: c.ai_response,
    severity: c.severity,
    recommendation: c.recommendation,
    created_at: c.created_at,
  };
}

export function symptomCheckRowToEntry(
  row: SymptomCheckDbRow,
  petName: string
): SymptomCheckEntry {
  const report = parseReportPayload(row.ai_response);
  const sev = report?.severity ?? row.severity;
  const urg = report?.recommendation ?? row.recommendation;
  const primary =
    report?.title?.trim() ||
    truncate(row.symptoms.replace(/\s+/g, " "), 72) ||
    "Symptom check";
  const dx = report?.differential_diagnoses?.[0];
  const topDiagnosis = dx?.condition ?? "See full report";
  const confidence =
    typeof report?.confidence === "number" && Number.isFinite(report.confidence)
      ? report.confidence
      : likelihoodToConfidence(dx?.likelihood);
  const summary =
    report?.explanation != null
      ? truncate(report.explanation, 220)
      : row.symptoms
        ? truncate(row.symptoms, 220)
        : undefined;

  return {
    id: row.id,
    pet_id: row.pet_id,
    pet_name: petName,
    created_at: row.created_at,
    primary_symptom: primary,
    severity: mapSeverity(sev),
    urgency: mapUrgency(urg),
    top_diagnosis: topDiagnosis,
    confidence: Math.min(1, Math.max(0, confidence)),
    report_summary: summary,
  };
}
