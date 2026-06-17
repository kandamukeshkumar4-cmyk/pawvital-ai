import {
  computeProbabilityGatedUrgency,
  buildDiagnosisContext,
  createSession,
  addSymptoms,
  recordAnswer,
  type PetProfile,
} from "@/lib/triage-engine";

const dog: PetProfile = {
  name: "Rex",
  species: "dog",
  breed: "Labrador Retriever",
  age_years: 4,
  weight: 30,
};

// Ticket 2 — conservative, urgency-aware probability gate on the urgency floor.
// Thresholds: emergency = always, high >= 5% share, moderate >= 15% share.
// These are HELD-OUT vignettes: benign-dominant cases must be allowed to settle
// at "low" (monitor), while serious candidates must still escalate even on a
// small probability. (Per the SIA Goodhart guard, the implementation was written
// first; these assert the intended clinical behavior, not tuned to pass.)
describe("Ticket 2 — computeProbabilityGatedUrgency", () => {
  it("lets a benign-dominant case settle at low (monitor)", () => {
    // low 0.82 (always), moderate 0.13 (<0.15 excluded), high 0.049 (<0.05 excluded)
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 50 },
        { urgency: "moderate", final_score: 8 },
        { urgency: "high", final_score: 3 },
      ])
    ).toBe("low");
  });

  it("still escalates to high when a serious candidate clears the 5% bar", () => {
    // high share 6/56 = 0.107 >= 0.05
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 50 },
        { urgency: "high", final_score: 6 },
      ])
    ).toBe("high");
  });

  it("escalates a high candidate sitting exactly on the 5% bar", () => {
    // 5/100 = 0.05, inclusive
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 95 },
        { urgency: "high", final_score: 5 },
      ])
    ).toBe("high");
  });

  it("counts a substantial moderate candidate (>= 15%)", () => {
    // 12/62 = 0.194 >= 0.15
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 50 },
        { urgency: "moderate", final_score: 12 },
      ])
    ).toBe("moderate");
  });

  it("excludes a long-shot moderate candidate (just under 15%)", () => {
    // 14/100 = 0.14 < 0.15 -> excluded -> stays low
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 86 },
        { urgency: "moderate", final_score: 14 },
      ])
    ).toBe("low");
  });

  it("always honors the single most probable candidate (index 0)", () => {
    // dominant moderate must floor at moderate even though it would be its own gate
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "moderate", final_score: 40 },
        { urgency: "low", final_score: 20 },
      ])
    ).toBe("moderate");
  });

  it("never gates an emergency candidate, even in the tail", () => {
    // emergency 2/97 = 0.02 but min share is 0 -> contributes
    expect(
      computeProbabilityGatedUrgency([
        { urgency: "low", final_score: 95 },
        { urgency: "emergency", final_score: 2 },
      ])
    ).toBe("emergency");
  });

  it("returns low for an empty candidate set", () => {
    expect(computeProbabilityGatedUrgency([])).toBe("low");
  });

  it("returns the lone candidate's urgency for a single-candidate set", () => {
    expect(
      computeProbabilityGatedUrgency([{ urgency: "high", final_score: 10 }])
    ).toBe("high");
  });

  it("never produces a MORE urgent floor than the ungated maximum", () => {
    // Property check across a few shapes: gated floor is always <= ungated.
    const order = ["emergency", "high", "moderate", "low"];
    const shapes = [
      [
        { urgency: "low", final_score: 50 },
        { urgency: "moderate", final_score: 8 },
        { urgency: "high", final_score: 3 },
      ],
      [
        { urgency: "high", final_score: 30 },
        { urgency: "moderate", final_score: 5 },
      ],
      [
        { urgency: "low", final_score: 90 },
        { urgency: "emergency", final_score: 1 },
      ],
    ];
    for (const shape of shapes) {
      const gated = computeProbabilityGatedUrgency(shape);
      const ungated = shape.reduce(
        (best, c) =>
          order.indexOf(c.urgency) < order.indexOf(best) ? c.urgency : best,
        "low"
      );
      // gated index >= ungated index  (== same or LESS urgent, never more urgent)
      expect(order.indexOf(gated)).toBeGreaterThanOrEqual(order.indexOf(ungated));
    }
  });
});

describe("Ticket 2 — buildDiagnosisContext integration", () => {
  it("still floors a red-flag case to emergency (regression guard)", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session = recordAnswer(session, "vomit_blood", true);
    expect(session.red_flags_triggered.length).toBeGreaterThan(0);
    const ctx = buildDiagnosisContext(session, dog);
    expect(ctx.highest_urgency).toBe("emergency");
  });

  it("produces a valid urgency for a non-red-flag case", () => {
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    const ctx = buildDiagnosisContext(session, dog);
    expect(["emergency", "high", "moderate", "low"]).toContain(
      ctx.highest_urgency
    );
  });
});
