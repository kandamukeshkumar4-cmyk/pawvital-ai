import {
  createInitialClinicalCaseState,
  serializeClinicalCaseState,
  deserializeClinicalCaseState,
  type ClinicalCaseState,
  type ClinicalSignal,
} from "@/lib/clinical-intelligence/case-state";

import {
  recordAskedQuestion,
  recordAnsweredQuestion,
  recordSkippedQuestion,
  updateRedFlagStatus,
  addClinicalSignal,
  hasQuestionBeenAskedOrAnswered,
  getUnknownCriticalSlots,
} from "@/lib/clinical-intelligence/case-state-update";

import {
  getRedFlagStatus,
  isRedFlagPositive,
  isRedFlagNegative,
  isRedFlagUnknown,
  getPositiveRedFlags,
  getUnknownRedFlags,
  hasAnyPositiveEmergencyRedFlags,
  resolveUnknownRedFlags,
  computeRedFlagSummary,
} from "@/lib/clinical-intelligence/red-flag-status";

describe("ClinicalCaseState initialization", () => {
  it("creates a valid initial state for a dog symptom case", () => {
    const state = createInitialClinicalCaseState();

    expect(state.species).toBe("dog");
    expect(state.activeComplaintModule).toBeNull();
    expect(state.explicitAnswers).toEqual({});
    expect(state.redFlagStatus).toEqual({});
    expect(state.clinicalSignals).toEqual([]);
    expect(state.concernBuckets).toEqual([]);
    expect(state.missingCriticalSlots).toEqual([]);
    expect(state.askedQuestionIds).toEqual([]);
    expect(state.answeredQuestionIds).toEqual([]);
    expect(state.skippedQuestionIds).toEqual([]);
    expect(state.currentUrgency).toBe("unknown");
    expect(state.urgencyTrajectory).toBe("unknown");
    expect(state.nextQuestionReason).toBeNull();
  });

  it("accepts an active complaint module", () => {
    const state = createInitialClinicalCaseState("gi");

    expect(state.activeComplaintModule).toBe("gi");
  });
});

describe("Question tracking", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("records an asked question", () => {
    const updated = recordAskedQuestion(state, "q1");

    expect(updated.askedQuestionIds).toContain("q1");
    expect(updated.askedQuestionIds).toHaveLength(1);
  });

  it("does not duplicate asked questions", () => {
    const once = recordAskedQuestion(state, "q1");
    const twice = recordAskedQuestion(once, "q1");

    expect(twice.askedQuestionIds).toHaveLength(1);
  });

  it("records an answered question with answer key and value", () => {
    const updated = recordAnsweredQuestion(state, "q1", "gum_color", "blue");

    expect(updated.answeredQuestionIds).toContain("q1");
    expect(updated.explicitAnswers["gum_color"]).toBe("blue");
  });

  it("does not duplicate answered questions", () => {
    const once = recordAnsweredQuestion(state, "q1", "gum_color", "blue");
    const twice = recordAnsweredQuestion(once, "q1", "gum_color", "pink");

    expect(twice.answeredQuestionIds).toHaveLength(1);
    expect(twice.explicitAnswers["gum_color"]).toBe("pink");
  });

  it("removes answered slot from missing critical slots", () => {
    const withMissing = {
      ...state,
      missingCriticalSlots: ["q1", "q2"],
    };

    const updated = recordAnsweredQuestion(withMissing, "q1", "gum_color", "pink");

    expect(updated.missingCriticalSlots).not.toContain("q1");
    expect(updated.missingCriticalSlots).toContain("q2");
  });

  it("records a skipped question", () => {
    const updated = recordSkippedQuestion(state, "q1");

    expect(updated.skippedQuestionIds).toContain("q1");
  });

  it("does not duplicate skipped questions", () => {
    const once = recordSkippedQuestion(state, "q1");
    const twice = recordSkippedQuestion(once, "q1");

    expect(twice.skippedQuestionIds).toHaveLength(1);
  });

  it("detects if a question has been asked", () => {
    const asked = recordAskedQuestion(state, "q1");

    expect(hasQuestionBeenAskedOrAnswered(asked, "q1")).toBe(true);
  });

  it("detects if a question has been answered", () => {
    const answered = recordAnsweredQuestion(state, "q1", "gum_color", "pink");

    expect(hasQuestionBeenAskedOrAnswered(answered, "q1")).toBe(true);
  });

  it("returns false for a question never asked or answered", () => {
    expect(hasQuestionBeenAskedOrAnswered(state, "q99")).toBe(false);
  });
});

