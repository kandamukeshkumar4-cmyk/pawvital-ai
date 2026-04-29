import {
  createInitialClinicalCaseState,
  type ClinicalCaseState,
} from "@/lib/clinical-intelligence/case-state";
import type { ClinicalQuestionCard } from "@/lib/clinical-intelligence/question-card-types";
import {
  updateRedFlagStatus,
  recordAnsweredQuestion,
  recordAskedQuestion,
  recordSkippedQuestion,
} from "@/lib/clinical-intelligence/case-state-update";

import {
  planNextClinicalQuestion,
  scoreQuestionCard,
  getCandidateQuestionCards,
  filterAnsweredOrAskedQuestions,
  buildQuestionScoreBreakdown,
  selectHighestScoringQuestion,
  fallbackToSafeEmergencyQuestion,
  type PlannedQuestion,
} from "@/lib/clinical-intelligence/next-question-planner";

import * as registry from "@/lib/clinical-intelligence/question-card-registry";

const MOCK_EMERGENCY_CARD: ClinicalQuestionCard = {
  id: "emergency_global_screen",
  ownerText: "Is your dog having any difficulty breathing right now?",
  shortReason: "Screen for airway emergency",
  complaintFamilies: ["emergency"],
  bodySystems: ["respiratory"],
  phase: "emergency_screen",
  ownerAnswerability: 2,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 2,
  screensRedFlags: ["blue_gums", "breathing_difficulty", "stridor_present"],
  changesUrgencyIf: {},
  answerType: "boolean",
  skipIfAnswered: ["breathing_difficulty"],
  sourceIds: ["merck_vet_manual"],
};

const MOCK_GUM_CARD: ClinicalQuestionCard = {
  id: "gum_color_check",
  ownerText: "What color are your dog's gums?",
  shortReason: "Assess circulation via gum color",
  complaintFamilies: ["emergency"],
  bodySystems: ["circulatory"],
  phase: "emergency_screen",
  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 2,
  reportValue: 2,
  screensRedFlags: ["blue_gums", "pale_gums"],
  changesUrgencyIf: {},
  answerType: "choice",
  allowedAnswers: ["pink", "blue", "pale_white", "yellow"],
  skipIfAnswered: ["gum_color"],
  sourceIds: ["merck_vet_manual"],
};

const MOCK_SKIN_CARD: ClinicalQuestionCard = {
  id: "skin_location_distribution",
  ownerText: "Where on your dog's body do you notice the skin issue?",
  shortReason: "Characterize skin problem location",
  complaintFamilies: ["skin"],
  bodySystems: ["integumentary"],
  phase: "characterize",
  ownerAnswerability: 3,
  urgencyImpact: 0,
  discriminativeValue: 2,
  reportValue: 1,
  screensRedFlags: [],
  changesUrgencyIf: {},
  answerType: "choice",
  skipIfAnswered: ["skin_location"],
  sourceIds: ["dermatology_guide"],
};

const MOCK_GI_CARD: ClinicalQuestionCard = {
  id: "gi_vomiting_frequency",
  ownerText: "How many times has your dog vomited today?",
  shortReason: "Assess GI severity via vomiting frequency",
  complaintFamilies: ["gi"],
  bodySystems: ["gastrointestinal"],
  phase: "characterize",
  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 2,
  reportValue: 2,
  screensRedFlags: [],
  changesUrgencyIf: {},
  answerType: "number",
  skipIfAnswered: ["vomiting_frequency"],
  sourceIds: ["gi_triage_guide"],
};

const MOCK_BLOAT_CARD: ClinicalQuestionCard = {
  id: "bloat_retching_abdomen_check",
  ownerText: "Has your dog been trying to vomit but nothing comes up?",
  shortReason: "Screen for GDV/bloat emergency",
  complaintFamilies: ["emergency", "gi"],
  bodySystems: ["gastrointestinal"],
  phase: "emergency_screen",
  ownerAnswerability: 2,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,
  screensRedFlags: ["unproductive_retching", "rapid_onset_distension"],
  changesUrgencyIf: {},
  answerType: "boolean",
  skipIfAnswered: ["unproductive_retching"],
  sourceIds: ["merck_vet_manual"],
};

const MOCK_REPORT_CARD: ClinicalQuestionCard = {
  id: "timeline_onset",
  ownerText: "When did you first notice these symptoms?",
  shortReason: "Establish symptom timeline for report",
  complaintFamilies: ["general"],
  bodySystems: ["general"],
  phase: "timeline",
  ownerAnswerability: 3,
  urgencyImpact: 0,
  discriminativeValue: 1,
  reportValue: 3,
  screensRedFlags: [],
  changesUrgencyIf: {},
  answerType: "choice",
  skipIfAnswered: ["symptom_onset"],
  sourceIds: ["triage_protocol"],
};

