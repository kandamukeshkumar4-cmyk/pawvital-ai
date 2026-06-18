/**
 * VET-1505 — Eye / ear / oral-gum pack.
 *
 * Structured evidence types and abstention rules for eye, ear, and oral/gum
 * image analysis. Adds `oral_gum` as a new image domain.
 *
 * Safety rules:
 *   - Gum-color abnormalities that suggest systemic emergency (blue, brick-red,
 *     pale gums) always trigger deterministic urgency — media observation is
 *     additive, never the sole basis for escalating to emergency.
 *   - Poor lighting / blurry images yield abstention — no speculative readings
 *     of gum color or ocular discharge.
 */

import type { SupportedImageDomain, VisionSeverityClass } from "@/lib/clinical-evidence";
import type { MediaAbstention } from "@/lib/media-intake";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";

// ---------------------------------------------------------------------------
// Supported pack domains
// ---------------------------------------------------------------------------

export type EyeEarOralDomain = "eye" | "ear" | "oral_gum";

export function isEyeEarOralDomain(
  domain: SupportedImageDomain | null | undefined
): domain is EyeEarOralDomain {
  return domain === "eye" || domain === "ear" || domain === "oral_gum";
}

// ---------------------------------------------------------------------------
// Eye evidence
// ---------------------------------------------------------------------------

export type EyeDischargeType =
  | "none"
  | "clear_watery"
  | "mucoid"
  | "purulent"
  | "blood_tinged"
  | "unknown";

export type EyeRednessGrade =
  | "none"
  | "mild"
  | "moderate"
  | "severe"
  | "unknown";

export interface EyeEvidence {
  domain: "eye";
  affected: "left" | "right" | "both" | "unknown";
  dischargeType: EyeDischargeType;
  redness: EyeRednessGrade;
  squinting: boolean | null;
  cloudiness: boolean | null;
  swellingAround: boolean | null;
  severity: VisionSeverityClass;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresVetExam: boolean;
}

// ---------------------------------------------------------------------------
// Ear evidence
// ---------------------------------------------------------------------------

export type EarDischargeType =
  | "none"
  | "dark_waxy"
  | "brown_grainy"
  | "purulent"
  | "blood_tinged"
  | "unknown";

export type EarOdor = "none" | "mild" | "strong" | "unknown";

export interface EarEvidence {
  domain: "ear";
  affected: "left" | "right" | "both" | "unknown";
  dischargeType: EarDischargeType;
  odor: EarOdor;
  swelling: boolean | null;
  hematoma: boolean | null;
  excoriations: boolean | null;
  severity: VisionSeverityClass;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresVetExam: boolean;
}

// ---------------------------------------------------------------------------
// Oral/gum evidence
// NOTE: Gum color interpretation is advisory only. Pale, blue, or brick-red
// gums trigger deterministic clinical matrix urgency regardless of this reading.
// ---------------------------------------------------------------------------

export type GumColor =
  | "normal_pink"
  | "pale"
  | "white"
  | "yellow"
  | "blue_purple"
  | "brick_red"
  | "muddy_brown"
  | "spotted"
  | "not_visible"
  | "unknown";

export type OralLesionType =
  | "none"
  | "ulcer"
  | "mass"
  | "abscess"
  | "foreign_body"
  | "discoloration"
  | "unknown";

export interface OralGumEvidence {
  domain: "oral_gum";
  gumColor: GumColor;
  dentalTartar: "none" | "mild" | "moderate" | "severe" | "unknown";
  oralLesion: OralLesionType;
  droolingExcessive: boolean | null;
  fracturedTooth: boolean | null;
  severity: VisionSeverityClass;
  /** Always true — gum color is advisory; systemic emergency requires vet */
  advisoryOnly: true;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresVetExam: boolean;
}

// Gum colors that warrant deterministic emergency escalation in the clinical matrix
export const EMERGENCY_GUM_COLORS = new Set<GumColor>([
  "pale",
  "white",
  "blue_purple",
  "brick_red",
  "muddy_brown",
]);

