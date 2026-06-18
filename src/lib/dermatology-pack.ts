/**
 * VET-1504 — Dermatology / wound / mass / swelling pack.
 *
 * Extends the existing skin_wound pilot to cover mass_swelling and structured
 * lesion descriptors. Adds "not enough visual evidence" abstention rules.
 *
 * Safety rules (inherited from VET-1501 manifest):
 *   - Media inference is additive only; never downgrades deterministic urgency.
 *   - Insufficient visual evidence returns DermatologyAbstention, not a guess.
 *   - All evidence confidence is capped by image quality (see capDermatologyConfidence).
 */

import type { SupportedImageDomain } from "@/lib/clinical-evidence";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";
import type { MediaAbstention } from "@/lib/media-intake";

// ---------------------------------------------------------------------------
// Dermatology-specific image domains
// ---------------------------------------------------------------------------

export type DermatologyDomain = "skin_wound" | "mass_swelling";

export function isDermatologyDomain(
  domain: SupportedImageDomain | null | undefined
): domain is DermatologyDomain {
  return domain === "skin_wound" || domain === "mass_swelling";
}

// ---------------------------------------------------------------------------
// Lesion descriptors (structured findings from image evidence)
// ---------------------------------------------------------------------------

export type LesionType =
  | "laceration"
  | "abrasion"
  | "puncture"
  | "burn"
  | "abscess"
  | "hot_spot"
  | "rash"
  | "ulcer"
  | "scab"
  | "hair_loss_patch"
  | "unknown";

export type LesionColor =
  | "normal_skin"
  | "red"
  | "dark_red"
  | "pink"
  | "purple"
  | "black"
  | "yellow_green"
  | "white"
  | "mixed"
  | "not_visible";

export type LesionTexture =
  | "smooth"
  | "crusted"
  | "weeping"
  | "dry"
  | "ulcerated"
  | "swollen"
  | "not_visible";

export type LesionSizeClass =
  | "small"      // < 1 cm estimated
  | "medium"     // 1–5 cm estimated
  | "large"      // > 5 cm estimated
  | "extensive"  // covers a large body region
  | "unknown";

export interface LesionDescriptor {
  type: LesionType;
  color: LesionColor;
  texture: LesionTexture;
  sizeClass: LesionSizeClass;
  bodyRegion: string | null;
  hasPus: boolean | null;
  hasBlood: boolean | null;
  hasFlyStrike: boolean | null;
  appearsInfected: boolean | null;
  progressionDirection: "worsening" | "improving" | "stable" | "unknown" | null;
}

// ---------------------------------------------------------------------------
// Mass / swelling descriptors
// ---------------------------------------------------------------------------

export type MassConsistency = "soft" | "firm" | "hard" | "fluctuant" | "unknown";
export type MassMobility = "mobile" | "fixed" | "unknown";
export type MassBorder = "well_defined" | "irregular" | "diffuse" | "unknown";

export interface MassDescriptor {
  sizeClass: LesionSizeClass;
  bodyRegion: string | null;
  consistency: MassConsistency;
  mobility: MassMobility;
  border: MassBorder;
  overlying_skin: "normal" | "discolored" | "ulcerated" | "hair_loss" | "unknown";
  growthRate: "rapid" | "slow" | "stable" | "unknown" | null;
  painOnPalpationReported: boolean | null;
}

// ---------------------------------------------------------------------------
// Structured dermatology evidence (richer than VisionClinicalEvidence)
// ---------------------------------------------------------------------------

export type DermatologyUrgency =
  | "monitor"        // non-urgent; watch at home
  | "vet_soon"       // should see vet within a few days
  | "vet_today"      // same-day vet visit recommended
  | "emergency";     // deterministic clinical matrix takes over

export interface DermatologyEvidence {
  domain: DermatologyDomain;
  lesion?: LesionDescriptor;
  mass?: MassDescriptor;
  urgency: DermatologyUrgency;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresVetExam: boolean;
  suggestFollowUpPhoto: boolean;
}

// ---------------------------------------------------------------------------
// Abstention: not enough visual evidence to characterize
// ---------------------------------------------------------------------------

export type DermatologyAbstentionReason =
  | "poor_image_quality"
  | "area_not_visible"
  | "hair_obscuring_lesion"
  | "insufficient_lighting"
  | "domain_mismatch"
  | "multiple_lesions_ambiguous";

export interface DermatologyAbstention extends MediaAbstention {
  dermatologyReason: DermatologyAbstentionReason;
  canRetry: boolean;
}

// ---------------------------------------------------------------------------
// Abstention rules
// ---------------------------------------------------------------------------

