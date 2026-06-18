/**
 * VET-1505 — Eye / ear / oral-gum pack tests.
 */

import {
  isEyeEarOralDomain,
  evaluateEyeEarOralAbstention,
  capEyeEarOralConfidence,
  isEmergencyGumColor,
  getDomainCaptureGuidance,
} from "@/lib/eye-ear-oral-pack";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";

function makePreprocess(
  overrides: Partial<VisionPreprocessResult> = {}
): VisionPreprocessResult {
  return {
    domain: "eye",
    bodyRegion: null,
    detectedRegions: [{ label: "eye", confidence: 0.75 }],
    bestCrop: null,
    imageQuality: "good",
    confidence: 0.75,
    limitations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isEyeEarOralDomain
// ---------------------------------------------------------------------------

describe("isEyeEarOralDomain", () => {
  test.each(["eye", "ear", "oral_gum"])("accepts %s", (d) =>
    expect(isEyeEarOralDomain(d as "eye" | "ear" | "oral_gum")).toBe(true)
  );
  test.each(["skin_wound", "mass_swelling", "stool_vomit", "unsupported"])(
    "rejects %s",
    (d) => expect(isEyeEarOralDomain(d as never)).toBe(false)
  );
  test("rejects null", () => expect(isEyeEarOralDomain(null)).toBe(false));
});

// ---------------------------------------------------------------------------
// evaluateEyeEarOralAbstention
// ---------------------------------------------------------------------------

describe("evaluateEyeEarOralAbstention — no abstention", () => {
  test("returns null for good-quality eye image", () => {
    expect(evaluateEyeEarOralAbstention(makePreprocess(), "eye")).toBeNull();
  });
  test("returns null for borderline ear image with detectable regions", () => {
    expect(
      evaluateEyeEarOralAbstention(
        makePreprocess({ imageQuality: "borderline", domain: "ear" }),
        "ear"
      )
    ).toBeNull();
  });
  test("returns null for excellent oral_gum image", () => {
    expect(
      evaluateEyeEarOralAbstention(
        makePreprocess({ imageQuality: "excellent", domain: "oral_gum" }),
        "oral_gum"
      )
    ).toBeNull();
  });
});

describe("evaluateEyeEarOralAbstention — should abstain", () => {
  test("abstains on domain_mismatch", () => {
    const result = evaluateEyeEarOralAbstention(makePreprocess(), "skin_wound");
    expect(result?.abstained).toBe(true);
    expect(result?.packReason).toBe("domain_mismatch");
  });

  test("abstains on poor quality — eye", () => {
    const result = evaluateEyeEarOralAbstention(
      makePreprocess({ imageQuality: "poor" }),
      "eye"
    );
    expect(result?.abstained).toBe(true);
    expect(result?.packReason).toBe("poor_image_quality");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains on poor quality — oral_gum", () => {
    const result = evaluateEyeEarOralAbstention(
      makePreprocess({ imageQuality: "poor", domain: "oral_gum" }),
      "oral_gum"
    );
    expect(result?.packReason).toBe("poor_image_quality");
    // Oral gum guidance should mention gum color
    expect(result?.suggestedAction.toLowerCase()).toContain("gum");
  });

  test("abstains when no regions detected", () => {
    const result = evaluateEyeEarOralAbstention(
      makePreprocess({ detectedRegions: [] }),
      "eye"
    );
    expect(result?.packReason).toBe("area_not_visible");
  });

  test("abstains when all regions confidence < 0.3", () => {
    const result = evaluateEyeEarOralAbstention(
      makePreprocess({
        detectedRegions: [
          { label: "eye", confidence: 0.1 },
          { label: "area", confidence: 0.2 },
        ],
      }),
      "eye"
    );
    expect(result?.packReason).toBe("too_blurry");
  });

  test("does NOT abstain when one region confidence >= 0.3", () => {
    const result = evaluateEyeEarOralAbstention(
      makePreprocess({
        detectedRegions: [
          { label: "eye", confidence: 0.1 },
          { label: "eye", confidence: 0.5 },
        ],
      }),
      "eye"
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// capEyeEarOralConfidence — stricter than dermatology
// ---------------------------------------------------------------------------

describe("capEyeEarOralConfidence", () => {
  test("caps to 0 for poor quality", () => {
    expect(capEyeEarOralConfidence(0.9, "poor")).toBe(0);
  });
  test("caps to 0.45 for borderline (stricter than dermatology 0.55)", () => {
    expect(capEyeEarOralConfidence(0.9, "borderline")).toBe(0.45);
  });
  test("caps to 0.78 for good", () => {
    expect(capEyeEarOralConfidence(0.9, "good")).toBe(0.78);
  });
  test("caps to 0.92 for excellent", () => {
    expect(capEyeEarOralConfidence(0.9, "excellent")).toBe(0.9);
  });
  test("does not go below 0", () => {
    expect(capEyeEarOralConfidence(-0.5, "good")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isEmergencyGumColor
// ---------------------------------------------------------------------------

describe("isEmergencyGumColor", () => {
  test.each(["pale", "white", "blue_purple", "brick_red", "muddy_brown"])(
    "flags %s as emergency",
    (color) => expect(isEmergencyGumColor(color as never)).toBe(true)
  );
  test("normal_pink is not emergency", () =>
    expect(isEmergencyGumColor("normal_pink")).toBe(false));
  test("yellow is not emergency (jaundice — vet_soon, not emergency)", () =>
    expect(isEmergencyGumColor("yellow")).toBe(false));
  test("spotted is not emergency", () =>
    expect(isEmergencyGumColor("spotted")).toBe(false));
});

// ---------------------------------------------------------------------------
// getDomainCaptureGuidance
// ---------------------------------------------------------------------------

describe("getDomainCaptureGuidance", () => {
  test("eye guidance mentions keeping camera level", () => {
    expect(getDomainCaptureGuidance("eye").toLowerCase()).toContain("flashlight");
  });
  test("ear guidance mentions ear canal", () => {
    expect(getDomainCaptureGuidance("ear").toLowerCase()).toContain("ear canal");
  });
  test("oral_gum guidance warns about emergency gum colors", () => {
    const guidance = getDomainCaptureGuidance("oral_gum").toLowerCase();
    expect(guidance).toContain("pale");
    expect(guidance).toContain("emergency vet");
  });
});
