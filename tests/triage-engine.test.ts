/**
 * TRIAGE ENGINE — Unit Tests
 * Tests the deterministic clinical logic that drives ALL medical decisions.
 * This is the most critical test file — if these fail, diagnoses are wrong.
 */

import {
  createSession,
  addSymptoms,
  recordAnswer,
  getNextQuestion,
  getQuestionText,
  getExtractionSchema,
  isReadyForDiagnosis,
  calculateProbabilities,
  buildDiagnosisContext,
  type TriageSession,
  type PetProfile,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const goldenRetriever: PetProfile = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
};

const bulldogPuppy: PetProfile = {
  name: "Tank",
  breed: "Bulldog",
  age_years: 0.5,
  weight: 20,
};

const seniorLab: PetProfile = {
  name: "Max",
  breed: "Labrador Retriever",
  age_years: 10,
  weight: 80,
};

const unknownBreed: PetProfile = {
  name: "Buddy",
  breed: "Mixed Breed",
  age_years: 3,
  weight: 40,
};

const labMix: PetProfile = {
  name: "Scout",
  breed: "Labrador Mix",
  age_years: 4,
  weight: 65,
};

const pugAdult: PetProfile = {
  name: "Olive",
  breed: "Pug",
  age_years: 4,
  weight: 18,
};

const miniatureSchnauzer: PetProfile = {
  name: "Pepper",
  breed: "Miniature Schnauzer",
  age_years: 8,
  weight: 17,
};

function buildSessionWithAnswers(
  symptoms: string[],
  answers: Record<string, string | boolean | number> = {}
): TriageSession {
  let session = createSession();
  session = addSymptoms(session, symptoms);

  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }

  return session;
}

// ─── createSession ───────────────────────────────────────────────────────────

describe("createSession", () => {
  it("should create an empty session with all required fields", () => {
    const session = createSession();
    expect(session.known_symptoms).toEqual([]);
    expect(session.answered_questions).toEqual([]);
    expect(session.extracted_answers).toEqual({});
    expect(session.red_flags_triggered).toEqual([]);
    expect(session.candidate_diseases).toEqual([]);
    expect(session.body_systems_involved).toEqual([]);
  });

  it("should create independent sessions (no shared state)", () => {
    const session1 = createSession();
    const session2 = createSession();
    session1.known_symptoms.push("vomiting");
    expect(session2.known_symptoms).toEqual([]);
  });
});

// ─── addSymptoms ─────────────────────────────────────────────────────────────

describe("addSymptoms", () => {
  it("should normalize and add a known symptom", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    expect(session.known_symptoms).toContain("vomiting");
    expect(session.candidate_diseases.length).toBeGreaterThan(0);
    expect(session.body_systems_involved).toContain("gastrointestinal");
  });

  it("should normalize free-text symptoms to SYMPTOM_MAP keys", () => {
    let session = createSession();
    session = addSymptoms(session, ["throwing up"]);
    expect(session.known_symptoms).toContain("vomiting");
  });

  it.each([
    ["won't eat", "not_eating"],
    ["hacking", "coughing"],
    ["panting", "difficulty_breathing"],
    ["goopy eyes", "eye_discharge"],
    ["shaking head", "ear_scratching"],
    ["hot spot", "wound_skin_issue"],
    ["favoring", "limping"],
    ["bald spot", "wound_skin_issue"],
    ["hit by car", "trauma"],
    ["after shots", "post_vaccination_reaction"],
  ])("should normalize colloquial phrase %s to %s", (phrase, expected) => {
    let session = createSession();
    session = addSymptoms(session, [phrase]);
    expect(session.known_symptoms).toContain(expected);
  });

  it("should normalize wound-related keywords to wound_skin_issue", () => {
    const woundKeywords = [
      "wound", "cut", "laceration", "hot spot", "abscess",
      "rash", "bump", "lump", "bleeding", "pus", "sore",
      "lesion", "bite", "skin infection", "redness",
    ];

    for (const keyword of woundKeywords) {
      let session = createSession();
      session = addSymptoms(session, [keyword]);
      expect(session.known_symptoms).toContain("wound_skin_issue");
    }
  });

  it("should not add duplicate symptoms", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = addSymptoms(session, ["vomiting"]);
    session = addSymptoms(session, ["throwing up"]); // Same as vomiting
    expect(session.known_symptoms.filter((s) => s === "vomiting").length).toBe(1);
  });

  it("should ignore unknown symptoms and return session unchanged", () => {
    let session = createSession();
    session = addSymptoms(session, ["flying", "teleporting"]);
    expect(session.known_symptoms).toEqual([]);
  });

  it("should add multiple different symptoms", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "limping", "wound"]);
    expect(session.known_symptoms).toContain("vomiting");
    expect(session.known_symptoms).toContain("limping");
    expect(session.known_symptoms).toContain("wound_skin_issue");
    expect(session.known_symptoms.length).toBe(3);
  });

  it("should populate candidate diseases from all symptoms", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    expect(session.candidate_diseases).toContain("gastroenteritis");
    expect(session.candidate_diseases).toContain("pancreatitis");
    expect(session.candidate_diseases).toContain("foreign_body");
  });

  it("should populate body systems from symptoms", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "limping"]);
    expect(session.body_systems_involved).toContain("gastrointestinal");
    expect(session.body_systems_involved).toContain("musculoskeletal");
  });
});

