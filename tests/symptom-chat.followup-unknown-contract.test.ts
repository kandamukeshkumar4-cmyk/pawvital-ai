import { transitionToAnswered } from "@/lib/conversation-state";
import { createSession, isReadyForDiagnosis, type TriageSession } from "@/lib/triage-engine";
import { getDeterministicFastPathExtraction } from "@/lib/symptom-chat/context-helpers";

function buildPendingSession(
  questionId: string,
  knownSymptoms: string[]
): TriageSession {
  const session = createSession();

  return {
    ...session,
    known_symptoms: knownSymptoms,
    candidate_diseases: ["placeholder_condition"],
    body_systems_involved: ["systemic"],
    last_question_asked: questionId,
    case_memory: {
      ...session.case_memory,
      unresolved_question_ids: [questionId],
    },
  };
}

function recordFastPathUnknown(
  questionId: string,
  message: string,
  knownSymptoms: string[]
): TriageSession {
  const session = buildPendingSession(questionId, knownSymptoms);
  const extraction = getDeterministicFastPathExtraction(session, message);

  expect(extraction).not.toBeNull();
  expect(extraction?.answers[questionId]).toBe("unknown");

  return transitionToAnswered({
    session,
    questionId,
    value: extraction!.answers[questionId],
    reason: "turn_answer_recorded",
  });
}

describe("VET-1338 / #263 follow-up unknown contract", () => {
  it.each([
    [
      "diarrhea_frequency",
      "I'm not sure how many times he went.",
      ["diarrhea"],
    ],
    [
      "diarrhea_onset",
      "I honestly don't remember exactly when it started.",
      ["diarrhea"],
    ],
    [
      "discharge_color",
      "There's discharge but I can't tell what color.",
      ["nasal_discharge"],
    ],
    [
      "energy_level",
      "I'm not sure if his energy is different, he's always been pretty calm.",
      ["drinking_more"],
    ],
    [
      "has_fever",
      "I don't have a thermometer so I can't tell if she has a fever.",
      ["lethargy"],
    ],
    [
      "itch_location",
      "She scratches everywhere, I can't pinpoint it.",
      ["excessive_scratching"],
    ],
    [
      "limping_progression",
      "I really can't tell if it's better or worse.",
      ["limping"],
    ],
    [
      "lump_size",
      "I found it but I'm not sure how big it is.",
      ["swelling_lump"],
    ],
    [
      "stool_consistency",
      "I have no idea, I didn't get a good look.",
      ["diarrhea"],
    ],
    [
      "urine_color",
      "I didn't notice the color of her urine.",
      ["urination_problem"],
    ],
    [
      "vomit_color",
      "I didn't really look at what color it was.",
      ["vomiting"],
    ],
    [
      "water_intake",
      "Honestly I am not sure how much she is drinking.",
      ["drinking_more"],
    ],
    [
      "weight_bearing",
      "I can't really tell how much weight he's putting on it.",
      ["limping"],
    ],
    [
      "wound_depth",
      "I can see a wound but I don't know how deep it goes.",
      ["wound_skin_issue"],
    ],
  ])(
    "stores %s as answered unknown and preserves follow-up readiness",
    (questionId, message, knownSymptoms) => {
      const updated = recordFastPathUnknown(questionId, message, knownSymptoms);

      expect(updated.answered_questions).toContain(questionId);
      expect(updated.extracted_answers[questionId]).toBe("unknown");
      expect(updated.case_memory?.unresolved_question_ids).not.toContain(
        questionId
      );
      expect(isReadyForDiagnosis(updated)).toBe(false);
    }
  );

  it("VET-1392: keeps ambiguous appetite_change unresolved instead of coercing unknown or directional words", () => {
    const session = buildPendingSession("appetite_change", ["weight_loss"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "I don't really know if she's eating more or less."
    );

    expect(extraction).toBeNull();
  });

  it("keeps determinate safe follow-up answers intact", () => {
    const session = buildPendingSession("water_intake", ["drinking_more"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "She is drinking normally."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        water_intake: "normal",
      },
    });
  });

  it("does not widen extended unknown handling to unsafe emergency follow-ups", () => {
    const session = buildPendingSession("breathing_onset", [
      "difficulty_breathing",
    ]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "I don't really know if it started suddenly or gradually."
    );

    expect(extraction).not.toBeNull();
    expect(extraction?.answers.breathing_onset).not.toBe("unknown");
  });
});
