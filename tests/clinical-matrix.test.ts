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
import { extractDeterministicAnswersForTurn } from "@/lib/symptom-chat/answer-extraction";
import { addSymptoms, createSession, recordAnswer } from "@/lib/triage-engine";

function hydrateSessionFromTurn(symptoms: string[], rawMessage: string) {
  let session = addSymptoms(createSession(), symptoms);
  const answers = extractDeterministicAnswersForTurn(rawMessage, session);

  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }

  return { session, answers };
}

describe("SYMPTOM_MAP integrity", () => {
  const symptoms = Object.keys(SYMPTOM_MAP);

  it("should have at least 10 symptom entries", () => {
    expect(symptoms.length).toBeGreaterThanOrEqual(10);
  });

  it("should include wound_skin_issue symptom", () => {
    expect(SYMPTOM_MAP.wound_skin_issue).toBeDefined();
  });

  it("should include trauma and post_vaccination_reaction symptoms", () => {
    expect(SYMPTOM_MAP.trauma).toBeDefined();
    expect(SYMPTOM_MAP.post_vaccination_reaction).toBeDefined();
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
      "trauma",
      "post_vaccination_reaction",
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

  it("should include trauma and post-vaccination questions", () => {
    const requiredQuestions = [
      "trauma_mechanism",
      "trauma_timeframe",
      "trauma_area",
      "active_bleeding_trauma",
      "visible_fracture",
      "trauma_mobility",
      "vaccination_timing",
      "vaccination_type",
      "face_swelling",
      "hives_with_breathing",
    ];
    for (const qId of requiredQuestions) {
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

  it("trauma should have trauma-specific follow-up questions and emergency red flags", () => {
    const trauma = SYMPTOM_MAP.trauma;
    expect(trauma.follow_up_questions).toEqual(
      expect.arrayContaining([
        "trauma_mechanism",
        "active_bleeding_trauma",
        "visible_fracture",
        "trauma_mobility",
      ])
    );
    expect(trauma.red_flags).toEqual(
      expect.arrayContaining([
        "active_bleeding_trauma",
        "visible_fracture",
        "inability_to_stand",
      ])
    );
  });

  it("post_vaccination_reaction should ask timing questions and screen for anaphylaxis", () => {
    const postVax = SYMPTOM_MAP.post_vaccination_reaction;
    expect(postVax.follow_up_questions).toEqual(
      expect.arrayContaining([
        "vaccination_timing",
        "reaction_symptoms",
        "face_swelling",
        "hives_with_breathing",
      ])
    );
    expect(postVax.red_flags).toEqual(
      expect.arrayContaining(["face_swelling", "hives_with_breathing"])
    );
  });
});

describe("Wave 3 emergency linkage regressions", () => {
  it("links bloody diarrhea complaints to hemorrhagic shock red-flag surfaces", () => {
    const { session, answers } = hydrateSessionFromTurn(
      ["diarrhea"],
      "My dog has explosive bloody diarrhea and is weak with pale gums."
    );

    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining([
        "hemorrhagic_gastroenteritis",
        "parvovirus",
        "coagulopathy",
      ])
    );
    expect(SYMPTOM_MAP.diarrhea.follow_up_questions).toEqual(
      expect.arrayContaining(["blood_amount", "gum_color", "water_intake"])
    );
    expect(answers.gum_color).toBe("pale_white");
    expect(session.red_flags_triggered).toContain("pale_gums");
  });

  it("links lethargy complaints to pale-gum emergency pathways for hemolytic shock patterns", () => {
    const { session, answers } = hydrateSessionFromTurn(
      ["lethargy"],
      "My dog is extremely weak, his gums are pale, and his urine is dark brown."
    );

    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["imha", "coagulopathy", "sepsis"])
    );
    expect(SYMPTOM_MAP.lethargy.follow_up_questions).toContain("gum_color");
    expect(answers.gum_color).toBe("pale_white");
    expect(session.red_flags_triggered).toContain("pale_gums");
  });

  it("replaces dead parvo-style combined GI red flags with deterministic emergency signals", () => {
    const { session, answers } = hydrateSessionFromTurn(
      ["vomiting_diarrhea_combined"],
      "My unvaccinated puppy is vomiting and has bloody diarrhea and won't drink."
    );

    expect(SYMPTOM_MAP.vomiting_diarrhea_combined.follow_up_questions).toEqual(
      expect.arrayContaining(["gum_color", "vaccination_status", "water_intake"])
    );
    expect(SYMPTOM_MAP.vomiting_diarrhea_combined.red_flags).toEqual(
      expect.arrayContaining(["not_drinking", "large_blood_volume", "pale_gums"])
    );
    expect(answers.water_intake).toBe("not_drinking");
    expect(session.red_flags_triggered).toContain("not_drinking");
  });

  it("surfaces postpartum eclampsia as a must-not-miss disease from trembling plus pregnancy complaints", () => {
    const { session, answers } = hydrateSessionFromTurn(
      ["pregnancy_birth", "trembling"],
      "She is nursing puppies and now she is trembling badly and seems weak and restless."
    );

    expect(session.candidate_diseases).toContain("eclampsia");
    expect(SYMPTOM_MAP.pregnancy_birth.follow_up_questions).toContain(
      "restlessness"
    );
    expect(SYMPTOM_MAP.pregnancy_birth.red_flags).toContain("eclampsia_signs");
    expect(answers.restlessness).toBe(true);
  });
});
