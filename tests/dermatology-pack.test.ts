/**
 * VET-1504 — Dermatology pack tests.
 * Covers: domain guard, abstention rules, confidence caps, urgency inference,
 * body-region guidance. No network calls.
 */

import {
  isDermatologyDomain,
  evaluateDermatologyAbstention,
  capDermatologyConfidence,
  inferDermatologyUrgency,
  getBodyRegionPhotoGuidance,
} from "@/lib/dermatology-pack";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePreprocess(
  overrides: Partial<VisionPreprocessResult> = {}
): VisionPreprocessResult {
  return {
    domain: "skin_wound",
    bodyRegion: "back",
    detectedRegions: [{ label: "wound", confidence: 0.8 }],
    bestCrop: null,
    imageQuality: "good",
    confidence: 0.8,
    limitations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isDermatologyDomain
// ---------------------------------------------------------------------------

describe("isDermatologyDomain", () => {
  test("accepts skin_wound", () => expect(isDermatologyDomain("skin_wound")).toBe(true));
  test("accepts mass_swelling", () => expect(isDermatologyDomain("mass_swelling")).toBe(true));
  test("rejects eye", () => expect(isDermatologyDomain("eye")).toBe(false));
  test("rejects ear", () => expect(isDermatologyDomain("ear")).toBe(false));
  test("rejects stool_vomit", () => expect(isDermatologyDomain("stool_vomit")).toBe(false));
  test("rejects unsupported", () => expect(isDermatologyDomain("unsupported")).toBe(false));
  test("rejects null", () => expect(isDermatologyDomain(null)).toBe(false));
  test("rejects undefined", () => expect(isDermatologyDomain(undefined)).toBe(false));
});

// ---------------------------------------------------------------------------
// evaluateDermatologyAbstention
// ---------------------------------------------------------------------------

describe("evaluateDermatologyAbstention — should not abstain", () => {
  test("returns null for good-quality skin_wound image", () => {
    const result = evaluateDermatologyAbstention(makePreprocess(), "skin_wound");
    expect(result).toBeNull();
  });

  test("returns null for borderline quality with detectable regions", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({ imageQuality: "borderline" }),
      "mass_swelling"
    );
    expect(result).toBeNull();
  });

  test("returns null for excellent quality", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({ imageQuality: "excellent", domain: "mass_swelling" }),
      "mass_swelling"
    );
    expect(result).toBeNull();
  });
});

describe("evaluateDermatologyAbstention — should abstain", () => {
  test("abstains on domain_mismatch (non-dermatology domain)", () => {
    const result = evaluateDermatologyAbstention(makePreprocess(), "eye");
    expect(result?.abstained).toBe(true);
    expect(result?.dermatologyReason).toBe("domain_mismatch");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains on poor image quality", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({ imageQuality: "poor" }),
      "skin_wound"
    );
    expect(result?.abstained).toBe(true);
    expect(result?.dermatologyReason).toBe("poor_image_quality");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains when no regions detected", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({ detectedRegions: [] }),
      "skin_wound"
    );
    expect(result?.abstained).toBe(true);
    expect(result?.dermatologyReason).toBe("area_not_visible");
  });

  test("abstains when all regions have low confidence (< 0.35)", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({
        detectedRegions: [
          { label: "wound", confidence: 0.2 },
          { label: "skin", confidence: 0.1 },
        ],
      }),
      "skin_wound"
    );
    expect(result?.abstained).toBe(true);
    expect(result?.dermatologyReason).toBe("area_not_visible");
  });

  test("does NOT abstain when at least one region has confidence >= 0.35", () => {
    const result = evaluateDermatologyAbstention(
      makePreprocess({
        detectedRegions: [
          { label: "wound", confidence: 0.1 },
          { label: "skin", confidence: 0.6 },
        ],
      }),
      "skin_wound"
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// capDermatologyConfidence
// ---------------------------------------------------------------------------

describe("capDermatologyConfidence", () => {
  test("caps to 0 for poor quality", () => {
    expect(capDermatologyConfidence(0.9, "poor")).toBe(0);
  });

  test("caps to 0.55 for borderline quality", () => {
    expect(capDermatologyConfidence(0.9, "borderline")).toBe(0.55);
  });

  test("caps to 0.82 for good quality", () => {
    expect(capDermatologyConfidence(0.9, "good")).toBe(0.82);
  });

  test("caps to 0.95 for excellent quality", () => {
    expect(capDermatologyConfidence(0.9, "excellent")).toBe(0.9);
  });

  test("does not go below 0", () => {
    expect(capDermatologyConfidence(-1, "good")).toBe(0);
  });

  test("uses 0.55 cap for unknown quality level", () => {
    expect(capDermatologyConfidence(0.9, "unknown_level")).toBe(0.55);
  });
});

// ---------------------------------------------------------------------------
// inferDermatologyUrgency
// ---------------------------------------------------------------------------

describe("inferDermatologyUrgency", () => {
  test("returns vet_soon for minor wound findings", () => {
    expect(inferDermatologyUrgency(["small laceration", "mild redness"])).toBe("vet_soon");
  });

  test("returns vet_today when finding mentions pus", () => {
    expect(inferDermatologyUrgency(["the wound has pus draining"])).toBe("vet_today");
  });

  test("returns vet_today when finding mentions infected", () => {
    expect(inferDermatologyUrgency(["appears infected", "swollen"])).toBe("vet_today");
  });

  test("returns vet_today for abscess", () => {
    expect(inferDermatologyUrgency(["abscess on the flank"])).toBe("vet_today");
  });

  test("returns emergency for profuse bleeding", () => {
    expect(inferDermatologyUrgency(["profuse bleeding from deep wound"])).toBe("emergency");
  });

  test("returns emergency for exposed bone", () => {
    expect(inferDermatologyUrgency(["exposed bone visible"])).toBe("emergency");
  });

  test("returns emergency for degloving", () => {
    expect(inferDermatologyUrgency(["degloving injury on hind leg"])).toBe("emergency");
  });

  test("emergency takes priority over vet_today keywords", () => {
    expect(inferDermatologyUrgency(["profuse bleeding", "infected wound"])).toBe("emergency");
  });

  test("returns vet_soon for empty findings", () => {
    expect(inferDermatologyUrgency([])).toBe("vet_soon");
  });
});

// ---------------------------------------------------------------------------
// getBodyRegionPhotoGuidance
// ---------------------------------------------------------------------------

describe("getBodyRegionPhotoGuidance", () => {
  test("returns default for null", () => {
    const guidance = getBodyRegionPhotoGuidance(null);
    expect(guidance).toContain("affected area");
  });

  test("matches paw region", () => {
    const guidance = getBodyRegionPhotoGuidance("front left paw");
    expect(guidance.toLowerCase()).toContain("paw");
  });

  test("matches ear region", () => {
    const guidance = getBodyRegionPhotoGuidance("right ear");
    expect(guidance.toLowerCase()).toContain("ear");
  });

  test("matches abdomen region", () => {
    const guidance = getBodyRegionPhotoGuidance("lower abdomen");
    expect(guidance.toLowerCase()).toContain("belly");
  });

  test("matches leg region", () => {
    const guidance = getBodyRegionPhotoGuidance("hind leg");
    expect(guidance.toLowerCase()).toContain("leg");
  });

  test("falls back to default for unknown region", () => {
    const guidance = getBodyRegionPhotoGuidance("some unknown body area");
    expect(guidance).toContain("affected area");
  });
});
