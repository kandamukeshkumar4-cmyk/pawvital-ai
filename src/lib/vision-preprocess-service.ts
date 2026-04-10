// =============================================================================
// VISION PREPROCESS SERVICE WRAPPER
// Health check + stub mode detection for Grounding DINO -> SAM2 -> Florence-2
// pipeline. Re-exports core functions from hf-sidecars.
// =============================================================================

import {
  isVisionPreprocessConfigured as _isConfigured,
  preprocessVeterinaryImage as _preprocess,
  isAbortLikeError,
} from "./hf-sidecars";
import type { VisionPreprocessResult } from "./clinical-evidence";

export { _isConfigured as isVisionPreprocessConfigured };
export { _preprocess as preprocessVeterinaryImage };
export { isAbortLikeError };

const STUB_MODE = process.env.STUB_MODE === "true";

/**
 * Check vision preprocess service health via /healthz endpoint.
 */
export async function checkVisionPreprocessHealth(): Promise<{
  ok: boolean;
  mode: "stub" | "live" | "unavailable";
  details?: Record<string, unknown>;
}> {
  if (STUB_MODE) {
    return { ok: true, mode: "stub", details: { stub_mode: true } };
  }

  if (!_isConfigured()) {
    return { ok: false, mode: "unavailable" };
  }

  const url = process.env.HF_VISION_PREPROCESS_URL;
  if (!url) {
    return { ok: false, mode: "unavailable" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${url}/healthz`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, mode: "live", details: { status: response.status } };
    }

    const data = await response.json();
    return { ok: true, mode: data.mode || "live", details: data };
  } catch {
    return { ok: false, mode: "live", details: { error: "health check failed" } };
  }
}

/**
 * Build a stub preprocess result when STUB_MODE=true or sidecar is unavailable.
 */
export function buildStubPreprocessResult(
  domain: VisionPreprocessResult["domain"] = "skin_wound"
): VisionPreprocessResult {
  return {
    domain,
    bodyRegion: domain === "skin_wound" ? "skin/limb region" : null,
    detectedRegions: [],
    bestCrop: null,
    imageQuality: "borderline",
    confidence: 0.2,
    limitations: ["stub mode — Grounding DINO/SAM2/Florence-2 not loaded"],
  };
}
