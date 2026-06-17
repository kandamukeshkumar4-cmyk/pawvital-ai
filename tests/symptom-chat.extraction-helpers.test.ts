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

  // P1a regression: "shaking his head" must NOT fire trembling
  it("P1a: shaking his head routes to ear_scratching, not trembling", () => {
    const message =
      "Buddy keeps shaking his head and scratching at his left ear constantly";

    const symptoms = extractSymptomsFromKeywords(message);

    expect(symptoms).toContain("ear_scratching");
    expect(symptoms).not.toContain("trembling");
  });

  it("P1a: shaking her head routes to ear_scratching, not trembling", () => {
    const symptoms = extractSymptomsFromKeywords(
      "She keeps shaking her head and pawing at her ear."
    );

    expect(symptoms).toContain("ear_scratching");
    expect(symptoms).not.toContain("trembling");
  });

  it("P1a: body trembling still routes to trembling", () => {
    const symptoms = extractSymptomsFromKeywords(
      "My dog is trembling and cannot stop shaking all over."
    );

    expect(symptoms).toContain("trembling");
  });

  // P1b regression: chocolate ingestion must bootstrap vomiting symptom track
  it("P1b: ate chocolate triggers vomiting symptom (drives toxin_exposure follow-up)", () => {
    const symptoms = extractSymptomsFromKeywords(
      "I think Daisy ate some chocolate off the counter about an hour ago"
    );

    expect(symptoms).toContain("vomiting");
  });

  it("P1b: ate dark chocolate triggers vomiting symptom", () => {
    const symptoms = extractSymptomsFromKeywords(
      "It was dark chocolate, like baking chocolate, maybe a few squares"
    );

    expect(symptoms).toContain("vomiting");
  });

  it("P1b: xylitol ingestion triggers vomiting symptom", () => {
    const symptoms = extractSymptomsFromKeywords(
      "My dog ate some sugar-free gum that contains xylitol"
    );

    expect(symptoms).toContain("vomiting");
  });
});