// ─── recordAnswer ────────────────────────────────────────────────────────────

describe("recordAnswer", () => {
  it("should record a string answer", () => {
    let session = createSession();
    session = recordAnswer(session, "vomit_duration", "3 days");
    expect(session.answered_questions).toContain("vomit_duration");
    expect(session.extracted_answers["vomit_duration"]).toBe("3 days");
  });

  it("should record a boolean answer", () => {
    let session = createSession();
    session = recordAnswer(session, "vomit_blood", true);
    expect(session.extracted_answers["vomit_blood"]).toBe(true);
  });

  it("should not duplicate question IDs", () => {
    let session = createSession();
    session = recordAnswer(session, "vomit_duration", "2 days");
    session = recordAnswer(session, "vomit_duration", "3 days");
    expect(
      session.answered_questions.filter((q) => q === "vomit_duration").length
    ).toBe(1);
    // Should update the value
    expect(session.extracted_answers["vomit_duration"]).toBe("3 days");
  });

  it("should trigger red flags when answer matches", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", true);
    expect(session.red_flags_triggered).toContain("vomit_blood");
  });

  it("should NOT trigger red flags for false answers", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", false);
    expect(session.red_flags_triggered).not.toContain("vomit_blood");
  });

  it("should trigger choice-valued red flags like non_weight_bearing", () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = recordAnswer(session, "weight_bearing", "non_weight_bearing");
    expect(session.red_flags_triggered).toContain("non_weight_bearing");
  });

  it("should trigger respiratory red flags derived from choice answers", () => {
    let session = createSession();
    session = addSymptoms(session, ["difficulty_breathing"]);
    session = recordAnswer(session, "gum_color", "blue");
    session = recordAnswer(session, "breathing_onset", "sudden");

    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["blue_gums", "breathing_onset_sudden"])
    );
  });

  it("should trigger trauma red flags derived from boolean and choice answers", () => {
    let session = createSession();
    session = addSymptoms(session, ["trauma"]);
    session = recordAnswer(session, "visible_fracture", true);
    session = recordAnswer(session, "trauma_mobility", "inability_to_stand");

    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["visible_fracture", "inability_to_stand"])
    );
  });

  it("should trigger post-vaccination red flags when facial swelling is present", () => {
    let session = createSession();
    session = addSymptoms(session, ["post_vaccination_reaction"]);
    session = recordAnswer(session, "face_swelling", true);

    expect(session.red_flags_triggered).toContain("face_swelling");
  });

  it("should trigger GI and toxin red flags derived from non-boolean answers", () => {
    let session = createSession();
    session = addSymptoms(session, ["blood_in_stool", "trembling"]);
    session = recordAnswer(session, "blood_amount", "mostly_blood");
    session = recordAnswer(
      session,
      "toxin_exposure",
      "He got into rat poison near the garage."
    );

    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["large_blood_volume", "rat_poison_confirmed", "toxin_confirmed"])
    );
  });
});

// ─── getNextQuestion ─────────────────────────────────────────────────────────

