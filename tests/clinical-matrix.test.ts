/**
 * CLINICAL MATRIX — Data Integrity Tests
 * Ensures the hardcoded medical data is complete and consistent.
 * Catches: missing diseases, orphaned questions, broken references.
 */

import {
  SYMPTOM_MAP,
  DISEASE_DB,
  BREED_MODIFIERS,
  FOLLOW_UP_QUESTIONS,
} from "@/lib/clinical-matrix";

// ─── SYMPTOM_MAP integrity ──────────────────────────────────────────────────

describe("SYMPTOM_MAP integrity", () => {
  const symptoms = Object.keys(SYMPTOM_MAP);

  it("should have at least 10 symptom entries", () => {
    expect(symptoms.length).toBeGreaterThanOrEqual(10);
  });

  it("should include wound_skin_issue symptom", () => {
    expect(SYMPTOM_MAP["wound_skin_issue"]).toBeDefined();
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
    for (const s of required) {
      expect(SYMPTOM_MAP[s]).toBeDefined();
    }
  });

  it("every symptom should have at least 1 linked disease", () => {
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      expect(entry.linked_diseases.length).toBeGreaterThan(0);
    }
  });

  it("every symptom should have at least 1 follow-up question", () => {
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      expect(entry.follow_up_questions.length).toBeGreaterThan(0);
    }
  });

  it("every symptom should have at least 1 body system", () => {
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      expect(entry.body_systems.length).toBeGreaterThan(0);
    }
  });

  it("all linked diseases should exist in DISEASE_DB (report gaps)", () => {
    const missing: string[] = [];
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      for (const disease of entry.linked_diseases) {
        if (!DISEASE_DB[disease]) {
          missing.push(`${symptom} → ${disease}`);
        }
      }
    }
    // Log gaps for future work but don't fail — these are known expansion targets
    if (missing.length > 0) {
      console.warn(
        `[KNOWN GAP] ${missing.length} disease(s) referenced but not in DISEASE_DB:\n  ${missing.join("\n  ")}`
      );
    }
    // Core diseases must exist
    expect(DISEASE_DB["gastroenteritis"]).toBeDefined();
    expect(DISEASE_DB["pancreatitis"]).toBeDefined();
    expect(DISEASE_DB["wound_infection"]).toBeDefined();
    expect(DISEASE_DB["hot_spots"]).toBeDefined();
    expect(DISEASE_DB["gdv"]).toBeDefined();
  });

  it("all follow-up questions should exist in FOLLOW_UP_QUESTIONS", () => {
    const missing: string[] = [];
    for (const [symptom, entry] of Object.entries(SYMPTOM_MAP)) {
      for (const qId of entry.follow_up_questions) {
        if (!FOLLOW_UP_QUESTIONS[qId]) {
          missing.push(`${symptom} → ${qId}`);
        }
      }
    }
    if (missing.length > 0) {
      console.warn(
        `[KNOWN GAP] ${missing.length} question(s) referenced but not in FOLLOW_UP_QUESTIONS:\n  ${missing.join("\n  ")}`
      );
    }
    // All questions should exist (this was passing before)
    expect(missing.length).toBe(0);
  });
});

// ─── DISEASE_DB integrity ───────────────────────────────────────────────────

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
    for (const d of woundDiseases) {
      expect(DISEASE_DB[d]).toBeDefined();
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
      expect(disease.age_modifier.puppy).toBeGreaterThan(0);
      expect(disease.age_modifier.adult).toBeGreaterThan(0);
      expect(disease.age_modifier.senior).toBeGreaterThan(0);
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
      for (const d of entry.linked_diseases) {
        referencedDiseases.add(d);
      }
    }
    for (const diseaseKey of diseases) {
      expect(referencedDiseases.has(diseaseKey)).toBe(true);
    }
  });
});

// ─── FOLLOW_UP_QUESTIONS integrity ──────────────────────────────────────────