export function isEmergencyGumColor(color: GumColor): boolean {
  return EMERGENCY_GUM_COLORS.has(color);
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type EyeEarOralEvidence = EyeEvidence | EarEvidence | OralGumEvidence;

// ---------------------------------------------------------------------------
// Abstention — lighting / blur guards are strict for this pack
// ---------------------------------------------------------------------------

export type EyeEarOralAbstentionReason =
  | "poor_image_quality"
  | "area_not_visible"
  | "insufficient_lighting"
  | "too_blurry"
  | "domain_mismatch";

export interface EyeEarOralAbstention extends MediaAbstention {
  packReason: EyeEarOralAbstentionReason;
  canRetry: boolean;
}

export function evaluateEyeEarOralAbstention(
  preprocessResult: VisionPreprocessResult,
  domain: SupportedImageDomain
): EyeEarOralAbstention | null {
  if (!isEyeEarOralDomain(domain)) {
    return {
      abstained: true,
      reason: "unsupported_domain",
      suggestedAction:
        "This image doesn't appear to show eyes, ears, or the mouth. Please try a closer photo of the affected area.",
      packReason: "domain_mismatch",
      canRetry: true,
    };
  }

  if (preprocessResult.imageQuality === "poor") {
    const domainGuidance: Record<EyeEarOralDomain, string> = {
      eye: "Please retake in bright natural light or with a flashlight, keeping the camera steady.",
      ear: "Please retake with a flashlight illuminating the ear canal opening, keeping the dog still.",
      oral_gum:
        "Please retake with a flashlight inside the mouth. Gum color assessment needs clear lighting.",
    };
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        domainGuidance[domain as EyeEarOralDomain] ??
        "Please retake the photo with better lighting and keep the camera steady.",
      packReason: "poor_image_quality",
      canRetry: true,
    };
  }

  if (preprocessResult.detectedRegions.length === 0) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The relevant area isn't clearly visible in this photo. Please try a closer shot that fills the frame.",
      packReason: "area_not_visible",
      canRetry: true,
    };
  }

  const allLowConfidence = preprocessResult.detectedRegions.every(
    (r) => r.confidence < 0.3
  );
  if (allLowConfidence) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "We couldn't clearly identify the area in this photo. Please try in better lighting, closer to the subject.",
      packReason: "too_blurry",
      canRetry: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Confidence cap — eye/ear/oral pack is stricter than dermatology
// (gum color misread has higher clinical consequence)
// ---------------------------------------------------------------------------

const EYE_EAR_ORAL_QUALITY_CAPS: Record<string, number> = {
  poor: 0,
  borderline: 0.45,   // lower than dermatology — color accuracy matters more
  good: 0.78,
  excellent: 0.92,
};

export function capEyeEarOralConfidence(
  baseConfidence: number,
  imageQuality: string
): number {
  const cap = EYE_EAR_ORAL_QUALITY_CAPS[imageQuality] ?? 0.45;
  return Number(Math.min(cap, Math.max(0, baseConfidence)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Owner photo-capture guidance (domain-specific)
// ---------------------------------------------------------------------------

export const EYE_CAPTURE_GUIDANCE =
  "In bright natural light or with a small flashlight, hold the camera level with your dog's eye and as close as possible without causing distress. Have a helper keep your dog still. Fill the frame with the eye area.";

export const EAR_CAPTURE_GUIDANCE =
  "Use a small flashlight to illuminate inside the ear canal. Keep your dog's head still — a helper is useful. Photograph the outer flap and the canal opening separately if possible.";

export const ORAL_GUM_CAPTURE_GUIDANCE =
  "Gently lift your dog's lip to expose the gums near the canine teeth. Use a flashlight for clear color visibility. Ask a helper to hold the lip up while you photograph. Important: if gums appear pale, blue, or brick-red, go to an emergency vet immediately — do not wait for photo results.";

export function getDomainCaptureGuidance(domain: EyeEarOralDomain): string {
  switch (domain) {
    case "eye":
      return EYE_CAPTURE_GUIDANCE;
    case "ear":
      return EAR_CAPTURE_GUIDANCE;
    case "oral_gum":
      return ORAL_GUM_CAPTURE_GUIDANCE;
  }
}