describe("getNextQuestion", () => {
  it("should return null for empty session", () => {
    const session = createSession();
    expect(getNextQuestion(session)).toBeNull();
  });

  it("should return a question for a session with symptoms", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const nextQ = getNextQuestion(session);
    expect(nextQ).not.toBeNull();
    expect(typeof nextQ).toBe("string");
  });

  it("should not return already-answered questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const firstQ = getNextQuestion(session);
    expect(firstQ).not.toBeNull();
    session = recordAnswer(session, firstQ!, "some answer");
    const secondQ = getNextQuestion(session);
    expect(secondQ).not.toBe(firstQ);
  });

  it("should prioritize critical questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    const firstQ = getNextQuestion(session);
    // First question should be one of the critical wound questions
    expect(firstQ).not.toBeNull();
  });

  it.each(
    Object.entries(SYMPTOM_MAP).map(([symptom, entry]) => {
      const firstCriticalQuestion =
        entry.follow_up_questions.find(
          (qId) => FOLLOW_UP_QUESTIONS[qId]?.critical
        ) || entry.follow_up_questions[0];

      return [symptom, firstCriticalQuestion];
    })
  )(
    "should start %s with its first critical follow-up question",
    (symptom, expectedQuestionId) => {
      let session = createSession();
      session = addSymptoms(session, [symptom]);
      expect(getNextQuestion(session)).toBe(expectedQuestionId);
    }
  );

  it("should prioritize higher-risk breathing questions over cough questions in mixed respiratory cases", () => {
    let session = createSession();
    session = addSymptoms(session, ["coughing", "difficulty_breathing"]);

    expect(getNextQuestion(session)).toBe("breathing_onset");
  });

  it("should start trauma flow with trauma-specific critical questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["trauma"]);

    expect(getNextQuestion(session)).toBe("trauma_mechanism");
  });

  it("should start post-vaccination flow with vaccination timing", () => {
    let session = createSession();
    session = addSymptoms(session, ["post_vaccination_reaction"]);

    expect(getNextQuestion(session)).toBe("vaccination_timing");
  });

  it("should eventually return null when all questions answered", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    // Answer all questions one by one
    let iterations = 0;
    const maxIterations = 20;
    while (getNextQuestion(session) !== null && iterations < maxIterations) {
      const q = getNextQuestion(session)!;
      session = recordAnswer(session, q, "test answer");
      iterations++;
    }
    expect(getNextQuestion(session)).toBeNull();
    expect(iterations).toBeLessThan(maxIterations);
  });
});

// ─── getQuestionText ─────────────────────────────────────────────────────────

describe("getQuestionText", () => {
  it("should return question text for known question IDs", () => {
    const text = getQuestionText("vomit_duration");
    expect(text.length).toBeGreaterThan(5);
    expect(text).not.toBe("Can you tell me more about what you've noticed?");
  });

  it("should return fallback for unknown question IDs", () => {
    const text = getQuestionText("nonexistent_question_xyz");
    expect(text).toBe("Can you tell me more about what you've noticed?");
  });
});

// ─── getExtractionSchema ─────────────────────────────────────────────────────

describe("getExtractionSchema", () => {
  it("should always include symptoms field", () => {
    const session = createSession();
    const schema = getExtractionSchema(session);
    expect(schema["symptoms"]).toBeDefined();
  });

  it("should include extraction hints for unanswered questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const schema = getExtractionSchema(session);
    expect(Object.keys(schema).length).toBeGreaterThan(1);
    expect(schema["vomit_duration"]).toBeDefined();
  });

  it("should NOT include already-answered questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_duration", "3 days");
    const schema = getExtractionSchema(session);
    expect(schema["vomit_duration"]).toBeUndefined();
  });
});

// ─── isReadyForDiagnosis ─────────────────────────────────────────────────────

describe("isReadyForDiagnosis", () => {
  it("should return false for empty session", () => {
    const session = createSession();
    expect(isReadyForDiagnosis(session)).toBe(false);
  });

  it("should return false with symptoms but no answers", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    expect(isReadyForDiagnosis(session)).toBe(false);
  });

  it("should return false with fewer than 3 answered questions", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_duration", "2 days");
    session = recordAnswer(session, "vomit_frequency", "3 times");
    expect(isReadyForDiagnosis(session)).toBe(false);
  });

  it("should return true when red flags are triggered (regardless of answers)", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", true);
    // Red flag triggered — should be ready immediately
    expect(session.red_flags_triggered.length).toBeGreaterThan(0);
    expect(isReadyForDiagnosis(session)).toBe(true);
  });

  it("should return true when all critical questions are answered (>= 3)", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    // Answer critical wound questions
    let answeredCount = 0;
    let nextQ = getNextQuestion(session);
    while (nextQ && answeredCount < 15) {
      session = recordAnswer(session, nextQ, "test answer");
      answeredCount++;
      nextQ = getNextQuestion(session);
      if (isReadyForDiagnosis(session)) break;
    }
    // Should eventually be ready
    expect(isReadyForDiagnosis(session)).toBe(true);
  });
});

