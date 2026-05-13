jest.mock("@/lib/nvidia-models", () => ({
  extractWithQwen: jest.fn(),
}));

import { createSession, type TriageSession } from "@/lib/triage-engine";
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

describe("VET-1424 deterministic answer coercion", () => {
  it.each([
    "for about two days",
    "since Tuesday",
    "started yesterday",
    "a few hours",
    "about a week",
    "two weeks ago",
  ])(
    "coerces anchored duration reply '%s' for pending duration questions",
    (message) => {
      const session = buildPendingSession("vomit_duration", ["vomiting"]);
      const extraction = getDeterministicFastPathExtraction(session, message);

      expect(extraction).toEqual({
        symptoms: [],
        answers: {
          vomit_duration: message,
        },
      });
    }
  );

  it.each([
    "not sure",
    "I can't tell",
    "I don't know",
    "maybe",
    "skip",
  ])("coerces '%s' to unknown for safe anchored follow-up questions", (message) => {
    const session = buildPendingSession("vomit_duration", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(session, message);

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        vomit_duration: "unknown",
      },
    });
  });

  it("keeps emergency unknown replies unresolved when the question does not allow canonical unknown", () => {
    const session = buildPendingSession("gum_color", ["difficulty_breathing"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "I can't tell what color they are."
    );

    expect(extraction).toBeNull();
  });

  it("does not coerce a vague negative into a false emergency-red-flag answer", () => {
    const session = buildPendingSession("vomit_blood", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "Not really sure, I did not get a good look."
    );

    expect(extraction).toBeNull();
  });

  it("still accepts an explicit denial for emergency-red-flag follow-ups", () => {
    const session = buildPendingSession("vomit_blood", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "No, there is no blood in what he threw up."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        vomit_blood: false,
      },
    });
  });

  it("coerces long yes replies for pending boolean questions", () => {
    const session = buildPendingSession("pain_on_touch", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "Yes, he yelps every time I touch that front leg near the paw."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        pain_on_touch: true,
      },
    });
  });

  it("coerces long choice replies for pending normality questions", () => {
    const session = buildPendingSession("water_intake", ["drinking_more"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "She is drinking less than usual lately, and I only see a few sips now."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        water_intake: "less_than_usual",
      },
    });
  });

  it("coerces appetite status replies deterministically", () => {
    const session = buildPendingSession("appetite_status", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He is eating less than usual today."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        appetite_status: "decreased",
      },
    });
  });

  it("coerces partial weight-bearing replies deterministically", () => {
    const session = buildPendingSession("weight_bearing", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He is only partially weight bearing and just toe touching on that leg."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        weight_bearing: "partial",
      },
    });
  });

  it("coerces mobility walk phrasing for trauma mobility questions", () => {
    const session = buildPendingSession("trauma_mobility", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He can still walk on it, just slowly and carefully."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        trauma_mobility: "walking",
      },
    });
  });

  it("coerces cannot-walk phrasing for trauma mobility questions", () => {
    const session = buildPendingSession("trauma_mobility", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He cannot walk and keeps dragging the leg."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        trauma_mobility: "inability_to_stand",
      },
    });
  });

  it("coerces mild/moderate/severe choice labels directly", () => {
    const session = buildPendingSession("lethargy_severity", ["lethargy"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "I would call it moderate overall."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        lethargy_severity: "moderate",
      },
    });
  });

  it("coerces long simple location replies for pending entity questions", () => {
    const session = buildPendingSession("which_leg", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "It seems to be the left back leg, mostly around the knee when he walks."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        which_leg: "left back leg",
      },
    });
  });

  it("coerces body-part location replies for wound questions", () => {
    const session = buildPendingSession("wound_location", ["wound_skin_issue"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "The sore is on her right paw near the toes."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        wound_location: "right paw",
      },
    });
  });

  it("coerces medication/substance mentions for anchored exposure questions", () => {
    const session = buildPendingSession("toxin_exposure", ["vomiting"]);
    const message = "He got into ibuprofen tablets from my bag last night.";
    const extraction = getDeterministicFastPathExtraction(session, message);

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        toxin_exposure: "ibuprofen",
      },
    });
  });

  it("coerces appearance replies for anchored vomit-content questions", () => {
    const session = buildPendingSession("vomit_content", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "It looks like yellow bile with some foam."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        vomit_content: "bile",
      },
    });
  });

  it("stays unresolved when the reply introduces a new symptom outside the pending question", () => {
    const session = buildPendingSession("vomit_duration", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He has been vomiting for two days and is limping now."
    );

    expect(extraction).toBeNull();
  });

  it("stays unresolved when a long pending string reply does not contain a deterministic entity", () => {
    const session = buildPendingSession("which_leg", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He started limping after fetch yesterday and it seems worse after exercise."
    );

    expect(extraction).toBeNull();
  });
});
