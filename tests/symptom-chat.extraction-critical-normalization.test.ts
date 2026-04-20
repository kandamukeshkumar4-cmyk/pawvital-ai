import {
  extractDeterministicEmergencyRedFlags,
  extractSymptomsFromKeywords,
} from "@/lib/symptom-chat/extraction-helpers";

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
});
