/**
 * VET-1506 — Gait / lameness temporal pack.
 *
 * Structured types and validation for multi-image or short-sequence gait
 * assessment. Additive only to musculoskeletal and neuro clinical questioning.
 *
 * Safety rules:
 *   - Gait evidence may escalate urgency but never downgrade it.
 *   - Neuro signs (knuckling, crossing legs, ataxia) observed in frames always
 *     trigger "vet_today" or "emergency" — they cannot be downgraded by sequence.
 *   - Temporal pack requires ≥ 2 frames; sequences with < 2 usable frames yield abstention.
 */

import type { SupportedTemporalDomain } from "@/lib/media-intake";
import type { MediaAbstention } from "@/lib/media-intake";

// ---------------------------------------------------------------------------
// Affected limb classification
// ---------------------------------------------------------------------------

export type AffectedLimb =
  | "front_left"
  | "front_right"
  | "hind_left"
  | "hind_right"
  | "multiple"
  | "unknown";

export type LimbRole = "front" | "hind" | "unknown";

export function limbRole(limb: AffectedLimb): LimbRole {
  if (limb === "front_left" || limb === "front_right") return "front";
  if (limb === "hind_left" || limb === "hind_right") return "hind";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Per-frame gait observation
// ---------------------------------------------------------------------------

export type WeightBearingGrade =
  | "full"           // bearing full weight
  | "partial"        // toe-touching or occasional use
  | "non_weight_bearing"  // holding limb up
  | "unknown";

export type PostureObservation =
  | "normal"
  | "hunched"
  | "wide_based"
  | "narrow_based"
  | "head_low"
  | "unknown";

export interface GaitFrameObservation {
  frameIndex: number;
  weightBearing: WeightBearingGrade;
  posture: PostureObservation;
  /** Estimated asymmetry score 0–1 (0 = symmetric, 1 = completely favoring) */
  asymmetryScore: number | null;
  neuroSigns: boolean;       // knuckling, crossing, ataxia
  painBehavior: boolean;     // yelping, flinching, tail-tuck
  confidence: number;
}

// ---------------------------------------------------------------------------
// Sequence-level gait evidence
// ---------------------------------------------------------------------------

export type GaitProgressionDirection = "worsening" | "improving" | "stable" | "unclear";

export type GaitUrgency = "monitor" | "vet_soon" | "vet_today" | "emergency";

export interface GaitTemporalEvidence {
  domain: SupportedTemporalDomain;
  affectedLimb: AffectedLimb;
  frameObservations: GaitFrameObservation[];
  progressionDirection: GaitProgressionDirection;
  worstWeightBearing: WeightBearingGrade;
  hasNeuroSigns: boolean;
  hasPainBehavior: boolean;
  urgency: GaitUrgency;
  confidence: number;
  frameCount: number;
  limitations: string[];
  requiresVetExam: boolean;
}

// ---------------------------------------------------------------------------
// Abstention rules
// ---------------------------------------------------------------------------

export type GaitAbstentionReason =
  | "insufficient_frames"
  | "all_frames_poor_quality"
  | "domain_mismatch"
  | "no_dog_visible"
  | "span_too_long";

export interface GaitAbstention extends MediaAbstention {
  gaitReason: GaitAbstentionReason;
  canRetry: boolean;
}

const MIN_USABLE_FRAMES = 2;
const MAX_SEQUENCE_SPAN_SECONDS = 15;

export function evaluateGaitAbstention(opts: {
  frameCount: number;
  usableFrameCount: number;
  spanSeconds?: number;
  domain: SupportedTemporalDomain | null | undefined;
}): GaitAbstention | null {
  if (opts.domain !== "gait_lameness") {
    return {
      abstained: true,
      reason: "unsupported_domain",
      suggestedAction:
        "This sequence doesn't appear to show gait or movement. Please provide photos of your dog walking from the side.",
      gaitReason: "domain_mismatch",
      canRetry: true,
    };
  }

  if (
    opts.spanSeconds !== undefined &&
    opts.spanSeconds > MAX_SEQUENCE_SPAN_SECONDS
  ) {
    return {
      abstained: true,
      reason: "duration_exceeded",
      suggestedAction: `The sequence is longer than ${MAX_SEQUENCE_SPAN_SECONDS} seconds. Please provide a shorter clip or a series of 2–4 still photos of your dog walking.`,
      gaitReason: "span_too_long",
      canRetry: true,
    };
  }

  if (opts.usableFrameCount < MIN_USABLE_FRAMES) {
    return {
      abstained: true,
      reason: "frame_count_invalid",
      suggestedAction:
        "We need at least 2 clear photos of your dog walking to assess gait. Please provide photos from both sides if possible.",
      gaitReason: "insufficient_frames",
      canRetry: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Urgency inference
// ---------------------------------------------------------------------------

export function inferGaitUrgency(opts: {
  hasNeuroSigns: boolean;
  worstWeightBearing: WeightBearingGrade;
  progressionDirection: GaitProgressionDirection;
  hasPainBehavior: boolean;
}): GaitUrgency {
  // Neuro signs (knuckling, ataxia, crossing) → at minimum vet_today
  if (opts.hasNeuroSigns) return "vet_today";

  if (opts.worstWeightBearing === "non_weight_bearing") {
    // NWB + worsening or pain = vet_today
    if (opts.progressionDirection === "worsening" || opts.hasPainBehavior) {
      return "vet_today";
    }
    return "vet_today"; // NWB alone → vet_today
  }

  if (opts.worstWeightBearing === "partial") {
    if (opts.progressionDirection === "worsening") return "vet_today";
    if (opts.hasPainBehavior) return "vet_soon";
    return "vet_soon";
  }

  if (opts.progressionDirection === "worsening") return "vet_soon";
  return "monitor";
}

// ---------------------------------------------------------------------------
// Confidence cap by frame quality
// ---------------------------------------------------------------------------

const GAIT_FRAME_QUALITY_CAPS: Record<number, number> = {
  2: 0.55,  // 2 frames — limited temporal info
  3: 0.70,
  4: 0.80,
  8: 0.90,  // maximum frame count
};

export function capGaitConfidence(
  baseConfidence: number,
  usableFrameCount: number
): number {
  const keys = Object.keys(GAIT_FRAME_QUALITY_CAPS).map(Number).sort((a, b) => a - b);
  let cap = 0.55;
  for (const k of keys) {
    if (usableFrameCount >= k) cap = GAIT_FRAME_QUALITY_CAPS[k];
  }
  return Number(Math.min(cap, Math.max(0, baseConfidence)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Owner guidance for gait sequence capture
// ---------------------------------------------------------------------------

export const GAIT_CAPTURE_GUIDANCE = [
  "Film or photograph your dog walking on a flat, non-slip surface.",
  "Take one view from each side (left and right) if possible.",
  "Include a full stride cycle — from when the affected foot lands to when it lands again.",
  "Keep the camera level with your dog's body, not looking down.",
  "Good lighting and minimal background movement help a lot.",
  "2–4 photos or a clip under 15 seconds is ideal.",
].join(" ");

export const GAIT_NEURO_ADDITIONAL_GUIDANCE =
  "If your dog is crossing its back legs, knuckling its paws, or seems uncoordinated (not just limping), please see a vet today — this may involve the spine or nervous system.";
