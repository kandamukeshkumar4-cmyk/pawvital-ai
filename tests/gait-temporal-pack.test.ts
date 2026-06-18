/**
 * VET-1506 — Gait / lameness temporal pack tests.
 */

import {
  limbRole,
  evaluateGaitAbstention,
  inferGaitUrgency,
  capGaitConfidence,
} from "@/lib/gait-temporal-pack";

// ---------------------------------------------------------------------------
// limbRole
// ---------------------------------------------------------------------------

describe("limbRole", () => {
  test("front_left → front", () => expect(limbRole("front_left")).toBe("front"));
  test("front_right → front", () => expect(limbRole("front_right")).toBe("front"));
  test("hind_left → hind", () => expect(limbRole("hind_left")).toBe("hind"));
  test("hind_right → hind", () => expect(limbRole("hind_right")).toBe("hind"));
  test("multiple → unknown", () => expect(limbRole("multiple")).toBe("unknown"));
  test("unknown → unknown", () => expect(limbRole("unknown")).toBe("unknown"));
});

// ---------------------------------------------------------------------------
// evaluateGaitAbstention
// ---------------------------------------------------------------------------

const VALID_GAIT_OPTS = {
  frameCount: 3,
  usableFrameCount: 3,
  domain: "gait_lameness" as const,
};

describe("evaluateGaitAbstention — no abstention", () => {
  test("returns null for valid gait sequence", () => {
    expect(evaluateGaitAbstention(VALID_GAIT_OPTS)).toBeNull();
  });
  test("returns null for 2 frames (minimum)", () => {
    expect(
      evaluateGaitAbstention({ ...VALID_GAIT_OPTS, frameCount: 2, usableFrameCount: 2 })
    ).toBeNull();
  });
  test("returns null when span is exactly 15s", () => {
    expect(
      evaluateGaitAbstention({ ...VALID_GAIT_OPTS, spanSeconds: 15 })
    ).toBeNull();
  });
});

describe("evaluateGaitAbstention — should abstain", () => {
  test("abstains on domain_mismatch (null domain)", () => {
    const result = evaluateGaitAbstention({
      ...VALID_GAIT_OPTS,
      domain: null,
    });
    expect(result?.abstained).toBe(true);
    expect(result?.gaitReason).toBe("domain_mismatch");
  });

  test("abstains on domain_mismatch (wrong domain)", () => {
    const result = evaluateGaitAbstention({
      ...VALID_GAIT_OPTS,
      domain: "wound_progression" as const,
    });
    expect(result?.gaitReason).toBe("domain_mismatch");
  });

  test("abstains when span > 15s", () => {
    const result = evaluateGaitAbstention({
      ...VALID_GAIT_OPTS,
      spanSeconds: 16,
    });
    expect(result?.gaitReason).toBe("span_too_long");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains when usable frames < 2", () => {
    const result = evaluateGaitAbstention({
      ...VALID_GAIT_OPTS,
      usableFrameCount: 1,
    });
    expect(result?.gaitReason).toBe("insufficient_frames");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains when usable frames = 0", () => {
    const result = evaluateGaitAbstention({
      ...VALID_GAIT_OPTS,
      usableFrameCount: 0,
    });
    expect(result?.gaitReason).toBe("insufficient_frames");
  });
});

// ---------------------------------------------------------------------------
// inferGaitUrgency
// ---------------------------------------------------------------------------

describe("inferGaitUrgency", () => {
  const base = {
    hasNeuroSigns: false,
    worstWeightBearing: "full" as const,
    progressionDirection: "stable" as const,
    hasPainBehavior: false,
  };

  test("neuro signs → vet_today regardless of weight bearing", () => {
    expect(
      inferGaitUrgency({ ...base, hasNeuroSigns: true, worstWeightBearing: "full" })
    ).toBe("vet_today");
  });

  test("non_weight_bearing → vet_today", () => {
    expect(
      inferGaitUrgency({ ...base, worstWeightBearing: "non_weight_bearing" })
    ).toBe("vet_today");
  });

  test("non_weight_bearing + worsening → vet_today", () => {
    expect(
      inferGaitUrgency({
        ...base,
        worstWeightBearing: "non_weight_bearing",
        progressionDirection: "worsening",
      })
    ).toBe("vet_today");
  });

  test("partial + worsening → vet_today", () => {
    expect(
      inferGaitUrgency({ ...base, worstWeightBearing: "partial", progressionDirection: "worsening" })
    ).toBe("vet_today");
  });

  test("partial + stable → vet_soon", () => {
    expect(
      inferGaitUrgency({ ...base, worstWeightBearing: "partial" })
    ).toBe("vet_soon");
  });

  test("partial + pain → vet_soon", () => {
    expect(
      inferGaitUrgency({ ...base, worstWeightBearing: "partial", hasPainBehavior: true })
    ).toBe("vet_soon");
  });

  test("full + worsening → vet_soon", () => {
    expect(
      inferGaitUrgency({ ...base, progressionDirection: "worsening" })
    ).toBe("vet_soon");
  });

  test("full + stable + no pain → monitor", () => {
    expect(inferGaitUrgency(base)).toBe("monitor");
  });

  test("full + improving → monitor", () => {
    expect(
      inferGaitUrgency({ ...base, progressionDirection: "improving" })
    ).toBe("monitor");
  });
});

// ---------------------------------------------------------------------------
// capGaitConfidence
// ---------------------------------------------------------------------------

describe("capGaitConfidence", () => {
  test("2 frames → cap 0.55", () => {
    expect(capGaitConfidence(0.9, 2)).toBe(0.55);
  });
  test("3 frames → cap 0.70", () => {
    expect(capGaitConfidence(0.9, 3)).toBe(0.70);
  });
  test("4 frames → cap 0.80", () => {
    expect(capGaitConfidence(0.9, 4)).toBe(0.80);
  });
  test("8 frames → cap 0.90", () => {
    expect(capGaitConfidence(0.9, 8)).toBe(0.90);
  });
  test("does not go below 0", () => {
    expect(capGaitConfidence(-1, 4)).toBe(0);
  });
  test("base confidence preserved when below cap", () => {
    expect(capGaitConfidence(0.4, 4)).toBe(0.4);
  });
});
