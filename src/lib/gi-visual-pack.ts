/**
 * VET-1508 — GI visual pack (vomit / stool / abdominal-distension).
 *
 * Advisory image classification for GI presentations. Adds `abdominal_distension`
 * as a new image domain.
 *
 * Safety rules:
 *   1. GI evidence is ADVISORY ONLY. Bloat (GDV) and obstruction red flags
 *      remain deterministic emergency conditions — no image result can downgrade
 *      their urgency.
 *   2. Abdominal distension images are HIGH-RISK: if the dog is also retching
 *      or in distress, the emergency path must fire before any image analysis.
 *   3. Contaminated or unclear images yield abstention — no speculative GI
 *      content classification.
 */

import type { SupportedImageDomain } from "@/lib/clinical-evidence";
import type { MediaAbstention } from "@/lib/media-intake";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";

// ---------------------------------------------------------------------------
// GI image domains
// ---------------------------------------------------------------------------

export type GiVisualDomain = "stool_vomit" | "abdominal_distension";

export function isGiVisualDomain(
  domain: SupportedImageDomain | null | undefined
): domain is GiVisualDomain {
  return domain === "stool_vomit" || domain === "abdominal_distension";
}

// ---------------------------------------------------------------------------
// Stool/vomit descriptors
// ---------------------------------------------------------------------------

export type VomitColor =
  | "white_foam"
  | "yellow_bile"
  | "food"
  | "blood_tinged"
  | "bright_red_blood"
  | "dark_coffee_ground"
  | "green"
  | "brown"
  | "unknown";

export type StoolConsistency =
  | "formed"
  | "soft"
  | "mushy"
  | "liquid"
  | "unknown";

export type StoolColor =
  | "normal_brown"
  | "dark_black_tarry"
  | "bright_red_blood"
  | "grey_pale"
  | "orange_yellow"
  | "green"
  | "unknown";

export interface StoolVomitEvidence {
  domain: "stool_vomit";
  subtype: "vomit" | "stool" | "both" | "unknown";
  vomitColor: VomitColor | null;
  stoolConsistency: StoolConsistency | null;
  stoolColor: StoolColor | null;
  foreignMaterial: boolean | null;
  bloodPresent: boolean | null;
  severity: "normal" | "needs_review" | "urgent";
  advisoryOnly: true;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresVetExam: boolean;
}

// ---------------------------------------------------------------------------
// Abdominal distension descriptors
// ---------------------------------------------------------------------------

export type DistensionGrade =
  | "none"
  | "mild"
  | "moderate"
  | "severe"
  | "unknown";

export type DistensionSymmetry =
  | "symmetric"
  | "asymmetric_left"
  | "asymmetric_right"
  | "unknown";

export interface AbdominalDistensionEvidence {
  domain: "abdominal_distension";
  grade: DistensionGrade;
  symmetry: DistensionSymmetry;
  visibleDiscomfort: boolean | null;
  severity: "needs_review" | "urgent";
  advisoryOnly: true;
  confidence: number;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  findings: string[];
  limitations: string[];
  requiresEmergencyVet: boolean;
}

export type GiVisualEvidence = StoolVomitEvidence | AbdominalDistensionEvidence;

// ---------------------------------------------------------------------------
// Emergency GDV guard
// ---------------------------------------------------------------------------

const GDV_SYMPTOM_KEYS = new Set([
  "swollen_abdomen",
  "distended_abdomen_with_retching",
  "retching",
  "non_productive_retching",
  "bloat",
]);

export function isGdvRiskPresentation(knownSymptoms: string[]): boolean {
  return knownSymptoms.some((s) => GDV_SYMPTOM_KEYS.has(s));
}

// Color findings that indicate urgent/emergency GI status
const URGENT_VOMIT_COLORS = new Set<VomitColor>([
  "blood_tinged",
  "bright_red_blood",
  "dark_coffee_ground",
]);

const URGENT_STOOL_COLORS = new Set<StoolColor>([
  "dark_black_tarry",
  "bright_red_blood",
]);

export function inferStoolVomitSeverity(
  vomitColor: VomitColor | null,
  stoolColor: StoolColor | null,
  bloodPresent: boolean | null,
  foreignMaterial: boolean | null
): StoolVomitEvidence["severity"] {
  if (bloodPresent) return "urgent";
  if (foreignMaterial) return "urgent";
  if (vomitColor && URGENT_VOMIT_COLORS.has(vomitColor)) return "urgent";
  if (stoolColor && URGENT_STOOL_COLORS.has(stoolColor)) return "urgent";
  if (stoolColor === "grey_pale") return "needs_review";
  if (stoolColor === "orange_yellow") return "needs_review";
  if (vomitColor === "dark_coffee_ground") return "urgent";
  return "needs_review";
}

// ---------------------------------------------------------------------------
// Abstention rules
// ---------------------------------------------------------------------------

export type GiAbstentionReason =
  | "poor_image_quality"
  | "contaminated_unidentifiable"
  | "area_not_visible"
  | "domain_mismatch";

export interface GiVisualAbstention extends MediaAbstention {
  giReason: GiAbstentionReason;
  canRetry: boolean;
}

export function evaluateGiAbstention(
  preprocessResult: VisionPreprocessResult,
  domain: SupportedImageDomain
): GiVisualAbstention | null {
  if (!isGiVisualDomain(domain)) {
    return {
      abstained: true,
      reason: "unsupported_domain",
      suggestedAction:
        "This image doesn't appear to show vomit, stool, or the belly area. Please try again with a clearer photo of the relevant area.",
      giReason: "domain_mismatch",
      canRetry: true,
    };
  }

  if (preprocessResult.imageQuality === "poor") {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The image is too blurry or dark. Please retake in better lighting and hold the camera steady.",
      giReason: "poor_image_quality",
      canRetry: true,
    };
  }

  if (preprocessResult.detectedRegions.length === 0) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "We couldn't identify the relevant content in this photo. Please try a closer, clearer shot.",
      giReason: "area_not_visible",
      canRetry: true,
    };
  }

  const allLowConfidence = preprocessResult.detectedRegions.every(
    (r) => r.confidence < 0.35
  );
  if (allLowConfidence) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The photo is unclear. Please try again with better lighting and focus.",
      giReason: "contaminated_unidentifiable",
      canRetry: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Confidence cap
// ---------------------------------------------------------------------------

const GI_QUALITY_CAPS: Record<string, number> = {
  poor: 0,
  borderline: 0.50,
  good: 0.75,
  excellent: 0.88,
};

export function capGiConfidence(
  baseConfidence: number,
  imageQuality: string
): number {
  const cap = GI_QUALITY_CAPS[imageQuality] ?? 0.50;
  return Number(Math.min(cap, Math.max(0, baseConfidence)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Owner guidance
// ---------------------------------------------------------------------------

export const STOOL_VOMIT_CAPTURE_GUIDANCE =
  "Photograph the vomit or stool in place — do not move or clean it first. Use overhead lighting or a flashlight for color accuracy. Include the full sample in the frame.";

export const ABDOMINAL_DISTENSION_CAPTURE_GUIDANCE =
  "Have your dog stand on a flat surface. Photograph from directly beside them at belly height, showing the full flank. Do NOT delay emergency care to take this photo — if your dog is retching without producing vomit, call an emergency vet immediately.";

export const GDV_EMERGENCY_WARNING =
  "If your dog has a visibly swollen belly AND is retching without producing anything, this may be GDV (bloat) — a life-threatening emergency. Call an emergency vet immediately and do not delay for photo results.";