describe("Red flag status", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("updates a red flag to positive and escalates urgency to emergency", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      evidenceText: "Owner reports blue gums",
      turn: 1,
    });

    expect(updated.redFlagStatus["blue_gums"].status).toBe("positive");
    expect(updated.currentUrgency).toBe("emergency");
  });

  it("updates a red flag to negative without escalating urgency", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "negative",
      source: "explicit_answer",
      turn: 1,
    });

    expect(updated.redFlagStatus["blue_gums"].status).toBe("negative");
    expect(updated.currentUrgency).toBe("unknown");
    expect(updated.urgencyTrajectory).toBe("unknown");
  });

  it("does not override a positive red flag with a negative update", () => {
    const positive = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const negated = updateRedFlagStatus(positive, "blue_gums", {
      status: "negative",
      source: "explicit_answer",
      turn: 2,
    });

    expect(negated.redFlagStatus["blue_gums"].status).toBe("positive");
  });

  it("tracks red flag source and evidence text", () => {
    const updated = updateRedFlagStatus(state, "collapse", {
      status: "positive",
      source: "clinical_signal",
      evidenceText: "AI detected collapse from owner description",
      turn: 3,
    });

    const entry = updated.redFlagStatus["collapse"];
    expect(entry.source).toBe("clinical_signal");
    expect(entry.evidenceText).toBe("AI detected collapse from owner description");
    expect(entry.updatedAtTurn).toBe(3);
  });

  it("escalates urgency trajectory to worsening when urgency increases", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(updated.urgencyTrajectory).toBe("worsening");
  });

  it("marks urgency trajectory as stable when urgency stays the same", () => {
    const first = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const second = updateRedFlagStatus(first, "collapse", {
      status: "positive",
      source: "explicit_answer",
      turn: 2,
    });

    expect(second.urgencyTrajectory).toBe("stable");
  });
});

describe("Clinical signals", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("adds a clinical signal without writing to explicitAnswers", () => {
    const signal: ClinicalSignal = {
      id: "signal_1",
      type: "behavior_change",
      severity: "medium",
      evidenceText: "Owner mentioned dog is less playful",
      turnDetected: 2,
    };

    const updated = addClinicalSignal(state, signal);

    expect(updated.clinicalSignals).toHaveLength(1);
    expect(updated.clinicalSignals[0]).toEqual(signal);
    expect(Object.keys(updated.explicitAnswers)).toHaveLength(0);
  });

  it("updates an existing clinical signal by id", () => {
    const signal1: ClinicalSignal = {
      id: "signal_1",
      type: "behavior_change",
      severity: "medium",
      evidenceText: "Initial signal",
      turnDetected: 1,
    };

    const signal2: ClinicalSignal = {
      id: "signal_1",
      type: "behavior_change",
      severity: "high",
      evidenceText: "Updated signal",
      turnDetected: 3,
    };

    const once = addClinicalSignal(state, signal1);
    const twice = addClinicalSignal(once, signal2);

    expect(twice.clinicalSignals).toHaveLength(1);
    expect(twice.clinicalSignals[0].severity).toBe("high");
    expect(twice.clinicalSignals[0].evidenceText).toBe("Updated signal");
  });

  it("keeps clinical signals separate from explicit answers", () => {
    const signal: ClinicalSignal = {
      id: "signal_gum",
      type: "gum_color_inference",
      severity: "high",
      evidenceText: "Inferred pale gums from description",
      turnDetected: 1,
    };

    const withSignal = addClinicalSignal(state, signal);
    const withAnswer = recordAnsweredQuestion(withSignal, "q1", "gum_color", "pink");

    expect(withAnswer.clinicalSignals).toHaveLength(1);
    expect(withAnswer.explicitAnswers["gum_color"]).toBe("pink");
    expect(withAnswer.clinicalSignals[0].type).toBe("gum_color_inference");
  });
});

