import {
  createSession,
  type TriageSession,
} from "@/lib/triage-engine";
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

describe("VET-1424 pending answer coercion fast path", () => {
  it("resolves long duration replies for pending duration questions", () => {
    const session = buildPendingSession("vomit_duration", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He has been vomiting since Monday night, so it has been about two days now overall."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        vomit_duration:
          "He has been vomiting since Monday night, so it has been about two days now overall.",
      },
    });
  });

  it("resolves long yes replies for pending boolean questions", () => {
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

  it("resolves long unknown replies for pending safe follow-up questions", () => {
    const session = buildPendingSession("vomit_duration", ["vomiting"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "I am not really sure because I was asleep when it started and my partner noticed first."
    );

    expect(extraction).toEqual({
      symptoms: [],
      answers: {
        vomit_duration: "unknown",
      },
    });
  });

  it("resolves long choice replies for pending choice questions", () => {
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

  it("resolves long simple location replies for pending entity questions", () => {
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

  it("stays unresolved when a long pending string reply does not contain a deterministic entity", () => {
    const session = buildPendingSession("which_leg", ["limping"]);
    const extraction = getDeterministicFastPathExtraction(
      session,
      "He started limping after fetch yesterday and it seems worse after exercise."
    );

    expect(extraction).toBeNull();
  });
});
