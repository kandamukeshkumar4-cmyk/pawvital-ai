/**
 * VET-1502 — Unified media intake contract tests.
 * Verifies type guards, size/duration validation, and MIME helpers.
 * No network calls; pure unit tests.
 */

import {
  isImagePayload,
  isAudioPayload,
  isTemporalPayload,
  isAudioEvidence,
  isTemporalEvidence,
  validateMediaSize,
  isSupportedAudioMimeType,
  type ImagePayload,
  type AudioPayload,
  type TemporalPayload,
  type AudioClinicalEvidence,
  type TemporalClinicalEvidence,
} from "@/lib/media-intake";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseImagePayload: ImagePayload = {
  mediaType: "image",
  meta: {
    mimeType: "image/jpeg",
    fileSizeBytes: 500 * 1024, // 500 KB
    width: 1024,
    height: 768,
    blurScore: 120,
    estimatedKb: 500,
  },
};

const baseAudioPayload: AudioPayload = {
  mediaType: "audio",
  storageRef: "audio/abc123.mp3",
  meta: {
    mimeType: "audio/mpeg",
    fileSizeBytes: 1 * 1024 * 1024, // 1 MB
    durationSeconds: 10,
  },
};

const baseTemporalPayload: TemporalPayload = {
  mediaType: "temporal",
  frames: [baseImagePayload, baseImagePayload],
  meta: {
    mimeType: "image/jpeg",
    fileSizeBytes: 1 * 1024 * 1024, // 1 MB total
  },
};

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

