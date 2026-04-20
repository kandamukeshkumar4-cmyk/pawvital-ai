import { DISEASE_DB, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import { addSymptoms, createSession, recordAnswer } from "@/lib/triage-engine";

function buildSyntheticSession(
  symptoms: string[],
  answers: Record<string, string | boolean | number>
) {
  let session = addSymptoms(createSession(), symptoms);

  for (const [questionId, value] of Object.entries(answers)) {
    session = recordAnswer(session, questionId, value);
  }

  return session;
}

describe("VET-1336 matrix reachability regressions", () => {
  it("keeps postpartum eclampsia on an emergency reproductive-neurologic path", () => {
    const session = buildSyntheticSession(
      ["pregnancy_birth", "trembling"],
      {
        eclampsia_signs: true,
        restlessness: true,
      }
    );

    expect(session.known_symptoms).toEqual(
      expect.arrayContaining(["pregnancy_birth", "trembling"])
    );
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["eclampsia", "metritis"])
    );
    expect(SYMPTOM_MAP.pregnancy_birth.red_flags).toContain("eclampsia_signs");
    expect(session.red_flags_triggered).toContain("eclampsia_signs");
    expect(DISEASE_DB.eclampsia.urgency).toBe("emergency");
    expect(session.body_systems_involved).toEqual(
      expect.arrayContaining(["reproductive", "neurologic", "systemic"])
    );
  });

  it("surfaces Babesia-style hemolytic weakness as a lethargy must-not-miss path", () => {
    const session = buildSyntheticSession(["lethargy"], {
      gum_color: "pale_white",
    });

    expect(session.known_symptoms).toContain("lethargy");
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["babesiosis", "imha", "coagulopathy"])
    );
    expect(SYMPTOM_MAP.lethargy.red_flags).toContain("pale_gums");
    expect(session.red_flags_triggered).toContain("pale_gums");
    expect(DISEASE_DB.babesiosis.urgency).toBe("emergency");
    expect(session.body_systems_involved).toContain("systemic");
  });

  it("keeps urinary blockage alias evidence wired to the emergency obstruction family", () => {
    const session = buildSyntheticSession(["urination_problem"], {
      male_unable_to_urinate: true,
    });

    expect(session.known_symptoms).toContain("urination_problem");
    expect(session.candidate_diseases).toContain("urethral_obstruction");
    expect(SYMPTOM_MAP.urination_problem.red_flags).toEqual(
      expect.arrayContaining([
        "urinary_blockage",
        "straining_no_urine",
        "male_unable_to_urinate",
      ])
    );
    expect(session.red_flags_triggered).toContain("male_unable_to_urinate");
    expect(DISEASE_DB.urethral_obstruction.urgency).toBe("emergency");
    expect(session.body_systems_involved).toEqual(
      expect.arrayContaining(["renal", "reproductive"])
    );
  });

  it("keeps vomiting blood with shock signals on an emergency GI-bleeding path", () => {
    const session = buildSyntheticSession(["vomiting"], {
      vomit_blood: true,
      gum_color: "pale_white",
    });

    expect(session.known_symptoms).toContain("vomiting");
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["coagulopathy", "foreign_body", "toxin_ingestion"])
    );
    expect(SYMPTOM_MAP.vomiting.follow_up_questions).toEqual(
      expect.arrayContaining(["vomit_blood", "vomit_content"])
    );
    expect(session.red_flags_triggered).toEqual(
      expect.arrayContaining(["vomit_blood", "pale_gums"])
    );
    expect(DISEASE_DB.coagulopathy.urgency).toBe("emergency");
    expect(session.body_systems_involved).toContain("gastrointestinal");
  });

  it("keeps repeated green vomiting on a dehydration-sensitive emergency GI path", () => {
    const session = buildSyntheticSession(["vomiting"], {
      vomit_content: "green bile",
      water_intake: "not_drinking",
    });

    expect(session.known_symptoms).toContain("vomiting");
    expect(session.candidate_diseases).toEqual(
      expect.arrayContaining(["foreign_body", "gdv", "toxin_ingestion"])
    );
    expect(SYMPTOM_MAP.vomiting.follow_up_questions).toContain("vomit_content");
    expect(SYMPTOM_MAP.vomiting.red_flags).toContain("not_drinking");
    expect(session.red_flags_triggered).toContain("not_drinking");
    expect(DISEASE_DB.foreign_body.urgency).toBe("emergency");
    expect(session.body_systems_involved).toContain("gastrointestinal");
  });

  it("surfaces deep avulsion wounds as a wound-family emergency must-not-miss", () => {
    const session = buildSyntheticSession(["wound_skin_issue"], {
      wound_tissue_exposed: true,
    });

    expect(session.known_symptoms).toContain("wound_skin_issue");
    expect(session.candidate_diseases).toContain("laceration");
    expect(SYMPTOM_MAP.wound_skin_issue.red_flags).toEqual(
      expect.arrayContaining(["wound_tissue_exposed", "wound_bone_visible"])
    );
    expect(session.red_flags_triggered).toContain("wound_tissue_exposed");
    expect(DISEASE_DB.laceration.urgency).toBe("high");
    expect(session.body_systems_involved).toEqual(
      expect.arrayContaining(["dermatologic", "musculoskeletal"])
    );
  });
});
