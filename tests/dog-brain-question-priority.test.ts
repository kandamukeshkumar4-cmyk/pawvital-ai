import { brainPrioritySymptomsFromSignals } from "@/lib/dog-brain/question-priority";
import type { DetectedSignal } from "@/lib/dog-brain/types";
import { getNextQuestionAvoidingRepeat } from "@/lib/symptom-chat/answer-coercion";
import { createSession } from "@/lib/triage-engine";
import { SYMPTOM_MAP } from "@/lib/clinical-matrix";

function signal(overrides: Partial<DetectedSignal>): DetectedSignal {
  return {
    signal_type: "stool_change",
    severity: "watch",
    owner_message: "test",
    dedupe_key: "test",
    ...overrides,
  };
}

describe("brainPrioritySymptomsFromSignals (pure mapping)", () => {
  it("maps signal types to real SYMPTOM_MAP keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "stool_change" }),
      signal({ signal_type: "vomiting_trend" }),
      signal({ signal_type: "appetite_drop" }),
      signal({ signal_type: "weight_downtrend" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "diarrhea",
        "blood_in_stool",
        "vomiting",
        "not_eating",
        "weight_loss",
      ]),
    );
    // stool_change can never mean constipation (not in the daily-log enum), so the
    // mapping must NOT surface a constipation follow-up.
    expect(keys).not.toContain("constipation");
    // Every emitted key must be a real symptom (so the selector can never invent
    // a question from Brain memory).
    for (const key of keys) {
      expect(SYMPTOM_MAP[key]).toBeDefined();
    }
  });

  it("maps the water/urination signal to drinking + urination symptom keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "water_urination_change", severity: "watch" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining(["drinking_more", "urination_problem"]),
    );
    for (const key of keys) {
      expect(SYMPTOM_MAP[key]).toBeDefined();
    }
  });

  it("maps the mobility/pain signal to limping + stiffness symptom keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "mobility_pain_change", severity: "watch" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining(["limping", "generalized_stiffness"]),
    );
    for (const key of keys) {
      expect(SYMPTOM_MAP[key]).toBeDefined();
    }
  });

  it("maps the breathing/cough signal to cough + difficulty-breathing keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "breathing_cough_change", severity: "watch" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining(["coughing", "difficulty_breathing"]),
    );
    for (const key of keys) {
      expect(SYMPTOM_MAP[key]).toBeDefined();
    }
  });

  it("maps the skin/ear signal to scratching + recurrent skin/ear keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "skin_ear_change", severity: "watch" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "excessive_scratching",
        "recurrent_skin",
        "recurrent_ear",
      ]),
    );
    for (const key of keys) {
      expect(SYMPTOM_MAP[key]).toBeDefined();
    }
  });

  it("orders higher-severity signals first and dedupes", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "appetite_drop", severity: "info" }),
      signal({ signal_type: "vomiting_trend", severity: "alert" }),
      signal({ signal_type: "vomiting_trend", severity: "watch" }),
    ]);
    expect(keys[0]).toBe("vomiting"); // alert beats info
    expect(keys.filter((k) => k === "vomiting")).toHaveLength(1); // deduped
  });

  it("returns an empty array for no signals (downstream no-op)", () => {
    expect(brainPrioritySymptomsFromSignals([])).toEqual([]);
  });

  it("contributes nothing for medication-only signals", () => {
    expect(
      brainPrioritySymptomsFromSignals([
        signal({ signal_type: "possible_med_side_effect", severity: "info" }),
      ]),
    ).toEqual([]);
  });
});

describe("getNextQuestionAvoidingRepeat — Dog Brain tiebreak", () => {
  it("(proof g) surfaces a targeted question from Brain memory the turn would not otherwise ask", () => {
    const session = createSession();
    session.known_symptoms = []; // no current complaint to drive selection
    session.answered_questions = [];

    const withoutBrain = getNextQuestionAvoidingRepeat(session, []);
    const withBrain = getNextQuestionAvoidingRepeat(session, [], ["diarrhea"]);

    // Brain memory surfaced a real, already-legal diarrhea follow-up question…
    expect(withBrain).toBeTruthy();
    expect(SYMPTOM_MAP["diarrhea"].follow_up_questions).toContain(withBrain);
    // …that the deterministic path (no symptoms) did not select on its own.
    expect(withBrain).not.toBe(withoutBrain);
  });

  it("never overrides the current turn's complaint (complaint wins over Brain)", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    session.answered_questions = [];

    const result = getNextQuestionAvoidingRepeat(session, ["vomiting"], [
      "diarrhea",
    ]);

    // The complaint (vomiting) is exhausted first; Brain ("diarrhea") is never
    // consulted, so the selected question belongs to vomiting's follow-ups.
    expect(SYMPTOM_MAP["vomiting"].follow_up_questions).toContain(result);
  });

  it("is a byte-identical no-op when Brain priority symptoms are empty", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    session.answered_questions = [];

    const legacy = getNextQuestionAvoidingRepeat(session, ["vomiting"]);
    const withEmptyBrain = getNextQuestionAvoidingRepeat(
      session,
      ["vomiting"],
      [],
    );
    expect(withEmptyBrain).toBe(legacy);
  });
});
