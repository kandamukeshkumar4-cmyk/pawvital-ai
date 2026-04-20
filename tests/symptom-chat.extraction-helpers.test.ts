import {
  extractDeterministicEmergencyRedFlags,
  extractSymptomsFromKeywords,
} from "@/lib/symptom-chat/extraction-helpers";

describe("symptom chat extraction helpers", () => {
  it("normalizes labored abdominal breathing into emergency breathing signals", () => {
    const message =
      "My dog is breathing with great effort using his belly muscles.";

    const symptoms = extractSymptomsFromKeywords(message);
    const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

    expect(symptoms).toContain("difficulty_breathing");
    expect(redFlags).toEqual(expect.arrayContaining(["breathing_difficulty"]));
  });

  it("normalizes choking foreign-body phrasing into airway emergency signals", () => {
    const message =
      "My dog is gagging and pawing at his mouth like something is stuck.";

    const symptoms = extractSymptomsFromKeywords(message);
    const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

    expect(symptoms).toContain("difficulty_breathing");
    expect(redFlags).toEqual(expect.arrayContaining(["breathing_difficulty"]));
  });

  it("normalizes oral bleeding with inability to swallow or drink into dental emergency signals", () => {
    const message =
      "There is blood coming from his mouth and he cannot really eat or drink.";

    const symptoms = extractSymptomsFromKeywords(message);
    const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

    expect(symptoms).toContain("dental_problem");
    expect(redFlags).toEqual(
      expect.arrayContaining(["blood_from_mouth", "inability_to_drink"])
    );
  });

  it("normalizes resting open-mouth breathing with bluish gums into respiratory emergency signals", () => {
    const message =
      "He is open-mouth breathing while resting and his gums are looking bluish.";

    const symptoms = extractSymptomsFromKeywords(message);
    const redFlags = extractDeterministicEmergencyRedFlags(message, symptoms);

    expect(symptoms).toContain("difficulty_breathing");
    expect(redFlags).toEqual(
      expect.arrayContaining(["breathing_distress_at_rest", "blue_gums"])
    );
  });
});
