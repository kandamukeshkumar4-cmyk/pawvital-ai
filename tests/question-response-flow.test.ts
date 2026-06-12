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
  const originalTurnDepth = process.env.SYMPTOM_CHAT_TURN_DEPTH;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
    mockGateQuestionBeforePhrasing.mockResolvedValue({
      includeImageContext: false,
      useDeterministicFallback: false,
      reason: "test",
    });
    mockPhraseQuestion.mockResolvedValue("How long has Bruno been limping?");
  });

  afterAll(() => {
    if (originalTurnDepth === undefined) {
      delete process.env.SYMPTOM_CHAT_TURN_DEPTH;
    } else {
      process.env.SYMPTOM_CHAT_TURN_DEPTH = originalTurnDepth;
    }
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

  it("uses optional image-aware phrasing and returns the asking state", async () => {
    const session = createSession();
    session.last_question_asked = "which_leg";
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He started limping earlier." }],
      lastUserMessage: "He started limping earlier.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: "Mild swelling is visible around the paw.",
      visionSeverity: "needs_review",
      image: "data:image/jpeg;base64,ZmFrZQ==",
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(payload.message).toBe("How long has Bruno been limping?");
    expect(payload.conversationState).toBe("asking");
    expect(mockGateQuestionBeforePhrasing).toHaveBeenCalledTimes(1);
    expect(mockPhraseQuestion).toHaveBeenCalledTimes(1);
    const gateDeadline = mockGateQuestionBeforePhrasing.mock.calls[0][8];
    const phraseDeadline = mockPhraseQuestion.mock.calls[0][10];
    expect(gateDeadline).toBeNull();
    expect(phraseDeadline).toBe(gateDeadline);
  });

  it("uses verified model wording for standard text-only question turns", async () => {
    const session = createSession();
    session.known_symptoms = ["limping"];
    const serviceTimeouts = [];

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He started limping earlier." }],
      lastUserMessage: "He started limping earlier.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: null,
      serviceTimeouts,
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(mockGateQuestionBeforePhrasing).not.toHaveBeenCalled();
    expect(mockPhraseQuestion).toHaveBeenCalledTimes(1);
    expect(mockPhraseQuestion.mock.calls[0][9]).toBe(false);
    expect(mockPhraseQuestion.mock.calls[0][12]).toBe(true);
    expect(serviceTimeouts).toEqual([]);
    expect(payload.session.case_memory.service_timeouts).toEqual([]);
  });

  it("keeps deep-env text-only turns inside the model-call cap", async () => {
    process.env.SYMPTOM_CHAT_TURN_DEPTH = "deep";
    const session = createSession();
    session.known_symptoms = ["limping"];

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He started limping earlier." }],
      lastUserMessage: "He started limping earlier.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: null,
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(mockGateQuestionBeforePhrasing).not.toHaveBeenCalled();
    expect(mockPhraseQuestion).toHaveBeenCalledTimes(1);
    expect(mockPhraseQuestion.mock.calls[0][9]).toBe(false);
    expect(mockPhraseQuestion.mock.calls[0][12]).toBe(true);
  });

  it("skips optional image phrasing model calls when the route deadline is exhausted", async () => {
    const session = createSession();
    session.known_symptoms = ["limping"];
    const serviceTimeouts = [];

    const response = await buildQuestionResponseFlow({
      session,
      nextQuestionId: "limping_onset",
      needsClarificationQuestionId: null,
      pet: PET,
      effectivePet: PET,
      messages: [{ role: "user", content: "He started limping earlier." }],
      lastUserMessage: "He started limping earlier.",
      turnFocusSymptoms: ["limping"],
      visionAnalysis: "Mild swelling is visible around the paw.",
      visionSeverity: "needs_review",
      image: "data:image/jpeg;base64,ZmFrZQ==",
      turnBudget: {
        startedAtMs: Date.now() - 60_000,
        deadlineAtMs: Date.now(),
      },
      serviceTimeouts,
    });
    const payload = await response.json();

    expect(payload.type).toBe("question");
    expect(mockGateQuestionBeforePhrasing).not.toHaveBeenCalled();
    expect(mockPhraseQuestion).toHaveBeenCalledTimes(1);
    expect(mockPhraseQuestion.mock.calls[0][9]).toBe(true);
    expect(serviceTimeouts).toEqual([
      {
        service: "nvidia-nemotron",
        stage: "question_plan_review",
        reason: "turn_deadline_budget_exhausted",
      },
      {
        service: "nvidia-llama",
        stage: "question_phrasing",
        reason: "turn_deadline_budget_exhausted",
      },
    ]);
    expect(payload.session.case_memory.service_timeouts).toEqual([]);
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
