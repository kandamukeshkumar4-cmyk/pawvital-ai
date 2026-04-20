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

    it("keeps postpartum bleeding language on the pregnancy_birth complaint family", () => {
      const message =
        "My dog gave birth a few hours ago and now she is bleeding a lot and seems weak.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("pregnancy_birth");
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

  describe("deep avulsion wound", () => {
    it("maps exposed tissue owner language to wound_skin_issue and wound_tissue_exposed", () => {
      const message =
        "My dog has a large flap of skin hanging off his shoulder from a fence incident.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(symptoms).toContain("wound_skin_issue");
      expect(redFlags).toContain("wound_tissue_exposed");
    });

    it("does not mark a superficial scrape as tissue-exposed", () => {
      const message =
        "My dog has a small superficial scrape, the bleeding stopped quickly, and he is acting normal.";

      const symptoms = extractSymptomsFromKeywords(message);
      const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

      expect(redFlags).not.toContain("wound_tissue_exposed");
      expect(redFlags).not.toContain("wound_deep_bleeding");
      expect(symptoms).toContain("wound_skin_issue");
    });
  });

  describe("release-gate residual symptom families", () => {
    it("maps collapse with pale gums to lethargy for shock-pattern routing", () => {
      const message = "He suddenly collapsed and his gums are very pale.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toEqual(
        expect.arrayContaining(["seizure_collapse", "lethargy"])
      );
    });

    it("does not add lethargy for collapse without pale-gum or weakness language", () => {
      const message = "He collapsed briefly after chasing a ball but his gums stayed pink.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("seizure_collapse");
      expect(symptoms).not.toContain("lethargy");
    });

    it("maps foul vaginal discharge wording to vaginal_discharge", () => {
      const message =
        "My unspayed dog is lethargic, drinking a lot, and has foul vaginal discharge.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("vaginal_discharge");
    });

    it("does not invent vaginal_discharge when discharge is explicitly absent", () => {
      const message =
        "She is drinking more than usual, but there is no discharge from her vulva.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("vaginal_discharge");
    });

    it("maps rat poison exposure wording to medication_reaction", () => {
      const message =
        "My dog may have eaten rat poison and now there is blood on his gums and he seems weak.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("medication_reaction");
    });

    it("does not add medication_reaction when rat poison is explicitly denied", () => {
      const message =
        "There was no rat poison involved, he just scraped his gum chewing a toy.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("medication_reaction");
    });

    it("maps vaccine swelling and hives language to post_vaccination_reaction", () => {
      const message =
        "A few hours after his shots my dog's face puffed up and he broke out in hives.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("post_vaccination_reaction");
    });

    it("does not add post_vaccination_reaction for mild post-shot tiredness alone", () => {
      const message =
        "He had his shots yesterday and is a little sleepy, but there is no swelling or hives.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("post_vaccination_reaction");
    });

    it("maps chemical cleaner burn wording to wound_skin_issue", () => {
      const message =
        "My dog stepped in drain cleaner and now his paw pads are red, blistered, and peeling.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).toContain("wound_skin_issue");
    });

    it("does not add wound_skin_issue when cleaner exposure has no skin injury wording", () => {
      const message =
        "He stepped near a cleaner spill, but his paw pads look normal and intact afterward.";

      const symptoms = extractSymptomsFromKeywords(message);

      expect(symptoms).not.toContain("wound_skin_issue");
    });
  });
});