describe("Unknown critical slots", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("returns all required slots as unknown when nothing is answered", () => {
    const required = ["q1", "q2", "q3"];

    const unknown = getUnknownCriticalSlots(state, required);

    expect(unknown).toEqual(["q1", "q2", "q3"]);
  });

  it("excludes answered slots from unknown list", () => {
    const withMissing = {
      ...state,
      missingCriticalSlots: ["q1", "q2", "q3"],
    };

    const answered = recordAnsweredQuestion(withMissing, "q1", "answer_1", "yes");
    const unknown = getUnknownCriticalSlots(answered, ["q1", "q2", "q3"]);

    expect(unknown).toEqual(["q2", "q3"]);
  });

  it("excludes skipped slots from unknown list", () => {
    const skipped = recordSkippedQuestion(state, "q2");
    const unknown = getUnknownCriticalSlots(skipped, ["q1", "q2", "q3"]);

    expect(unknown).toEqual(["q1", "q3"]);
  });

  it("excludes slots with resolved red flags from unknown list", () => {
    const withResolved = updateRedFlagStatus(state, "q2", {
      status: "negative",
      source: "explicit_answer",
      turn: 1,
    });

    const unknown = getUnknownCriticalSlots(withResolved, ["q1", "q2", "q3"]);

    expect(unknown).toEqual(["q1", "q3"]);
  });

  it("keeps slots with unknown red flags in the unknown list", () => {
    const withUnknown = updateRedFlagStatus(state, "q2", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });

    const unknown = getUnknownCriticalSlots(withUnknown, ["q1", "q2", "q3"]);

    expect(unknown).toEqual(["q1", "q2", "q3"]);
  });
});

describe("Serialization / Deserialization", () => {
  it("serializes and deserializes a state without data loss", () => {
    let state = createInitialClinicalCaseState("gi");
    state = recordAskedQuestion(state, "q1");
    state = recordAnsweredQuestion(state, "q2", "gum_color", "blue");
    state = recordSkippedQuestion(state, "q3");
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      evidenceText: "Blue gums confirmed",
      turn: 1,
    });
    state = addClinicalSignal(state, {
      id: "sig_1",
      type: "behavior_change",
      severity: "medium",
      evidenceText: "Less playful",
      turnDetected: 2,
    });
    state = {
      ...state,
      currentUrgency: "emergency",
      urgencyTrajectory: "worsening",
      nextQuestionReason: "Need to assess breathing",
    };

    const serialized = serializeClinicalCaseState(state);
    const restored = deserializeClinicalCaseState(serialized);

    expect(restored.species).toBe("dog");
    expect(restored.activeComplaintModule).toBe("gi");
    expect(restored.askedQuestionIds).toEqual(["q1"]);
    expect(restored.answeredQuestionIds).toEqual(["q2"]);
    expect(restored.skippedQuestionIds).toEqual(["q3"]);
    expect(restored.explicitAnswers["gum_color"]).toBe("blue");
    expect(restored.redFlagStatus["blue_gums"].status).toBe("positive");
    expect(restored.redFlagStatus["blue_gums"].evidenceText).toBe("Blue gums confirmed");
    expect(restored.clinicalSignals).toHaveLength(1);
    expect(restored.clinicalSignals[0].id).toBe("sig_1");
    expect(restored.currentUrgency).toBe("emergency");
    expect(restored.urgencyTrajectory).toBe("worsening");
    expect(restored.nextQuestionReason).toBe("Need to assess breathing");
  });

  it("restores empty arrays when fields are missing from serialized data", () => {
    const minimal = JSON.stringify({
      species: "dog",
    });

    const restored = deserializeClinicalCaseState(minimal);

    expect(restored.clinicalSignals).toEqual([]);
    expect(restored.concernBuckets).toEqual([]);
    expect(restored.missingCriticalSlots).toEqual([]);
    expect(restored.askedQuestionIds).toEqual([]);
    expect(restored.answeredQuestionIds).toEqual([]);
    expect(restored.skippedQuestionIds).toEqual([]);
    expect(restored.redFlagStatus).toEqual({});
    expect(restored.explicitAnswers).toEqual({});
  });

  it("throws on invalid species", () => {
    const invalid = JSON.stringify({
      species: "cat",
    });

    expect(() => deserializeClinicalCaseState(invalid)).toThrow(
      "Invalid ClinicalCaseState: species must be 'dog'"
    );
  });
});