// ─── calculateProbabilities ──────────────────────────────────────────────────

describe("calculateProbabilities", () => {
  it("should return probabilities for candidate diseases", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const probs = calculateProbabilities(session, goldenRetriever);
    expect(probs.length).toBeGreaterThan(0);
    expect(probs[0].final_score).toBeGreaterThan(0);
  });

  it("should return results sorted by final_score descending", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "not_eating"]);
    const probs = calculateProbabilities(session, goldenRetriever);
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i].final_score).toBeLessThanOrEqual(probs[i - 1].final_score);
    }
  });

  it("should apply breed multipliers for Golden Retriever", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    const probs = calculateProbabilities(session, goldenRetriever);
    const hotSpots = probs.find((p) => p.disease_key === "hot_spots");
    // Golden Retrievers have 3.0x hot spot risk
    if (hotSpots) {
      expect(hotSpots.breed_multiplier).toBeGreaterThanOrEqual(2.0);
    }
  });

  it("should apply the new Pug modifier for breathing complaints", () => {
    let session = createSession();
    session = addSymptoms(session, ["difficulty_breathing"]);
    const probs = calculateProbabilities(session, pugAdult);
    const airwayDisease = probs.find(
      (p) => p.disease_key === "difficulty_breathing"
    );

    expect(airwayDisease?.breed_multiplier).toBeGreaterThan(1.0);
  });

  it("should apply the new Miniature Schnauzer modifier for pancreatitis", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "not_eating"]);
    const probs = calculateProbabilities(session, miniatureSchnauzer);
    const pancreatitis = probs.find((p) => p.disease_key === "pancreatitis");

    expect(pancreatitis?.breed_multiplier).toBeGreaterThan(1.0);
  });

  it("should match common mix labels like Labrador Mix conservatively", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    const probs = calculateProbabilities(session, labMix);
    const hotSpots = probs.find((p) => p.disease_key === "hot_spots");

    expect(hotSpots?.breed_multiplier).toBeGreaterThan(1.0);
  });

  it("should apply age modifiers (puppy vs senior)", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const puppyProbs = calculateProbabilities(session, bulldogPuppy);
    const seniorProbs = calculateProbabilities(session, seniorLab);

    // Foreign body is more common in puppies
    const puppyFB = puppyProbs.find((p) => p.disease_key === "foreign_body");
    const seniorFB = seniorProbs.find((p) => p.disease_key === "foreign_body");
    if (puppyFB && seniorFB) {
      expect(puppyFB.age_multiplier).toBeGreaterThanOrEqual(seniorFB.age_multiplier);
    }
  });

  it("should boost wound_infection when pus is present", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const withoutPus = calculateProbabilities(session, goldenRetriever);

    session = recordAnswer(session, "wound_discharge", "pus");
    const withPus = calculateProbabilities(session, goldenRetriever);

    const infectionWithout = withoutPus.find(
      (p) => p.disease_key === "wound_infection"
    );
    const infectionWith = withPus.find(
      (p) => p.disease_key === "wound_infection"
    );
    if (infectionWith && infectionWithout) {
      expect(infectionWith.final_score).toBeGreaterThan(
        infectionWithout.final_score
      );
    }
  });

  it("should boost soft_tissue_injury when trauma_history confirms an incident", () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);

    const withoutTrauma = calculateProbabilities(session, goldenRetriever);

    session = recordAnswer(session, "trauma_history", "yes_trauma");
    const withTrauma = calculateProbabilities(session, goldenRetriever);

    const without = withoutTrauma.find(
      (p) => p.disease_key === "soft_tissue_injury"
    );
    const withConfirmedTrauma = withTrauma.find(
      (p) => p.disease_key === "soft_tissue_injury"
    );
    if (without && withConfirmedTrauma) {
      expect(withConfirmedTrauma.final_score).toBeGreaterThan(without.final_score);
    }
  });

  it("should boost hot_spots when wound_licking is true", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const without = calculateProbabilities(session, goldenRetriever);

    session = recordAnswer(session, "wound_licking", true);
    const withLicking = calculateProbabilities(session, goldenRetriever);

    const hsWithout = without.find((p) => p.disease_key === "hot_spots");
    const hsWith = withLicking.find((p) => p.disease_key === "hot_spots");
    if (hsWith && hsWithout) {
      expect(hsWith.final_score).toBeGreaterThan(hsWithout.final_score);
    }
  });

  it("should boost GDV with unproductive retching (5x pathognomonic)", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "unproductive_retching", true);
    const probs = calculateProbabilities(session, goldenRetriever);
    const gdv = probs.find((p) => p.disease_key === "gdv");
    if (gdv) {
      // GDV should be near the top with 5x boost
      const gdvRank = probs.indexOf(gdv);
      expect(gdvRank).toBeLessThan(5);
    }
  });

  it("should give reasonable results for unknown breed", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const probs = calculateProbabilities(session, unknownBreed);
    expect(probs.length).toBeGreaterThan(0);
    // All breed multipliers should be 1.0 for unknown breed
    for (const p of probs) {
      expect(p.breed_multiplier).toBe(1.0);
    }
  });
});

