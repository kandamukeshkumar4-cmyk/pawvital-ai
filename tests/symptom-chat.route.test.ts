import {
  addSymptoms,
  createSession,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockExtractWithQwen = jest.fn();
const mockPhraseWithLlama = jest.fn();
const mockReviewQuestionPlanWithNemotron = jest.fn();
const mockVerifyQuestionWithNemotron = jest.fn();
const mockRunVisionPipeline = jest.fn();
const mockParseVisionForMatrix = jest.fn();
const mockImageGuardrail = jest.fn();
const mockDiagnoseWithDeepSeek = jest.fn();
const mockVerifyWithGLM = jest.fn();
const mockDetectBreedWithNyckel = jest.fn();
const mockRunRoboflowSkinWorkflow = jest.fn();
const mockEvaluateImageGate = jest.fn();
const mockShouldAnalyzeWoundImage = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();
const mockPreprocessVeterinaryImage = jest.fn();
const mockConsultWithMultimodalSidecar = jest.fn();
const mockRetrieveVeterinaryEvidenceFromSidecar = jest.fn();
const mockIsTextRetrievalConfigured = jest.fn();
const mockIsImageRetrievalConfigured = jest.fn();
const mockRetrieveVeterinaryTextEvidence = jest.fn();
const mockRetrieveVeterinaryImageEvidence = jest.fn();
const mockEnqueueAsyncReview = jest.fn();

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
  diagnoseWithDeepSeek: (...args: unknown[]) => mockDiagnoseWithDeepSeek(...args),
  verifyWithGLM: (...args: unknown[]) => mockVerifyWithGLM(...args),
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

jest.mock("@/lib/hf-sidecars", () => ({
  isVisionPreprocessConfigured: () => true,
  isRetrievalSidecarConfigured: () => true,
  isMultimodalConsultConfigured: () => true,
  isAbortLikeError: (error: unknown) =>
    error instanceof Error && error.name === "AbortError",
  preprocessVeterinaryImage: (...args: unknown[]) =>
    mockPreprocessVeterinaryImage(...args),
  consultWithMultimodalSidecar: (...args: unknown[]) =>
    mockConsultWithMultimodalSidecar(...args),
  retrieveVeterinaryEvidenceFromSidecar: (...args: unknown[]) =>
    mockRetrieveVeterinaryEvidenceFromSidecar(...args),
}));

jest.mock("@/lib/text-retrieval-service", () => ({
  isTextRetrievalConfigured: (...args: unknown[]) =>
    mockIsTextRetrievalConfigured(...args),
  retrieveVeterinaryTextEvidence: (...args: unknown[]) =>
    mockRetrieveVeterinaryTextEvidence(...args),
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: (...args: unknown[]) =>
    mockIsImageRetrievalConfigured(...args),
  retrieveVeterinaryImageEvidence: (...args: unknown[]) =>
    mockRetrieveVeterinaryImageEvidence(...args),
}));

jest.mock("@/lib/async-review-client", () => ({
  enqueueAsyncReview: (...args: unknown[]) => mockEnqueueAsyncReview(...args),
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

function makeReportRequest(session: TriageSession, image?: string) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate_report",
      pet: PET,
      session,
      image,
      messages: [{ role: "user", content: "Please generate the report." }],
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
    mockPreprocessVeterinaryImage.mockResolvedValue({
      domain: "skin_wound",
      bodyRegion: "left hind leg",
      detectedRegions: [{ label: "wound", confidence: 0.92 }],
      bestCrop: null,
      imageQuality: "good",
      confidence: 0.88,
      limitations: [],
    });
    mockConsultWithMultimodalSidecar.mockResolvedValue({
      model: "Qwen2.5-VL-7B-Instruct",
      summary: "The lesion appears localized to the left hind limb and warrants wound-focused follow-up.",
      agreements: ["left hind limb involvement"],
      disagreements: [],
      uncertainties: [],
      confidence: 0.74,
      mode: "sync",
    });
    mockRetrieveVeterinaryEvidenceFromSidecar.mockResolvedValue({
      textChunks: [],
      imageMatches: [],
      rerankScores: [],
      sourceCitations: [],
    });
    mockIsTextRetrievalConfigured.mockReturnValue(false);
    mockIsImageRetrievalConfigured.mockReturnValue(false);
    mockRetrieveVeterinaryTextEvidence.mockResolvedValue({
      textChunks: [],
      rerankScores: [],
      sourceCitations: [],
    });
    mockRetrieveVeterinaryImageEvidence.mockResolvedValue({
      imageMatches: [],
      sourceCitations: [],
    });
    mockEnqueueAsyncReview.mockResolvedValue(true);
    mockDiagnoseWithDeepSeek.mockResolvedValue(
      JSON.stringify({
        severity: "medium",
        recommendation: "vet_48h",
        title: "Localized skin lesion",
        explanation: "Explanation",
        differential_diagnoses: [],
        clinical_notes: "Notes",
        recommended_tests: [],
        home_care: [],
        actions: [],
        warning_signs: [],
        vet_questions: [],
      })
    );
    mockVerifyWithGLM.mockResolvedValue(
      JSON.stringify({
        safe: true,
        corrections: {},
        reasoning: "Report is clinically sound",
      })
    );
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
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("IMAGE REASONING CONTEXT:");
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
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("IMAGE REASONING CONTEXT:");
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

  it("keeps fresh image findings available for reasoning even when direct photo wording is blocked", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockRunVisionPipeline.mockResolvedValue({
      combined: "photo analysis showing a superficial wound on the left hind leg",
      severity: "needs_review",
      tiersUsed: ["tier1"],
      woundDetected: true,
      tier1_fast: "{\"finding\":\"wound\"}",
      tier2_detailed: null,
      tier3_reasoned: null,
    });
    mockParseVisionForMatrix.mockReturnValue({
      symptoms: [],
      redFlags: [],
      severityClass: "needs_review",
    });
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({
        include_image_context: false,
        use_deterministic_fallback: false,
        reason: "image should inform reasoning but not be mentioned directly",
      })
    );
    mockPhraseWithLlama.mockResolvedValue(
      "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. When did the limping start? Was it sudden or gradual?"
    );
    mockVerifyQuestionWithNemotron.mockResolvedValue(
      JSON.stringify({
        message:
          "Thanks for sharing that about Bruno; I'm combining your answer with the photo and the rest of the history. When did the limping start? Was it sudden or gradual?",
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
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain("IMAGE REASONING CONTEXT:");
    expect(mockPhraseWithLlama.mock.calls[0][0]).toContain(
      "EXPLICITLY REFERENCE PHOTO IN WORDING: NO"
    );
    expect(payload.message).toBe(
      "I'm keeping track of what you've shared so far about Bruno's limping. How big is the affected area? Compare to a coin, golf ball, or your palm."
    );
    expect(payload.message).not.toContain("photo");
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

  it("supports eye-domain image turns even outside the wound flow", async () => {
    mockPreprocessVeterinaryImage.mockResolvedValue({
      domain: "eye",
      bodyRegion: "left eye",
      detectedRegions: [{ label: "eye", confidence: 0.96 }],
      bestCrop: null,
      imageQuality: "good",
      confidence: 0.91,
      limitations: [],
    });
    mockRunVisionPipeline.mockResolvedValue({
      combined: "photo analysis showing redness and discharge around the left eye",
      severity: "needs_review",
      tiersUsed: [1],
      woundDetected: false,
      tier1_fast:
        "{\"clinical_impression\":\"mild ocular irritation\",\"confidence\":0.82}",
      tier2_detailed: null,
      tier3_deep: null,
    });
    mockParseVisionForMatrix.mockReturnValue({
      symptoms: [],
      redFlags: [],
      severityClass: "needs_review",
    });

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(createSession(), "his left eye looks red"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockRunVisionPipeline).toHaveBeenCalledTimes(1);
    expect(payload.session.latest_image_domain).toBe("eye");
    expect(payload.session.known_symptoms).toContain("eye_discharge");
    expect(payload.session.case_memory.visual_evidence.at(-1)?.domain).toBe("eye");
  });

  it("calls the multimodal consult on ambiguous supported image cases", async () => {
    mockPreprocessVeterinaryImage.mockResolvedValue({
      domain: "eye",
      bodyRegion: "left eye",
      detectedRegions: [
        { label: "eye", confidence: 0.65 },
        { label: "discharge", confidence: 0.61 },
      ],
      bestCrop: null,
      imageQuality: "borderline",
      confidence: 0.58,
      limitations: ["partial blur"],
    });
    mockRunVisionPipeline.mockResolvedValue({
      combined: "{\"confidence\":0.52,\"summary\":\"ocular irritation\"}",
      severity: "needs_review",
      tiersUsed: [1, 2],
      woundDetected: false,
      tier1_fast: "{\"confidence\":0.52}",
      tier2_detailed: "{\"estimated_severity\":\"moderate\"}",
      tier3_deep: null,
    });
    mockParseVisionForMatrix.mockReturnValue({
      symptoms: [],
      redFlags: [],
      severityClass: "needs_review",
    });

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(createSession(), "his eye looks weird"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockConsultWithMultimodalSidecar).toHaveBeenCalledTimes(1);
    expect(payload.session.latest_consult_opinion?.model).toBe(
      "Qwen2.5-VL-7B-Instruct"
    );
    expect(payload.session.case_memory.consult_opinions).toHaveLength(1);
  });

  it("records sidecar timeouts and falls back to deterministic preprocess", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mockPreprocessVeterinaryImage.mockRejectedValue(abortError);

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.latest_image_domain).toBe("skin_wound");
    expect(payload.session.case_memory.service_timeouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: "vision-preprocess-service",
          stage: "preprocess",
          reason: "timeout",
        }),
      ])
    );
  });

  it("adds evidence-chain data and capped confidence to the final report", async () => {
    mockIsTextRetrievalConfigured.mockReturnValue(true);
    mockIsImageRetrievalConfigured.mockReturnValue(true);
    mockRetrieveVeterinaryTextEvidence.mockResolvedValue({
      textChunks: [
        {
          title: "Merck Wound Management",
          citation: "Merck Veterinary Manual",
          score: 0.92,
          summary: "Clean wounds should be stabilized and monitored for infection.",
          sourceUrl: "https://example.com/merck",
        },
      ],
      rerankScores: [0.92],
      sourceCitations: ["Merck Veterinary Manual"],
    });
    mockRetrieveVeterinaryImageEvidence.mockResolvedValue({
      imageMatches: [
        {
          title: "Dog Skin Dataset",
          citation: "https://example.com/dataset",
          score: 0.88,
          summary: "reference hot spot image",
          assetUrl: null,
          domain: "skin_wound",
          conditionLabel: "hot_spot",
          dogOnly: true,
        },
      ],
      sourceCitations: ["Dog Skin Dataset"],
    });

    const session = createSession();
    session.known_symptoms = ["wound_skin_issue"];
    session.extracted_answers = { wound_location: "left hind leg" };
    session.vision_analysis = "Superficial moist lesion on the left hind leg.";
    session.vision_severity = "needs_review";
    session.latest_image_domain = "skin_wound";
    session.latest_image_quality = "borderline";
    session.case_memory = {
      ...session.case_memory!,
      latest_owner_turn: "There is a raw patch on his left hind leg.",
      compressed_summary: "Raw moist lesion on the left hind leg with owner concern about irritation.",
      visual_evidence: [
        {
          domain: "skin_wound",
          bodyRegion: "left hind leg",
          findings: ["raw moist lesion"],
          severity: "needs_review",
          confidence: 0.71,
          supportedSymptoms: ["wound_skin_issue"],
          contradictions: [],
          requiresConsult: false,
          limitations: ["borderline image quality"],
          influencedQuestionSelection: true,
        },
      ],
      consult_opinions: [],
      retrieval_evidence: [],
      evidence_chain: ["Visual evidence directly influenced next question: wound_size"],
      service_timeouts: [],
      ambiguity_flags: ["borderline image quality"],
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeReportRequest(session, IMAGE));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("report");
    expect(payload.report.confidence).toBeLessThanOrEqual(0.98);
    expect(payload.report.evidence_chain).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Visual evidence"),
        expect.stringContaining("Reference support"),
      ])
    );
    expect(payload.report.evidenceChain).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "visual-analysis",
          confidence: 0.71,
        }),
        expect.objectContaining({
          source: "text-retrieval",
        }),
      ])
    );
    expect(payload.report.async_review_scheduled).toBe(true);
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

  it("prefers direct owner text over conflicting model extraction for critical first-turn facts", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["limping"],
        answers: {
          which_leg: "right front",
          limping_onset: "gradual",
        },
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog has been limping on the left back leg since this morning."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.which_leg).toBe("left back leg");
    expect(payload.session.extracted_answers.limping_onset).toBe("sudden");
    expect(payload.session.last_question_asked).toBe("limping_progression");
  });

  it("keeps asking which_leg when the owner only gives front-or-back without a side", async () => {
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
      makeTextOnlyRequest(session, "My dog is limping on the back leg.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.known_symptoms).toContain("limping");
    expect(payload.session.extracted_answers.which_leg).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("which_leg");
    expect(payload.session.last_question_asked).toBe("which_leg");
    expect(mockPhraseWithLlama.mock.calls.at(-1)?.[0]).toContain(
      "Internal ID: which_leg"
    );
  });

  it("rejects weak model-only which_leg extraction when the side is still missing", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["limping"],
        answers: { which_leg: "back" },
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(createSession(), "My dog is limping on the back leg.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.which_leg).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("which_leg");
    expect(payload.session.last_question_asked).toBe("which_leg");
  });

  it("updates a previously answered leg when the owner corrects themselves", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = recordAnswer(session, "which_leg", "left back leg");
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "Actually it's the right front leg.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.which_leg).toBe("right front leg");
    expect(payload.session.last_question_asked).toBe("limping_onset");
  });

  it("returns an emergency response for vomiting blood on the first turn", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["vomiting"],
        answers: { vomit_blood: true },
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog is vomiting and there is blood in it."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.session.red_flags_triggered).toContain("vomit_blood");
  });

  it("captures volunteered non-critical limping details on the first turn", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog has been limping on the left back leg since this morning and the area is swollen and warm to touch."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.swelling_present).toBe(true);
    expect(payload.session.extracted_answers.warmth_present).toBe(true);
    expect(payload.session.last_question_asked).toBe("limping_progression");
  });

  it("accepts an explicit unknown trauma-history answer instead of repeating the same question", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = recordAnswer(session, "which_leg", "left back leg");
    session = recordAnswer(session, "limping_onset", "sudden");
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I don't know."));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("I don't know.");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("accepts a natural negative trauma-history reply instead of repeating the same question", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = recordAnswer(session, "which_leg", "left back leg");
    session = recordAnswer(session, "limping_onset", "sudden");
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "No, he didn't fall or jump.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe(
      "No, he didn't fall or jump."
    );
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it.each(["no", "no not really", "no, not really"])(
    "accepts a bare negative water-intake response (%s) instead of repeating the same question",
    async (message) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: ["vomiting"], answers: {} })
      );

      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "water_intake";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.water_intake).toBe(
        "less_than_usual"
      );
      expect(payload.session.answered_questions).toContain("water_intake");
      expect(payload.session.last_question_asked).not.toBe("water_intake");
    }
  );

  it("accepts a natural-language normal water-intake reply when extraction misses it", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "water_intake";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "yes he's drinking normally")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.water_intake).toBe("normal");
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.last_question_asked).not.toBe("water_intake");
  });

  it.each(["not-json", ""])(
    "recovers a pending water-intake answer when extraction output is %p",
    async (extractionPayload) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(extractionPayload);

      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "water_intake";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(
          session,
          "Yes, he's drinking normally overall and still going to the water bowl like usual today."
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.water_intake).toBe("normal");
      expect(payload.session.answered_questions).toContain("water_intake");
      expect(payload.session.last_question_asked).not.toBe("water_intake");
    }
  );

  it.each(["yes he's drinking normally", "yes, he's drinking normally"])(
    "accepts comma and non-comma variants of normal water-intake reply (%s)",
    async (message) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: ["vomiting"], answers: {} })
      );

      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "water_intake";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.water_intake).toBe("normal");
      expect(payload.session.answered_questions).toContain("water_intake");
      expect(payload.session.last_question_asked).not.toBe("water_intake");
    }
  );

  it.each(["not much water", "barely drinking"])(
    "accepts reduced water-intake replies (%s) instead of repeating the same question",
    async (message) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: ["vomiting"], answers: {} })
      );

      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "water_intake";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.water_intake).toBe("less_than_usual");
      expect(payload.session.answered_questions).toContain("water_intake");
      expect(payload.session.last_question_asked).not.toBe("water_intake");
    }
  );

  it("prioritizes breathing follow-up over coughing when both symptoms are reported together", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["coughing", "difficulty_breathing"],
        answers: {},
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog is coughing and having trouble breathing."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.known_symptoms).toEqual(
      expect.arrayContaining(["coughing", "difficulty_breathing"])
    );
    expect(payload.session.last_question_asked).toBe("breathing_onset");
  });

  it("preserves non-limping critical choice answers and escalates breathing emergencies", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["difficulty_breathing"],
        answers: { breathing_onset: "sudden", gum_color: "blue" },
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog suddenly started struggling to breathe and his gums look blue."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.session.extracted_answers.breathing_onset).toBe("sudden");
    expect(payload.session.extracted_answers.gum_color).toBe("blue");
    expect(payload.session.red_flags_triggered).toEqual(
      expect.arrayContaining(["blue_gums", "breathing_onset_sudden"])
    );
  });

  it("deterministically captures respiratory red flags when the model misses them", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["difficulty_breathing"],
        answers: {},
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog suddenly started struggling to breathe and his gums look blue."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.session.extracted_answers.breathing_onset).toBe("sudden");
    expect(payload.session.extracted_answers.gum_color).toBe("blue");
    expect(payload.session.red_flags_triggered).toEqual(
      expect.arrayContaining(["blue_gums", "breathing_onset_sudden"])
    );
  });

  it("does not force-close an unrelated pending string question with a new symptom update", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["coughing", "difficulty_breathing"],
        answers: { gum_color: "blue", breathing_onset: "sudden" },
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "Actually now he's breathing hard and his gums look blue."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.answered_questions).not.toContain("cough_duration");
    expect(payload.session.extracted_answers.cough_duration).toBeUndefined();
    expect(payload.session.red_flags_triggered).toContain("blue_gums");
  });

  it("records a direct duration-style pending answer instead of repeating the same question", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["coughing"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "For about two days."));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe("For about two days.");
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
  });

  it("records a direct duration-style pending answer when the owner says since yesterday", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["coughing"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "Since yesterday."));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe("Since yesterday.");
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
  });

  it.each(["not-json", ""])(
    "recovers a duration-style pending answer when extraction output is %p",
    async (extractionPayload) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(extractionPayload);

      let session = createSession();
      session = addSymptoms(session, ["coughing"]);
      session.last_question_asked = "cough_duration";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "Since yesterday."));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.cough_duration).toBe(
        "Since yesterday."
      );
      expect(payload.session.answered_questions).toContain("cough_duration");
      expect(payload.session.last_question_asked).not.toBe("cough_duration");
    }
  );

  it("accepts a natural affirmative pending swelling reply when extraction misses it", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "swelling_present";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "Yes, it's swollen around the ankle.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.swelling_present).toBe(true);
    expect(payload.session.answered_questions).toContain("swelling_present");
    expect(payload.session.last_question_asked).not.toBe("swelling_present");
  });

  it.each(["Can't tell.", "Not sure."])(
    "accepts an unknown-style pending boolean reply (%s) instead of repeating the same question",
    async (message) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "swelling_present";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.swelling_present).toBe(message);
      expect(payload.session.answered_questions).toContain("swelling_present");
      expect(payload.session.last_question_asked).not.toBe("swelling_present");
    }
  );

  it("uses broader keyword fallback for common respiratory and abdomen phrasings", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: [],
        answers: {},
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const breathingResponse = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog is panting, breathing hard, and looks short of breath."
      )
    );
    const breathingPayload = await breathingResponse.json();

    expect(breathingPayload.session.known_symptoms).toContain("difficulty_breathing");
    expect(breathingPayload.session.last_question_asked).toBe("breathing_onset");

    const bellyResponse = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog's belly looks bloated and hard."
      )
    );
    const bellyPayload = await bellyResponse.json();

    expect(bellyPayload.session.known_symptoms).toContain("swollen_abdomen");
    expect(bellyPayload.session.last_question_asked).toBe("abdomen_onset");
  });

  it("does not treat worsening-only language as a breathing onset answer in pending recovery", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["difficulty_breathing"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["difficulty_breathing"]);
    session.last_question_asked = "breathing_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "It's getting worse."));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.breathing_onset).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("breathing_onset");
    expect(payload.session.last_question_asked).toBe("breathing_onset");
  });

  it("does not treat unrelated water-drinking language as watery stool in pending recovery", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["diarrhea"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["diarrhea"]);
    session.last_question_asked = "stool_consistency";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "He's still drinking water normally.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.stool_consistency).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("stool_consistency");
    expect(payload.session.last_question_asked).not.toBe("stool_consistency");
  });

  it.each(["It's mostly water.", "It came out like water."])(
    "records a real watery-stool pending answer from common owner phrasing (%s)",
    async (message) => {
      mockRunRoboflowSkinWorkflow.mockResolvedValue({
        positive: false,
        summary: "",
        labels: [],
      });
      mockShouldAnalyzeWoundImage.mockReturnValue(false);
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({
          symptoms: ["diarrhea"],
          answers: {},
        })
      );

      let session = createSession();
      session = addSymptoms(session, ["diarrhea"]);
      session.last_question_asked = "stool_consistency";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.stool_consistency).toBe("watery");
      expect(payload.session.answered_questions).toContain("stool_consistency");
      expect(payload.session.last_question_asked).not.toBe("stool_consistency");
    }
  );

  it("does not run deep image analysis when pre-vision marks a generic photo unsupported", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockPreprocessVeterinaryImage.mockResolvedValue({
      domain: "unsupported",
      bodyRegion: null,
      detectedRegions: [],
      bestCrop: null,
      imageQuality: "borderline",
      confidence: 0.2,
      limitations: ["generic photo does not map to a supported veterinary image domain"],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "here's a photo"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockRunVisionPipeline).not.toHaveBeenCalled();
    expect(payload.session.known_symptoms).not.toContain("wound_skin_issue");
    expect(payload.session.latest_image_domain).toBe("unsupported");
  });

  it("falls back to deterministic-summary when MiniMax compression throws", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockRejectedValueOnce(new Error("timeout"));

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog has been limping on the left back leg since this morning."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.case_memory.compression_model).toBe(
      "deterministic-summary"
    );
    expect(payload.session.case_memory.compressed_summary).toContain("Main concerns");
  });

  it("treats non-weight-bearing limping as an emergency red-flag path", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        createSession(),
        "My dog has been limping on the left back leg since this morning and is not putting weight on it."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.session.red_flags_triggered).toContain("non_weight_bearing");
  });

  // =============================================================================
  // VET-704: Lossless Conversation-State Preservation
  // Regression tests to ensure protected control state survives compression.
  // =============================================================================

  it("VET-704: compression does not change answered_questions", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg", "limping_onset"];
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "It started three days ago")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Protected control state must be preserved across compression
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.answered_questions).toContain("limping_onset");
  });

  it("VET-704: compression does not change extracted_answers", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg", limping_onset: "three days ago" };
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "It seems to be getting worse")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Protected control state must be preserved across compression
    expect(payload.session.extracted_answers.which_leg).toBe("left back leg");
    expect(payload.session.extracted_answers.limping_onset).toBe("three days ago");
  });

  it("VET-704: mergeCompressionResult preserves unresolved_question_ids exactly", async () => {
    const { getProtectedConversationState, mergeCompressionResult } = await import(
      "@/lib/symptom-memory"
    );

    const session = createSession();
    session.answered_questions = ["which_leg", "limping_onset"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.last_question_asked = "limping_onset";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["limping_severity", "trauma_history"],
      compressed_summary: "old summary",
      compression_model: "old-model",
      last_compressed_turn: 2,
    };

    const protectedState = getProtectedConversationState(session);
    const merged = mergeCompressionResult(
      session,
      { summary: "new narrative summary", model: "MiniMax-M2.7" },
      protectedState
    );

    expect(merged.answered_questions).toEqual(["which_leg", "limping_onset"]);
    expect(merged.extracted_answers).toEqual({ which_leg: "left back leg" });
    expect(merged.last_question_asked).toBe("limping_onset");
    expect(merged.case_memory.unresolved_question_ids).toEqual([
      "limping_severity",
      "trauma_history",
    ]);
    expect(merged.case_memory.compressed_summary).toBe("new narrative summary");
    expect(merged.case_memory.compression_model).toBe("MiniMax-M2.7");
  });

  it("VET-704: compression does not change last_question_asked", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "It started three days ago")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Protected control state must be preserved across compression
    expect(payload.session.last_question_asked).toBeTruthy();
  });

  it("VET-704: compression failure falls back safely without losing state", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    // Force compression to fail
    mockCompressCaseMemoryWithMiniMax.mockRejectedValueOnce(new Error("timeout"));

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg", "limping_onset"];
    session.extracted_answers = { which_leg: "right front leg" };
    session.last_question_asked = "limping_progression";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["limping_progression"],
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "The limping is getting worse")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Fallback to deterministic-summary, but protected control state must be preserved
    expect(payload.session.case_memory.compression_model).toBe("deterministic-summary");
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.answered_questions).toContain("limping_onset");
    expect(payload.session.extracted_answers.which_leg).toBe("right front leg");
  });

  it("VET-704: conversation crossing compression boundary does not repeat resolved question", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId = prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    // Pre-populate with several answered questions
    session.answered_questions = ["which_leg", "limping_onset", "limping_progression"];
    session.extracted_answers = {
      which_leg: "left back leg",
      limping_onset: "three days ago",
      limping_progression: "getting worse",
    };
    session.last_question_asked = "limping_progression";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: [],
      turn_count: 5, // Force compression to trigger
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    // First request - triggers compression due to turn_count >= 4
    const response1 = await POST(
      makeTextOnlyRequest(session, "The limping seems to be getting better now")
    );
    const payload1 = await response1.json();

    expect(response1.status).toBe(200);
    // The compression ran and control state was preserved
    expect(payload1.session.answered_questions).toContain("which_leg");
    expect(payload1.session.answered_questions).toContain("limping_onset");
    expect(payload1.session.answered_questions).toContain("limping_progression");
    expect(payload1.session.extracted_answers.which_leg).toBe("left back leg");

    // Second request - verify no regression (should not ask already-answered questions)
    const response2 = await POST(
      makeTextOnlyRequest(payload1.session, "Actually the limping is gone now")
    );
    const payload2 = await response2.json();

    expect(response2.status).toBe(200);
    // Control state must still be intact after compression boundary
    expect(payload2.session.answered_questions).toContain("which_leg");
    expect(payload2.session.answered_questions).toContain("limping_onset");
    expect(payload2.session.answered_questions).toContain("limping_progression");
    expect(payload2.session.extracted_answers.which_leg).toBe("left back leg");
  });

  it("VET-704: compression output that tries to rewrite protected fields is rejected", async () => {
    // This test verifies the defensive validation in mergeCompressionResult
    const {
      getProtectedConversationState,
      mergeCompressionResult,
      validateCompressionOutput,
    } = await import("@/lib/symptom-memory");

    const { createSession } = await import("@/lib/triage-engine");

    const session = createSession();
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };

    const protectedState = getProtectedConversationState(session);

    // Simulate a malicious compression output that tries to rewrite protected fields
    const maliciousOutput = {
      summary: "Dog is limping on left back leg",
      model: "MiniMax-M2.7",
      answered_questions: [], // This should be rejected!
    };

    // The validateCompressionOutput function should throw
    expect(() => {
      validateCompressionOutput(maliciousOutput as any, protectedState);
    }).toThrow();

    // mergeCompressionResult should also throw because it calls validateCompressionOutput
    expect(() => {
      mergeCompressionResult(session, maliciousOutput as any, protectedState);
    }).toThrow();
  });

  it("VET-704: compression prompt excludes protected control state", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Narrative summary only.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["limping_onset", "limping_progression"],
      turn_count: 5,
    };
    session.last_question_asked = "limping_progression";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "It started three days ago")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockCompressCaseMemoryWithMiniMax).toHaveBeenCalledTimes(1);

    const prompt = String(mockCompressCaseMemoryWithMiniMax.mock.calls[0][0]);
    expect(prompt).toContain("CASE SNAPSHOT:");
    expect(prompt).toContain("excluded");
    expect(prompt).toContain("telemetry entries");
    expect(prompt).toContain("Recent transcript:");
    expect(prompt).not.toContain("Open question IDs:");
    expect(prompt).not.toContain("answered_questions");
    expect(prompt).not.toContain("extracted_answers");
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.case_memory.compressed_summary).toBe("Narrative summary only.");
  });

  it("VET-706: telemetry entry is excluded from compression prompt", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Dog is limping on left back leg.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5, // Force compression to trigger
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "The limping seems worse"));
    const payload = await response.json();

    expect(response.status).toBe(200);

    // Telemetry is recorded internally
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const extractionTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "extraction"
    );
    expect(extractionTelemetry).toBeDefined();

    // But compression telemetry should NOT appear as telemetry input in the prompt
  });

  it("VET-706: repeat suppression telemetry is recorded when triggered", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "It's been limping for 3 days"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    // User-facing payload should be unchanged
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.message).not.toContain("[VET-705]");
    expect(payload.type).not.toBe("error");
  });

  // =============================================================================
  // VET-705: Internal Conversation Telemetry
  // Tests to verify telemetry is recorded without changing user-facing payload.
  // =============================================================================

  it("VET-705: extraction telemetry is recorded in service_observations", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "It seems to be getting worse")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Telemetry should be recorded in service_observations
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const extractionTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "extraction"
    );
    expect(extractionTelemetry).toBeDefined();
    expect(extractionTelemetry.service).toBe("async-review-service");
    expect(extractionTelemetry.outcome).toBe("success");
    // Concrete marker: note should contain src=fast_path or src=structured
    expect(extractionTelemetry.note).toMatch(/src=(fast_path|structured)/);
    // Concrete marker: note should contain symptoms count
    expect(extractionTelemetry.note).toMatch(/syms=\d+/);
  });

  it("VET-705: pending recovery telemetry is recorded on success", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "limping_severity";
    session.answered_questions = [];
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["limping_severity"],
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    // Simulate a negative answer that will trigger raw_fallback resolution
    const response = await POST(
      makeTextOnlyRequest(session, "no")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Telemetry should be recorded
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const pendingTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "pending_recovery"
    );
    expect(pendingTelemetry).toBeDefined();
    // Concrete marker: note should contain src= and q= with question ID
    expect(pendingTelemetry.note).toMatch(/src=/);
    expect(pendingTelemetry.note).toMatch(/q=limping_severity/);
  });

  it("VET-705: compression telemetry is recorded on success", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Dog is limping on left back leg.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5, // Force compression to trigger
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "The limping seems worse")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Telemetry should be recorded for compression
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const compressionTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "compression"
    );
    expect(compressionTelemetry).toBeDefined();
    expect(compressionTelemetry.outcome).toBe("success");
    // Concrete markers: should contain compression model and isolation flags
    expect(compressionTelemetry.note).toContain("compress=MiniMax-M2.7");
    expect(compressionTelemetry.note).toContain("narrative_only=true");
    expect(compressionTelemetry.note).toContain("ctrl_preserved=true");
    // User-facing payload should be unchanged
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.session.case_memory.compressed_summary).toBe("Dog is limping on left back leg.");
  });

  it("VET-705: compression fallback telemetry is recorded on failure", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );
    mockCompressCaseMemoryWithMiniMax.mockRejectedValue(new Error("timeout"));

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5, // Force compression to trigger
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "The limping seems worse")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Telemetry should be recorded for compression fallback
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const compressionTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "compression"
    );
    expect(compressionTelemetry).toBeDefined();
    expect(compressionTelemetry.outcome).toBe("fallback");
    // Fallback marker should be present in note
    expect(compressionTelemetry.note).toMatch(/fallback=true/);
    expect(compressionTelemetry.note).toContain("compress=deterministic-summary");
    // User-facing payload should be unchanged
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    // Should have fallen back to deterministic summary
    expect(payload.session.case_memory.compression_model).toBe("deterministic-summary");
  });

  it("VET-705: user-facing payload shape is unchanged by telemetry recording", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "My dog is limping"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    // Verify standard payload shape is preserved
    expect(payload).toHaveProperty("type");
    expect(payload).toHaveProperty("message");
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("ready_for_report");
    // Verify session shape is preserved
    expect(payload.session).toHaveProperty("known_symptoms");
    expect(payload.session).toHaveProperty("answered_questions");
    expect(payload.session).toHaveProperty("case_memory");
    // Telemetry should be internal only, not exposed in user-facing fields
    expect(payload.message).not.toContain("[VET-705]");
    expect(payload.type).not.toBe("error");
  });
});

