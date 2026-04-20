import {
  extractDeterministicEmergencyRedFlags,
  extractSymptomsFromKeywords,
} from "@/lib/symptom-chat/extraction-helpers";
import { extractDeterministicAnswersForTurn } from "@/lib/symptom-chat/answer-extraction";
import { addSymptoms, createSession } from "@/lib/triage-engine";

describe("VET-1335 critical emergency normalization", () => {
  describe("postpartum eclampsia", () => {
    it("maps nursing postpartum tremors to pregnancy_birth with eclampsia signs", () => {
      const message =
        "She is nursing puppies and now she is trembling, weak, and pacing restlessly.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(symptoms).toEqual(
        expect.arrayContaining(["pregnancy_birth", "trembling"])
      );
      expect(redFlags).toContain("eclampsia_signs");
    });

    it("does not turn normal postpartum recovery into eclampsia red flags", () => {
      const message =
        "She recently had puppies and is nursing normally, eating, and walking around fine.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(symptoms).toContain("pregnancy_birth");
      expect(symptoms).not.toContain("trembling");
      expect(redFlags).not.toContain("eclampsia_signs");
    });
  });

  describe("protozoal acute weakness", () => {
    it("maps weakness with pale gums and dark urine to lethargy", () => {
      const message =
        "My dog is suddenly extremely weak, his gums are pale, and his urine is dark brown.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("lethargy");
    });

    it("does not turn a normal tick exposure into lethargy", () => {
      const message = "I found one tick on him, but he is acting normal and his gums look fine.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("lethargy");
    });

    it("does not turn post-exercise tiredness with normal gums into lethargy", () => {
      const message =
        "He seemed tired after running, but his breathing is normal and his gums are pink.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("lethargy");
    });
  });

  describe("urinary blockage", () => {
    it("maps straining with almost no urine to urination_problem and blockage red flags", () => {
      const message =
        "My male dog keeps squatting and straining but almost no urine is coming out.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(symptoms).toContain("urination_problem");
      expect(redFlags).toContain("urinary_blockage");
    });

    it("does not turn normal increased urination into a blockage signal", () => {
      const message =
        "He peed normally each time, just more often than usual, and he does not seem painful.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(redFlags).not.toContain("urinary_blockage");
    });

    it("does not turn an indoor accident without straining into a blockage signal", () => {
      const message =
        "She had a small accident indoors but was not straining, crying, or trying to pee repeatedly.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(redFlags).not.toContain("urinary_blockage");
    });
  });

  describe("vomiting blood and collapse", () => {
    it("maps 'threw up' phrasing to vomiting for the blood-collapse blocker", () => {
      const message =
        "My dog threw up a lot of blood and now he is weak and wobbly.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("vomiting");
    });

    it("extracts vomit_blood from first-turn bleeding vomit phrasing", () => {
      const session = addSymptoms(createSession(), ["vomiting"]);
      const answers = extractDeterministicAnswersForTurn(
        "My dog threw up a lot of blood and now he is weak and wobbly.",
        session
      );

      expect(answers.vomit_blood).toBe(true);
    });

    it("does not add emergency red flags for a mild one-off red-treat lookalike", () => {
      const message =
        "He threw up once after eating a red treat, but now he is alert and acting normal.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(symptoms).toContain("vomiting");
      expect(redFlags).toEqual([]);
    });

    it("does not mark red-food vomit as vomit_blood without bleeding language", () => {
      const session = addSymptoms(createSession(), ["vomiting"]);
      const answers = extractDeterministicAnswersForTurn(
        "He threw up once after eating a red treat, but now he is alert and acting normal.",
        session
      );

      expect(answers.vomit_blood).toBeUndefined();
    });
  });

  describe("green vomiting", () => {
    it('extracts "green bile" vomit content from first-turn owner language', () => {
      const session = addSymptoms(createSession(), ["vomiting"]);
      const answers = extractDeterministicAnswersForTurn(
        "My dog keeps throwing up green bile and won't eat or drink.",
        session
      );

      expect(answers.vomit_content).toBe("green bile");
    });

    it('extracts "won\'t eat or drink" as not_drinking when water intake is the active follow-up', () => {
      const session = addSymptoms(createSession(), ["vomiting"]);
      session.last_question_asked = "water_intake";

      const answers = extractDeterministicAnswersForTurn(
        "My dog keeps throwing up green bile and won't eat or drink.",
        session
      );

      expect(answers.water_intake).toBe("not_drinking");
    });

    it("does not set green bile content for a mild grass-once lookalike", () => {
      const session = addSymptoms(createSession(), ["vomiting"]);
      const answers = extractDeterministicAnswersForTurn(
        "He ate grass and vomited once, but now he is acting normal and eating again.",
        session
      );

      expect(answers.vomit_content).toBeUndefined();
    });
  });
});