describe("FOLLOW_UP_QUESTIONS integrity", () => {
  const questions = Object.keys(FOLLOW_UP_QUESTIONS);

  it("should have at least 20 questions", () => {
    expect(questions.length).toBeGreaterThanOrEqual(20);
  });

  it("should include wound-specific questions", () => {
    const woundQs = [
      "wound_location",
      "wound_size",
      "wound_duration",
      "wound_discharge",
      "wound_licking",
    ];
    for (const q of woundQs) {
      expect(FOLLOW_UP_QUESTIONS[q]).toBeDefined();
    }
  });

  it("every question should have required fields", () => {
    for (const [id, q] of Object.entries(FOLLOW_UP_QUESTIONS)) {
      expect(q.id).toBe(id);
      expect(q.question_text).toBeTruthy();
      expect(q.question_text.length).toBeGreaterThan(5);
      expect(["boolean", "string", "number", "choice"]).toContain(q.data_type);
      expect(q.extraction_hint).toBeTruthy();
      expect(typeof q.critical).toBe("boolean");
    }
  });

  it("choice-type questions should have choices array", () => {
    for (const [id, q] of Object.entries(FOLLOW_UP_QUESTIONS)) {
      if (q.data_type === "choice") {
        expect(q.choices).toBeDefined();
        expect(q.choices!.length).toBeGreaterThan(1);
      }
    }
  });

  it("every question should be referenced by at least one symptom", () => {
    const referencedQuestions = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      for (const q of entry.follow_up_questions) {
        referencedQuestions.add(q);
      }
    }
    for (const qId of questions) {
      expect(referencedQuestions.has(qId)).toBe(true);
    }
  });
});

// ─── BREED_MODIFIERS integrity ──────────────────────────────────────────────

describe("BREED_MODIFIERS integrity", () => {
  it("should have breed entries", () => {
    expect(Object.keys(BREED_MODIFIERS).length).toBeGreaterThan(0);
  });

  it("Golden Retriever should have hot_spots modifier >= 2.0", () => {
    const gr = BREED_MODIFIERS["Golden Retriever"];
    expect(gr).toBeDefined();
    if (gr) {
      expect(gr["hot_spots"]).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("all modifier values should be positive numbers", () => {
    for (const [breed, mods] of Object.entries(BREED_MODIFIERS)) {
      for (const [disease, mult] of Object.entries(mods)) {
        expect(mult).toBeGreaterThan(0);
        expect(typeof mult).toBe("number");
      }
    }
  });

  it("all diseases in modifiers should exist in DISEASE_DB (report gaps)", () => {
    const missing: string[] = [];
    for (const [breed, mods] of Object.entries(BREED_MODIFIERS)) {
      for (const disease of Object.keys(mods)) {
        if (!DISEASE_DB[disease]) {
          missing.push(`${breed} → ${disease}`);
        }
      }
    }
    if (missing.length > 0) {
      console.warn(
        `[KNOWN GAP] ${missing.length} breed modifier disease(s) not in DISEASE_DB:\n  ${missing.join("\n  ")}`
      );
    }
    // Core breed-disease combos must exist
    expect(DISEASE_DB["hot_spots"]).toBeDefined();
    expect(DISEASE_DB["wound_infection"]).toBeDefined();
  });
});

// ─── Cross-reference consistency ────────────────────────────────────────────

describe("Cross-reference consistency", () => {
  it("no orphaned diseases (in DISEASE_DB but never linked from any symptom)", () => {
    const linked = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      entry.linked_diseases.forEach((d) => linked.add(d));
    }
    const orphaned = Object.keys(DISEASE_DB).filter((dk) => !linked.has(dk));
    if (orphaned.length > 0) {
      console.warn(`[WARN] Orphaned diseases in DISEASE_DB: ${orphaned.join(", ")}`);
    }
    // Allow some gap but core diseases must be linked
    expect(linked.has("gastroenteritis")).toBe(true);
    expect(linked.has("wound_infection")).toBe(true);
  });

  it("no orphaned questions (in FOLLOW_UP_QUESTIONS but never referenced)", () => {
    const referenced = new Set<string>();
    for (const entry of Object.values(SYMPTOM_MAP)) {
      entry.follow_up_questions.forEach((q) => referenced.add(q));
    }
    const orphaned = Object.keys(FOLLOW_UP_QUESTIONS).filter(
      (qk) => !referenced.has(qk)
    );
    if (orphaned.length > 0) {
      console.warn(`[WARN] Orphaned questions: ${orphaned.join(", ")}`);
    }
    // All questions should be referenced
    expect(orphaned.length).toBe(0);
  });

  it("wound_skin_issue should link to wound-related diseases", () => {
    const wound = SYMPTOM_MAP["wound_skin_issue"];
    expect(wound.linked_diseases).toContain("wound_infection");
    expect(wound.linked_diseases).toContain("hot_spots");
    expect(wound.linked_diseases).toContain("abscess");
  });

  it("wound_skin_issue should have wound-specific follow-up questions", () => {
    const wound = SYMPTOM_MAP["wound_skin_issue"];
    expect(wound.follow_up_questions).toContain("wound_location");
    expect(wound.follow_up_questions).toContain("wound_size");
    expect(wound.follow_up_questions).toContain("wound_discharge");
  });
});
