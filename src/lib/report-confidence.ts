import type { CalibratedConfidence } from "./confidence-calibrator";
import { calibrateDiagnosticConfidence } from "./confidence-calibrator";
import { getICD10CodesForDisease } from "./icd-10-mapper";
import type { TriageSession } from "./triage-engine";

type ReportSeverity = "low" | "medium" | "high" | "emergency";

function normalizeUrgencyLevel(
  severity: ReportSeverity
): "low" | "moderate" | "high" | "emergency" {
  return severity === "medium" ? "moderate" : severity;
}

function normalizeImageQuality(
  quality: string | undefined
): "poor" | "borderline" | "good" | "excellent" | null {
  return quality === "poor" ||
    quality === "borderline" ||
    quality === "good" ||
    quality === "excellent"
    ? quality
    : null;
}

function deriveSidecarAgreementRate(session: TriageSession): number | null {
  const shadowComparisons = session.case_memory?.shadow_comparisons ?? [];
  if (shadowComparisons.length === 0) {
    return null;
  }

  const alignedComparisons = shadowComparisons.filter(
    (comparison) => comparison.disagreementCount === 0
  ).length;
  return alignedComparisons / shadowComparisons.length;
}

export function buildReportConfidenceCalibration(input: {
  baseConfidence: number;
  reportSeverity: ReportSeverity;
  session: TriageSession;
  hasModelDisagreement: boolean;
  textChunkCount: number;
  imageMatchCount: number;
  breedKnown: boolean;
  ageKnown: boolean;
  topDifferentialCondition?: string | null;
}): CalibratedConfidence {
  const observedServices = new Set(
    (input.session.case_memory?.service_observations ?? []).map(
      (observation) => observation.service
    )
  );

  return calibrateDiagnosticConfidence({
    baseConfidence: input.baseConfidence,
    numSymptoms: input.session.known_symptoms.length,
    numAnswers: Object.keys(input.session.extracted_answers).length,
    numRedFlags: input.session.red_flags_triggered.length,
    urgencyLevel: normalizeUrgencyLevel(input.reportSeverity),
    hasModelDisagreement: input.hasModelDisagreement,
    imageQuality: normalizeImageQuality(input.session.latest_image_quality),
    hasRetrievalSupport: input.textChunkCount + input.imageMatchCount > 0,
    ambiguityFlags: input.session.case_memory?.ambiguity_flags ?? [],
    numSidecarServicesAvailable: observedServices.size,
    sidecarAgreementRate: deriveSidecarAgreementRate(input.session),
    hasICD10Mapping: Boolean(
      input.topDifferentialCondition &&
        getICD10CodesForDisease(input.topDifferentialCondition)
    ),
    breedKnown: input.breedKnown,
    ageKnown: input.ageKnown,
  });
}

export function formatConfidenceLevelLabel(
  level: CalibratedConfidence["confidence_level"]
): string {
  switch (level) {
    case "very_low":
      return "Very low";
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "High";
    case "very_high":
      return "Very high";
    default:
      return level;
  }
}