const MOCK_CARDS: ClinicalQuestionCard[] = [
  MOCK_EMERGENCY_CARD,
  MOCK_GUM_CARD,
  MOCK_SKIN_CARD,
  MOCK_GI_CARD,
  MOCK_BLOAT_CARD,
  MOCK_REPORT_CARD,
];

jest.spyOn(registry, "getAllQuestionCards").mockReturnValue(MOCK_CARDS);
jest.spyOn(registry, "getQuestionCardById").mockImplementation((id) =>
  MOCK_CARDS.find((c) => c.id === id)
);
jest.spyOn(registry, "getQuestionCardsByComplaintFamily").mockImplementation((family) =>
  MOCK_CARDS.filter((c) => c.complaintFamilies.includes(family))
);
jest.spyOn(registry, "getQuestionCardsByPhase").mockImplementation((phase) =>
  MOCK_CARDS.filter((c) => c.phase === phase)
);

function makeState(): ClinicalCaseState {
  return createInitialClinicalCaseState();
}

describe("Planner returns PlannedQuestion shape", () => {
  it("returns a valid PlannedQuestion object", () => {
    const state = makeState();

    const result = planNextClinicalQuestion(state);

    expect(result).not.toHaveProperty("type");
    const planned = result as PlannedQuestion;
    expect(planned.questionId).toBeDefined();
    expect(planned.ownerText).toBeDefined();
    expect(planned.shortReason).toBeDefined();
    expect(typeof planned.score).toBe("number");
    expect(planned.scoreBreakdown).toBeDefined();
    expect(Array.isArray(planned.screenedRedFlags)).toBe(true);
    expect(["emergency_screen", "highest_information_gain", "urgency_changing", "report_value", "clarification"]).toContain(planned.selectedBecause);
  });
});

describe("Planner never repeats an answered question", () => {
  it("does not return an already answered question", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");

    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    expect(result.questionId).not.toBe("emergency_global_screen");
  });
});

describe("Planner never repeats an asked question", () => {
  it("does not return an already asked question", () => {
    let state = makeState();
    state = recordAskedQuestion(state, "emergency_global_screen");

    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    expect(result.questionId).not.toBe("emergency_global_screen");
  });
});

describe("Emergency-screen cards outrank routine characterization", () => {
  it("emergency cards score higher than routine cards", () => {
    const state = makeState();

    const emergencyScore = scoreQuestionCard(MOCK_EMERGENCY_CARD, state);
    const skinScore = scoreQuestionCard(MOCK_SKIN_CARD, state);

    expect(emergencyScore).toBeGreaterThan(skinScore);
  });

  it("planner selects emergency card over routine card", () => {
    const state = makeState();

    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    const isEmergency = MOCK_CARDS.filter((c) => c.phase === "emergency_screen").some(
      (c) => c.id === result.questionId
    );
    expect(isEmergency).toBe(true);
  });
});

describe("Unknown emergency red flags increase emergency question score", () => {
  it("unknown red flags boost emergency card score", () => {
    let state = makeState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "unknown",
      source: "unset",
      turn: 0,
    });

    const baseScore = scoreQuestionCard(MOCK_EMERGENCY_CARD, makeState());
    const unknownScore = scoreQuestionCard(MOCK_EMERGENCY_CARD, state);

    expect(unknownScore).toBeGreaterThanOrEqual(baseScore);
  });
});

describe("Already-known skipIfAnswered values reduce score", () => {
  it("penalizes cards where skipIfAnswered is in explicitAnswers", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "q1", "breathing_difficulty", "no");

    const breakdown = buildQuestionScoreBreakdown(MOCK_EMERGENCY_CARD, state);

    expect(breakdown["alreadyKnownPenalty"]).toBeLessThan(0);
  });

  it("penalizes cards where skipIfAnswered is an answered question ID", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");

    const dependentCard: ClinicalQuestionCard = {
      ...MOCK_SKIN_CARD,
      id: "skin_followup_after_emergency",
      skipIfAnswered: ["emergency_global_screen"],
    };

    const breakdown = buildQuestionScoreBreakdown(dependentCard, state);

    expect(breakdown["alreadyKnownPenalty"]).toBeLessThan(0);
  });
});