describe("Red flag helper functions", () => {
  let state: ClinicalCaseState;

  beforeEach(() => {
    state = createInitialClinicalCaseState();
  });

  it("getRedFlagStatus returns undefined for unknown flag", () => {
    expect(getRedFlagStatus(state, "nonexistent")).toBeUndefined();
  });

  it("getRedFlagStatus returns entry after update", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const entry = getRedFlagStatus(updated, "blue_gums");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("positive");
  });

  it("isRedFlagPositive returns true only for positive flags", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(isRedFlagPositive(updated, "blue_gums")).toBe(true);
    expect(isRedFlagPositive(updated, "collapse")).toBe(false);
  });

  it("isRedFlagNegative returns true only for negative flags", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "negative",
      source: "explicit_answer",
      turn: 1,
    });

    expect(isRedFlagNegative(updated, "blue_gums")).toBe(true);
    expect(isRedFlagNegative(updated, "collapse")).toBe(false);
  });

  it("isRedFlagUnknown returns true for unset flags", () => {
    expect(isRedFlagUnknown(state, "blue_gums")).toBe(true);
  });

  it("isRedFlagUnknown returns false for resolved flags", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(isRedFlagUnknown(updated, "blue_gums")).toBe(false);
  });

  it("getPositiveRedFlags returns only positive flag ids", () => {
    let updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });
    updated = updateRedFlagStatus(updated, "collapse", {
      status: "negative",
      source: "explicit_answer",
      turn: 2,
    });
    updated = updateRedFlagStatus(updated, "seizure_activity", {
      status: "positive",
      source: "clinical_signal",
      turn: 3,
    });

    const positives = getPositiveRedFlags(updated);
    expect(positives).toContain("blue_gums");
    expect(positives).toContain("seizure_activity");
    expect(positives).not.toContain("collapse");
    expect(positives).toHaveLength(2);
  });

  it("getUnknownRedFlags returns only unknown flag ids", () => {
    let updated = updateRedFlagStatus(state, "blue_gums", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });
    updated = updateRedFlagStatus(updated, "collapse", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const unknowns = getUnknownRedFlags(updated);
    expect(unknowns).toContain("blue_gums");
    expect(unknowns).not.toContain("collapse");
  });

  it("hasAnyPositiveEmergencyRedFlags returns true when any positive flag exists", () => {
    const updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(hasAnyPositiveEmergencyRedFlags(updated)).toBe(true);
    expect(hasAnyPositiveEmergencyRedFlags(state)).toBe(false);
  });

  it("hasAnyPositiveEmergencyRedFlags ignores non-emergency positive flags", () => {
    const updated = updateRedFlagStatus(state, "localized_itching", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(hasAnyPositiveEmergencyRedFlags(updated)).toBe(false);
  });

  it("resolveUnknownRedFlags resolves unknown flags to negative", () => {
    let updated = updateRedFlagStatus(state, "blue_gums", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });
    updated = updateRedFlagStatus(updated, "collapse", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });

    const resolved = resolveUnknownRedFlags(updated, ["blue_gums"], "negative", 5);

    expect(resolved.redFlagStatus["blue_gums"].status).toBe("negative");
    expect(resolved.redFlagStatus["collapse"].status).toBe("unknown");
  });

  it("computeRedFlagSummary returns correct counts", () => {
    let updated = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });
    updated = updateRedFlagStatus(updated, "collapse", {
      status: "negative",
      source: "explicit_answer",
      turn: 2,
    });
    updated = updateRedFlagStatus(updated, "seizure_activity", {
      status: "not_sure",
      source: "clinical_signal",
      turn: 3,
    });

    const summary = computeRedFlagSummary(updated);

    expect(summary.total).toBe(3);
    expect(summary.positive).toBe(1);
    expect(summary.negative).toBe(1);
    expect(summary.unknown).toBe(0);
    expect(summary.notSure).toBe(1);
  });
});

describe("Case state after each answer", () => {
  it("state evolves correctly through a sequence of answers", () => {
    let state = createInitialClinicalCaseState("gi");

    state = recordAskedQuestion(state, "emergency_global_screen");
    expect(hasQuestionBeenAskedOrAnswered(state, "emergency_global_screen")).toBe(true);

    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");
    expect(state.answeredQuestionIds).toContain("emergency_global_screen");
    expect(state.explicitAnswers["breathing_difficulty"]).toBe("no");

    state = recordAnsweredQuestion(state, "gum_check", "gum_color", "blue");
    expect(state.explicitAnswers["gum_color"]).toBe("blue");

    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      evidenceText: "Owner confirmed blue gums",
      turn: 3,
    });

    expect(state.currentUrgency).toBe("emergency");
    expect(state.redFlagStatus["blue_gums"].status).toBe("positive");
  });
});

describe("Repeat question prevention", () => {
  it("prevents re-asking an already asked question", () => {
    let state = createInitialClinicalCaseState();
    state = recordAskedQuestion(state, "q1");

    const isAsked = hasQuestionBeenAskedOrAnswered(state, "q1");
    expect(isAsked).toBe(true);
  });

  it("prevents re-asking an already answered question", () => {
    let state = createInitialClinicalCaseState();
    state = recordAnsweredQuestion(state, "q1", "answer_key", "value");

    const isAnswered = hasQuestionBeenAskedOrAnswered(state, "q1");
    expect(isAnswered).toBe(true);
  });
});
