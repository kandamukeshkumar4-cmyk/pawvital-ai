import { addSymptoms, createSession, type TriageSession } from "@/lib/triage-engine";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockExtractWithQwen = jest.fn();
const mockPhraseWithLlama = jest.fn();
const mockReviewQuestionPlanWithNemotron = jest.fn();
const mockVerifyQuestionWithNemotron = jest.fn();
const mockRunVisionPipeline = jest.fn();
const mockParseVisionForMatrix = jest.fn();
const mockImageGuardrail = jest.fn();
const mockDetectBreedWithNyckel = jest.fn();
const mockRunRoboflowSkinWorkflow = jest.fn();
const mockEvaluateImageGate = jest.fn();
const mockShouldAnalyzeWoundImage = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  symptomChatLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/anthropic", () => ({
  anthropic: {},
  isAnthropicConfigured: false,
}));

jest.mock("@/lib/nvidia-models", () => ({
  isNvidiaConfigured: () => true,
  extractWithQwen: (...args: unknown[]) => mockExtractWithQwen(...args),
  phraseWithLlama: (...args: unknown[]) => mockPhraseWithLlama(...args),
  reviewQuestionPlanWithNemotron: (...args: unknown[]) =>
    mockReviewQuestionPlanWithNemotron(...args),
  verifyQuestionWithNemotron: (...args: unknown[]) =>
    mockVerifyQuestionWithNemotron(...args),
  diagnoseWithDeepSeek: jest.fn(),
  verifyWithGLM: jest.fn(),
  runVisionPipeline: (...args: unknown[]) => mockRunVisionPipeline(...args),
  parseVisionForMatrix: (...args: unknown[]) => mockParseVisionForMatrix(...args),
  imageGuardrail: (...args: unknown[]) => mockImageGuardrail(...args),
}));

jest.mock("@/lib/image-gate", () => ({
  evaluateImageGate: (...args: unknown[]) => mockEvaluateImageGate(...args),
  shouldAnalyzeWoundImage: (...args: unknown[]) =>
    mockShouldAnalyzeWoundImage(...args),
}));

jest.mock("@/lib/pet-enrichment", () => ({
  detectBreedWithNyckel: (...args: unknown[]) =>
    mockDetectBreedWithNyckel(...args),
  fetchBreedProfile: jest.fn(),
  getEffectivePetProfile: (pet: unknown) => pet,
  isLikelyDogContext: () => true,
  runRoboflowSkinWorkflow: (...args: unknown[]) =>
    mockRunRoboflowSkinWorkflow(...args),
  shouldUseImageInferredBreed: () => false,
}));

jest.mock("@/lib/knowledge-retrieval", () => ({
  buildReferenceImageQuery: jest.fn(),
  buildKnowledgeSearchQuery: jest.fn(),
  formatReferenceImageContext: jest.fn(),
  formatKnowledgeContext: jest.fn(),
  searchReferenceImages: jest.fn(),
  searchKnowledgeChunks: jest.fn(),
}));

jest.mock("@/lib/minimax", () => ({
  isMiniMaxConfigured: () => true,
  compressCaseMemoryWithMiniMax: (...args: unknown[]) =>
    mockCompressCaseMemoryWithMiniMax(...args),
}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

const IMAGE = "data:image/jpeg;base64,ZmFrZQ==";

function makeRequest(session: TriageSession, message: string) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet: PET,
      session,
      image: IMAGE,
      imageMeta: {
        width: 900,
        height: 900,
        blurScore: 30,
        estimatedKb: 120,
      },
      messages: [{ role: "user", content: message }],
    }),
  });
}

function makeTextOnlyRequest(session: TriageSession, message: string) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet: PET,
      session,
      messages: [{ role: "user", content: message }],
    }),
  });
}