export function evaluateDermatologyAbstention(
  preprocessResult: VisionPreprocessResult,
  domain: SupportedImageDomain
): DermatologyAbstention | null {
  // Domain mismatch — image doesn't show what we expected
  if (!isDermatologyDomain(domain)) {
    return {
      abstained: true,
      reason: "unsupported_domain",
      suggestedAction:
        "This image doesn't appear to show a skin issue, wound, or mass. Please try a closer photo of the affected area.",
      dermatologyReason: "domain_mismatch",
      canRetry: true,
    };
  }

  // Poor image quality
  if (preprocessResult.imageQuality === "poor") {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The image is too blurry or dark to assess. Please retake the photo in better lighting, held steady, and close to the affected area.",
      dermatologyReason: "poor_image_quality",
      canRetry: true,
    };
  }

  // No regions detected at all
  if (preprocessResult.detectedRegions.length === 0) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "We couldn't identify the affected area in this photo. Please try a closer shot that fills the frame with the skin or wound.",
      dermatologyReason: "area_not_visible",
      canRetry: true,
    };
  }

  // All detected regions have low confidence
  const allLowConfidence = preprocessResult.detectedRegions.every(
    (r) => r.confidence < 0.35
  );
  if (allLowConfidence) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The affected area isn't clearly visible in this photo. Please try again with better lighting and the area fully in frame.",
      dermatologyReason: "area_not_visible",
      canRetry: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Confidence cap by image quality
// ---------------------------------------------------------------------------

const QUALITY_CONFIDENCE_CAPS: Record<string, number> = {
  poor: 0,
  borderline: 0.55,
  good: 0.82,
  excellent: 0.95,
};

export function capDermatologyConfidence(
  baseConfidence: number,
  imageQuality: string
): number {
  const cap = QUALITY_CONFIDENCE_CAPS[imageQuality] ?? 0.55;
  return Number(Math.min(cap, Math.max(0, baseConfidence)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Urgency inference from findings + domain
// (additive only — deterministic clinical matrix always dominates)
// ---------------------------------------------------------------------------

const URGENT_FINDING_KEYWORDS = [
  "infected",
  "pus",
  "abscess",
  "maggot",
  "fly strike",
  "deep wound",
  "penetrating",
  "bone visible",
  "severe bleeding",
  "rapidly growing",
  "ulcerated",
];

const EMERGENCY_FINDING_KEYWORDS = [
  "profuse bleeding",
  "exposed bone",
  "degloving",
  "evisceration",
];

export function inferDermatologyUrgency(findings: string[]): DermatologyUrgency {
  const lower = findings.map((f) => f.toLowerCase()).join(" ");

  if (EMERGENCY_FINDING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "emergency";
  }
  if (URGENT_FINDING_KEYWORDS.some((kw) => lower.includes(kw))) {
    return "vet_today";
  }
  return "vet_soon";
}

// ---------------------------------------------------------------------------
// Body-region prompts (for owner guidance when requesting a photo)
// ---------------------------------------------------------------------------

export const BODY_REGION_PHOTO_GUIDANCE: Record<string, string> = {
  head: "Please photograph the affected area on the head — part the fur if needed and use a flashlight for clarity.",
  face: "Please photograph the face in good lighting. Keep your dog still and fill the frame with the affected area.",
  ear: "Please photograph the outer ear flap or canal opening. Use a flashlight and keep your dog's head still.",
  eye: "Please photograph the eye area in good natural light. Gently keep the eye open if possible.",
  mouth: "Please photograph inside the mouth or the muzzle area. Good lighting is essential.",
  neck: "Please photograph the neck area. Part the fur to reveal the skin beneath.",
  chest: "Please photograph the chest area. Part the fur and use direct lighting.",
  abdomen: "Please photograph the belly area with your dog lying on its side. Part the fur to reveal the skin.",
  back: "Please photograph the back or flank. Part the fur so the skin is clearly visible.",
  leg: "Please photograph the affected leg — include the full length if possible.",
  paw: "Please photograph the paw — top and bottom if relevant. Check between the toes.",
  tail: "Please photograph the tail area. Part the fur so the skin is visible.",
  groin: "Please photograph the groin or inner thigh area in good lighting.",
  default: "Please photograph the affected area directly — close enough to fill the frame, with good lighting.",
};

export function getBodyRegionPhotoGuidance(bodyRegion: string | null): string {
  if (!bodyRegion) return BODY_REGION_PHOTO_GUIDANCE.default;
  const lower = bodyRegion.toLowerCase();
  for (const [key, guidance] of Object.entries(BODY_REGION_PHOTO_GUIDANCE)) {
    if (lower.includes(key)) return guidance;
  }
  return BODY_REGION_PHOTO_GUIDANCE.default;
}
