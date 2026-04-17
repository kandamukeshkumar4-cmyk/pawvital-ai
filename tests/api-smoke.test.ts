/**
 * Smoke tests for core module imports and basic engine regressions.
 * These stay intentionally light so they catch broken wiring quickly.
 */

import * as clinicalMatrix from "@/lib/clinical-matrix";
import * as nvidiaModels from "@/lib/nvidia-models";
import * as triageEngine from "@/lib/triage-engine";

describe("Module imports (smoke test)", () => {
  it("should import triage-engine without errors", () => {
    expect(triageEngine.createSession).toBeDefined();
    expect(triageEngine.addSymptoms).toBeDefined();
    expect(triageEngine.recordAnswer).toBeDefined();
    expect(triageEngine.getNextQuestion).toBeDefined();
    expect(triageEngine.isReadyForDiagnosis).toBeDefined();
    expect(triageEngine.calculateProbabilities).toBeDefined();
    expect(triageEngine.buildDiagnosisContext).toBeDefined();
    expect(triageEngine.getQuestionText).toBeDefined();
    expect(triageEngine.getExtractionSchema).toBeDefined();
  });

  it("should import clinical-matrix without errors", () => {
    expect(clinicalMatrix.SYMPTOM_MAP).toBeDefined();
    expect(clinicalMatrix.DISEASE_DB).toBeDefined();
    expect(clinicalMatrix.BREED_MODIFIERS).toBeDefined();
    expect(clinicalMatrix.FOLLOW_UP_QUESTIONS).toBeDefined();
  });

  it("should import nvidia-models without errors", () => {
    expect(nvidiaModels.MODELS).toBeDefined();
    expect(nvidiaModels.isNvidiaConfigured).toBeDefined();
  });
});

describe("TypeScript interface compliance", () => {
  it("TriageSession should match expected shape", () => {
    const session = triageEngine.createSession();

    expect(session).toHaveProperty("known_symptoms");
    expect(session).toHaveProperty("answered_questions");
    expect(session).toHaveProperty("extracted_answers");
    expect(session).toHaveProperty("red_flags_triggered");
    expect(session).toHaveProperty("candidate_diseases");
    expect(session).toHaveProperty("body_systems_involved");

    expect(Array.isArray(session.known_symptoms)).toBe(true);
    expect(Array.isArray(session.answered_questions)).toBe(true);
    expect(typeof session.extracted_answers).toBe("object");
  });

  it("PetProfile should work with all required fields", () => {
    const pet = {
      name: "Test",
      breed: "Poodle",
      age_years: 3,
      weight: 50,
    };

    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["vomiting"]);

    expect(() => triageEngine.calculateProbabilities(session, pet)).not.toThrow();
  });
});

describe("Edge cases", () => {
  it("should handle empty symptom array", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, []);
    expect(session.known_symptoms).toEqual([]);
  });

  it("should handle null-ish symptom values gracefully", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["", "null", "undefined"]);
    expect(session).toBeDefined();
  });

  it("should handle very long answer strings", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["vomiting"]);
    const longAnswer = "a".repeat(10000);
    session = triageEngine.recordAnswer(session, "vomit_duration", longAnswer);
    expect(session.extracted_answers["vomit_duration"]).toBe(longAnswer);
  });

  it("should handle calculating probabilities with no candidate diseases", () => {
    const session = triageEngine.createSession();
    const pet = { name: "Test", breed: "Poodle", age_years: 3, weight: 50 };
    const probs = triageEngine.calculateProbabilities(session, pet);
    expect(probs).toEqual([]);
  });

  it("should handle unknown breed without crashing", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["vomiting"]);
    const pet = {
      name: "Test",
      breed: "Xoloitzcuintli",
      age_years: 3,
      weight: 50,
    };
    const probs = triageEngine.calculateProbabilities(session, pet);
    expect(probs.length).toBeGreaterThan(0);
  });

  it("should handle multiple symptoms across body systems", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, [
      "vomiting",
      "limping",
      "coughing",
      "wound",
    ]);
    expect(session.known_symptoms.length).toBe(4);
    expect(session.body_systems_involved.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Regression tests", () => {
  it("REGRESSION: wound photo should NOT get low concern with 0 symptoms", () => {
    const session = triageEngine.createSession();
    expect(triageEngine.isReadyForDiagnosis(session)).toBe(false);
  });

  it("REGRESSION: wound keywords should map to wound_skin_issue", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["wound"]);
    expect(session.known_symptoms).toContain("wound_skin_issue");
    expect(session.candidate_diseases.length).toBeGreaterThan(0);
  });

  it("REGRESSION: trauma keywords should map to trauma", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["hit by car"]);
    expect(session.known_symptoms).toContain("trauma");
    expect(session.candidate_diseases.length).toBeGreaterThan(0);
  });

  it("REGRESSION: vaccine reaction keywords should map to post_vaccination_reaction", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["after shots"]);
    expect(session.known_symptoms).toContain("post_vaccination_reaction");
    expect(session.candidate_diseases.length).toBeGreaterThan(0);
  });

  it("REGRESSION: fewer than 3 answers should NOT be ready", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["vomiting"]);
    session = triageEngine.recordAnswer(session, "vomit_duration", "2 days");
    expect(triageEngine.isReadyForDiagnosis(session)).toBe(false);
  });

  it("REGRESSION: questions should never loop", () => {
    let session = triageEngine.createSession();
    session = triageEngine.addSymptoms(session, ["wound_skin_issue"]);

    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const questionId = triageEngine.getNextQuestion(session);
      if (!questionId) break;
      expect(seen.has(questionId)).toBe(false);
      seen.add(questionId);
      session = triageEngine.recordAnswer(session, questionId, "no");
    }
  });
});