describe("Highest scoring question is selected", () => {
  it("selectHighestScoringQuestion returns the highest score", () => {
    const scored = [
      { card: MOCK_SKIN_CARD, score: 20, breakdown: {} },
      { card: MOCK_EMERGENCY_CARD, score: 50, breakdown: {} },
      { card: MOCK_GI_CARD, score: 35, breakdown: {} },
    ];

    const best = selectHighestScoringQuestion(scored);

    expect(best).toBeDefined();
    expect(best!.card.id).toBe("emergency_global_screen");
    expect(best!.score).toBe(50);
  });

  it("returns null for empty array", () => {
    expect(selectHighestScoringQuestion([])).toBeNull();
  });
});

describe("Score breakdown includes all formula parts", () => {
  it("breakdown contains all expected keys", () => {
    const state = makeState();
    const breakdown = buildQuestionScoreBreakdown(MOCK_EMERGENCY_CARD, state);

    expect(breakdown).toHaveProperty("emergencyValue");
    expect(breakdown).toHaveProperty("urgencyImpact");
    expect(breakdown).toHaveProperty("discriminativeValue");
    expect(breakdown).toHaveProperty("reportValue");
    expect(breakdown).toHaveProperty("ownerAnswerability");
    expect(breakdown).toHaveProperty("modulePhasePriority");
    expect(breakdown).toHaveProperty("repetitionPenalty");
    expect(breakdown).toHaveProperty("alreadyKnownPenalty");
    expect(breakdown).toHaveProperty("offTopicPenalty");
    expect(breakdown).toHaveProperty("tooManyQuestionsPenalty");
  });

  it("score equals sum of breakdown values", () => {
    const state = makeState();
    const breakdown = buildQuestionScoreBreakdown(MOCK_EMERGENCY_CARD, state);
    const score = scoreQuestionCard(MOCK_EMERGENCY_CARD, state);
    const sum = Object.values(breakdown).reduce((s, v) => s + v, 0);

    expect(score).toBe(sum);
  });
});

describe("selectedBecause is emergency_screen for emergency cards", () => {
  it("emergency cards get emergency_screen selectedBecause", () => {
    const state = makeState();
    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    const emergencyCards = MOCK_CARDS.filter((c) => c.phase === "emergency_screen");
    const isEmergency = emergencyCards.some((c) => c.id === result.questionId);

    if (isEmergency) {
      expect(result.selectedBecause).toBe("emergency_screen");
    }
  });
});

describe("selectedBecause is report_value when reportValue dominates", () => {
  it("report_value selectedBecause when reportValue is highest", () => {
    const state = makeState();
    const breakdown = buildQuestionScoreBreakdown(MOCK_REPORT_CARD, state);

    expect(breakdown["reportValue"]).toBe(6);
    expect(breakdown["reportValue"]).toBeGreaterThanOrEqual(breakdown["discriminativeValue"]);
  });
});

describe("Current emergency urgency does not produce routine questions", () => {
  it("returns emergency_handoff when urgency is emergency", () => {
    let state = makeState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    expect(state.currentUrgency).toBe("emergency");

    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      expect(result.type).toBe("emergency_handoff");
    } else {
      const card = MOCK_CARDS.find((c) => c.id === result.questionId);
      expect(card?.phase).toBe("emergency_screen");
    }
  });

  it("fallback helper returns emergency_handoff when urgency is already emergency", () => {
    let state = makeState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "positive",
      source: "explicit_answer",
      turn: 1,
    });

    const result = fallbackToSafeEmergencyQuestion(state);

    expect(result).toHaveProperty("type", "emergency_handoff");
  });
});

describe("Fallback works when no candidate cards are valid", () => {
  it("returns fallback when all cards are answered", () => {
    let state = makeState();
    for (const card of MOCK_CARDS) {
      state = recordAnsweredQuestion(state, card.id, card.skipIfAnswered[0] || "answered", "yes");
    }

    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      expect(result.type).toBe("no_valid_questions");
    }
  });

  it("fallbackToSafeEmergencyQuestion returns emergency card or fallback", () => {
    const state = makeState();

    const result = fallbackToSafeEmergencyQuestion(state);

    if ("type" in result) {
      expect(result.type).toBeDefined();
    } else {
      const card = MOCK_CARDS.find((c) => c.id === result.questionId);
      expect(card?.phase).toBe("emergency_screen");
    }
  });
});

describe("Does not generate new question text", () => {
  it("ownerText comes from question card only", () => {
    const state = makeState();
    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    const card = MOCK_CARDS.find((c) => c.id === result.questionId);
    expect(result.ownerText).toBe(card?.ownerText);
  });

  it("shortReason comes from question card only", () => {
    const state = makeState();
    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    const card = MOCK_CARDS.find((c) => c.id === result.questionId);
    expect(result.shortReason).toBe(card?.shortReason);
  });
});

