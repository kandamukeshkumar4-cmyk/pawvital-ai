// =============================================================================
// CONFIDENCE CALIBRATOR
// Computes calibrated diagnostic confidence scores based on multiple
// evidence sources: clinical matrix, sidecar services, model agreement,
// image quality, retrieval support, and ICD-10 code mapping.
// =============================================================================

import { capDiagnosticConfidence } from "./clinical-evidence";
import { getICD10CodesForDisease } from "./icd-10-mapper";

export { capDiagnosticConfidence };

export interface ConfidenceInput {
  baseConfidence: number; // Raw confidence from triage engine (0-1)
  numSymptoms: number;
  numAnswers: number;
  numRedFlags: number;
  urgencyLevel: "low" | "moderate" | "high" | "emergency";
  hasModelDisagreement: boolean;
  imageQuality: "poor" | "borderline" | "good" | "excellent" | null;
  hasRetrievalSupport: boolean;
  ambiguityFlags: string[];
  numSidecarServicesAvailable: number;
  sidecarAgreementRate: number | null; // 0-1, null if no sidecars used
  hasICD10Mapping: boolean;
  breedKnown: boolean;
  ageKnown: boolean;
}

export interface CalibratedConfidence {
  final_confidence: number; // 0-1, calibrated
  base_confidence: number; // Original input
  adjustments: ConfidenceAdjustment[];
  confidence_level: "very_low" | "low" | "moderate" | "high" | "very_high";
  recommendation: string;
}

export interface ConfidenceAdjustment {
  factor: string;
  delta: number;
  direction: "increase" | "decrease" | "neutral";
  reason: string;
}

/**
 * Calibrates diagnostic confidence based on comprehensive evidence assessment.
 * Returns detailed breakdown of all adjustments for transparency.
 */
export function calibrateDiagnosticConfidence(
  input: ConfidenceInput
): CalibratedConfidence {
  const adjustments: ConfidenceAdjustment[] = [];
  let confidence = Math.max(0, Math.min(1, input.baseConfidence));
  const baseConfidence = confidence;

  // 1. Symptom evidence strength
  const symptomBonus = Math.min(0.08, input.numSymptoms * 0.02);
  if (symptomBonus > 0) {
    adjustments.push({
      factor: "symptom_count",
      delta: symptomBonus,
      direction: "increase",
      reason: `${input.numSymptoms} symptoms provide clinical anchor points`,
    });
    confidence += symptomBonus;
  }

  // 2. Answer completeness
  const answerRatio = Math.min(1, input.numAnswers / 5); // 5 answers = full credit
  const answerBonus = answerRatio * 0.06;
  if (answerBonus > 0.01) {
    adjustments.push({
      factor: "answer_completeness",
      delta: answerBonus,
      direction: "increase",
      reason: `${Math.round(answerRatio * 100)}% answer completeness`,
    });
    confidence += answerBonus;
  }

  // 3. Red flag presence (emergency cases need higher certainty for safety)
  if (input.numRedFlags > 0) {
    const redFlagBonus = Math.min(0.05, input.numRedFlags * 0.02);
    adjustments.push({
      factor: "red_flag_clarity",
      delta: redFlagBonus,
      direction: "increase",
      reason: `${input.numRedFlags} red flag(s) clearly identified`,
    });
    confidence += redFlagBonus;
  }

  // 4. Urgency level adjustment
  if (input.urgencyLevel === "emergency") {
    // Emergency cases: confidence is boosted slightly to ensure clear recommendations
    adjustments.push({
      factor: "urgency_emergency",
      delta: 0.03,
      direction: "increase",
      reason: "Emergency presentation requires decisive guidance",
    });
    confidence += 0.03;
  }

  // 5. Model disagreement penalty
  if (input.hasModelDisagreement) {
    adjustments.push({
      factor: "model_disagreement",
      delta: -0.12,
      direction: "decrease",
      reason: "AI models disagree on assessment",
    });
    confidence -= 0.12;
  }

  // 6. Image quality impact
  if (input.imageQuality === "poor") {
    adjustments.push({
      factor: "image_quality_poor",
      delta: -0.1,
      direction: "decrease",
      reason: "Poor image quality limits visual assessment",
    });
    confidence -= 0.1;
  } else if (input.imageQuality === "borderline") {
    adjustments.push({
      factor: "image_quality_borderline",
      delta: -0.05,
      direction: "decrease",
      reason: "Borderline image quality",
    });
    confidence -= 0.05;
  } else if (input.imageQuality === "excellent") {
    adjustments.push({
      factor: "image_quality_excellent",
      delta: 0.03,
      direction: "increase",
      reason: "Excellent image quality supports confident assessment",
    });
    confidence += 0.03;
  }

  // 7. Retrieval support
  if (!input.hasRetrievalSupport) {
    adjustments.push({
      factor: "weak_retrieval",
      delta: -0.06,
      direction: "decrease",
      reason: "No supporting literature retrieved",
    });
    confidence -= 0.06;
  }

  // 8. Ambiguity penalties
  if (input.ambiguityFlags.length > 0) {
    const ambiguityPenalty = Math.min(0.15, input.ambiguityFlags.length * 0.03);
    adjustments.push({
      factor: "ambiguity",
      delta: -ambiguityPenalty,
      direction: "decrease",
      reason: `${input.ambiguityFlags.length} ambiguity flag(s) in conversation`,
    });
    confidence -= ambiguityPenalty;
  }

  // 9. Sidecar service agreement
  if (input.sidecarAgreementRate !== null) {
    if (input.sidecarAgreementRate >= 0.9) {
      adjustments.push({
        factor: "sidecar_agreement_high",
        delta: 0.04,
        direction: "increase",
        reason: "Sidecar services strongly agree",
      });
      confidence += 0.04;
    } else if (input.sidecarAgreementRate < 0.7) {
      const disagreementPenalty = (0.7 - input.sidecarAgreementRate) * 0.15;
      adjustments.push({
        factor: "sidecar_disagreement",
        delta: -disagreementPenalty,
        direction: "decrease",
        reason: `Sidecar agreement rate: ${Math.round(input.sidecarAgreementRate * 100)}%`,
      });
      confidence -= disagreementPenalty;
    }
  }

  // 10. ICD-10 code mapping
  if (input.hasICD10Mapping) {
    adjustments.push({
      factor: "icd10_mapped",
      delta: 0.02,
      direction: "increase",
      reason: "Condition mapped to ICD-10-CM code",
    });
    confidence += 0.02;
  }

  // 11. Breed/Age known
  if (input.breedKnown) {
    adjustments.push({
      factor: "breed_known",
      delta: 0.01,
      direction: "increase",
      reason: "Breed information available for risk assessment",
    });
    confidence += 0.01;
  }
  if (input.ageKnown) {
    adjustments.push({
      factor: "age_known",
      delta: 0.01,
      direction: "increase",
      reason: "Age information available for epidemiological adjustment",
    });
    confidence += 0.01;
  }

  // Clamp to valid range
  confidence = Math.max(0.15, Math.min(0.98, confidence));
  confidence = Number(confidence.toFixed(2));

  // Determine confidence level
  const confidenceLevel = determineConfidenceLevel(confidence);

  // Generate recommendation
  const recommendation = generateRecommendation(confidence, confidenceLevel, input);

  return {
    final_confidence: confidence,
    base_confidence: baseConfidence,
    adjustments,
    confidence_level: confidenceLevel,
    recommendation,
  };
}

