/**
 * VET-1507 — Respiratory audio pack tests.
 */

import {
  evaluateRespiratoryAudioAbstention,
  inferRespiratoryUrgency,
  capRespiratoryConfidence,
  isAlwaysEmergencyRespiratory,
} from "@/lib/respiratory-audio-pack";

const VALID_OPTS = {
  durationSeconds: 15,
  backgroundNoiseLevel: "low" as const,
  audioQuality: "good" as const,
  domain: "respiratory_cough" as const,
};

// ---------------------------------------------------------------------------
// evaluateRespiratoryAudioAbstention
// ---------------------------------------------------------------------------

describe("evaluateRespiratoryAudioAbstention — no abstention", () => {
  test("returns null for valid clip", () => {
    expect(evaluateRespiratoryAudioAbstention(VALID_OPTS)).toBeNull();
  });
  test("returns null for acceptable quality", () => {
    expect(
      evaluateRespiratoryAudioAbstention({ ...VALID_OPTS, audioQuality: "acceptable" })
    ).toBeNull();
  });
  test("returns null for all 4 respiratory domains", () => {
    const domains = [
      "respiratory_cough",
      "respiratory_wheeze",
      "respiratory_stridor",
      "respiratory_labored",
    ] as const;
    for (const domain of domains) {
      expect(evaluateRespiratoryAudioAbstention({ ...VALID_OPTS, domain })).toBeNull();
    }
  });
});

describe("evaluateRespiratoryAudioAbstention — should abstain", () => {
  test("abstains on domain_mismatch (unsupported domain)", () => {
    const result = evaluateRespiratoryAudioAbstention({
      ...VALID_OPTS,
      domain: "unsupported" as never,
    });
    expect(result?.abstained).toBe(true);
    expect(result?.audioReason).toBe("domain_mismatch");
  });

  test("abstains when clip < 5 seconds", () => {
    const result = evaluateRespiratoryAudioAbstention({
      ...VALID_OPTS,
      durationSeconds: 4,
    });
    expect(result?.audioReason).toBe("clip_too_short");
    expect(result?.canRetry).toBe(true);
    expect(result?.suggestedAction).toContain("5 seconds");
  });

  test("abstains on high background noise", () => {
    const result = evaluateRespiratoryAudioAbstention({
      ...VALID_OPTS,
      backgroundNoiseLevel: "high",
    });
    expect(result?.audioReason).toBe("high_background_noise");
    expect(result?.canRetry).toBe(true);
  });

  test("abstains on poor audio quality", () => {
    const result = evaluateRespiratoryAudioAbstention({
      ...VALID_OPTS,
      audioQuality: "poor",
    });
    expect(result?.audioReason).toBe("inaudible");
    expect(result?.canRetry).toBe(true);
  });

  test("exactly 5 seconds is allowed", () => {
    expect(
      evaluateRespiratoryAudioAbstention({ ...VALID_OPTS, durationSeconds: 5 })
    ).toBeNull();
  });

  test("domain check runs before duration check (domain_mismatch takes priority)", () => {
    const result = evaluateRespiratoryAudioAbstention({
      ...VALID_OPTS,
      domain: "unsupported" as never,
      durationSeconds: 1,
    });
    expect(result?.audioReason).toBe("domain_mismatch");
  });
});

// ---------------------------------------------------------------------------
// inferRespiratoryUrgency
// ---------------------------------------------------------------------------

describe("inferRespiratoryUrgency", () => {
  test("stridor → urgent", () =>
    expect(inferRespiratoryUrgency("stridor", "mild")).toBe("urgent"));
  test("labored_breathing → urgent", () =>
    expect(inferRespiratoryUrgency("labored_breathing", "mild")).toBe("urgent"));
  test("rapid_shallow → urgent", () =>
    expect(inferRespiratoryUrgency("rapid_shallow", "minimal")).toBe("urgent"));
  test("biphasic_wheeze → urgent", () =>
    expect(inferRespiratoryUrgency("biphasic_wheeze", "mild")).toBe("urgent"));

  test("severe effort → urgent regardless of pattern", () =>
    expect(inferRespiratoryUrgency("dry_cough", "severe")).toBe("urgent"));
  test("moderate effort → urgent", () =>
    expect(inferRespiratoryUrgency("dry_cough", "moderate")).toBe("urgent"));

  test("productive_cough + mild effort → needs_review", () =>
    expect(inferRespiratoryUrgency("productive_cough", "mild")).toBe("needs_review"));
  test("dry_cough + minimal effort → needs_review", () =>
    expect(inferRespiratoryUrgency("dry_cough", "minimal")).toBe("needs_review"));
  test("honking_cough → needs_review", () =>
    expect(inferRespiratoryUrgency("honking_cough", "minimal")).toBe("needs_review"));
  test("inspiratory_wheeze → needs_review", () =>
    expect(inferRespiratoryUrgency("inspiratory_wheeze", "minimal")).toBe("needs_review"));

  test("normal + minimal effort → normal", () =>
    expect(inferRespiratoryUrgency("normal", "minimal")).toBe("normal"));
  test("uncertain + minimal → normal", () =>
    expect(inferRespiratoryUrgency("uncertain", "minimal")).toBe("normal"));
});

// ---------------------------------------------------------------------------
// capRespiratoryConfidence
// ---------------------------------------------------------------------------

describe("capRespiratoryConfidence", () => {
  test("poor → cap 0", () => expect(capRespiratoryConfidence(0.9, "poor")).toBe(0));
  test("acceptable → cap 0.55", () =>
    expect(capRespiratoryConfidence(0.9, "acceptable")).toBe(0.55));
  test("good → cap 0.78", () =>
    expect(capRespiratoryConfidence(0.9, "good")).toBe(0.78));
  test("base below cap is preserved", () =>
    expect(capRespiratoryConfidence(0.4, "good")).toBe(0.4));
  test("does not go below 0", () =>
    expect(capRespiratoryConfidence(-0.5, "good")).toBe(0));
});

// ---------------------------------------------------------------------------
// isAlwaysEmergencyRespiratory
// ---------------------------------------------------------------------------

describe("isAlwaysEmergencyRespiratory", () => {
  test.each([
    "difficulty_breathing",
    "not_breathing",
    "coughing_blood",
    "blue_gums",
    "pale_gums",
    "collapse",
  ])("flags %s as always-emergency", (symptom) =>
    expect(isAlwaysEmergencyRespiratory([symptom])).toBe(true)
  );
  test("returns false for non-emergency symptom", () =>
    expect(isAlwaysEmergencyRespiratory(["coughing"])).toBe(false));
  test("returns true if any symptom in list is emergency", () =>
    expect(
      isAlwaysEmergencyRespiratory(["coughing", "collapse"])
    ).toBe(true));
  test("returns false for empty list", () =>
    expect(isAlwaysEmergencyRespiratory([])).toBe(false));
});
