/**
 * VET-1507 — Respiratory audio pack.
 *
 * Types, validation, and urgency inference for owner-uploaded respiratory
 * audio clips (cough, wheeze, stridor, labored breathing).
 *
 * Safety rules (non-negotiable):
 *   1. Audio inference is ADVISORY ONLY. Deterministic urgency from the
 *      clinical matrix always dominates.
 *   2. No audio inference may REDUCE urgency. It may only confirm or escalate.
 *   3. "Difficulty breathing" remains a deterministic emergency regardless of
 *      any audio classification result.
 *   4. Low-quality audio (high background noise, < 5 s, clipping) yields
 *      abstention — no speculative respiratory classification.
 */

import type { SupportedAudioDomain, AudioQuality } from "@/lib/media-intake";
import type { MediaAbstention } from "@/lib/media-intake";

// ---------------------------------------------------------------------------
// Respiratory sound types
// ---------------------------------------------------------------------------

export type RespiratoryPattern =
  | "productive_cough"    // moist, wet-sounding
  | "dry_cough"           // harsh, non-productive
  | "honking_cough"       // goose-honk (tracheal collapse marker)
  | "inspiratory_wheeze"  // high-pitched on inhale
  | "expiratory_wheeze"   // high-pitched on exhale
  | "biphasic_wheeze"     // both phases
  | "stridor"             // high-pitched inspiratory stridor
  | "stertor"             // low-pitched snorting / reverse-sneeze
  | "labored_breathing"   // increased respiratory effort
  | "rapid_shallow"       // tachypnea pattern
  | "normal"
  | "uncertain";

export type RespiratoryRate =
  | "normal"    // dog normal: ~15–30 breaths/min
  | "elevated"  // 31–60
  | "high"      // > 60
  | "unknown";

// ---------------------------------------------------------------------------
// Audio evidence
// ---------------------------------------------------------------------------

export interface RespiratoryAudioEvidence {
  domain: SupportedAudioDomain;
  pattern: RespiratoryPattern;
  rate: RespiratoryRate;
  effort: "minimal" | "mild" | "moderate" | "severe" | "unknown";
  /** Always true — clinical urgency cannot be lowered by audio */
  advisoryOnly: true;
  severity: "normal" | "needs_review" | "urgent";
  confidence: number;
  audioQuality: AudioQuality;
  findings: string[];
  limitations: string[];
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Abstention rules
// ---------------------------------------------------------------------------

export type AudioAbstentionReason =
  | "clip_too_short"
  | "high_background_noise"
  | "audio_clipping"
  | "inaudible"
  | "domain_mismatch"
  | "non_respiratory_sound";

export interface RespiratoryAudioAbstention extends MediaAbstention {
  audioReason: AudioAbstentionReason;
  canRetry: boolean;
}

const MIN_AUDIO_DURATION_SECONDS = 5;

export function evaluateRespiratoryAudioAbstention(opts: {
  durationSeconds: number;
  backgroundNoiseLevel?: "low" | "moderate" | "high";
  audioQuality?: AudioQuality;
  domain: SupportedAudioDomain;
}): RespiratoryAudioAbstention | null {
  if (
    opts.domain !== "respiratory_cough" &&
    opts.domain !== "respiratory_wheeze" &&
    opts.domain !== "respiratory_stridor" &&
    opts.domain !== "respiratory_labored"
  ) {
    return {
      abstained: true,
      reason: "unsupported_domain",
      suggestedAction:
        "This audio clip doesn't appear to contain respiratory sounds. Please record your dog breathing or coughing in a quiet room.",
      audioReason: "domain_mismatch",
      canRetry: true,
    };
  }

  if (opts.durationSeconds < MIN_AUDIO_DURATION_SECONDS) {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction: `The clip is too short (${opts.durationSeconds}s). Please record at least ${MIN_AUDIO_DURATION_SECONDS} seconds of breathing or coughing in a quiet room.`,
      audioReason: "clip_too_short",
      canRetry: true,
    };
  }

  if (opts.backgroundNoiseLevel === "high") {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "There is too much background noise in this clip. Please record in a quieter room — turn off the TV, radio, and fans.",
      audioReason: "high_background_noise",
      canRetry: true,
    };
  }

  if (opts.audioQuality === "poor") {
    return {
      abstained: true,
      reason: "low_quality",
      suggestedAction:
        "The audio quality is too poor to classify. Please try holding the phone closer to your dog (15–30 cm from the nose/chest) in a quiet room.",
      audioReason: "inaudible",
      canRetry: true,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Urgency inference (advisory only — deterministic matrix dominates)
// ---------------------------------------------------------------------------

const URGENT_PATTERNS = new Set<RespiratoryPattern>([
  "stridor",
  "labored_breathing",
  "rapid_shallow",
  "biphasic_wheeze",
]);

const REVIEW_PATTERNS = new Set<RespiratoryPattern>([
  "productive_cough",
  "dry_cough",
  "honking_cough",
  "inspiratory_wheeze",
  "expiratory_wheeze",
  "stertor",
]);

export function inferRespiratoryUrgency(
  pattern: RespiratoryPattern,
  effort: RespiratoryAudioEvidence["effort"]
): RespiratoryAudioEvidence["severity"] {
  if (URGENT_PATTERNS.has(pattern)) return "urgent";
  if (effort === "severe" || effort === "moderate") return "urgent";
  if (REVIEW_PATTERNS.has(pattern)) return "needs_review";
  return "normal";
}

// ---------------------------------------------------------------------------
// Confidence cap by audio quality
// ---------------------------------------------------------------------------

const AUDIO_QUALITY_CAPS: Record<AudioQuality, number> = {
  poor: 0,
  acceptable: 0.55,
  good: 0.78,
};

export function capRespiratoryConfidence(
  baseConfidence: number,
  quality: AudioQuality
): number {
  const cap = AUDIO_QUALITY_CAPS[quality] ?? 0;
  return Number(Math.min(cap, Math.max(0, baseConfidence)).toFixed(2));
}

// ---------------------------------------------------------------------------
// Patterns that the clinical matrix must flag regardless of audio result
// ---------------------------------------------------------------------------

export const ALWAYS_EMERGENCY_RESPIRATORY_SYMPTOMS = new Set([
  "difficulty_breathing",
  "not_breathing",
  "coughing_blood",
  "blue_gums",
  "pale_gums",
  "collapse",
]);

export function isAlwaysEmergencyRespiratory(knownSymptoms: string[]): boolean {
  return knownSymptoms.some((s) => ALWAYS_EMERGENCY_RESPIRATORY_SYMPTOMS.has(s));
}

// ---------------------------------------------------------------------------
// Owner audio-capture guidance
// ---------------------------------------------------------------------------

export const RESPIRATORY_AUDIO_CAPTURE_GUIDANCE = [
  "Record in the quietest room you can find — turn off the TV, fans, and any background noise.",
  "Hold the phone 15–30 cm from your dog's nose or chest.",
  "Record for 15–30 seconds to capture at least 3–5 breath cycles.",
  "If your dog is resting or sleeping, that's often the best time to capture breathing sounds.",
  "Do NOT delay getting emergency care to record audio — only record if your dog is stable.",
].join(" ");

export const RESPIRATORY_EMERGENCY_WARNING =
  "If your dog is breathing with its mouth open, neck extended, sides heaving, or gums appear pale, blue, or grey — go to an emergency vet immediately. Do not wait for audio results.";
