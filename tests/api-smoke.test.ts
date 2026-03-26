/**
 * SMOKE TESTS — Build, imports, and API route structure
 * Verifies nothing is broken at the module level before hitting live APIs.
 */

// ─── Module Import Smoke Tests ──────────────────────────────────────────────

describe("Module imports (smoke test)", () => {
  it("should import triage-engine without errors", () => {
    const mod = require("@/lib/triage-engine");
    expect(mod.createSession).toBeDefined();
    expect(mod.addSymptoms).toBeDefined();
    expect(mod.recordAnswer).toBeDefined();
    expect(mod.getNextQuestion).toBeDefined();
    expect(mod.isReadyForDiagnosis).toBeDefined();
    expect(mod.calculateProbabilities).toBeDefined();
    expect(mod.buildDiagnosisContext).toBeDefined();
    expect(mod.getQuestionText).toBeDefined();
    expect(mod.getExtractionSchema).toBeDefined();
  });

  it("should import clinical-matrix without errors", () => {
    const mod = require("@/lib/clinical-matrix");
    expect(mod.SYMPTOM_MAP).toBeDefined();
    expect(mod.DISEASE_DB).toBeDefined();
    expect(mod.BREED_MODIFIERS).toBeDefined();
    expect(mod.FOLLOW_UP_QUESTIONS).toBeDefined();
  });

  it("should import nvidia-models without errors", () => {
    // This import won't fail even without API keys
    const mod = require("@/lib/nvidia-models");
    expect(mod.MODELS).toBeDefined();
    expect(mod.isNvidiaConfigured).toBeDefined();
  });
});

// ─── TypeScript Interface Compliance ────────────────────────────────────────

describe("TypeScript interface compliance", () => {
  it("TriageSession should match expected shape", () => {
    const { createSession } = require("@/lib/triage-engine");
    const session = createSession();

    // Verify all required keys exist
    expect(session).toHaveProperty("known_symptoms");
    expect(session).toHaveProperty("answered_questions");
    expect(session).toHaveProperty("extracted_answers");
    expect(session).toHaveProperty("red_flags_triggered");
    expect(session).toHaveProperty("candidate_diseases");
    expect(session).toHaveProperty("body_systems_involved");

    // Verify types
    expect(Array.isArray(session.known_symptoms)).toBe(true);
    expect(Array.isArray(session.answered_questions)).toBe(true);
    expect(typeof session.extracted_answers).toBe("object");
  });

  it("PetProfile should work with all required fields", () => {
    const { calculateProbabilities, createSession, addSymptoms } =
      require("@/lib/triage-engine");

    const pet = {
      name: "Test",
      breed: "Poodle",
      age_years: 3,
      weight: 50,
    };

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    // Should not throw
    expect(() => calculateProbabilities(session, pet)).not.toThrow();
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("should handle empty symptom array", () => {
    const { createSession, addSymptoms } = require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, []);
    expect(session.known_symptoms).toEqual([]);
  });

  it("should handle null-ish symptom values gracefully", () => {
    const { createSession, addSymptoms } = require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["", "null", "undefined"]);
    // Should not crash, might not add anything
    expect(session).toBeDefined();
  });

  it("should handle very long answer strings", () => {
    const { createSession, addSymptoms, recordAnswer } =
      require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const longAnswer = "a".repeat(10000);
    session = recordAnswer(session, "vomit_duration", longAnswer);
    expect(session.extracted_answers["vomit_duration"]).toBe(longAnswer);
  });

  it("should handle calculating probabilities with no candidate diseases", () => {
    const { createSession, calculateProbabilities } =
      require("@/lib/triage-engine");
    const session = createSession();
    const pet = { name: "Test", breed: "Poodle", age_years: 3, weight: 50 };
    const probs = calculateProbabilities(session, pet);
    expect(probs).toEqual([]);
  });

  it("should handle unknown breed without crashing", () => {
    const { createSession, addSymptoms, calculateProbabilities } =
      require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const pet = {
      name: "Test",
      breed: "Xoloitzcuintli", // Rare breed not in modifiers
      age_years: 3,
      weight: 50,
    };
    const probs = calculateProbabilities(session, pet);
    expect(probs.length).toBeGreaterThan(0);
  });

  it("should handle multiple symptoms across body systems", () => {
    const { createSession, addSymptoms, buildDiagnosisContext } =
      require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, [
      "vomiting",
      "limping",
      "coughing",
      "wound",
    ]);
    expect(session.known_symptoms.length).toBe(4);
    expect(session.body_systems_involved.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Regression Tests ───────────────────────────────────────────────────────

describe("Regression tests", () => {
  it("REGRESSION: wound photo should NOT get 'Low Concern' with 0 symptoms", () => {
    // Bug: system gave "Low Concern / Monitor at Home" for open wounds
    // because wound text mapped to nothing → 0 symptoms → instant ready
    const { createSession, isReadyForDiagnosis } =
      require("@/lib/triage-engine");
    const session = createSession();
    // Empty session should NEVER be ready for diagnosis
    expect(isReadyForDiagnosis(session)).toBe(false);
  });

  it("REGRESSION: wound keywords should map to wound_skin_issue", () => {
    // Bug: clinical matrix had NO wound/skin symptoms
    const { createSession, addSymptoms } = require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["wound"]);
    expect(session.known_symptoms).toContain("wound_skin_issue");
    expect(session.candidate_diseases.length).toBeGreaterThan(0);
  });

  it("REGRESSION: fewer than 3 answers should NOT be ready", () => {
    // Bug: diagnosis triggered too early
    const { createSession, addSymptoms, recordAnswer, isReadyForDiagnosis } =
      require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_duration", "2 days");
    expect(isReadyForDiagnosis(session)).toBe(false);
  });

  it("REGRESSION: questions should never loop (same Q asked twice)", () => {
    // Bug: negative answers caused questions to repeat forever
    const { createSession, addSymptoms, recordAnswer, getNextQuestion } =
      require("@/lib/triage-engine");
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = getNextQuestion(session);
      if (!q) break;
      expect(seen.has(q)).toBe(false);
      seen.add(q);
      session = recordAnswer(session, q, "no");
    }
  });
});