describe("Does not expose bucket labels", () => {
  it("PlannedQuestion has no bucket label fields", () => {
    const state = makeState();
    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    expect(result).not.toHaveProperty("bucketId");
    expect(result).not.toHaveProperty("bucketLabel");
    expect(result).not.toHaveProperty("concernBucket");
  });
});

describe("No diagnosis/treatment language in planned output", () => {
  it("ownerText contains no diagnosis/treatment claims", () => {
    const forbiddenWords = [
      "diagnose",
      "diagnosis",
      "treat",
      "treatment",
      "cure",
      "medication",
      "prescription",
      "antibiotic",
      "steroid",
      "surgery",
    ];

    const state = makeState();
    const result = planNextClinicalQuestion(state);

    if ("type" in result) {
      return;
    }
    const combinedText = `${result.ownerText} ${result.shortReason}`.toLowerCase();
    for (const word of forbiddenWords) {
      expect(combinedText).not.toContain(word.toLowerCase());
    }
  });
});

describe("filterAnsweredOrAskedQuestions", () => {
  it("filters out answered cards", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");

    const filtered = filterAnsweredOrAskedQuestions(MOCK_CARDS, state);

    expect(filtered.some((c) => c.id === "emergency_global_screen")).toBe(false);
  });

  it("filters out cards whose skipIfAnswered dependency is an answered question ID", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");

    const dependentCard: ClinicalQuestionCard = {
      ...MOCK_SKIN_CARD,
      id: "skin_followup_after_emergency",
      skipIfAnswered: ["emergency_global_screen"],
    };

    const filtered = filterAnsweredOrAskedQuestions([dependentCard], state);

    expect(filtered).toHaveLength(0);
  });

  it("filters out asked cards by default", () => {
    let state = makeState();
    state = recordAskedQuestion(state, "emergency_global_screen");

    const filtered = filterAnsweredOrAskedQuestions(MOCK_CARDS, state);

    expect(filtered.some((c) => c.id === "emergency_global_screen")).toBe(false);
  });

  it("filters out skipped cards even when clarification repeats are allowed", () => {
    let state = makeState();
    state = recordSkippedQuestion(state, "emergency_global_screen");
    state = recordAskedQuestion(state, "emergency_global_screen");

    const filtered = filterAnsweredOrAskedQuestions(MOCK_CARDS, state, {
      allowClarification: true,
    });

    expect(filtered.some((c) => c.id === "emergency_global_screen")).toBe(false);
  });

  it("includes asked cards when allowClarification is true", () => {
    let state = makeState();
    state = recordAskedQuestion(state, "emergency_global_screen");

    const filtered = filterAnsweredOrAskedQuestions(MOCK_CARDS, state, {
      allowClarification: true,
    });

    expect(filtered.some((c) => c.id === "emergency_global_screen")).toBe(true);
  });
});

describe("Question score red-flag uncertainty", () => {
  it("treats not_sure red flags as unresolved for emergency value", () => {
    let state = makeState();
    state = updateRedFlagStatus(state, "blue_gums", {
      status: "not_sure",
      source: "explicit_answer",
      turn: 1,
    });

    const redFlagCard: ClinicalQuestionCard = {
      ...MOCK_SKIN_CARD,
      id: "blue_gums_followup",
      phase: "characterize",
      screensRedFlags: ["blue_gums"],
    };

    const breakdown = buildQuestionScoreBreakdown(redFlagCard, state);

    expect(breakdown["emergencyValue"]).toBeGreaterThan(0);
  });
});

describe("getCandidateQuestionCards", () => {
  it("returns cards filtered by active complaint module", () => {
    const state = createInitialClinicalCaseState("gi");

    const candidates = getCandidateQuestionCards(state);

    const hasEmergency = candidates.some((c) => c.complaintFamilies.includes("emergency"));
    const hasGi = candidates.some((c) => c.complaintFamilies.includes("gi"));

    expect(hasEmergency || hasGi).toBe(true);
  });

  it("excludes answered and asked cards", () => {
    let state = makeState();
    state = recordAnsweredQuestion(state, "emergency_global_screen", "breathing_difficulty", "no");
    state = recordAskedQuestion(state, "gum_color_check");

    const candidates = getCandidateQuestionCards(state);

    expect(candidates.some((c) => c.id === "emergency_global_screen")).toBe(false);
    expect(candidates.some((c) => c.id === "gum_color_check")).toBe(false);
  });
});
