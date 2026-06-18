/**
 * VET-1508 — GI visual pack tests.
 */

import {
  isGiVisualDomain,
  isGdvRiskPresentation,
  inferStoolVomitSeverity,
  evaluateGiAbstention,
  capGiConfidence,
} from "@/lib/gi-visual-pack";
import type { VisionPreprocessResult } from "@/lib/clinical-evidence";

function makePreprocess(
  overrides: Partial<VisionPreprocessResult> = {}
): VisionPreprocessResult {
  return {
    domain: "stool_vomit",
    bodyRegion: null,
    detectedRegions: [{ label: "stool", confidence: 0.7 }],
    bestCrop: null,
    imageQuality: "good",
    confidence: 0.7,
    limitations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isGiVisualDomain
// ---------------------------------------------------------------------------

describe("isGiVisualDomain", () => {
  test("accepts stool_vomit", () => expect(isGiVisualDomain("stool_vomit")).toBe(true));
  test("accepts abdominal_distension", () =>
    expect(isGiVisualDomain("abdominal_distension")).toBe(true));
  test.each(["skin_wound", "eye", "ear", "oral_gum", "mass_swelling", "unsupported"])(
    "rejects %s",
    (d) => expect(isGiVisualDomain(d as never)).toBe(false)
  );
  test("rejects null", () => expect(isGiVisualDomain(null)).toBe(false));
});

// ---------------------------------------------------------------------------
// isGdvRiskPresentation
// ---------------------------------------------------------------------------

describe("isGdvRiskPresentation", () => {
  test.each(["swollen_abdomen", "retching", "bloat", "distended_abdomen_with_retching"])(
    "detects GDV risk for %s",
    (s) => expect(isGdvRiskPresentation([s])).toBe(true)
  );
  test("returns false for non-GDV symptoms", () =>
    expect(isGdvRiskPresentation(["vomiting", "diarrhea"])).toBe(false));
  test("returns true if any symptom is GDV-risk", () =>
    expect(isGdvRiskPresentation(["vomiting", "retching"])).toBe(true));
});

// ---------------------------------------------------------------------------
// inferStoolVomitSeverity
// ---------------------------------------------------------------------------

describe("inferStoolVomitSeverity", () => {
  test("blood present → urgent", () =>
    expect(inferStoolVomitSeverity(null, null, true, null)).toBe("urgent"));
  test("foreign material → urgent", () =>
    expect(inferStoolVomitSeverity(null, null, false, true)).toBe("urgent"));
  test("bright_red_blood vomit → urgent", () =>
    expect(inferStoolVomitSeverity("bright_red_blood", null, null, null)).toBe("urgent"));
  test("dark_coffee_ground vomit → urgent", () =>
    expect(inferStoolVomitSeverity("dark_coffee_ground", null, null, null)).toBe("urgent"));
  test("blood_tinged vomit → urgent", () =>
    expect(inferStoolVomitSeverity("blood_tinged", null, null, null)).toBe("urgent"));
  test("dark_black_tarry stool → urgent", () =>
    expect(inferStoolVomitSeverity(null, "dark_black_tarry", null, null)).toBe("urgent"));
  test("bright_red_blood stool → urgent", () =>
    expect(inferStoolVomitSeverity(null, "bright_red_blood", null, null)).toBe("urgent"));
  test("grey_pale stool → needs_review", () =>
    expect(inferStoolVomitSeverity(null, "grey_pale", null, null)).toBe("needs_review"));
  test("yellow_bile vomit, normal stool → needs_review", () =>
    expect(inferStoolVomitSeverity("yellow_bile", "normal_brown", null, null)).toBe("needs_review"));
  test("all null → needs_review", () =>
    expect(inferStoolVomitSeverity(null, null, null, null)).toBe("needs_review"));
});

// ---------------------------------------------------------------------------
// evaluateGiAbstention
// ---------------------------------------------------------------------------

describe("evaluateGiAbstention — no abstention", () => {
  test("returns null for good stool_vomit image", () =>
    expect(evaluateGiAbstention(makePreprocess(), "stool_vomit")).toBeNull());
  test("returns null for abdominal_distension image", () =>
    expect(
      evaluateGiAbstention(
        makePreprocess({ domain: "abdominal_distension" }),
        "abdominal_distension"
      )
    ).toBeNull());
});

describe("evaluateGiAbstention — should abstain", () => {
  test("domain_mismatch on eye", () => {
    const result = evaluateGiAbstention(makePreprocess(), "eye");
    expect(result?.giReason).toBe("domain_mismatch");
  });
  test("poor quality → abstain", () => {
    const result = evaluateGiAbstention(makePreprocess({ imageQuality: "poor" }), "stool_vomit");
    expect(result?.giReason).toBe("poor_image_quality");
  });
  test("no regions → abstain", () => {
    const result = evaluateGiAbstention(
      makePreprocess({ detectedRegions: [] }),
      "stool_vomit"
    );
    expect(result?.giReason).toBe("area_not_visible");
  });
  test("all low confidence → abstain", () => {
    const result = evaluateGiAbstention(
      makePreprocess({ detectedRegions: [{ label: "stool", confidence: 0.2 }] }),
      "stool_vomit"
    );
    expect(result?.giReason).toBe("contaminated_unidentifiable");
  });
});

// ---------------------------------------------------------------------------
// capGiConfidence
// ---------------------------------------------------------------------------

describe("capGiConfidence", () => {
  test("poor → 0", () => expect(capGiConfidence(0.9, "poor")).toBe(0));
  test("borderline → 0.50", () => expect(capGiConfidence(0.9, "borderline")).toBe(0.50));
  test("good → 0.75", () => expect(capGiConfidence(0.9, "good")).toBe(0.75));
  test("excellent → 0.88", () => expect(capGiConfidence(0.9, "excellent")).toBe(0.88));
  test("base below cap preserved", () => expect(capGiConfidence(0.4, "good")).toBe(0.4));
});
