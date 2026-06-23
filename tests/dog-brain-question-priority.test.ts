import {
  brainPrioritySymptomsFromSignals,
  brainPrioritySymptomEvidence,
} from "@/lib/dog-brain/question-priority";
import type { DetectedSignal } from "@/lib/dog-brain/types";
import {
  getNextQuestionAvoidingRepeat,
  getNextQuestionWithSource,
  getNextQuestionForPreferredSymptoms,
  deriveBrainQuestionTrace,
} from "@/lib/symptom-chat/answer-coercion";
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

  it("maps the energy/behavior signal to lethargy + behavior-change keys", () => {
    const keys = brainPrioritySymptomsFromSignals([
      signal({ signal_type: "energy_behavior_change", severity: "watch" }),
    ]);
    expect(keys).toEqual(
      expect.arrayContaining(["lethargy", "behavior_change"]),
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

describe("brainPrioritySymptomEvidence (owner-friendly, non-diagnostic)", () => {
  it("maps each priority symptom key to its source signal_type + summary", () => {
    const evidence = brainPrioritySymptomEvidence([
      signal({
        signal_type: "stool_change",
        severity: "watch",
        owner_message: "The latest log shows a stool change.",
        dedupe_key: "stool_change:2026-06-10",
      }),
    ]);

    // The mapped keys (diarrhea, blood_in_stool) each reference the same signal.
    expect(evidence["diarrhea"]?.signal_type).toBe("stool_change");
    expect(evidence["blood_in_stool"]?.signal_type).toBe("stool_change");
    expect(evidence["diarrhea"]?.evidence_summary).toBe(
      "The latest log shows a stool change.",
    );
    // Owner-friendly: no disease names / diagnosis language.
    expect(evidence["diarrhea"]?.evidence_summary).not.toMatch(
      /diagnos|disease|cancer|infection/i,
    );
  });

  it("derives a relative date phrase only when a date is reliable", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const evidence = brainPrioritySymptomEvidence(
      [
        signal({
          signal_type: "vomiting_trend",
          severity: "watch",
          owner_message: "Vomiting was reported 3 times.",
          dedupe_key: "vomiting_trend:2026-06-13",
        }),
      ],
      now,
    );
    expect(evidence["vomiting"]?.evidence_date_range).toBe("about 2 days ago");
  });

  it("omits the date when the dedupe_key has no parseable date", () => {
    const evidence = brainPrioritySymptomEvidence([
      signal({
        signal_type: "appetite_drop",
        severity: "watch",
        owner_message: "Appetite was down recently.",
        dedupe_key: "appetite_drop:unknown",
      }),
    ]);
    expect(evidence["not_eating"]).toBeDefined();
    expect(evidence["not_eating"]?.evidence_date_range).toBeUndefined();
  });

  it("is empty for no signals and for unmapped (medication) signals", () => {
    expect(brainPrioritySymptomEvidence([])).toEqual({});
    expect(
      brainPrioritySymptomEvidence([
        signal({ signal_type: "possible_med_side_effect", severity: "info" }),
      ]),
    ).toEqual({});
  });

  it("highest-severity signal wins when two signals map to the same key", () => {
    const evidence = brainPrioritySymptomEvidence([
      signal({
        signal_type: "vomiting_trend",
        severity: "info",
        owner_message: "low severity message",
        dedupe_key: "vomiting_trend:2026-06-01",
      }),
      signal({
        signal_type: "vomiting_trend",
        severity: "alert",
        owner_message: "high severity message",
        dedupe_key: "vomiting_trend:2026-06-10",
      }),
    ]);
    expect(evidence["vomiting"]?.evidence_summary).toBe("high severity message");
  });
});

describe("deriveBrainQuestionTrace (explanation-only)", () => {
  function brainSession() {
    const session = createSession();
    session.known_symptoms = []; // no current complaint
    session.answered_questions = [];
    return session;
  }

  it("(proof 1+2) returns a trace referencing the correct signal_type when Brain drove the question", () => {
    const session = brainSession();
    const evidenceMap = brainPrioritySymptomEvidence([
      signal({
        signal_type: "stool_change",
        severity: "watch",
        owner_message: "The latest log shows a stool change.",
        dedupe_key: "stool_change:2026-06-10",
      }),
    ]);
    const selected = getNextQuestionForPreferredSymptoms(session, ["diarrhea"]);
    expect(selected).toBeTruthy();

    const trace = deriveBrainQuestionTrace(
      "brain", // selector reported Brain memory drove it
      ["diarrhea"], // brain branch
      evidenceMap,
      selected,
    );

    expect(trace).not.toBeNull();
    expect(trace?.source).toBe("dog_brain");
    expect(trace?.signal_type).toBe("stool_change");
    expect(trace?.selected_symptom_key).toBe("diarrhea");
    expect(trace?.selected_question_id).toBe(selected);
    expect(trace?.safety_note).toMatch(/not a diagnosis/i);
  });

  it("(proof 3) returns null when Brain memory is empty (no evidence)", () => {
    const session = brainSession();
    const selected = getNextQuestionForPreferredSymptoms(session, ["diarrhea"]);
    expect(
      deriveBrainQuestionTrace("brain", ["diarrhea"], {}, selected),
    ).toBeNull();
    expect(
      deriveBrainQuestionTrace("brain", [], {}, selected),
    ).toBeNull();
  });

  it("(proof 4) returns null when the current complaint drove the question", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    session.answered_questions = [];

    // Complaint = vomiting; the selected question belongs to vomiting's follow-ups.
    const selected = getNextQuestionForPreferredSymptoms(session, ["vomiting"]);
    expect(selected).toBeTruthy();

    const evidenceMap = brainPrioritySymptomEvidence([
      signal({
        signal_type: "vomiting_trend",
        severity: "watch",
        owner_message: "Vomiting was reported 3 times.",
        dedupe_key: "vomiting_trend:2026-06-10",
      }),
    ]);

    // Even though Brain also maps to "vomiting", the complaint produced this
    // question first — the selector reports source="complaint" → no Brain trace.
    const trace = deriveBrainQuestionTrace(
      "complaint",
      ["vomiting"],
      evidenceMap,
      selected,
    );
    expect(trace).toBeNull();
  });

  it("(proof 7) returns null (no throw) for an unmapped symptom key with no evidence", () => {
    const session = brainSession();
    const selected = getNextQuestionForPreferredSymptoms(session, ["diarrhea"]);
    // Evidence map references a DIFFERENT key than the one that produced the
    // question — unknown/unmapped ⇒ safe no-op.
    const trace = deriveBrainQuestionTrace(
      "brain",
      ["diarrhea"],
      { vomiting: { signal_type: "vomiting_trend", evidence_summary: "x" } },
      selected,
    );
    expect(trace).toBeNull();
  });

  it("returns null for a null selected question id", () => {
    expect(
      deriveBrainQuestionTrace("brain", ["diarrhea"], {}, null),
    ).toBeNull();
  });

  it("returns null when the selector reports a non-brain source", () => {
    const session = brainSession();
    const evidenceMap = brainPrioritySymptomEvidence([
      signal({
        signal_type: "stool_change",
        severity: "watch",
        owner_message: "stool change",
        dedupe_key: "stool_change:2026-06-10",
      }),
    ]);
    const selected = getNextQuestionForPreferredSymptoms(session, ["diarrhea"]);
    // Same inputs that would yield a trace under source="brain"…
    expect(
      deriveBrainQuestionTrace("brain", ["diarrhea"], evidenceMap, selected),
    ).not.toBeNull();
    // …produce nothing when the fallback (not Brain) drove the question.
    expect(
      deriveBrainQuestionTrace("fallback", ["diarrhea"], evidenceMap, selected),
    ).toBeNull();
  });
});

describe("getNextQuestionWithSource (selection + branch attribution)", () => {
  it("reports source='complaint' when the current complaint drives the question", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    session.answered_questions = [];
    const { questionId, source } = getNextQuestionWithSource(
      session,
      ["vomiting"],
      ["diarrhea"],
    );
    expect(questionId).toBeTruthy();
    expect(source).toBe("complaint");
  });

  it("reports source='brain' when only Brain memory surfaces a question", () => {
    const session = createSession();
    session.known_symptoms = [];
    session.answered_questions = [];
    const { questionId, source } = getNextQuestionWithSource(
      session,
      [], // no current complaint
      ["diarrhea"], // brain memory
    );
    expect(questionId).toBeTruthy();
    expect(source).toBe("brain");
  });

  it("never reports 'brain' when Brain memory is empty", () => {
    const session = createSession();
    session.known_symptoms = [];
    session.answered_questions = [];
    expect(getNextQuestionWithSource(session, [], []).source).not.toBe("brain");
  });

  it("selects the SAME question id as getNextQuestionAvoidingRepeat (no selection change)", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    session.answered_questions = [];
    expect(
      getNextQuestionWithSource(session, ["vomiting"], ["diarrhea"]).questionId,
    ).toBe(getNextQuestionAvoidingRepeat(session, ["vomiting"], ["diarrhea"]));
  });

  it("preserves selection and still attributes a source on a repeat-avoidance swap", () => {
    const session = createSession();
    session.known_symptoms = ["vomiting"];
    const firstPick = getNextQuestionForPreferredSymptoms(session, ["vomiting"]);
    expect(firstPick).toBeTruthy();
    // Force the swap: the first pick was just asked and already answered.
    session.last_question_asked = firstPick as string;
    session.answered_questions = [firstPick as string];
    const result = getNextQuestionWithSource(session, ["vomiting"], ["diarrhea"]);
    // Selection stays identical to the legacy selector on the same turn.
    expect(result.questionId).toBe(
      getNextQuestionAvoidingRepeat(session, ["vomiting"], ["diarrhea"]),
    );
    // A source is always attributed so the trace logic is never silently skipped.
    expect(["complaint", "brain", "fallback", null]).toContain(result.source);
  });
});
