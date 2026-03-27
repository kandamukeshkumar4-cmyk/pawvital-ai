/**
 * CLINICAL MATRIX - Data Integrity Tests
 * Ensures the hardcoded medical data is complete and consistent.
 * Catches missing diseases, orphaned questions, and broken references.
 */

import {
  SYMPTOM_MAP,
  DISEASE_DB,
  BREED_MODIFIERS,
  FOLLOW_UP_QUESTIONS,
} from "@/lib/clinical-matrix";

describe("SYMPTOM_MAP integrity", () => {
  const symptoms = Object.keys(SYMPTOM_MAP);

  it("should have at least 10 symptom entries", () => {
    expect(symptoms.length).toBeGreaterThanOrEqual(10);
  });

  it("should include wound_skin_issue symptom", () => {
    expect(SYMPTOM_MAP.wound_skin_issue).toBeDefined();
  });

  it("should include all core symptoms", () => {
    const required = [
      "vomiting",
      "not_eating",
      "diarrhea",
      "limping",
      "lethargy",
      "coughing",
      "wound_skin_issue",
    ];
    for (const symptom of required) {
      expect(SYMPTOM_MAP[symptom]).toBeDefined();
    }
  });

  it("every symptom should have at least 1 linked disease", () => {
    for (const entry of Object.values(SYMPTOM_MAP)) {
      expect(entry.linked_diseases.length).toBeGreaterThan(0);
    }
  });

  it("every symptom should have at least 1 follow-up question", () => {
    for (const entry of Object.values(SYMPTOM_MAP)) {
      expect(entry.follow_up_questions.length).toBeGreaterThan(0);
    }
  });

  it("every symptom should have at least 1 body system", () => {
    for (const entry of Object.values(SYMPTOM_MAP)) {
      expect(entry.body_systems.length).toBeGreaterThan(0);
    }
  });

  it("all linked diseases should exist in DISEASE_DB", () => {
    const missing: string[] = [];
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      for (const disease of entry.linked_diseases) {
        if (!DISEASE_DB[disease]) {
          missing.push(`${symptom} -> ${disease}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("all follow-up questions should exist in FOLLOW_UP_QUESTIONS", () => {
    const missing: string[] = [];
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      for (const qId of entry.follow_up_questions) {
        if (!FOLLOW_UP_QUESTIONS[qId]) {
          missing.push(`${symptom} -> ${qId}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("DISEASE_DB integrity", () => {
  const diseases = Object.keys(DISEASE_DB);

  it("should have at least 15 disease entries", () => {
    expect(diseases.length).toBeGreaterThanOrEqual(15);
  });

  it("should include wound-related diseases", () => {
    const woundDiseases = [
      "wound_infection",
      "abscess",
      "hot_spots",
      "laceration",
    ];
    for (const disease of woundDiseases) {
      expect(DISEASE_DB[disease]).toBeDefined();
    }
  });

  it("every disease should have required fields", () => {
    for (const [key, disease] of Object.entries(DISEASE_DB)) {
      expect(disease.name).toBeTruthy();
      expect(disease.medical_term).toBeTruthy();
      expect(disease.description).toBeTruthy();
      expect(disease.base_probability).toBeGreaterThan(0);
      expect(disease.base_probability).toBeLessThanOrEqual(1);
      expect(disease.age_modifier).toBeDefined();
      expect(disease.age_modifier.puppy).toBeGreaterThanOrEqual(0);
      expect(disease.age_modifier.adult).toBeGreaterThanOrEqual(0);
      expect(disease.age_modifier.senior).toBeGreaterThanOrEqual(0);
      expect(
        disease.age_modifier.puppy +
          disease.age_modifier.adult +
          disease.age_modifier.senior
      ).toBeGreaterThan(0);
      expect(["low", "moderate", "high", "emergency"]).toContain(
        disease.urgency
      );
      expect(disease.key_differentiators.length).toBeGreaterThan(0);
      expect(disease.typical_tests.length).toBeGreaterThan(0);
      expect(disease.typical_home_care.length).toBeGreaterThan(0);
    }
  });

  it("every disease should be referenced by at least one symptom", () => {
    const referencedDiseases = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      for (const disease of entry.linked_diseases) {
        referencedDiseases.add(disease);
      }
    }
    for (const diseaseKey of diseases) {
      expect(referencedDiseases.has(diseaseKey)).toBe(true);
    }
  });
});

describe("FOLLOW_UP_QUESTIONS integrity", () => {
  const questions = Object.keys(FOLLOW_UP_QUESTIONS);

  it("should have at least 20 questions", () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
  });

  it("should include wound-specific questions", () => {
    const woundQuestions = [
      "wound_location",
      "wound_size",
      "wound_duration",
      "wound_discharge",
      "wound_licking",
    ];
    for (const qId of woundQuestions) {
      expect(FOLLOW_UP_QUESTIONS[qId]).toBeDefined();
    }
  });

  it("every question should have required fields", () => {
    for (const [id, question] of Object.entries(FOLLOW_UP_QUESTIONS)) {
      expect(question.id).toBe(id);
      expect(question.question_text).toBeTruthy();
      expect(question.question_text.length).toBeGreaterThan(5);
      expect(["boolean", "string", "number", "choice"]).toContain(
        question.data_type
      );
      expect(question.extraction_hint).toBeTruthy();
      expect(typeof question.critical).toBe("boolean");
    }
  });

  it("choice-type questions should have choices array", () => {
    for (const question of Object.values(FOLLOW_UP_QUESTIONS)) {
      if (question.data_type === "choice") {
        expect(question.choices).toBeDefined();
        expect(question.choices!.length).toBeGreaterThan(1);
      }
    }
  });

  it("every question should be referenced by at least one symptom", () => {
    const referencedQuestions = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      for (const qId of entry.follow_up_questions) {
        referencedQuestions.add(qId);
      }
    }
    for (const qId of questions) {
      expect(referencedQuestions.has(qId)).toBe(true);
    }
  });
});

describe("BREED_MODIFIERS integrity", () => {
  it("should have breed entries", () => {
    expect(Object.keys(BREED_MODIFIERS).length).toBeGreaterThan(0);
  });

  it("Golden Retriever should have hot_spots modifier >= 2.0", () => {
    const goldenRetriever = BREED_MODIFIERS["Golden Retriever"];
    expect(goldenRetriever).toBeDefined();
    if (goldenRetriever) {
      expect(goldenRetriever.hot_spots).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("all modifier values should be positive numbers", () => {
    for (const modifiers of Object.values(BREED_MODIFIERS)) {
      for (const multiplier of Object.values(modifiers)) {
        expect(multiplier).toBeGreaterThan(0);
        expect(typeof multiplier).toBe("number");
      }
    }
  });

  it("all diseases in modifiers should exist in DISEASE_DB", () => {
    const missing: string[] = [];
    for (const [breed, modifiers] of Object.entries(BREED_MODIFIERS)) {
      for (const disease of Object.keys(modifiers)) {
        if (!DISEASE_DB[disease]) {
          missing.push(`${breed} -> ${disease}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("Cross-reference consistency", () => {
  it("no orphaned diseases (in DISEASE_DB but never linked from any symptom)", () => {
    const linked = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      entry.linked_diseases.forEach((disease) => linked.add(disease));
    }
    const orphaned = Object.keys(DISEASE_DB).filter(
      (diseaseKey) => !linked.has(diseaseKey)
    );
    expect(orphaned).toEqual([]);
  });

  it("no orphaned questions (in FOLLOW_UP_QUESTIONS but never referenced)", () => {
    const referenced = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      entry.follow_up_questions.forEach((qId) => referenced.add(qId));
    }
    const orphaned = Object.keys(FOLLOW_UP_QUESTIONS).filter(
      (questionKey) => !referenced.has(questionKey)
    );
    expect(orphaned).toEqual([]);
  });

  it("wound_skin_issue should link to wound-related diseases", () => {
    const wound = SYMPTOM_MAP.wound_skin_issue;
    expect(wound.linked_diseases).toContain("wound_infection");
    expect(wound.linked_diseases).toContain("hot_spots");
    expect(wound.linked_diseases).toContain("abscess");
  });

  it("wound_skin_issue should have wound-specific follow-up questions", () => {
    const wound = SYMPTOM_MAP.wound_skin_issue;
    expect(wound.follow_up_questions).toContain("wound_location");
    expect(wound.follow_up_questions).toContain("wound_size");
    expect(wound.follow_up_questions).toContain("wound_discharge");
  });
});