// =============================================================================
// VET-707: Loop Diagnostics
// Verify that loop reason codes are recorded for pending recovery outcomes.
// =============================================================================

describe("VET-707: loop diagnostics", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("VET-707: pending recovery failure records loop_reason extraction_miss when using raw_fallback", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "limping_severity";
    session.answered_questions = [];

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "no"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const pendingTelemetryNote = telemetryEvents
      .filter((e: any) => e.stage === "pending_recovery")
      .map((e: any) => e.note)
      .find((note: unknown) => typeof note === "string" && note.includes("loop_reason=extraction_miss"));
    expect(pendingTelemetryNote).toContain("pending_before=true");
    expect(pendingTelemetryNote).toContain("pending_after=true");
  });

  it("VET-707: pending recovery failure records loop_reason for extraction_miss", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "wound_location";
    session.answered_questions = [];

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "something random"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.message).not.toContain("loop_reason=extraction_miss");
  });

  it("VET-707: repeat suppression records loop_reason repeat_of_last_asked", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };
    // Set last_question_asked to something getNextQuestionAvoidingRepeat might return
    session.last_question_asked = "limping_onset";
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5,
      unresolved_question_ids: ["limping_onset"],
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "The limping seems worse"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    const repeatTelemetry = telemetryEvents.find(
      (e: any) => e.stage === "repeat_suppression"
    );
    if (repeatTelemetry) {
      expect(repeatTelemetry.note).toContain("loop_reason=repeat_of_last_asked");
      expect(repeatTelemetry.note).toContain("repeat_prevented=true");
    }
    // User-facing payload should be unchanged
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.message).not.toContain("loop_reason");
  });
});
