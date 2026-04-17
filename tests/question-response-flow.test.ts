import { createSession } from "@/lib/triage-engine";
import { buildQuestionResponseFlow } from "@/lib/symptom-chat/question-response-flow";

const mockGateQuestionBeforePhrasing = jest.fn();
const mockPhraseQuestion = jest.fn();

jest.mock("@/lib/symptom-chat/question-phrasing", () => ({
  gateQuestionBeforePhrasing: (...args: unknown[]) =>
    mockGateQuestionBeforePhrasing(...args),
  phraseQuestion: (...args: unknown[]) => mockPhraseQuestion(...args),
}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

describe("buildQuestionResponseFlow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGateQuestionBeforePhrasing.mockResolvedValue({
      includeImageContext: false,
      useDeterministicFallback: false,
      reason: "test",
    });
    mockPhraseQuestion.mockResolvedValue("How long has Bruno been limping?");
  });

  it("returns the image-aware fallback question when no symptom is known yet", async () => {
    const response = await buildQuestionResponseFlow({
      session: createSession(),
      nextQuestionId: null,
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "Please look at this." }],
      lastUserMessage: "Please look at this.",
      turnFocusSymptoms: [],
      visionAnalysis: null,
      image: "data:image/jpeg;base64,ZmFrZQ==",
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(payload.ready_for_report).toBe(false);
    expect(payload.message).toContain("I can see the photo");
  });

  it("returns ready when no next question remains and symptoms are already known", async () => {
    const session = createSession();
    session.known_symptoms = ["limping"];

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: null,
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He is limping." }],
      lastUserMessage: "He is limping.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: null,
    });
    const payload = await response.json();

    expect(payload.type).toBe("ready");
    expect(payload.ready_for_report).toBe(true);
    expect(payload.message).toContain("I have enough information");
  });

  it("phrases the next question and returns the asking state", async () => {
    const session = createSession();
    session.last_question_asked = "which_leg";
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: null,
      sessionHandle: "session-handle-123",
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He started limping earlier." }],
      lastUserMessage: "He started limping earlier.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: null,
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(payload.message).toBe("How long has Bruno been limping?");
    expect(payload.conversationState).toBe("asking");
    expect(payload.sessionHandle).toBe("session-handle-123");
    expect(mockGateQuestionBeforePhrasing).toHaveBeenCalledTimes(1);
    expect(mockPhraseQuestion).toHaveBeenCalledTimes(1);
  });

  it("keeps the needs_clarification conversation state on clarification re-asks", async () => {
    const session = createSession();
    session.last_question_asked = "limping_onset";

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: "limping_onset",
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "I'm not sure." }],
      lastUserMessage: "I'm not sure.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: null,
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(payload.conversationState).toBe("needs_clarification");
  });
});
