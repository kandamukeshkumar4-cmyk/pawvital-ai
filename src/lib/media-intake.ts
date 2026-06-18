/**
 * VET-1502 — Unified media intake contract.
 *
 * Single contract for all modalities: image, audio, and temporal sequences.
 * Backward-compatible with the existing image flow (ImagePayload wraps what the
 * symptom-checker already sends).  Audio and temporal are new for VET-1507 and
 * VET-1506 respectively.
 *
 * Safety rules (from VET-1501 manifest):
 *   - Media inference is additive only; never silently downgrades urgency.
 *   - Low-quality media yields MediaAbstention, not a speculative result.
 *   - SupportedImageDomain extensions live in clinical-evidence.ts.
 */

import type { ImageMeta, ImageGateWarning } from "@/lib/image-gate";
import type {
  VisionPreprocessResult,
  VisionClinicalEvidence,
  SupportedImageDomain,
  VisionSeverityClass,
} from "@/lib/clinical-evidence";

// ---------------------------------------------------------------------------
// Shared base metadata
// ---------------------------------------------------------------------------

export interface MediaMeta {
  mimeType: string;
  fileSizeBytes: number;
  capturedAt?: string;       // ISO 8601 capture timestamp (owner-supplied)
  bodyRegionHint?: string;   // owner-supplied anatomy hint ("left ear", "left hind leg")
  storageRef?: string;       // blob URL or storage key after server-side upload
}

// ---------------------------------------------------------------------------
// Image payload (backward-compatible extension of the existing flow)
// ---------------------------------------------------------------------------

export interface ImagePayloadMeta extends MediaMeta, ImageMeta {}

export interface ImagePayload {
  mediaType: "image";
  /** base64 data URI — present on initial upload, stripped before long-term storage */
  base64?: string;
  meta: ImagePayloadMeta;
  preprocessResult?: VisionPreprocessResult;
  gateWarning?: ImageGateWarning;
  domain?: SupportedImageDomain;
}

// ---------------------------------------------------------------------------
// Audio payload (new — VET-1507)
// ---------------------------------------------------------------------------

export type SupportedAudioMimeType =
  | "audio/mpeg"
  | "audio/mp4"
  | "audio/wav"
  | "audio/x-wav"
  | "audio/ogg"
  | "audio/webm";

export type SupportedAudioDomain =
  | "respiratory_cough"
  | "respiratory_wheeze"
  | "respiratory_stridor"
  | "respiratory_labored"
  | "unsupported";

export type AudioQuality = "poor" | "acceptable" | "good";

export interface AudioPayloadMeta extends MediaMeta {
  mimeType: SupportedAudioMimeType;
  durationSeconds: number;
  sampleRateHz?: number;
  backgroundNoiseLevel?: "low" | "moderate" | "high";
}

export interface AudioPayload {
  mediaType: "audio";
  /** Audio is never sent inline; always uploaded to storage first */
  storageRef: string;
  meta: AudioPayloadMeta;
  audioQuality?: AudioQuality;
  /** Speech-to-text transcript, if dictation was run on this audio */
  transcript?: string;
}

// ---------------------------------------------------------------------------
// Temporal sequence payload (new — VET-1506)
// ---------------------------------------------------------------------------

export type SupportedTemporalDomain =
  | "gait_lameness"
  | "wound_progression"
  | "swelling_progression"
  | "unsupported";

export interface TemporalPayload {
  mediaType: "temporal";
  /** Ordered frames; minimum 2, maximum 8 */
  frames: ImagePayload[];
  /** Seconds between consecutive frames, if known */
  intervalSeconds?: number;
  /** Total span of the sequence in seconds */
  spanSeconds?: number;
  domain?: SupportedTemporalDomain;
  meta: MediaMeta;
}

// ---------------------------------------------------------------------------
// Union — the single intake contract for all modalities
// ---------------------------------------------------------------------------

export type MediaPayload = ImagePayload | AudioPayload | TemporalPayload;

export type MediaType = MediaPayload["mediaType"];

// ---------------------------------------------------------------------------
// Abstention (returned when domain is unsupported or quality gate fails)
// ---------------------------------------------------------------------------

export type AbstentionReason =
  | "unsupported_domain"
  | "low_quality"
  | "species_mismatch"
  | "out_of_scope"
  | "human_person_detected"
  | "duration_exceeded"
  | "file_too_large"
  | "frame_count_invalid";

export interface MediaAbstention {
  abstained: true;
  reason: AbstentionReason;
  suggestedAction: string;
}