describe("symptom-chat mixed text + image routing", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary:
        "Bruno remains in a limping triage flow with left-sided limb concerns and possible wound evidence from the latest photo.",
      model: "MiniMax-M2.7",
    });
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockReviewQuestionPlanWithNemotron.mockImplementation(async (prompt: string) =>
      JSON.stringify({
        include_image_context: prompt.includes("PHOTO ANALYZED THIS TURN: YES"),
        use_deterministic_fallback: false,
        reason: "safe",
      })
    );
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      const messages: Record<string, string> = {
        wound_size:
          "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. How big is the affected area? Compare to a coin, golf ball, or your palm.",
        limping_onset:
          "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. When did the limping start? Was it sudden or gradual?",
        limping_progression:
          "Thanks for sharing that about Bruno; I'm combining your answer with the rest of the history. Since it started, is the limping getting better, worse, or staying the same?",
      };
      return JSON.stringify({
        message: messages[questionId] || `Thanks for sharing that about Bruno. ${questionId}?`,
      });
    });
    mockRunVisionPipeline.mockResolvedValue({
      combined: "photo analysis",
      severity: "needs_review",
      tiersUsed: ["tier1"],
      woundDetected: true,
      tier1_fast: "{\"finding\":\"wound\"}",
      tier2_detailed: null,
      tier3_reasoned: null,
    });
    mockParseVisionForMatrix.mockReturnValue({
      symptoms: ["wound_skin_issue"],
      redFlags: [],
      severityClass: "needs_review",
    });
    mockImageGuardrail.mockReturnValue({
      triggered: false,
      flags: [],
      blockFurtherAnalysis: false,
    });
    mockDetectBreedWithNyckel.mockResolvedValue({
      breed: "Dalmatian",
      confidence: 0.61,
    });
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: true,
      summary: "skin-focused issue",
      labels: ["hot_spot"],
    });
    mockEvaluateImageGate.mockResolvedValue(null);
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
  });

  it("fuses a direct leg answer with wound-photo evidence and pivots to wound follow-up", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. How big is the affected area? Compare to a coin, golf ball, or your palm."
    );
    expect(payload.message).not.toContain("confusion about what type of animal");

    expect(mockRunVisionPipeline).toHaveBeenCalledTimes(1);
    expect(mockExtractWithQwen).not.toHaveBeenCalled();
    expect(mockReviewQuestionPlanWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithLlama).toHaveBeenCalledTimes(1);
    expect(mockVerifyQuestionWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockCompressCaseMemoryWithMiniMax).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("IMAGE CONTEXT:");
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("Internal ID: wound_size");
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("Compressed case summary:");
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain(
      "Bruno remains in a limping triage flow"
    );
    expect(mockPhraseWithLlama.mock.calls[0][0]).not.toContain(
      "Internal ID: limping_onset"
    );
    expect(mockPhraseWithLlama.mock.calls[0][0]).not.toContain(
      "Breed hint from image"
    );

    expect(payload.session.known_symptoms).toContain("wound_skin_issue");
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.answered_questions).toContain("wound_location");
    expect(payload.session.extracted_answers.which_leg).toBe("left leg");
    expect(payload.session.extracted_answers.wound_location).toBe("left leg");
  });

  it("keeps the limping flow when the image adds no new symptom evidence", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockRunVisionPipeline.mockResolvedValue({
      combined: "photo analysis",
      severity: "normal",
      tiersUsed: ["tier1"],
      woundDetected: false,
      tier1_fast: "{\"finding\":\"normal\"}",
      tier2_detailed: null,
      tier3_reasoned: null,
    });
    mockParseVisionForMatrix.mockReturnValue({
      symptoms: [],
      redFlags: [],
      severityClass: "normal",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. When did the limping start? Was it sudden or gradual?"
    );
    expect(mockReviewQuestionPlanWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain(
      "Internal ID: limping_onset"
    );
    expect(payload.session.known_symptoms).toEqual(["limping"]);
    expect(payload.session.extracted_answers.which_leg).toBe("left leg");
  });

  it("still allows wound-photo context when the active flow is already wound-specific", async () => {
    let session = createSession();
    session = addSymptoms(session, ["wound_skin_issue"]);
    session.last_question_asked = "wound_location";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. How big is the affected area? Compare to a coin, golf ball, or your palm."
    );
    expect(mockRunVisionPipeline).toHaveBeenCalledTimes(1);
    expect(mockReviewQuestionPlanWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithLlama).toHaveBeenCalledTimes(1);
    expect(mockVerifyQuestionWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("IMAGE CONTEXT:");
    expect(payload.session.extracted_answers.wound_location).toBe("left leg");
  });

  it("strips visual hallucinations when no photo was sent this turn", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockPhraseWithLlama.mockResolvedValue(
      "I can see your dog holding up one leg. When did the limping start?"
    );
    mockVerifyQuestionWithNemotron.mockResolvedValue(
      JSON.stringify({
        message:
          "I understand Bruno has been limping. When did the limping start?",
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";
    session = addSymptoms(session, []);
    session.answered_questions.push("which_leg");
    session.extracted_answers.which_leg = "left leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "it started today"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "I understand Bruno has been limping. When did the limping start?"
    );
    expect(payload.message).not.toContain("I can see");
    expect(mockReviewQuestionPlanWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockVerifyQuestionWithNemotron).toHaveBeenCalledTimes(1);
    expect(mockVerifyQuestionWithNemotron.mock.calls[0][0]).toContain(
      "PHOTO SENT THIS TURN: NO"
    );
  });

  it("falls back to deterministic phrasing when the preflight gate marks the turn as fragile", async () => {
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({
        include_image_context: false,
        use_deterministic_fallback: true,
        reason: "fragile mixed turn",
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "I'm keeping track of what you've shared so far about Bruno's limping. How big is the affected area? Compare to a coin, golf ball, or your palm."
    );
    expect(mockPhraseWithLlama).not.toHaveBeenCalled();
    expect(mockVerifyQuestionWithNemotron).not.toHaveBeenCalled();
  });

  it("captures obvious first-turn limping details before asking the next question", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    const session = createSession();

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "My dog has been limping on the left back leg since this morning."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.message).toBe(
      "Thanks for sharing that about Bruno; I'm combining your answer with the rest of the history. Since it started, is the limping getting better, worse, or staying the same?"
    );
    expect(payload.session.known_symptoms).toContain("limping");
    expect(payload.session.extracted_answers.which_leg).toBe("left back leg");
    expect(payload.session.extracted_answers.limping_onset).toBe("sudden");
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.answered_questions).toContain("limping_onset");
    expect(payload.session.last_question_asked).toBe("limping_progression");
    expect(mockPhraseWithLlama.mock.calls.at(-1)?.[0]).toContain(
      "Internal ID: limping_progression"
    );
  });
});
