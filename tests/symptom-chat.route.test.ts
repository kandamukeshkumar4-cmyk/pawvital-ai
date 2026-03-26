import { addSymptoms, createSession, type TriageSession } from "@/lib/triage-engine";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockExtractWithQwen = jest.fn();
const mockPhraseWithKimi = jest.fn();
const mockRunVisionPipeline = jest.fn();
const mockParseVisionForMatrix = jest.fn();
const mockImageGuardrail = jest.fn();
const mockDetectBreedWithNyckel = jest.fn();
const mockRunRoboflowSkinWorkflow = jest.fn();
const mockEvaluateImageGate = jest.fn();
const mockShouldAnalyzeWoundImage = jest.fn();

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
  phraseWithKimi: (...args: unknown[]) => mockPhraseWithKimi(...args),
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
    mockPhraseWithKimi.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
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
    expect(payload.message).toBe("QUESTION_ID:wound_size");
    expect(payload.message).not.toContain("confusion about what type of animal");

    expect(mockRunVisionPipeline).toHaveBeenCalledTimes(1);
    expect(mockExtractWithQwen).not.toHaveBeenCalled();
    expect(mockPhraseWithKimi).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithKimi.mock.calls[0][0]).toContain("IMAGE CONTEXT:");
    expect(mockPhraseWithKimi.mock.calls[0][0]).toContain("Internal ID: wound_size");
    expect(mockPhraseWithKimi.mock.calls[0][0]).not.toContain(
      "Internal ID: limping_onset"
    );
    expect(mockPhraseWithKimi.mock.calls[0][0]).not.toContain(
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
    expect(payload.message).toBe("QUESTION_ID:limping_onset");
    expect(mockPhraseWithKimi.mock.calls[0][0]).toContain(
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
    expect(payload.message).toBe("QUESTION_ID:wound_size");
    expect(mockRunVisionPipeline).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithKimi).toHaveBeenCalledTimes(1);
    expect(mockPhraseWithKimi.mock.calls[0][0]).toContain("IMAGE CONTEXT:");
    expect(payload.session.extracted_answers.wound_location).toBe("left leg");
  });
});