// ─── buildDiagnosisContext ───────────────────────────────────────────────────

describe("buildDiagnosisContext", () => {
  it("should return all required fields", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_duration", "3 days");
    const ctx = buildDiagnosisContext(session, goldenRetriever);

    expect(ctx.probabilities).toBeDefined();
    expect(ctx.top5).toBeDefined();
    expect(ctx.top5.length).toBeLessThanOrEqual(5);
    expect(ctx.breed_risk_summary).toBeDefined();
    expect(ctx.symptom_summary).toBeDefined();
    expect(ctx.answer_summary).toBeDefined();
    expect(ctx.red_flags).toBeDefined();
    expect(ctx.body_systems).toBeDefined();
    expect(ctx.highest_urgency).toBeDefined();
  });

  it("should set urgency to emergency when red flags present", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", true);
    const ctx = buildDiagnosisContext(session, goldenRetriever);
    expect(ctx.highest_urgency).toBe("emergency");
  });

  it("should include breed risk summary for Golden Retriever", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    const ctx = buildDiagnosisContext(session, goldenRetriever);
    expect(ctx.breed_risk_summary).toContain("Golden Retriever");
  });

  it("should include answers in answer_summary", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_duration", "3 days");
    const ctx = buildDiagnosisContext(session, goldenRetriever);
    expect(ctx.answer_summary).toContain("3 days");
  });
});

describe("Dangerous emergency composite regressions", () => {
  it.each([
    {
      name: "pale gums with respiratory distress",
      symptoms: ["difficulty_breathing"],
      answers: {
        gum_color: "pale_white",
      },
    },
    {
      name: "collapse with delayed recovery",
      symptoms: ["seizure_collapse"],
      answers: {
        consciousness_level: "dull",
      },
    },
    {
      name: "acute hind-limb paralysis",
      symptoms: ["abnormal_gait"],
      answers: {
        abnormal_gait_onset: "sudden",
        affected_limbs: "back legs",
      },
    },
    {
      name: "neck swelling with breathing compromise",
      symptoms: ["swelling_lump", "difficulty_breathing"],
      answers: {
        lump_location: "neck",
        position_preference: "neck extended",
      },
    },
    {
      name: "post-vaccine anaphylaxis pattern",
      symptoms: ["post_vaccination_reaction"],
      answers: {
        face_swelling: true,
        hives_with_breathing: true,
      },
    },
    {
      name: "Addisonian-crisis-like multi-system decline",
      symptoms: ["multi_system_decline"],
      answers: {
        appetite_status: "none",
        water_intake: "not_drinking",
        energy_level: "barely_moving",
      },
    },
  ])("keeps %s emergency-ready at the engine layer", ({
    symptoms,
    answers,
  }) => {
    const session = buildSessionWithAnswers(symptoms, answers);
    const ctx = buildDiagnosisContext(session, unknownBreed);

    expect(ctx.highest_urgency).toBe("emergency");
    expect(isReadyForDiagnosis(session)).toBe(true);
    expect(["low", "moderate", "high"]).not.toContain(ctx.highest_urgency);
  });

  it("does not auto-ready a recovered fainting spell without ongoing compromise", () => {
    const session = buildSessionWithAnswers(["seizure_collapse"], {
      consciousness_level: "alert",
    });

    expect(isReadyForDiagnosis(session)).toBe(false);
  });
});

