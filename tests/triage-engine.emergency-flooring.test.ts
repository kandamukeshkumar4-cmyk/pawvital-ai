import {
  addSymptoms,
  buildDiagnosisContext,
  createSession,
  recordAnswer,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";

const mixedBreedAdult: PetProfile = {
  name: "Scout",
  breed: "Mixed Breed",
  age_years: 4,
  weight: 42,
};

function buildSession(
  symptoms: string[],
  answers: Record<string, string | boolean | number>
): TriageSession {
  let session = createSession();
  session = addSymptoms(session, symptoms);

  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }

  return session;
}

describe("VET-1337 engine emergency flooring sentinels", () => {
  it.each([
    {
      label: "postpartum eclampsia",
      symptoms: ["pregnancy_birth", "trembling"],
      answers: { eclampsia_signs: true },
      expectedFlags: ["eclampsia_signs"],
    },
    {
      label: "protozoal/Babesia-style weakness",
      symptoms: ["lethargy"],
      answers: { gum_color: "pale_white", blood_in_urine: true },
      expectedFlags: ["pale_gums"],
    },
    {
      label: "urinary blockage",
      symptoms: ["urination_problem"],
      answers: { urinary_blockage: true },
      expectedFlags: ["urinary_blockage"],
    },
    {
      label: "vomiting blood with collapse",
      symptoms: ["vomiting"],
      answers: {
        vomit_blood: true,
        gum_color: "pale_white",
        consciousness_level: "unresponsive",
      },
      expectedFlags: ["vomit_blood"],
    },
    {
      label: "repeated green vomiting with dehydration signals",
      symptoms: ["vomiting"],
      answers: {
        vomit_frequency: "repeated",
        appetite_status: "none",
        water_intake: "not_drinking",
      },
      expectedFlags: ["vomiting_not_drinking"],
    },
    {
      label: "deep avulsion wound",
      symptoms: ["wound_skin_issue"],
      answers: { wound_deep_bleeding: true },
      expectedFlags: ["wound_deep_bleeding"],
    },
  ])("keeps $label at emergency", ({ symptoms, answers, expectedFlags }) => {
    const session = buildSession(symptoms, answers);
    const context = buildDiagnosisContext(session, mixedBreedAdult);

    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(expectedFlags)
    );
    expect(context.highest_urgency).toBe("emergency");
  });
});

describe("VET-1337 engine false-positive guardrails", () => {
  it.each([
    {
      label: "nursing dog acting normal",
      symptoms: ["pregnancy_birth"],
      answers: {
        puppies_delivered: 4,
        time_since_last_puppy: "2 days ago",
        appetite_status: "normal",
        restlessness: false,
      },
    },
    {
      label: "tick found but dog normal",
      symptoms: ["lethargy"],
      answers: {
        gum_color: "pink_normal",
        appetite_status: "normal",
        water_intake: "normal",
      },
    },
    {
      label: "increased urination without straining or no-urine signs",
      symptoms: ["urination_problem"],
      answers: {
        urination_frequency: true,
        straining_present: false,
        blood_in_urine: false,
        water_intake: "normal",
      },
    },
    {
      label: "one mild vomit with the dog bright and alert",
      symptoms: ["vomiting"],
      answers: {
        vomit_frequency: "once",
        appetite_status: "normal",
        water_intake: "normal",
      },
    },
    {
      label: "ate grass and vomited once, then acted normal",
      symptoms: ["vomiting"],
      answers: {
        vomit_frequency: "once",
        appetite_status: "normal",
        water_intake: "normal",
      },
    },
    {
      label: "small scrape without deep tissue exposure",
      symptoms: ["wound_skin_issue"],
      answers: {
        wound_size: "small scratch",
        wound_discharge: "none",
        wound_color: "pink",
      },
    },
  ])("does not emergency-floor $label", ({ symptoms, answers }) => {
    const session = buildSession(symptoms, answers);
    const context = buildDiagnosisContext(session, mixedBreedAdult);

    expect(session.red_flags_triggered).toEqual([]);
    expect(context.highest_urgency).not.toBe("emergency");
  });
});