// ---------------------------------------------------------------------------
// Audio clinical evidence (mirrors VisionClinicalEvidence — VET-1507)
// ---------------------------------------------------------------------------

export interface AudioClinicalEvidence {
  domain: SupportedAudioDomain;
  findings: string[];
  severity: VisionSeverityClass;
  confidence: number;
  /** Deterministic urgency from the clinical matrix always dominates */
  advisoryOnly: true;
  supportedSymptoms: string[];
  contradictions: string[];
  limitations: string[];
  audioQuality: AudioQuality;
}

// ---------------------------------------------------------------------------
// Temporal clinical evidence (VET-1506)
// ---------------------------------------------------------------------------

export interface TemporalClinicalEvidence {
  domain: SupportedTemporalDomain;
  findings: string[];
  severity: VisionSeverityClass;
  confidence: number;
  frameCount: number;
  progressionDirection: "worsening" | "improving" | "stable" | "unclear";
  limitations: string[];
}

// ---------------------------------------------------------------------------
// Union evidence type
// ---------------------------------------------------------------------------

export type MediaClinicalEvidence =
  | VisionClinicalEvidence
  | AudioClinicalEvidence
  | TemporalClinicalEvidence;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isImagePayload(p: MediaPayload): p is ImagePayload {
  return p.mediaType === "image";
}

export function isAudioPayload(p: MediaPayload): p is AudioPayload {
  return p.mediaType === "audio";
}

export function isTemporalPayload(p: MediaPayload): p is TemporalPayload {
  return p.mediaType === "temporal";
}

export function isAudioEvidence(e: MediaClinicalEvidence): e is AudioClinicalEvidence {
  return "advisoryOnly" in e;
}

export function isTemporalEvidence(
  e: MediaClinicalEvidence
): e is TemporalClinicalEvidence {
  return "frameCount" in e;
}

// ---------------------------------------------------------------------------
// Quality gate helpers
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;   // 5 MB
const MAX_AUDIO_SECONDS = 30;
const MAX_TEMPORAL_BYTES = 50 * 1024 * 1024;
const MAX_TEMPORAL_SECONDS = 15;
const MIN_TEMPORAL_FRAMES = 2;
const MAX_TEMPORAL_FRAMES = 8;

export function validateMediaSize(payload: MediaPayload): MediaAbstention | null {
  if (isImagePayload(payload)) {
    if (payload.meta.fileSizeBytes > MAX_IMAGE_BYTES) {
      return {
        abstained: true,
        reason: "file_too_large",
        suggestedAction: "Please attach an image under 10 MB.",
      };
    }
    return null;
  }

  if (isAudioPayload(payload)) {
    if (payload.meta.fileSizeBytes > MAX_AUDIO_BYTES) {
      return {
        abstained: true,
        reason: "file_too_large",
        suggestedAction: "Please attach an audio clip under 5 MB.",
      };
    }
    if (payload.meta.durationSeconds > MAX_AUDIO_SECONDS) {
      return {
        abstained: true,
        reason: "duration_exceeded",
        suggestedAction: `Please attach an audio clip under ${MAX_AUDIO_SECONDS} seconds.`,
      };
    }
    return null;
  }

  if (isTemporalPayload(payload)) {
    const totalBytes = payload.frames.reduce(
      (sum, f) => sum + f.meta.fileSizeBytes,
      0
    );
    if (totalBytes > MAX_TEMPORAL_BYTES) {
      return {
        abstained: true,
        reason: "file_too_large",
        suggestedAction: "The image sequence is too large. Please use fewer or smaller images.",
      };
    }
    if (payload.spanSeconds !== undefined && payload.spanSeconds > MAX_TEMPORAL_SECONDS) {
      return {
        abstained: true,
        reason: "duration_exceeded",
        suggestedAction: `Please keep the clip sequence under ${MAX_TEMPORAL_SECONDS} seconds.`,
      };
    }
    const fc = payload.frames.length;
    if (fc < MIN_TEMPORAL_FRAMES || fc > MAX_TEMPORAL_FRAMES) {
      return {
        abstained: true,
        reason: "frame_count_invalid",
        suggestedAction: `Please provide between ${MIN_TEMPORAL_FRAMES} and ${MAX_TEMPORAL_FRAMES} photos for a progression sequence.`,
      };
    }
    return null;
  }

  return null;
}

export const SUPPORTED_AUDIO_MIME_TYPES: SupportedAudioMimeType[] = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
];

export function isSupportedAudioMimeType(mime: string): mime is SupportedAudioMimeType {
  return (SUPPORTED_AUDIO_MIME_TYPES as string[]).includes(mime);
}