function determineConfidenceLevel(confidence: number): CalibratedConfidence["confidence_level"] {
  if (confidence >= 0.85) return "very_high";
  if (confidence >= 0.70) return "high";
  if (confidence >= 0.55) return "moderate";
  if (confidence >= 0.40) return "low";
  return "very_low";
}

function generateRecommendation(
  confidence: number,
  level: CalibratedConfidence["confidence_level"],
  input: ConfidenceInput
): string {
  if (input.urgencyLevel === "emergency") {
    return "Immediate veterinary attention required. Seek emergency care now.";
  }

  switch (level) {
    case "very_high":
      return "High confidence assessment. Veterinary consultation recommended for confirmation and treatment planning.";
    case "high":
      return "Assessment suggests likely conditions. Veterinary examination advised for definitive diagnosis.";
    case "moderate":
      return "Preliminary assessment completed. Additional clinical information would improve diagnostic certainty. Veterinary consultation recommended.";
    case "low":
      return "Limited assessment confidence. Strongly recommend veterinary examination with detailed history and physical examination.";
    case "very_low":
      return "Insufficient information for reliable assessment. Immediate veterinary consultation advised, especially if symptoms persist or worsen.";
    default:
      return "Veterinary consultation recommended.";
  }
}

/**
 * Computes ICD-10 mapping confidence for a specific disease.
 * Returns confidence score based on code specificity and match quality.
 */
export function computeICD10MappingConfidence(diseaseName: string): number {
  const mapping = getICD10CodesForDisease(diseaseName);
  if (!mapping) return 0;

  let confidence = 0.75; // Base confidence for mapped diseases

  // Higher confidence if primary code is specific (more specific codes have longer codes)
  const primaryCodeLength = mapping.primary_code.code.length;
  if (primaryCodeLength >= 6) {
    confidence += 0.1; // Very specific code
  } else if (primaryCodeLength >= 4) {
    confidence += 0.05;
  }

  // Emergency conditions have higher mapping confidence (better documented)
  if (mapping.primary_code.urgency === "emergency") {
    confidence += 0.05;
  }

  // Multiple alternative codes indicate some ambiguity
  if (mapping.alternative_codes.length > 2) {
    confidence -= 0.05;
  }

  return Number(Math.min(0.95, confidence).toFixed(2));
}

/**
 * Legacy compatibility function - caps diagnostic confidence based on
 * key risk factors. Used by existing report generation code.
 */
export function computeCappedConfidence(input: {
  baseConfidence?: number | null;
  hasModelDisagreement?: boolean;
  lowQualityImage?: boolean;
  weakRetrievalSupport?: boolean;
  ambiguityFlags?: string[];
}): number {
  return capDiagnosticConfidence({
    baseConfidence: input.baseConfidence,
    hasModelDisagreement: input.hasModelDisagreement,
    lowQualityImage: input.lowQualityImage,
    weakRetrievalSupport: input.weakRetrievalSupport,
    ambiguityFlags: input.ambiguityFlags,
  });
}
