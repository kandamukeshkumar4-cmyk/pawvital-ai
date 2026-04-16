const mockPhraseWithLlama = jest.fn();
const mockReviewQuestionPlanWithNemotron = jest.fn();
const mockVerifyQuestionWithNemotron = jest.fn();

jest.mock("@/lib/nvidia-models", () => ({
  isNvidiaConfigured: jest.fn(() => true),
  phraseWithLlama: (...args: unknown[]) => mockPhraseWithLlama(...args),
  reviewQuestionPlanWithNemotron: (...args: unknown[]) =>
    mockReviewQuestionPlanWithNemotron(...args),
  verifyQuestionWithNemotron: (...args: unknown[]) =>
    mockVerifyQuestionWithNemotron(...args),
}));

jest.mock("@/lib/clinical-matrix", () => ({
  FOLLOW_UP_QUESTIONS: {
    water_intake: {
      data_type: "choice",
    },
  },
}));

jest.mock("@/lib/symptom-memory", () => ({
  buildCaseMemorySnapshot: jest.fn(() => "MEMORY SNAPSHOT"),
}));

jest.mock("@/lib/symptom-chat/extraction-helpers", () => {
  const actual = jest.requireActual("@/lib/symptom-chat/extraction-helpers");
  return {
    ...actual,
    buildConfirmedQASummary: jest.fn(() => "water intake: less than usual"),
    buildDeterministicQuestionFallback: jest.fn(
      () => "Since this could still be important, is she drinking less than usual?"
    ),
  };
});

import { createSession, type PetProfile } from "@/lib/triage-engine";
import {
  gateQuestionBeforePhrasing,
  phraseQuestion,
  sanitizeQuestionDraft,
} from "@/lib/symptom-chat/question-phrasing";

const pet: PetProfile = {
  name: "Mochi",
  breed: "Beagle",
  age_years: 6,
  weight: 28,
};

const messages = [
  { role: "assistant" as const, content: "What has changed?" },
  { role: "user" as const, content: "She is drinking less than usual." },
];

describe("question phrasing helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("falls back when photo language is not allowed in the draft", () => {
    const fallback = "Fallback question?";
    const result = sanitizeQuestionDraft(
      "From the photo, what has changed?",
      fallback,
      false
    );

    expect(result).toBe(fallback);
  });

  it("keeps deterministic fallback gating but strips image context when no photo was analyzed", async () => {
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({
        include_image_context: true,
        use_deterministic_fallback: true,
        reason: "ambiguous turn",
      })
    );

    const decision = await gateQuestionBeforePhrasing(
      "water_intake",
      "Is she drinking less than usual?",
      createSession(),
      pet,
      messages,
      "She seems off today.",
      "Image context is available.",
      false
    );

    expect(decision.includeImageContext).toBe(false);
    expect(decision.useDeterministicFallback).toBe(true);
    expect(decision.reason).toBe("ambiguous turn");
  });

  it("returns the deterministic fallback immediately when forced", async () => {
    const result = await phraseQuestion(
      "Is she drinking less than usual?",
      "water_intake",
      createSession(),
      pet,
      messages,
      "She is drinking less than usual.",
      null,
      false,
      false,
      true
    );

    expect(result).toBe(
      "Since this could still be important, is she drinking less than usual?"
    );
    expect(mockPhraseWithLlama).not.toHaveBeenCalled();
    expect(mockVerifyQuestionWithNemotron).not.toHaveBeenCalled();
  });

  it("falls back when Nemotron verification reintroduces banned photo wording", async () => {
    const session = createSession();
    mockPhraseWithLlama.mockResolvedValue(
      "Since Mochi has been drinking less than usual, is she drinking less than usual?"
    );
    mockVerifyQuestionWithNemotron.mockResolvedValue(
      JSON.stringify({
        message:
          "From the photo, since Mochi has been drinking less than usual, is she drinking less than usual?",
      })
    );

    const result = await phraseQuestion(
      "Is she drinking less than usual?",
      "water_intake",
      session,
      pet,
      messages,
      "She is drinking less than usual.",
      null,
      false,
      false,
      false
    );

    expect(result).toBe(
      "Since this could still be important, is she drinking less than usual?"
    );
  });
});
