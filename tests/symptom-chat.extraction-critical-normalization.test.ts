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
});
