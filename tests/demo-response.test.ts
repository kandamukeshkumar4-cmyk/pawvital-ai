import { createSession, type PetProfile } from "@/lib/triage-engine";
import { demoResponse } from "@/lib/symptom-chat/demo-response";

const PET: PetProfile = {
  name: "Mochi",
  breed: "Beagle",
  age_years: 6,
  weight: 28,
};

describe("demoResponse", () => {
  it("returns the existing demo report payload unchanged", async () => {
    const response = demoResponse("generate_report", PET);
    const payload = await response.json();

    expect(payload.type).toBe("report");
    expect(payload.report).toEqual(
      expect.objectContaining({
        severity: "high",
        recommendation: "vet_48h",
        title: "Demo Mode — Configure API Keys",
        clinical_notes: "Demo mode active.",
        actions: ["Configure API keys"],
        warning_signs: ["Any worsening"],
        vet_questions: ["Ask about breed risks"],
      })
    );
    expect(payload.report.explanation).toContain(PET.name);
  });

  it("returns the existing demo chat question payload with a fresh session", async () => {
    const response = demoResponse("chat", PET);
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "Demo mode. Add API keys for full triage. What's going on with Mochi?"
    );
    expect(payload.ready_for_report).toBe(false);
    expect(payload.session).toEqual(createSession());
  });
});
