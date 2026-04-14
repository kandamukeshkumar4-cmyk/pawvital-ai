import {
  buildContradictionRecord,
  detectTextContradictions,
} from "@/lib/clinical/contradiction-detector";
import {
  addSymptoms,
  createSession,
  recordAnswer,
  type PetProfile,
} from "@/lib/triage-engine";

const PET: PetProfile = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

function buildInput(overrides?: {
  ownerText?: string;
  previousAnswers?: Record<string, string | boolean | number>;
  symptom?: string;
  pet?: Partial<PetProfile>;
}) {
  let session = createSession();

  if (overrides?.symptom) {
    session = addSymptoms(session, [overrides.symptom]);
  }

  for (const [questionId, value] of Object.entries(
    overrides?.previousAnswers || {}
  )) {
    session = recordAnswer(session, questionId, value);
  }

  return {
    ownerText: overrides?.ownerText || "no contradiction here",
    previousAnswers: overrides?.previousAnswers || {},
    pet: { ...PET, ...(overrides?.pet || {}) },
    session,
  };
}

describe("detectTextContradictions", () => {
  it("detects appetite_conflict from prior normal appetite and current no-appetite text", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "He isn't eating anything today.",
        previousAnswers: { appetite_status: "normal" },
      })
    );

    expect(contradictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "appetite_conflict",
          severity: "moderate",
          affectedKey: "appetite_status",
          sourcePair: [
            {
              source: "previous_answer",
              key: "appetite_status",
              value: "normal",
            },
            {
              source: "owner_text",
              key: "owner_text",
              value: "not_eating_signal",
            },
          ],
        }),
      ])
    );
  });

  it("detects energy_conflict from prior mild lethargy and severe immobility text", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "He's barely moving and will not move from his bed.",
        previousAnswers: { lethargy_severity: "mild" },
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("energy_conflict");
  });

  it("detects onset_conflict from prior gradual limping and sudden-onset text", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "It happened suddenly today out of nowhere.",
        previousAnswers: { limping_onset: "gradual" },
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("onset_conflict");
  });

  it("detects water_conflict from prior not_drinking and current normal-drinking text", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "She's still drinking fine and acting thirsty.",
        previousAnswers: { water_intake: "not_drinking" },
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("water_conflict");
  });

  it("detects gum_conflict from prior pink gums and current pale-gum text", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "His gums look pale and almost white.",
        previousAnswers: { gum_color: "pink_normal" },
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("gum_conflict");
  });

  it("detects breathing_conflict from prior normal breathing and respiratory symptom state", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "He seems okay otherwise.",
        previousAnswers: { breathing_status: "normal" },
        symptom: "difficulty_breathing",
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("breathing_conflict");
  });

  it("detects puppy_age_conflict when puppy concern is present for a dog older than one year", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "My older dog seems weak.",
        symptom: "puppy_concern",
        pet: { age_years: 3 },
      })
    );

    expect(contradictions.map((item) => item.id)).toContain("puppy_age_conflict");
  });

  it("does not flag when prior answers and owner text align", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "He's drinking fine and ate breakfast.",
        previousAnswers: {
          appetite_status: "normal",
          water_intake: "normal",
        },
      })
    );

    expect(contradictions).toEqual([]);
  });

  it("does not flag puppy_age_conflict for an actual puppy", () => {
    const contradictions = detectTextContradictions(
      buildInput({
        ownerText: "The puppy feels weak.",
        symptom: "puppy_concern",
        pet: { age_years: 0.4 },
      })
    );

    expect(contradictions).toEqual([]);
  });

  it("builds a normalized contradiction record with turn metadata", () => {
    const contradiction = detectTextContradictions(
      buildInput({
        ownerText: "His gums look pale and almost white.",
        previousAnswers: { gum_color: "pink_normal" },
      })
    )[0];

    const record = buildContradictionRecord(contradiction, 4);

    expect(record).toEqual({
      contradiction_type: "gum_conflict",
      severity: "high",
      resolution: "escalate",
      source_pair: [
        {
          source: "previous_answer",
          key: "gum_color",
          value: "pink_normal",
        },
        {
          source: "owner_text",
          key: "owner_text",
          value: "pale_gums_signal",
        },
      ],
      affected_key: "gum_color",
      turn_number: 4,
    });
  });
});
