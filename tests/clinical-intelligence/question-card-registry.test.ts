import {
  getAllQuestionCards,
  getQuestionCardById,
  getQuestionCardsByComplaintFamily,
  getQuestionCardsByPhase,
  validateRegistry,
} from "@/lib/clinical-intelligence/question-card-registry";

describe("question card registry", () => {
  it("exports all cards without duplicate ids", () => {
    const cards = getAllQuestionCards();
    const ids = cards.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
    expect(cards.length).toBeGreaterThanOrEqual(19);
  });

  it("retrieves a card safely by id", () => {
    const card = getQuestionCardById("emergency_global_screen");

    expect(card).toBeDefined();
    expect(card?.id).toBe("emergency_global_screen");
    expect(card?.ownerText).toBeTruthy();
  });

  it("returns defensive clones so callers cannot mutate registry state", () => {
    const first = getQuestionCardById("gum_color_check");
    expect(first).toBeDefined();

    if (!first) {
      throw new Error("Expected gum_color_check to exist");
    }

    first.ownerText = "mutated";
    first.complaintFamilies.push("mutated_family");

    const second = getQuestionCardById("gum_color_check");
    expect(second?.ownerText).not.toBe("mutated");
    expect(second?.complaintFamilies).not.toContain("mutated_family");
  });

  it("returns undefined for unknown id", () => {
    expect(getQuestionCardById("nonexistent_card")).toBeUndefined();
  });

  it("filters cards by complaint family", () => {
    const emergencyCards = getQuestionCardsByComplaintFamily("emergency");

    expect(emergencyCards.length).toBeGreaterThan(0);
    expect(
      emergencyCards.every((c) => c.complaintFamilies.includes("emergency"))
    ).toBe(true);
  });

  it("filters cards by phase", () => {
    const screenCards = getQuestionCardsByPhase("emergency_screen");

    expect(screenCards.length).toBeGreaterThan(0);
    expect(screenCards.every((c) => c.phase === "emergency_screen")).toBe(true);
  });

  it("every card has ownerText", () => {
    const cards = getAllQuestionCards();

    for (const card of cards) {
      expect(card.ownerText).toBeTruthy();
    }
  });

  it("every card has shortReason", () => {
    const cards = getAllQuestionCards();

    for (const card of cards) {
      expect(card.shortReason).toBeTruthy();
    }
  });

  it("every emergency card has urgencyImpact = 3", () => {
    const cards = getAllQuestionCards();
    const emergencyCards = cards.filter((c) => c.phase === "emergency_screen");

    expect(emergencyCards.length).toBeGreaterThan(0);

    for (const card of emergencyCards) {
      expect(card.urgencyImpact).toBe(3);
    }
  });

  it("every card has ownerAnswerability >= 2 unless documented in safetyNotes", () => {
    const cards = getAllQuestionCards();

    for (const card of cards) {
      if (card.ownerAnswerability < 2) {
        const hasSafetyNote =
          Array.isArray(card.safetyNotes) && card.safetyNotes.length > 0;
        expect(hasSafetyNote).toBe(true);
      }
    }
  });

  it("every card has skipIfAnswered", () => {
    const cards = getAllQuestionCards();

    for (const card of cards) {
      expect(Array.isArray(card.skipIfAnswered)).toBe(true);
    }
  });

  it("every card has sourceIds", () => {
    const cards = getAllQuestionCards();

    for (const card of cards) {
      expect(Array.isArray(card.sourceIds)).toBe(true);
      expect(card.sourceIds.length).toBeGreaterThan(0);
    }
  });

  it("every choice card has allowedAnswers", () => {
    const cards = getAllQuestionCards();
    const choiceCards = cards.filter((card) => card.answerType === "choice");

    expect(choiceCards.length).toBeGreaterThan(0);

    for (const card of choiceCards) {
      expect(Array.isArray(card.allowedAnswers)).toBe(true);
      expect(card.allowedAnswers.length).toBeGreaterThan(0);
    }
  });

  it("no card contains diagnosis or treatment claims", () => {
    const { diagnosisTreatmentClaims } = validateRegistry();

    expect(diagnosisTreatmentClaims).toEqual([]);
  });

  it("registry validation passes all checks", () => {
    const result = validateRegistry();

    expect(result.valid).toBe(true);
    expect(result.duplicateIds).toEqual([]);
    expect(result.missingOwnerText).toEqual([]);
    expect(result.missingShortReason).toEqual([]);
    expect(result.missingSkipIfAnswered).toEqual([]);
    expect(result.missingSourceIds).toEqual([]);
    expect(result.choiceCardsMissingAllowedAnswers).toEqual([]);
    expect(result.lowOwnerAnswerabilityWithoutSafetyNote).toEqual([]);
    expect(result.emergencyCardsWithLowUrgency).toEqual([]);
    expect(result.diagnosisTreatmentClaims).toEqual([]);
  });
});