describe("media-intake type guards", () => {
  test("isImagePayload identifies image", () => {
    expect(isImagePayload(baseImagePayload)).toBe(true);
    expect(isImagePayload(baseAudioPayload)).toBe(false);
    expect(isImagePayload(baseTemporalPayload)).toBe(false);
  });

  test("isAudioPayload identifies audio", () => {
    expect(isAudioPayload(baseAudioPayload)).toBe(true);
    expect(isAudioPayload(baseImagePayload)).toBe(false);
    expect(isAudioPayload(baseTemporalPayload)).toBe(false);
  });

  test("isTemporalPayload identifies temporal", () => {
    expect(isTemporalPayload(baseTemporalPayload)).toBe(true);
    expect(isTemporalPayload(baseImagePayload)).toBe(false);
    expect(isTemporalPayload(baseAudioPayload)).toBe(false);
  });

  test("isAudioEvidence guards on advisoryOnly field", () => {
    const audioEvidence: AudioClinicalEvidence = {
      domain: "respiratory_cough",
      findings: ["productive cough"],
      severity: "needs_review",
      confidence: 0.7,
      advisoryOnly: true,
      supportedSymptoms: ["coughing"],
      contradictions: [],
      limitations: [],
      audioQuality: "acceptable",
    };
    expect(isAudioEvidence(audioEvidence)).toBe(true);
  });

  test("isTemporalEvidence guards on frameCount field", () => {
    const temporalEvidence: TemporalClinicalEvidence = {
      domain: "gait_lameness",
      findings: ["favoring left hind leg"],
      severity: "needs_review",
      confidence: 0.65,
      frameCount: 3,
      progressionDirection: "worsening",
      limitations: [],
    };
    expect(isTemporalEvidence(temporalEvidence)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateMediaSize — image
// ---------------------------------------------------------------------------

describe("validateMediaSize — image", () => {
  test("returns null for a valid image", () => {
    expect(validateMediaSize(baseImagePayload)).toBeNull();
  });

  test("returns abstention for oversized image", () => {
    const oversized: ImagePayload = {
      ...baseImagePayload,
      meta: { ...baseImagePayload.meta, fileSizeBytes: 11 * 1024 * 1024 },
    };
    const result = validateMediaSize(oversized);
    expect(result).not.toBeNull();
    expect(result?.reason).toBe("file_too_large");
    expect(result?.abstained).toBe(true);
  });

  test("exactly 10 MB is allowed", () => {
    const tenMb: ImagePayload = {
      ...baseImagePayload,
      meta: { ...baseImagePayload.meta, fileSizeBytes: 10 * 1024 * 1024 },
    };
    expect(validateMediaSize(tenMb)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateMediaSize — audio
// ---------------------------------------------------------------------------

describe("validateMediaSize — audio", () => {
  test("returns null for a valid audio clip", () => {
    expect(validateMediaSize(baseAudioPayload)).toBeNull();
  });

  test("returns file_too_large for audio > 5 MB", () => {
    const big: AudioPayload = {
      ...baseAudioPayload,
      meta: { ...baseAudioPayload.meta, fileSizeBytes: 6 * 1024 * 1024 },
    };
    expect(validateMediaSize(big)?.reason).toBe("file_too_large");
  });

  test("returns duration_exceeded for audio > 30 s", () => {
    const long: AudioPayload = {
      ...baseAudioPayload,
      meta: { ...baseAudioPayload.meta, durationSeconds: 31 },
    };
    expect(validateMediaSize(long)?.reason).toBe("duration_exceeded");
  });

  test("exactly 30 s and 5 MB is allowed", () => {
    const edge: AudioPayload = {
      ...baseAudioPayload,
      meta: { ...baseAudioPayload.meta, fileSizeBytes: 5 * 1024 * 1024, durationSeconds: 30 },
    };
    expect(validateMediaSize(edge)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateMediaSize — temporal
// ---------------------------------------------------------------------------

describe("validateMediaSize — temporal", () => {
  test("returns null for a valid sequence", () => {
    expect(validateMediaSize(baseTemporalPayload)).toBeNull();
  });

  test("returns frame_count_invalid for < 2 frames", () => {
    const one: TemporalPayload = { ...baseTemporalPayload, frames: [baseImagePayload] };
    expect(validateMediaSize(one)?.reason).toBe("frame_count_invalid");
  });

  test("returns frame_count_invalid for > 8 frames", () => {
    const nine: TemporalPayload = {
      ...baseTemporalPayload,
      frames: Array(9).fill(baseImagePayload),
    };
    expect(validateMediaSize(nine)?.reason).toBe("frame_count_invalid");
  });

  test("returns duration_exceeded for span > 15 s", () => {
    const long: TemporalPayload = { ...baseTemporalPayload, spanSeconds: 16 };
    expect(validateMediaSize(long)?.reason).toBe("duration_exceeded");
  });

  test("total bytes > 50 MB yields file_too_large", () => {
    const bigFrame: ImagePayload = {
      ...baseImagePayload,
      meta: { ...baseImagePayload.meta, fileSizeBytes: 26 * 1024 * 1024 },
    };
    const heavy: TemporalPayload = { ...baseTemporalPayload, frames: [bigFrame, bigFrame] };
    expect(validateMediaSize(heavy)?.reason).toBe("file_too_large");
  });
});

// ---------------------------------------------------------------------------
// isSupportedAudioMimeType
// ---------------------------------------------------------------------------

describe("isSupportedAudioMimeType", () => {
  test("accepts known audio MIME types", () => {
    expect(isSupportedAudioMimeType("audio/mpeg")).toBe(true);
    expect(isSupportedAudioMimeType("audio/wav")).toBe(true);
    expect(isSupportedAudioMimeType("audio/mp4")).toBe(true);
    expect(isSupportedAudioMimeType("audio/ogg")).toBe(true);
    expect(isSupportedAudioMimeType("audio/webm")).toBe(true);
    expect(isSupportedAudioMimeType("audio/x-wav")).toBe(true);
  });

  test("rejects non-audio MIME types", () => {
    expect(isSupportedAudioMimeType("image/jpeg")).toBe(false);
    expect(isSupportedAudioMimeType("video/mp4")).toBe(false);
    expect(isSupportedAudioMimeType("application/pdf")).toBe(false);
    expect(isSupportedAudioMimeType("audio/aiff")).toBe(false);
  });
});