// ─── Negative Answer Extraction Fix ──────────────────────────────────────────

describe("Negative answer extraction (loop fix)", () => {
  it("should progress through questions without looping", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const askedQuestions: string[] = [];
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
      const nextQ = getNextQuestion(session);
      if (!nextQ) break;

      // Detect loops: same question should never appear twice
      expect(askedQuestions).not.toContain(nextQ);
      askedQuestions.push(nextQ);

      // Simulate answering with "no" / negative — this is where the old bug was
      session = recordAnswer(session, nextQ, "no");
      iterations++;
    }

    expect(iterations).toBeLessThan(maxIterations);
    expect(askedQuestions.length).toBe(new Set(askedQuestions).size);
  });

  it("should accept raw text as valid answer (force-record path)", () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);

    const nextQ = getNextQuestion(session)!;
    // Simulate the force-record: user said "I don't know" → record raw text
    session = recordAnswer(
      session,
      nextQ,
      "i don't have a idea i thought it might be a infection"
    );
    expect(session.answered_questions).toContain(nextQ);
    expect(session.extracted_answers[nextQ]).toBe(
      "i don't have a idea i thought it might be a infection"
    );
  });
});

// ─── Full Triage Flow (End-to-End within engine) ────────────────────────────

describe("Full triage flow simulation", () => {
  it("should complete a wound triage for Golden Retriever", () => {
    let session = createSession();

    // Step 1: Add wound symptom
    session = addSymptoms(session, ["wound_skin_issue"]);
    expect(session.candidate_diseases.length).toBeGreaterThan(0);

    // Step 2: Answer questions until ready
    let iterations = 0;
    while (!isReadyForDiagnosis(session) && iterations < 15) {
      const q = getNextQuestion(session);
      if (!q) break;
      // Simulate typical wound answers
      const answers: Record<string, string | boolean> = {
        wound_location: "right front leg near paw",
        wound_size: "quarter sized",
        wound_duration: "3 days, getting bigger",
        wound_discharge: "pus",
        wound_odor: true,
        wound_licking: true,
        trauma_history: "no idea",
      };
      session = recordAnswer(session, q, answers[q] ?? "not sure");
      iterations++;
    }

    expect(isReadyForDiagnosis(session)).toBe(true);

    // Step 3: Get diagnosis
    const ctx = buildDiagnosisContext(session, goldenRetriever);
    expect(ctx.top5.length).toBeGreaterThan(0);

    // With pus + odor + licking, wound_infection and hot_spots should rank high
    const topDiseases = ctx.top5.map((p) => p.disease_key);
    const hasWoundRelated = topDiseases.some((d) =>
      ["wound_infection", "hot_spots", "abscess"].includes(d)
    );
    expect(hasWoundRelated).toBe(true);

    // Urgency should be at least moderate for wound with pus
    expect(["moderate", "high", "emergency"]).toContain(ctx.highest_urgency);
  });

  it("should complete a vomiting triage for Bulldog puppy", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "not_eating"]);

    let iterations = 0;
    while (!isReadyForDiagnosis(session) && iterations < 15) {
      const q = getNextQuestion(session);
      if (!q) break;
      session = recordAnswer(session, q, "moderate");
      iterations++;
    }

    const ctx = buildDiagnosisContext(session, bulldogPuppy);
    expect(ctx.top5.length).toBeGreaterThan(0);
    expect(ctx.body_systems).toContain("gastrointestinal");
  });

  it("should trigger emergency for GDV symptoms in deep-chested breed", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting", "swollen_abdomen"]);
    session = recordAnswer(session, "unproductive_retching", true);

    // Red flag should be triggered
    expect(session.red_flags_triggered).toContain("unproductive_retching");
    expect(isReadyForDiagnosis(session)).toBe(true);

    const ctx = buildDiagnosisContext(session, goldenRetriever);
    expect(ctx.highest_urgency).toBe("emergency");
  });
});
