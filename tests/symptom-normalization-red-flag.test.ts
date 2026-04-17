import { SYMPTOM_MAP } from "@/lib/clinical-matrix";
import {
  extractDeterministicAnswersForTurn,
} from "@/lib/symptom-chat/answer-extraction";
import { extractSymptomsFromKeywords } from "@/lib/symptom-chat/extraction-helpers";
import {
  addSymptoms,
  createSession,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";

function buildDeterministicSession(message: string): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
  session: TriageSession;
} {
  let session = createSession();
  const symptoms = extractSymptomsFromKeywords(message);
  session = addSymptoms(session, symptoms);

  const answers = extractDeterministicAnswersForTurn(message, session);
  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }

  return { symptoms, answers, session };
}

describe("emergency normalization and linkage regressions", () => {
  it("keeps matrix follow-ups aligned with the restored emergency pathways", () => {
    expect(SYMPTOM_MAP.lethargy.follow_up_questions).toContain("gum_color");
    expect(SYMPTOM_MAP.lethargy.red_flags).toEqual(
      expect.arrayContaining(["blue_gums", "pale_gums"])
    );
    expect(SYMPTOM_MAP.excessive_scratching.follow_up_questions).toEqual(
      expect.arrayContaining(["face_swelling", "hives_with_breathing"])
    );
    expect(SYMPTOM_MAP.swelling_lump.follow_up_questions).toEqual(
      expect.arrayContaining(["face_swelling", "hives_with_breathing"])
    );
    expect(SYMPTOM_MAP.abnormal_gait.follow_up_questions).toContain(
      "trauma_mobility"
    );
  });

  it("maps allergic swelling language into emergency red-flag reachability", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "After a bee sting her face swelled up and now she is breathing hard."
    );

    expect(symptoms).toEqual(
      expect.arrayContaining(["difficulty_breathing", "swelling_lump"])
    );
    expect(answers.face_swelling).toBe(true);
    expect(session.red_flags_triggered).toContain("face_swelling");
    expect(session.candidate_diseases).toContain("allergic_reaction");
  });

  it("maps post-vaccine facial swelling and hives into the vaccine reaction family", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "A few hours after his shots my dog's face puffed up and he broke out in hives."
    );

    expect(symptoms).toEqual(
      expect.arrayContaining([
        "post_vaccination_reaction",
        "excessive_scratching",
        "swelling_lump",
      ])
    );
    expect(answers.face_swelling).toBe(true);
    expect(session.red_flags_triggered).toContain("face_swelling");
    expect(session.candidate_diseases).toContain("allergic_reaction");
  });

  it("links profound weakness and pale gums into lethargy emergency screening", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "My dog is extremely weak, his gums are pale, and his urine is dark brown."
    );

    expect(symptoms).toContain("lethargy");
    expect(answers.gum_color).toBe("pale_white");
    expect(session.red_flags_triggered).toContain("pale_gums");
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["anemia", "imha", "addisons_disease"])
    );
  });

  it("keeps Addisonian-crisis-like collapse language on an emergency disease path", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "My dog has been having intermittent vomiting and now she has collapsed."
    );

    expect(symptoms).toEqual(
      expect.arrayContaining(["vomiting", "seizure_collapse"])
    );
    expect(answers.consciousness_level).toBe("unresponsive");
    expect(session.red_flags_triggered).toContain("unresponsive");
    expect(session.candidate_diseases).toContain("addisons_disease");
  });

  it("recovers inability-to-stand linkage for sudden gait failure", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "My dog suddenly can't walk and can barely stand."
    );

    expect(symptoms).toContain("abnormal_gait");
    expect(answers.trauma_mobility).toBe("inability_to_stand");
    expect(session.red_flags_triggered).toContain("inability_to_stand");
  });

  it("treats fainted or limp language with gray gums as a collapse emergency", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "My dog fainted, went limp, and his gums looked gray."
    );

    expect(symptoms).toContain("seizure_collapse");
    expect(answers.consciousness_level).toBe("unresponsive");
    expect(answers.gum_color).toBe("blue");
    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["unresponsive", "blue_gums"])
    );
  });

  it("captures trauma pallor and stand-failure language on the trauma emergency path", () => {
    const { symptoms, answers, session } = buildDeterministicSession(
      "My dog was hit by a car, can barely stand, and his gums look white."
    );

    expect(symptoms).toEqual(
      expect.arrayContaining(["trauma", "abnormal_gait"])
    );
    expect(answers.trauma_mobility).toBe("inability_to_stand");
    expect(answers.gum_color).toBe("pale_white");
    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["inability_to_stand", "pale_gums"])
    );
  });
});
