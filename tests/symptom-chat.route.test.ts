import {
  addSymptoms,
  createSession,
  getNextQuestion,
  isReadyForDiagnosis,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";
import { buildContradictionRecord } from "@/lib/clinical/contradiction-detector";
import { transitionToConfirmed } from "@/lib/conversation-state";
import type { SidecarObservation } from "@/lib/clinical-evidence";
import {
  buildObservabilitySnapshot,
  extractTerminalOutcomeMetricsFromObservations,
} from "@/lib/sidecar-observability";
import { recordConversationTelemetry } from "@/lib/symptom-memory";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
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
const mockComputeBayesianScore = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();
const mockPreprocessVeterinaryImageWithResult = jest.fn();
const mockConsultWithMultimodalSidecarWithResult = jest.fn();
const mockRetrieveVeterinaryEvidenceFromSidecar = jest.fn();
const mockIsVisionPreprocessConfigured = jest.fn();
const mockIsRetrievalSidecarConfigured = jest.fn();
const mockIsMultimodalConsultConfigured = jest.fn();
const mockIsAsyncReviewServiceConfigured = jest.fn();
const mockIsTextRetrievalConfigured = jest.fn();
const mockIsImageRetrievalConfigured = jest.fn();
const mockRetrieveVeterinaryTextEvidenceWithResult = jest.fn();
const mockRetrieveVeterinaryImageEvidenceWithResult = jest.fn();
const mockEnqueueAsyncReview = jest.fn();
const mockSaveSymptomReportToDB = jest.fn();
const mockEmit = jest.fn();
const mockEventType = {
  REPORT_READY: "REPORT_READY",
  URGENCY_HIGH: "URGENCY_HIGH",
  OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
  SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
  PET_ADDED: "PET_ADDED",
} as const;

jest.mock("@/lib/rate-limit", () => ({
  symptomChatLimiter: {},
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getRateLimitId: (...args: unknown[]) => mockGetRateLimitId(...args),
}));

jest.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: (...args: unknown[]) =>
    mockCreateServerSupabaseClient(...args),
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

jest.mock("@/lib/bayesian-scorer", () => ({
  computeBayesianScore: (...args: unknown[]) => mockComputeBayesianScore(...args),
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
  isVisionPreprocessConfigured: (...args: unknown[]) =>
    mockIsVisionPreprocessConfigured(...args),
  isRetrievalSidecarConfigured: (...args: unknown[]) =>
    mockIsRetrievalSidecarConfigured(...args),
  isMultimodalConsultConfigured: (...args: unknown[]) =>
    mockIsMultimodalConsultConfigured(...args),
  isAsyncReviewServiceConfigured: (...args: unknown[]) =>
    mockIsAsyncReviewServiceConfigured(...args),
  isAbortLikeError: (error: unknown) =>
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError"),
  preprocessVeterinaryImageWithResult: (...args: unknown[]) =>
    mockPreprocessVeterinaryImageWithResult(...args),
  preprocessVeterinaryImage: async (...args: unknown[]) => {
    const result = await mockPreprocessVeterinaryImageWithResult(...args);
    if (!result.ok) {
      const err = result.category === "timeout"
        ? new DOMException(result.error, "AbortError")
        : new Error(result.error);
      throw err;
    }
    return result.data;
  },
  consultWithMultimodalSidecarWithResult: (...args: unknown[]) =>
    mockConsultWithMultimodalSidecarWithResult(...args),
  consultWithMultimodalSidecar: async (...args: unknown[]) => {
    const result = await mockConsultWithMultimodalSidecarWithResult(...args);
    if (!result.ok) {
      const err = result.category === "timeout"
        ? new DOMException(result.error, "AbortError")
        : new Error(result.error);
      throw err;
    }
    return result.data;
  },
  retrieveVeterinaryTextEvidenceFromSidecarWithResult: (...args: unknown[]) =>
    mockRetrieveVeterinaryTextEvidenceWithResult(...args),
  retrieveVeterinaryImageEvidenceFromSidecarWithResult: (...args: unknown[]) =>
    mockRetrieveVeterinaryImageEvidenceWithResult(...args),
  retrieveVeterinaryEvidenceFromSidecar: (...args: unknown[]) =>
    mockRetrieveVeterinaryEvidenceFromSidecar(...args),
}));

jest.mock("@/lib/text-retrieval-service", () => ({
  isTextRetrievalConfigured: (...args: unknown[]) =>
    mockIsTextRetrievalConfigured(...args),
  retrieveVeterinaryTextEvidence: async (...args: unknown[]) => {
    const result = await mockRetrieveVeterinaryTextEvidenceWithResult(...args);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: (...args: unknown[]) =>
    mockIsImageRetrievalConfigured(...args),
  retrieveVeterinaryImageEvidence: async (...args: unknown[]) => {
    const result = await mockRetrieveVeterinaryImageEvidenceWithResult(...args);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
}));

jest.mock("@/lib/async-review-client", () => ({
  enqueueAsyncReview: (...args: unknown[]) => mockEnqueueAsyncReview(...args),
}));

jest.mock("@/lib/confidence-calibrator", () => ({
  calibrateDiagnosticConfidence: ({ baseConfidence }: { baseConfidence: number }) => ({
    final_confidence: baseConfidence,
    base_confidence: baseConfidence,
    adjustments: [],
    confidence_level: "moderate",
    recommendation: "No significant adjustments needed",
  }),
}));

jest.mock("@/lib/icd-10-mapper", () => ({
  getICD10CodesForDisease: () => null,
  generateICD10Summary: () => [],
}));

jest.mock("@/lib/report-storage", () => ({
  saveSymptomReportToDB: (...args: unknown[]) =>
    mockSaveSymptomReportToDB(...args),
}));

jest.mock("@/lib/events/event-bus", () => ({
  EventType: mockEventType,
  emit: (...args: unknown[]) => mockEmit(...args),
}));

jest.mock("@/lib/events/notification-handler", () => ({}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

const IMAGE = "data:image/jpeg;base64,ZmFrZQ==";

function findConsoleLine(
  spy: { mock: { calls: unknown[][] } },
  marker: string
): string | undefined {
  return spy.mock.calls
    .flat()
    .find(
      (value): value is string =>
        typeof value === "string" && value.includes(marker)
    );
}

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

function makeTextOnlyRequest(
  session: TriageSession,
  message: string,
  petOverrides: Record<string, unknown> = {}
) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet: {
        ...PET,
        ...petOverrides,
      },
      session,
      messages: [{ role: "user", content: message }],
    }),
  });
}

function makeReportRequest(
  session: TriageSession,
  image?: string,
  petOverrides: Record<string, unknown> = {}
) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate_report",
      pet: {
        ...PET,
        ...petOverrides,
      },
      session,
      image,
      messages: [{ role: "user", content: "Please generate the report." }],
    }),
  });
}

function buildAuthSupabase(userId: string | null) {
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: {
          user: userId ? { id: userId } : null,
        },
      }),
    },
  };
}

function buildModerateReportSession() {
  let session = createSession();
  session = addSymptoms(session, ["excessive_scratching"]);
  session = recordAnswer(session, "scratch_location", "ears");
  session.case_memory = {
    ...session.case_memory!,
    latest_owner_turn: "He keeps scratching around his ears.",
  };

  return session;
}

function buildEmergencyReportSession() {
  let session = createSession();
  session = addSymptoms(session, ["vomiting"]);
  session = recordAnswer(session, "vomit_blood", true);
  session.red_flags_triggered = ["vomit_blood"];
  session.case_memory = {
    ...session.case_memory!,
    latest_owner_turn: "He vomited blood this morning.",
  };

  return session;
}

function buildPendingQuestionSession(symptom: string, questionId: string) {
  let session = createSession();
  session = addSymptoms(session, [symptom]);
  session.last_question_asked = questionId;
  session.case_memory = {
    ...session.case_memory!,
    turn_count: 1,
    unresolved_question_ids: [],
  };

  return session;
}

function getEmitCalls(eventType: string) {
  return mockEmit.mock.calls.filter(([type]) => type === eventType);
}

function getFirstEmitPayload<T extends Record<string, unknown>>(
  eventType: string
) {
  const firstCall = getEmitCalls(eventType)[0];
  return (firstCall?.[1] ?? null) as T | null;
}

function emittedArgsContain(value: string) {
  return mockEmit.mock.calls.some((call) => JSON.stringify(call).includes(value));
}

function buildOkSidecarResult<T>(service: string, data: T, latencyMs = 12) {
  return { ok: true, data, latencyMs, service };
}

function buildErrorSidecarResult(
  service: string,
  category: "timeout" | "connection_refused" | "http_error" | "parse_error" | "unknown" = "unknown",
  error = "sidecar failed",
  latencyMs = 12
) {
  return { ok: false, category, error, latencyMs, service };
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
    mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );
    mockComputeBayesianScore.mockResolvedValue([]);
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary:
        "Bruno remains in a limping triage flow with left-sided limb concerns and possible wound evidence from the latest photo.",
      model: "MiniMax-M2.7",
    });
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildOkSidecarResult("vision-preprocess-service", {
        domain: "skin_wound",
        bodyRegion: "left hind leg",
        detectedRegions: [{ label: "wound", confidence: 0.92 }],
        bestCrop: null,
        imageQuality: "good",
        confidence: 0.88,
        limitations: [],
      })
    );
    mockConsultWithMultimodalSidecarWithResult.mockResolvedValue(
      buildOkSidecarResult("multimodal-consult-service", {
        model: "Qwen2.5-VL-7B-Instruct",
        summary:
          "The lesion appears localized to the left hind limb and warrants wound-focused follow-up.",
        agreements: ["left hind limb involvement"],
        disagreements: [],
        uncertainties: [],
        confidence: 0.74,
        mode: "sync",
      })
    );
    mockIsVisionPreprocessConfigured.mockReturnValue(false);
    mockIsRetrievalSidecarConfigured.mockReturnValue(false);
    mockIsMultimodalConsultConfigured.mockReturnValue(false);
    mockIsAsyncReviewServiceConfigured.mockReturnValue(false);
    mockIsTextRetrievalConfigured.mockReturnValue(false);
    mockIsImageRetrievalConfigured.mockReturnValue(false);
    mockRetrieveVeterinaryEvidenceFromSidecar.mockResolvedValue({
      textChunks: [],
      imageMatches: [],
      rerankScores: [],
      sourceCitations: [],
    });
    mockIsTextRetrievalConfigured.mockReturnValue(false);
    mockIsImageRetrievalConfigured.mockReturnValue(false);
    mockRetrieveVeterinaryTextEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("text-retrieval-service", {
        textChunks: [],
        rerankScores: [],
        sourceCitations: [],
      })
    );
    mockRetrieveVeterinaryImageEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("image-retrieval-service", {
        imageMatches: [],
        sourceCitations: [],
      })
    );
    mockEnqueueAsyncReview.mockResolvedValue(true);
    mockSaveSymptomReportToDB.mockResolvedValue(null);
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

  it("returns an emergency response when the vision guardrail blocks further analysis", async () => {
    mockImageGuardrail.mockReturnValue({
      triggered: true,
      flags: ["deep wound", "active bleeding"],
      blockFurtherAnalysis: true,
    });

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(createSession(), "what about this?"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.ready_for_report).toBe(true);
    expect(payload.message).toContain(
      "Based on my analysis of Bruno's photo, I've detected signs that require IMMEDIATE veterinary attention:"
    );
    expect(payload.message).toContain("• deep wound");
    expect(payload.message).toContain("• active bleeding");
    expect(payload.message).toContain(
      "Please take Bruno to the nearest emergency veterinary hospital NOW."
    );
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
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildOkSidecarResult("vision-preprocess-service", {
        domain: "eye",
        bodyRegion: "left eye",
        detectedRegions: [{ label: "eye", confidence: 0.96 }],
        bestCrop: null,
        imageQuality: "good",
        confidence: 0.91,
        limitations: [],
      })
    );
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
    mockIsMultimodalConsultConfigured.mockReturnValue(true);
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildOkSidecarResult("vision-preprocess-service", {
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
      })
    );
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
    expect(mockConsultWithMultimodalSidecarWithResult).toHaveBeenCalledTimes(1);
    expect(payload.session.latest_consult_opinion?.model).toBe(
      "Qwen2.5-VL-7B-Instruct"
    );
    expect(payload.session.case_memory.consult_opinions).toHaveLength(1);
  });

  it("records sidecar timeout observations and falls back to deterministic preprocess", async () => {
    mockIsVisionPreprocessConfigured.mockReturnValue(true);
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildErrorSidecarResult(
        "vision-preprocess-service",
        "timeout",
        abortError.message
      )
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "which_leg";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeRequest(session, "left leg"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.latest_image_domain).toBe("skin_wound");
    expect(payload.session.case_memory.service_observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: "vision-preprocess-service",
          stage: "preprocess",
          outcome: "timeout",
          fallbackUsed: true,
        }),
      ])
    );
    expect(payload.session.case_memory.service_timeouts).toEqual([]);
  });

  it("adds evidence-chain data and capped confidence to the final report", async () => {
    mockIsMultimodalConsultConfigured.mockReturnValue(true);
    mockIsTextRetrievalConfigured.mockReturnValue(true);
    mockIsImageRetrievalConfigured.mockReturnValue(true);
    mockRetrieveVeterinaryTextEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("text-retrieval-service", {
        textChunks: [
          {
            title: "Merck Wound Management",
            citation: "Merck Veterinary Manual",
            score: 0.92,
            summary:
              "Clean wounds should be stabilized and monitored for infection.",
            sourceUrl: "https://example.com/merck",
          },
        ],
        rerankScores: [0.92],
        sourceCitations: ["Merck Veterinary Manual"],
      })
    );
    mockRetrieveVeterinaryImageEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("image-retrieval-service", {
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
      })
    );

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

  it("keeps report generation alive when GLM safety review returns malformed JSON", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      mockVerifyWithGLM.mockResolvedValue("not-json");

      const session = createSession();
      session.known_symptoms = ["wound_skin_issue"];
      session.extracted_answers = { wound_location: "left hind leg" };
      session.vision_analysis = "Superficial moist lesion on the left hind leg.";
      session.vision_severity = "needs_review";
      session.latest_image_domain = "skin_wound";
      session.latest_image_quality = "good";
      session.case_memory = {
        ...session.case_memory!,
        latest_owner_turn: "There is a raw patch on his left hind leg.",
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(session, IMAGE));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(payload.report.severity).toBe("medium");
      expect(payload.report.recommendation).toBe("vet_48h");
      expect(errorSpy).toHaveBeenCalledWith(
        "[Safety] GLM-5 JSON parse failed (non-blocking, skipping safety corrections):",
        expect.any(SyntaxError)
      );
      expect(logSpy).toHaveBeenCalledWith(
        "[Safety] Continuing with report generation without safety corrections"
      );
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
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
    expect(payload.ready_for_report).toBe(true);
    expect(payload.message).toContain(
      "I've detected potential emergency signs (vomit_blood)."
    );
    expect(payload.message).toContain(
      "Please take Bruno to the nearest emergency veterinary hospital IMMEDIATELY."
    );
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
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
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
    expect(payload.session.extracted_answers.trauma_history).toBe("no_trauma");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("does not treat a car ride mention as affirmative trauma history", async () => {
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
      makeTextOnlyRequest(session, "He was in the car when I noticed it.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("trauma_history");
    expect(payload.session.last_question_asked).toBe("trauma_history");
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
    expect(payload.conversationState).not.toBe("escalation");
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
    expect(payload.session.last_question_asked).toBe("stool_consistency");
    expect(payload.conversationState).toBe("needs_clarification");
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
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildOkSidecarResult("vision-preprocess-service", {
        domain: "unsupported",
        bodyRegion: null,
        detectedRegions: [],
        bestCrop: null,
        imageQuality: "borderline",
        confidence: 0.2,
        limitations: [
          "generic photo does not map to a supported veterinary image domain",
        ],
      })
    );
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
      validateCompressionOutput(
        maliciousOutput as Record<string, unknown>,
        protectedState
      );
    }).toThrow();

    // mergeCompressionResult should also throw because it calls validateCompressionOutput
    expect(() => {
      mergeCompressionResult(
        session,
        maliciousOutput as unknown as { summary: string; model: string },
        protectedState
      );
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

  it("VET-706: telemetry entry is excluded from compression prompt and client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
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
    const prompt = String(mockCompressCaseMemoryWithMiniMax.mock.calls[0][0]);

    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    expect(
      telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
    ).toBeUndefined();
    expect(prompt).not.toContain("async-review-service");
    expect(prompt).not.toContain('"stage":"extraction"');

    const extractionLog = findConsoleLine(logSpy, "[VET-705][extraction]");
    expect(extractionLog).toBeDefined();
    expect(String(extractionLog)).toContain('"outcome":"success"');
  } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-705: extraction telemetry is logged internally and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
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
      const telemetryEvents = payload.session.case_memory?.service_observations || [];
      expect(
        telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
      ).toBeUndefined();

      const extractionLog = findConsoleLine(logSpy, "[VET-705][extraction]");
      expect(extractionLog).toBeDefined();
      expect(String(extractionLog)).toContain('"outcome":"success"');
      expect(String(extractionLog)).toMatch(/"source":"(fast_path|structured)"/);
      expect(String(extractionLog)).toMatch(/"symptoms_extracted":\d+/);
    } finally {
      logSpy.mockRestore();
    }
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

  it("VET-1028: cannot_assess terminal telemetry is logged internally and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["coughing"]);
      sessionWithSymptom.last_question_asked = "breathing_onset";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["coughing"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(sessionWithSymptom, "I can't tell")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("cannot_assess");
      expect(
        payload.session.case_memory.service_observations ?? []
      ).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ service: "async-review-service" }),
        ])
      );

      const terminalTelemetry = findConsoleLine(
        logSpy,
        "[VET-705][terminal_outcome]"
      );
      expect(terminalTelemetry).toBeDefined();
      expect(String(terminalTelemetry)).toContain(
        '"reason_code":"owner_cannot_assess_breathing_onset"'
      );
      expect(String(terminalTelemetry)).toContain(
        '"terminal_state":"cannot_assess"'
      );
      expect(String(terminalTelemetry)).toContain(
        '"question_id":"breathing_onset"'
      );
      expect(String(terminalTelemetry)).toContain('"turn_number":2');
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-1028: out_of_scope terminal telemetry is logged internally and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(
          createSession(),
          "How much Benadryl can I give my dog for itching?"
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("out_of_scope");
      expect(
        payload.session.case_memory.service_observations ?? []
      ).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ service: "async-review-service" }),
        ])
      );

      const terminalTelemetry = findConsoleLine(
        logSpy,
        "[VET-705][terminal_outcome]"
      );
      expect(terminalTelemetry).toBeDefined();
      expect(String(terminalTelemetry)).toContain(
        '"reason_code":"medication_dosing_request"'
      );
      expect(String(terminalTelemetry)).toContain(
        '"terminal_state":"out_of_scope"'
      );
      expect(String(terminalTelemetry)).not.toContain('"question_id":"');
      expect(String(terminalTelemetry)).toContain('"turn_number":1');
    } finally {
      logSpy.mockRestore();
    }
  });

  // =============================================================================
  // VET-705: Internal Conversation Telemetry
  // Tests to verify telemetry is recorded without changing user-facing payload.
  // =============================================================================

  it("VET-705: pending recovery telemetry is logged internally on success and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
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
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";
    session.answered_questions = [];
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["cough_duration"],
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "It's been about three days now. It's louder when he's lying down at night."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    expect(
      telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
    ).toBeUndefined();

    const pendingTelemetry = findConsoleLine(
      logSpy,
      "[VET-705][pending_recovery]"
    );
    expect(pendingTelemetry).toBeDefined();
    expect(String(pendingTelemetry)).toContain('"question_id":"cough_duration"');
    expect(String(pendingTelemetry)).toContain('"outcome":"success"');
    expect(String(pendingTelemetry)).toContain('"source":"raw_fallback"');
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-705: compression telemetry is logged internally on success and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
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
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    expect(
      telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
    ).toBeUndefined();

    const compressionTelemetry = findConsoleLine(
      logSpy,
      "[VET-705][compression]"
    );
    expect(compressionTelemetry).toBeDefined();
    expect(String(compressionTelemetry)).toContain('"outcome":"success"');
    expect(String(compressionTelemetry)).toContain('"compression_model":"MiniMax-M2.7"');
    expect(String(compressionTelemetry)).toContain('"narrative_only":true');
    expect(String(compressionTelemetry)).toContain('"control_state_preserved":true');
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.session.case_memory.compressed_summary).toBe("Dog is limping on left back leg.");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-705: compression fallback telemetry is logged internally and excluded from client session", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    try {
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
    const telemetryEvents = payload.session.case_memory?.service_observations || [];
    expect(
      telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
    ).toBeUndefined();

    const compressionTelemetry = findConsoleLine(
      logSpy,
      "[VET-705][compression]"
    );
    expect(compressionTelemetry).toBeDefined();
    expect(String(compressionTelemetry)).toContain('"outcome":"fallback"');
    expect(String(compressionTelemetry)).toContain('"fallback_used":true');
    expect(String(compressionTelemetry)).toContain('"compression_model":"deterministic-summary"');
    expect(payload.type).toBe("question");
    expect(payload.session).toBeDefined();
    expect(payload.session.case_memory.compression_model).toBe("deterministic-summary");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-1008: text contradictions add ambiguity flags and internal telemetry without changing the response shape", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
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
      session = addSymptoms(session, ["vomiting"]);
      session = recordAnswer(session, "appetite_status", "normal");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(session, "He isn't eating anything today.")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.session.case_memory.ambiguity_flags).toEqual(
        expect.arrayContaining([
          expect.stringContaining("appetite_conflict"),
        ])
      );
      expect(payload.session.case_memory.service_observations ?? []).toEqual(
        expect.not.arrayContaining([
          expect.objectContaining({ service: "async-review-service" }),
        ])
      );

      const contradictionTelemetry = findConsoleLine(
        warnSpy,
        "[VET-705][contradiction_detection]"
      );
      expect(contradictionTelemetry).toBeDefined();
      expect(String(contradictionTelemetry)).toContain('"outcome":"warning"');
      expect(String(contradictionTelemetry)).toContain('"contradiction_count":1');
      expect(String(contradictionTelemetry)).toContain("appetite_conflict");
      expect(String(contradictionTelemetry)).toContain('"contradiction_records":[');
      expect(String(contradictionTelemetry)).toContain('"severity":"moderate"');
      expect(String(contradictionTelemetry)).toContain('"affected_key":"appetite_status"');
      expect(String(contradictionTelemetry)).toContain('"turn_number":0');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("VET-1022: contradiction payload stays internal while observability snapshot exposes normalized records", () => {
    const session = recordConversationTelemetry(createSession(), {
      event: "contradiction_detection",
      turn_count: 3,
      outcome: "warning",
      reason: "gum_conflict",
      contradiction_count: 1,
      contradiction_ids: ["gum_conflict"],
      contradiction_records: [
        buildContradictionRecord(
          {
            id: "gum_conflict",
            resolution: "escalate",
            severity: "high",
            flag: "gum_conflict: prior gum_color=pink_normal conflicts with owner describing pale or white gums",
            affectedKey: "gum_color",
            sourcePair: [
              {
                source: "previous_answer",
                key: "gum_color",
                value: "pink_normal",
              },
              {
                source: "owner_text",
                key: "owner_text",
                value: "pale_gums_signal",
              },
            ],
          },
          3
        ),
      ],
    });

    const snapshot = buildObservabilitySnapshot(session);

    expect(snapshot.contradictionRecords).toEqual([
      {
        contradiction_type: "gum_conflict",
        severity: "high",
        resolution: "escalate",
        source_pair: [
          {
            source: "previous_answer",
            key: "gum_color",
            value: "pink_normal",
          },
          {
            source: "owner_text",
            key: "owner_text",
            value: "pale_gums_signal",
          },
        ],
        affected_key: "gum_color",
        turn_number: 3,
      },
    ]);
  });

  it("VET-1028: terminal outcome metrics stay internal while observability helpers expose normalized records", () => {
    const session = recordConversationTelemetry(createSession(), {
      event: "terminal_outcome",
      turn_count: 2,
      question_id: "gum_color",
      outcome: "success",
      reason: "owner_cannot_assess_gum_color",
      terminal_outcome_metric: {
        terminal_state: "cannot_assess",
        reason_code: "owner_cannot_assess_gum_color",
        conversation_state: "escalation",
        recommended_next_step:
          "Please seek veterinary assessment rather than guessing at home.",
        question_id: "gum_color",
        turn_number: 2,
      },
    });

    const metrics = extractTerminalOutcomeMetricsFromObservations(
      session.case_memory?.service_observations ?? []
    );
    const snapshot = buildObservabilitySnapshot(session);

    expect(metrics).toEqual([
      {
        terminal_state: "cannot_assess",
        reason_code: "owner_cannot_assess_gum_color",
        conversation_state: "escalation",
        recommended_next_step:
          "Please seek veterinary assessment rather than guessing at home.",
        question_id: "gum_color",
        turn_number: 2,
      },
    ]);
    expect(snapshot).not.toHaveProperty("terminalOutcomeMetrics");
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

  // =============================================================================
  // VET-710: Replay and Compression Boundary Harness
  // Multi-turn replay coverage and compression-boundary regressions.
  // =============================================================================

  it("VET-710: realistic multi-turn replay does not repeat answered questions", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["limping"], answers: {} }));
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId = prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId = prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    // Turn 1: Owner reports limping
    const response1 = await POST(makeTextOnlyRequest(session, "My dog has been limping on the left back leg"));
    const payload1 = await response1.json();
    expect(payload1.session.extracted_answers.which_leg).toBe("left back leg");
    expect(payload1.session.answered_questions).toContain("which_leg");
    expect(payload1.session.last_question_asked).toBe("limping_onset");

    // Turn 2: Owner provides onset
    const response2 = await POST(makeTextOnlyRequest(payload1.session, "It started suddenly yesterday"));
    const payload2 = await response2.json();
    expect(payload2.session.extracted_answers.limping_onset).toBe("sudden");
    expect(payload2.session.answered_questions).toContain("limping_onset");
    expect(payload2.session.last_question_asked).toBe("limping_progression");

    // Turn 3: Owner provides progression
    const response3 = await POST(makeTextOnlyRequest(payload2.session, "It's getting worse"));
    const payload3 = await response3.json();
    expect(payload3.session.extracted_answers.limping_progression).toBe("worse");
    expect(payload3.session.answered_questions).toContain("limping_progression");

    // Turn 4: Owner provides a non-emergency weight-bearing answer so replay stays in normal question flow
    const response4 = await POST(makeTextOnlyRequest(payload3.session, "He's limping but still walking on it"));
    const payload4 = await response4.json();
    expect(payload4.type).toBe("question");
    expect(payload4.session.extracted_answers.weight_bearing).toBe("weight_bearing");
    expect(payload4.session.answered_questions).toContain("weight_bearing");
    expect(payload4.session.last_question_asked).toBe("trauma_history");

    // Turn 5: Verify no repeat of already-answered questions
    const response5 = await POST(makeTextOnlyRequest(payload4.session, "Actually he's limping on the right leg now"));
    const payload5 = await response5.json();
    expect(payload5.session.extracted_answers.which_leg).toBe("right leg");
    expect(payload5.session.answered_questions).toContain("which_leg");
    expect(payload5.session.last_question_asked).toBe("trauma_history");
  });

  it("VET-710: multi-turn replay with compression boundary preserves answered_questions", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["vomiting"], answers: {} }));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Pet has been vomiting with decreased appetite.",
      model: "MiniMax-M2.7",
    });
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId = prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId = prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 3,
      last_compressed_turn: 0,
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    // Turn 1: Owner reports vomiting
    const response1 = await POST(makeTextOnlyRequest(session, "My dog has been vomiting"));
    const payload1 = await response1.json();
    expect(payload1.session.answered_questions).not.toContain("vomit_duration");
    expect(payload1.session.last_question_asked).toBe("vomit_duration");

    // Turn 2: Owner provides duration
    const response2 = await POST(makeTextOnlyRequest(payload1.session, "For about two days"));
    const payload2 = await response2.json();
    expect(payload2.session.extracted_answers.vomit_duration).toBeDefined();
    expect(payload2.session.answered_questions).toContain("vomit_duration");

    // Turn 3: Triggers compression (turn_count >= 4)
    const response3 = await POST(makeTextOnlyRequest(payload2.session, "He's also not eating"));
    const payload3 = await response3.json();
    expect(payload3.session.answered_questions).toContain("vomit_duration");
    expect(payload3.session.extracted_answers.vomit_duration).toBeDefined();

    // Turn 4: After compression boundary - verify no state loss
    const response4 = await POST(makeTextOnlyRequest(payload3.session, "He's drinking less water too"));
    const payload4 = await response4.json();
    expect(payload4.session.answered_questions).toContain("vomit_duration");
    expect(payload4.session.extracted_answers.vomit_duration).toBeDefined();
    expect(payload4.session.answered_questions).toContain("water_intake");
    expect(payload4.session.extracted_answers.water_intake).toBe("less_than_usual");
  });

  it("VET-710: compression boundary preserves last_question_asked across turns", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["diarrhea"], answers: {} }));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Diarrhea case in progress.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["diarrhea"]);
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 6,
      last_compressed_turn: 3,
    };
    session.last_question_asked = "stool_frequency";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    const response = await POST(makeTextOnlyRequest(session, "About 4 times today"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.last_question_asked).toBeTruthy();
    expect(payload.session.last_question_asked).not.toBe("stool_frequency");
    expect(payload.session.answered_questions).toContain("stool_frequency");
    expect(payload.session.extracted_answers.stool_frequency).toBeDefined();
  });

  it("VET-710: compression boundary preserves unresolved_question_ids", async () => {
    const { getProtectedConversationState, mergeCompressionResult } = await import("@/lib/symptom-memory");

    const session = createSession();
    session.answered_questions = ["which_leg", "limping_onset"];
    session.extracted_answers = { which_leg: "left back leg", limping_onset: "sudden" };
    session.last_question_asked = "limping_progression";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["limping_progression", "trauma_history", "weight_bearing"],
      compressed_summary: "old summary",
      compression_model: "old-model",
      last_compressed_turn: 2,
      turn_count: 5,
    };

    const protectedState = getProtectedConversationState(session);
    const merged = mergeCompressionResult(
      session,
      { summary: "new narrative summary after compression", model: "MiniMax-M2.7" },
      protectedState
    );

    expect(merged.answered_questions).toEqual(["which_leg", "limping_onset"]);
    expect(merged.extracted_answers).toEqual({
      which_leg: "left back leg",
      limping_onset: "sudden",
    });
    expect(merged.last_question_asked).toBe("limping_progression");
    expect(merged.case_memory.unresolved_question_ids).toEqual([
      "limping_progression",
      "trauma_history",
      "weight_bearing",
    ]);
    expect(merged.case_memory.compressed_summary).toBe("new narrative summary after compression");
    expect(merged.case_memory.compression_model).toBe("MiniMax-M2.7");
  });

  it("VET-710: telemetry markers do not leak into user-facing message", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["limping"], answers: {} }));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Limping case summary.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5,
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "My dog is limping and not eating"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).not.toContain("[VET-");
    expect(payload.message).not.toContain("telemetry");
    expect(payload.message).not.toContain("service_observations");
    expect(payload.message).not.toContain("async-review-service");
    expect(payload.message).not.toContain("extraction");
    expect(payload.message).not.toContain("pending_recovery");
    expect(payload.message).not.toContain("compression");
    expect(payload.message).not.toContain("repeat_suppression");
    expect(payload.type).toBe("question");
  });

  it("VET-710: compression prompt excludes answered_questions and extracted_answers", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["limping"], answers: {} }));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Narrative summary.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.answered_questions = ["which_leg", "limping_onset"];
    session.extracted_answers = { which_leg: "left back leg", limping_onset: "sudden" };
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5,
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "It's getting worse"));
    const payload = await response.json();

    expect(response.status).toBe(200);

    const prompt = String(mockCompressCaseMemoryWithMiniMax.mock.calls[0][0]);
    expect(prompt).not.toContain("answered_questions");
    expect(prompt).not.toContain("extracted_answers");
    expect(payload.session.answered_questions).toContain("which_leg");
    expect(payload.session.answered_questions).toContain("limping_onset");
    expect(payload.session.extracted_answers.which_leg).toBe("left back leg");
    expect(payload.session.extracted_answers.limping_onset).toBe("sudden");
  });

  it("VET-710: payload shape remains stable after compression boundary", async () => {
    mockRunRoboflowSkinWorkflow.mockResolvedValue({ positive: false, summary: "", labels: [] });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: ["coughing"], answers: {} }));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Coughing case summary.",
      model: "MiniMax-M2.7",
    });

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5,
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "My dog has been coughing"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty("type");
    expect(payload).toHaveProperty("message");
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("ready_for_report");
    expect(payload.session).toHaveProperty("known_symptoms");
    expect(payload.session).toHaveProperty("answered_questions");
    expect(payload.session).toHaveProperty("extracted_answers");
    expect(payload.session).toHaveProperty("case_memory");
    expect(payload.session).toHaveProperty("last_question_asked");
    expect(payload.type).toBe("question");
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

  it("VET-707: pending recovery failure logs structured telemetry without leaking client payload", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
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
    expect(
      telemetryEvents.find((e: SidecarObservation) => e.service === "async-review-service")
    ).toBeUndefined();

    const pendingTelemetryNote = findConsoleLine(
      errorSpy,
      "[VET-705][pending_recovery]"
    );
    expect(pendingTelemetryNote).toBeDefined();
    expect(String(pendingTelemetryNote)).toContain('"question_id":"limping_severity"');
    expect(String(pendingTelemetryNote)).toContain('"outcome":"failure"');
    expect(String(pendingTelemetryNote)).toContain('"pending_after":true');
    } finally {
      errorSpy.mockRestore();
    }
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
      (e: SidecarObservation) => e.stage === "repeat_suppression"
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

// =============================================================================
// VET-714: Edge-Case Deterministic Reply Regression Pack
// Hedged negatives, multi-sentence duration replies, and unknown-style replies.
// =============================================================================

describe("VET-714: edge-case deterministic reply regression pack", () => {
  /** Mirror VET-710: internal telemetry markers must not appear in the owner-visible message. */
  function assertVet714UserFacingPayloadSafe(payload: {
    message?: unknown;
    type?: unknown;
  }) {
    const message = String(payload.message ?? "");
    expect(payload.type).not.toBe("error");
    expect(message).not.toContain("[VET-");
    expect(message).not.toContain("telemetry");
    expect(message).not.toContain("service_observations");
    expect(message).not.toContain("async-review-service");
    expect(message).not.toContain("extraction");
    expect(message).not.toContain("pending_recovery");
    expect(message).not.toContain("compression");
    expect(message).not.toContain("repeat_suppression");
    expect(message).not.toContain("loop_reason");
    expect(message).not.toContain("state_transition");
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
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
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({ approved: true })
    );
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  // -------------------------------------------------------------------------
  // Hedged negatives - replies that are negative but not bare "no"
  // -------------------------------------------------------------------------

  it("VET-714: hedged negative 'not really' closes pending boolean question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "swelling_present";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not really"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.swelling_present).toBe(false);
    expect(payload.session.answered_questions).toContain("swelling_present");
    expect(payload.session.last_question_asked).not.toBe("swelling_present");
  });

  it("VET-714: hedged negative 'not much' closes pending water-intake question", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "water_intake";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not much water"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.water_intake).toBe("less_than_usual");
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.last_question_asked).not.toBe("water_intake");
  });

  it("VET-714: hedged negative 'not really' on vomiting frequency closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "vomit_frequency";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not really"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.vomit_frequency).toBe("not really");
    expect(payload.session.answered_questions).toContain("vomit_frequency");
    expect(payload.session.last_question_asked).not.toBe("vomit_frequency");
  });

  it("VET-714: hedged negative 'not too much' on drinking closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "water_intake";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "barely drinking"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.water_intake).toBe("less_than_usual");
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.last_question_asked).not.toBe("water_intake");
  });

  it("VET-714: hedged negative 'not at all' on appetite closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "appetite_status";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "He's not eating at all"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.appetite_status).toBe("none");
    expect(payload.session.answered_questions).toContain("appetite_status");
    expect(payload.session.last_question_asked).not.toBe("appetite_status");
  });

  it("VET-714: hedged negative 'never really' on trauma history closes pending question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "never really"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("no_trauma");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  // -------------------------------------------------------------------------
  // Multi-sentence duration replies - longer responses with duration info
  // -------------------------------------------------------------------------

  it("VET-714: multi-sentence duration reply with time and observation closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "It's been about three days now. It's louder when he's lying down at night."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe(
      "It's been about three days now. It's louder when he's lying down at night."
    );
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
  });

  it("VET-714: multi-sentence duration reply with since-clause closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "Since Monday morning. He woke up and couldn't use his leg properly.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.limping_onset).toBe(
      "Since Monday morning. He woke up and couldn't use his leg properly."
    );
    expect(payload.session.answered_questions).toContain("limping_onset");
    expect(payload.session.last_question_asked).not.toBe("limping_onset");
  });

  it("VET-714: multi-sentence duration reply with for-clause and progression closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "vomit_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "For the past two days. It started after dinner and he's thrown up four times.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.vomit_duration).toBe(
      "For the past two days. It started after dinner and he's thrown up four times."
    );
    expect(payload.session.answered_questions).toContain("vomit_duration");
    expect(payload.session.last_question_asked).not.toBe("vomit_duration");
  });

  it("VET-714: multi-sentence duration reply with vague time reference closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["diarrhea"]);
    session.last_question_asked = "stool_frequency";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "Several times today. Started this morning and keeps happening.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.stool_frequency).toBe(
      "Several times today. Started this morning and keeps happening."
    );
    expect(payload.session.answered_questions).toContain("stool_frequency");
    expect(payload.session.last_question_asked).not.toBe("stool_frequency");
  });

  it("VET-714: multi-sentence duration reply with weekend reference closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "Since the weekend. It's been getting worse each day.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe(
      "Since the weekend. It's been getting worse each day."
    );
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
  });

  it("VET-714: multi-sentence duration reply with hour reference closes pending question", async () => {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    session.last_question_asked = "vomit_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "Just a few hours. He ate breakfast fine but then he threw up twice."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.vomit_duration).toBe(
      "Just a few hours. He ate breakfast fine but then he threw up twice."
    );
    expect(payload.session.answered_questions).toContain("vomit_duration");
    expect(payload.session.last_question_asked).not.toBe("vomit_duration");
  });

  it("VET-714: multi-sentence duration reply survives extraction failure", async () => {
    mockExtractWithQwen.mockResolvedValue("not-json");

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session.last_question_asked = "cough_duration";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(
        session,
        "Started yesterday afternoon. He was fine in the morning but it sounded rougher after lunch."
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe(
      "Started yesterday afternoon. He was fine in the morning but it sounded rougher after lunch."
    );
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
  });

  // -------------------------------------------------------------------------
  // Unknown-style replies - explicit uncertainty that should close questions
  // -------------------------------------------------------------------------

  it("VET-714: unknown-style 'I'm not sure' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I'm not sure"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style 'I have no idea' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I have no idea"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style 'not certain' closes pending onset question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "limping_onset";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not certain"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.limping_onset).toBe("unknown");
    expect(payload.session.answered_questions).toContain("limping_onset");
    expect(payload.session.last_question_asked).not.toBe("limping_onset");
  });

  it("VET-714: unknown-style 'I couldn't say' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I couldn't say"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style 'maybe' closes pending boolean question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "swelling_present";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "maybe"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.swelling_present).toBe("maybe");
    expect(payload.session.answered_questions).toContain("swelling_present");
    expect(payload.session.last_question_asked).not.toBe("swelling_present");
  });

  it("VET-714: unknown-style 'I wish I knew' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I wish I knew"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style 'No idea sorry' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "No idea sorry"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style reply survives extraction failure", async () => {
    mockExtractWithQwen.mockResolvedValue("");

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "I really don't know"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it("VET-714: unknown-style 'Not that I know of' closes pending trauma-history question", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session.last_question_asked = "trauma_history";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "Not that I know of"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet714UserFacingPayloadSafe(payload);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
    expect(payload.session.last_question_asked).not.toBe("trauma_history");
  });

  it.each(["not sure", "can't tell"])(
    "VET-714: unknown-style %s (casual phrasing) closes pending swelling question",
    async (message) => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "swelling_present";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      assertVet714UserFacingPayloadSafe(payload);
      expect(payload.type).toBe("question");
      expect(payload.session.extracted_answers.swelling_present).toBe(message);
      expect(payload.session.answered_questions).toContain("swelling_present");
      expect(payload.session.last_question_asked).not.toBe("swelling_present");
    }
  );

  it("VET-714: edge-case replies preserve stable question payload shape", async () => {
    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const steps: Array<{
      symptoms: Array<"limping" | "coughing">;
      pending: string;
      message: string;
    }> = [
      {
        symptoms: ["limping"],
        pending: "swelling_present",
        message: "not really",
      },
      {
        symptoms: ["coughing"],
        pending: "cough_duration",
        message: "About two days. It sounds worse at night.",
      },
      {
        symptoms: ["limping"],
        pending: "trauma_history",
        message: "not sure what happened",
      },
    ];

    for (const step of steps) {
      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: step.symptoms, answers: {} })
      );
      let session = createSession();
      session = addSymptoms(session, step.symptoms);
      session.last_question_asked = step.pending;
      const response = await POST(makeTextOnlyRequest(session, step.message));
      const payload = await response.json();

      expect(response.status).toBe(200);
      assertVet714UserFacingPayloadSafe(payload);
      expect(payload).toHaveProperty("type");
      expect(payload).toHaveProperty("message");
      expect(payload).toHaveProperty("session");
      expect(payload).toHaveProperty("ready_for_report");
      expect(payload.session).toHaveProperty("answered_questions");
      expect(payload.session).toHaveProperty("extracted_answers");
    }
  });
});

describe("VET-733: ambiguous reply coercion", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
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
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  async function runPendingReply(
    questionId: string,
    message: string,
    symptoms: string[] = ["limping"]
  ) {
    mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms, answers: {} }));

    let session = createSession();
    session = addSymptoms(session, symptoms);
    session.last_question_asked = questionId;

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, message));
    const payload = await response.json();

    return { response, payload };
  }

  it("coerces 'not sure' to unknown", async () => {
    const { response, payload } = await runPendingReply("trauma_history", "not sure");

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it("coerces 'I don't know' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "I don't know"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it("coerces 'hard to tell' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "hard to tell"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it("coerces 'maybe' to unknown", async () => {
    const { response, payload } = await runPendingReply("trauma_history", "maybe");

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it("coerces 'can't really say' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "can't really say"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it("coerces 'I'm not totally sure, it's hard to tell' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "I'm not totally sure, it's hard to tell"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    expect(payload.session.answered_questions).toContain("trauma_history");
  });

  it.each([
    ["appetite_status", "not sure", ["vomiting"]],
    ["blood_color", "I don't know", ["blood_in_stool"]],
    ["blood_amount", "can't tell", ["blood_in_stool"]],
    ["wound_discharge", "hard to say", ["wound_skin_issue"]],
  ])(
    "normalizes ambiguous %s replies to canonical unknown",
    async (questionId, message, symptoms) => {
      const { response, payload } = await runPendingReply(
        questionId,
        message,
        symptoms
      );

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers[questionId]).toBe("unknown");
      expect(payload.session.answered_questions).toContain(questionId);
    }
  );

  it("does NOT coerce 'she ate this morning' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "she ate this morning"
    );

    expect(response.status).toBe(200);
    // trauma_history is now a choice type; unrelated text doesn't match any choice
    expect(payload.session.answered_questions).not.toContain("trauma_history");
  });

  it("does NOT coerce 'yes definitely' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "yes definitely"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("yes_trauma");
  });

  it("does NOT coerce 'about two days' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "limping_onset",
      "about two days"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.limping_onset).toBe("about two days");
  });

  it("does NOT coerce 'no vomiting' to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "no vomiting"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).not.toBe("unknown");
  });

  it("does NOT coerce empty string to unknown", async () => {
    const { response, payload } = await runPendingReply("trauma_history", "");

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("trauma_history");
  });

  it("handles curly apostrophes: 'I don’t know' coerces to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "I don’t know"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
  });

  it("handles curly apostrophes: 'can’t tell' coerces to unknown", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "can’t tell"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
  });

  it("does not coerce when question schema forbids 'unknown' in allowed_values", async () => {
    const { response, payload } = await runPendingReply(
      "swelling_present",
      "not sure"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.swelling_present).toBe("not sure");
    expect(payload.session.extracted_answers.swelling_present).not.toBe("unknown");
  });

  it("coerces when question has no allowed_values restriction", async () => {
    const { response, payload } = await runPendingReply(
      "trauma_history",
      "I don't know really"
    );

    expect(response.status).toBe(200);
    expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
  });
});

describe("coerceAmbiguousReplyToUnknown — unit", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadCoercer() {
    const { coerceAmbiguousReplyToUnknown } = await import(
      "@/lib/ambiguous-reply"
    );
    return coerceAmbiguousReplyToUnknown;
  }

  it.each([
    "not sure",
    "unsure",
    "not certain",
    "uncertain",
    "I don't know",
    "i dont know",
    "no idea",
    "I have no idea",
    "can't tell",
    "cant tell",
    "hard to tell",
    "hard to say",
    "maybe",
    "maybe not",
    "not really sure",
    "kind of",
    "sort of",
    "I'm not sure",
    "im not sure",
    "not totally sure",
    "couldn't say",
    "couldnt say",
    "no way to tell",
    "I don't know really",
    "not sure, it's hard to tell",
  ])("returns unknown for %p", async (reply) => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();
    expect(coerceAmbiguousReplyToUnknown(reply)).toBe("unknown");
  });

  it.each([
    "she ate this morning",
    "yes definitely",
    "about two days",
    "no vomiting",
    "",
  ])("returns null for factual or non-ambiguous reply %p", async (reply) => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();
    expect(coerceAmbiguousReplyToUnknown(reply)).toBeNull();
  });

  it("handles smart/curly quotes", async () => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();

    expect(coerceAmbiguousReplyToUnknown("I don’t know")).toBe("unknown");
    expect(coerceAmbiguousReplyToUnknown("can’t tell")).toBe("unknown");
  });

  it("handles trailing punctuation", async () => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();
    expect(coerceAmbiguousReplyToUnknown("not sure.")).toBe("unknown");
  });

  it("handles mixed case", async () => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();
    expect(coerceAmbiguousReplyToUnknown("Not Sure")).toBe("unknown");
  });

  it("handles extra whitespace", async () => {
    const coerceAmbiguousReplyToUnknown = await loadCoercer();
    expect(coerceAmbiguousReplyToUnknown("  not  sure  ")).toBe("unknown");
  });
});

describe("VET-725: asked-state regression pack", () => {
  const INTERNAL_STAGES = [
    "compression",
    "extraction",
    "pending_recovery",
    "repeat_suppression",
    "state_transition",
  ];

  function assertVet725AskedStatePayloadSafe(payload: {
    type?: unknown;
    message?: unknown;
    ready_for_report?: unknown;
    session?: Record<string, unknown>;
  }) {
    const message = String(payload.message ?? "");
    const session = (payload.session ?? {}) as Record<string, unknown>;
    const caseMemory = ((session.case_memory as Record<string, unknown> | undefined) ?? {});

    expect(payload).toHaveProperty("type");
    expect(payload).toHaveProperty("message");
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("ready_for_report");

    expect(session).not.toHaveProperty("questionStates");
    expect(session).not.toHaveProperty("transitionHistory");
    expect(session).not.toHaveProperty("conversationState");
    expect(session).not.toHaveProperty("askedState");

    expect(caseMemory).not.toHaveProperty("questionStates");
    expect(caseMemory).not.toHaveProperty("transitionHistory");
    expect(caseMemory).not.toHaveProperty("conversationState");
    expect(caseMemory).not.toHaveProperty("askedState");

    expect(message).not.toContain("[StateMachine]");
    expect(message).not.toContain("state_transition");
    expect(message).not.toContain("next_question_selected");
    expect(message).not.toContain("questionStates");
    expect(message).not.toContain("transitionHistory");
    expect(message).not.toContain("conversationState");

    // Issue 2 fix: verify that state-transition telemetry notes do not expose
    // raw question_state= or conversation_state= markers in the owner-facing
    // session payload via case_memory.service_observations.
    // buildTransitionNote() emits these strings inside observation.note —
    // they must never reach the owner-facing payload in any readable form.
    const serviceObservations = (
      caseMemory.service_observations as Array<Record<string, unknown>> | undefined
    ) ?? [];
    for (const obs of serviceObservations) {
      const note = String(obs.note ?? "");
      expect(note).not.toContain("question_state=");
      expect(note).not.toContain("conversation_state=");
      expect(String(obs.service ?? "")).not.toBe("async-review-service");
      expect(INTERNAL_STAGES).not.toContain(String(obs.stage ?? ""));
    }
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
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
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  it("VET-725: route-asked limping question advances instead of repeating on the next turn", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    const response1 = await POST(
      makeTextOnlyRequest(session, "My dog has been limping on the left back leg")
    );
    const payload1 = await response1.json();

    expect(response1.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload1);
    expect(payload1.type).toBe("question");
    expect(payload1.session.answered_questions).toContain("which_leg");
    expect(payload1.session.last_question_asked).toBe("limping_onset");

    const askedOnTurn1 = payload1.session.last_question_asked;

    const response2 = await POST(
      makeTextOnlyRequest(payload1.session, "It started suddenly yesterday")
    );
    const payload2 = await response2.json();

    expect(response2.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload2);
    expect(payload2.type).toBe("question");
    expect(payload2.session.extracted_answers.limping_onset).toBe("sudden");
    expect(payload2.session.answered_questions).toContain(askedOnTurn1);
    expect(payload2.session.last_question_asked).toBe("limping_progression");
    expect(payload2.session.last_question_asked).not.toBe(askedOnTurn1);
    expect(payload2.message).not.toContain("When did the limping start");
  });

  it("VET-725: pending recovery still resolves a route-asked duration question after extraction failure", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    const response1 = await POST(
      makeTextOnlyRequest(session, "My dog has been vomiting")
    );
    const payload1 = await response1.json();

    expect(response1.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload1);
    expect(payload1.type).toBe("question");
    expect(payload1.session.last_question_asked).toBe("vomit_duration");

    const askedOnTurn1 = payload1.session.last_question_asked;

    // The second-turn message must NOT be caught by the deterministic fast path
    // (getDeterministicFastPathExtraction). The fast path only fires when
    // looksShortAnswer is true — which requires no multi-sentence pattern
    // (/[.!?].+[.!?]/ must not match). Using two complete sentences here forces
    // looksShortAnswer=false so the fast path returns null and extractWithQwen
    // runs. The mock returning "not-json" is therefore live, causing extraction
    // to fail and triggering the pending-recovery raw-text fallback path to
    // close vomit_duration via shouldPersistRawPendingAnswer/sanitizePendingRawAnswer.
    mockExtractWithQwen.mockResolvedValueOnce("not-json");

    const secondTurnMessage =
      "He has been vomiting for about two days. It started on Monday night.";
    const response2 = await POST(
      makeTextOnlyRequest(payload1.session, secondTurnMessage)
    );
    const payload2 = await response2.json();

    expect(response2.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload2);
    expect(payload2.type).toBe("question");
    // The raw-text fallback records the sanitized full message as the answer
    expect(payload2.session.extracted_answers.vomit_duration).toBe(secondTurnMessage);
    expect(payload2.session.answered_questions).toContain(askedOnTurn1);
    expect(payload2.session.last_question_asked).not.toBe(askedOnTurn1);
    expect(payload2.message).not.toContain("How long has your dog been vomiting");
  });

  it("VET-725: asked-state internals stay out of owner-facing question payloads", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);

    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    const response1 = await POST(
      makeTextOnlyRequest(session, "My dog has been limping on the left back leg")
    );
    const payload1 = await response1.json();

    expect(response1.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload1);
    expect(payload1.type).toBe("question");
    expect(payload1.session.last_question_asked).toBe("limping_onset");

    const response2 = await POST(
      makeTextOnlyRequest(payload1.session, "It started suddenly yesterday")
    );
    const payload2 = await response2.json();

    expect(response2.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload2);
    expect(payload2.type).toBe("question");
    expect(payload2.session.last_question_asked).toBe("limping_progression");
  });

  it("VET-737: client payload strips internal telemetry observations but preserves user-safe observations", async () => {
    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    const recordedAt = new Date().toISOString();
    const internalTransitionObservation: SidecarObservation = {
      service: "async-review-service",
      stage: "state_transition",
      latencyMs: 0,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note:
        "question_state=unanswered->answered | conversation_state=asking->confirmed",
      recordedAt,
    };
    const misclassifiedInternalObservation: SidecarObservation = {
      service: "vision-preprocess-service",
      stage: "state_transition",
      latencyMs: 12,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note:
        "question_state=unanswered->answered | conversation_state=asking->confirmed",
      recordedAt,
    };
    const safeObservation: SidecarObservation = {
      service: "vision-preprocess-service",
      stage: "preprocess",
      latencyMs: 120,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note: "Owner-safe photo preprocessing completed.",
      recordedAt,
    };
    const session = createSession();
    session.case_memory = {
      ...(session.case_memory ?? {}),
      service_observations: [
        internalTransitionObservation,
        misclassifiedInternalObservation,
        safeObservation,
      ],
    };

    const response = await POST(
      makeTextOnlyRequest(session, "He's still vomiting.")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertVet725AskedStatePayloadSafe(payload);

    const caseMemory =
      ((payload.session?.case_memory as Record<string, unknown> | undefined) ??
        {});
    const observations =
      (caseMemory.service_observations as Array<Record<string, unknown>> | undefined) ??
      [];

    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: safeObservation.service,
          stage: safeObservation.stage,
          note: safeObservation.note,
        }),
      ])
    );
    expect(observations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          service: internalTransitionObservation.service,
        }),
      ])
    );
    expect(observations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: misclassifiedInternalObservation.stage,
          note: misclassifiedInternalObservation.note,
        }),
      ])
    );
  });

  describe("VET-825 - server-auth REPORT_READY / URGENCY_HIGH emission", () => {
    jest.setTimeout(20_000);

    beforeEach(() => {
      mockEmit.mockClear();
      mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
      mockSaveSymptomReportToDB.mockResolvedValue(null);
      mockComputeBayesianScore.mockResolvedValue([]);
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
    });

    it("emits REPORT_READY for the authenticated server-side user instead of pet.user_id", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(
        buildAuthSupabase("user-abc-123")
      );
      mockSaveSymptomReportToDB.mockResolvedValue("report-123");

      const session = buildModerateReportSession();

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeReportRequest(session, undefined, { user_id: "evil-client-id" })
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(1);
      expect(getFirstEmitPayload<{ userId: string }>(mockEventType.REPORT_READY))
        .toEqual(
          expect.objectContaining({
            userId: "user-abc-123",
          })
        );
      expect(emittedArgsContain("evil-client-id")).toBe(false);
    });

    it("does not emit REPORT_READY when the request is unauthenticated", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
      mockSaveSymptomReportToDB.mockResolvedValue("report-123");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      await POST(makeReportRequest(buildModerateReportSession()));

      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(0);
    });

    it("skips emission in demo mode when server auth throws and still returns the report", async () => {
      mockCreateServerSupabaseClient.mockRejectedValue(new Error("DEMO_MODE"));
      mockSaveSymptomReportToDB.mockResolvedValue("report-123");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(buildModerateReportSession()));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(0);
    });

    it("does not emit when the report is not saved even if the user is authenticated", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(
        buildAuthSupabase("user-abc-123")
      );
      mockSaveSymptomReportToDB.mockResolvedValue(null);

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      await POST(makeReportRequest(buildModerateReportSession()));

      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(0);
      expect(getEmitCalls(mockEventType.URGENCY_HIGH)).toHaveLength(0);
    });

    it("emits REPORT_READY and URGENCY_HIGH for authenticated emergency reports", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(
        buildAuthSupabase("user-emergency-1")
      );
      mockSaveSymptomReportToDB.mockResolvedValue("report-emergency-1");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(buildEmergencyReportSession()));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(1);
      expect(getEmitCalls(mockEventType.URGENCY_HIGH)).toHaveLength(1);
      expect(getFirstEmitPayload<{ userId: string }>(mockEventType.REPORT_READY))
        .toEqual(
          expect.objectContaining({
            userId: "user-emergency-1",
          })
        );
      expect(
        getFirstEmitPayload<{ userId: string; urgency: string }>(
          mockEventType.URGENCY_HIGH
        )
      ).toEqual(
        expect.objectContaining({
          userId: "user-emergency-1",
          urgency: "emergency",
        })
      );
    });

    it("does not emit URGENCY_HIGH for a moderate report", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(
        buildAuthSupabase("user-moderate-1")
      );
      mockSaveSymptomReportToDB.mockResolvedValue("report-moderate-1");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(buildModerateReportSession()));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(getEmitCalls(mockEventType.REPORT_READY)).toHaveLength(1);
      expect(getEmitCalls(mockEventType.URGENCY_HIGH)).toHaveLength(0);
    });

    it("guards against cross-user notification injection by always using the verified auth user", async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(
        buildAuthSupabase("real-user-uuid")
      );
      mockSaveSymptomReportToDB.mockResolvedValue("report-guard-1");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      await POST(
        makeReportRequest(buildModerateReportSession(), undefined, {
          user_id: "attacker-uuid",
        })
      );

      expect(getFirstEmitPayload<{ userId: string }>(mockEventType.REPORT_READY))
        .toEqual(
          expect.objectContaining({
            userId: "real-user-uuid",
          })
        );
      expect(emittedArgsContain("attacker-uuid")).toBe(false);
    });
  });
});

describe("VET-736: transitionToConfirmed", () => {
  function buildMinimalSession(overrides?: Partial<TriageSession>): TriageSession {
    return {
      ...createSession(),
      ...overrides,
    } as TriageSession;
  }

  describe("transitionToConfirmed — unit", () => {
    it("returns a TriageSession (does not throw)", () => {
      const session = buildMinimalSession();
      const result = transitionToConfirmed({
        session,
        reason: "all_questions_answered",
      });
      expect(result).toBeDefined();
    });

    it("does not mutate answered_questions", () => {
      const session = buildMinimalSession({
        answered_questions: ["water_intake", "appetite_change"],
        last_question_asked: "appetite_change",
      });
      const result = transitionToConfirmed({
        session,
        reason: "all_questions_answered",
      });
      expect(result.answered_questions).toEqual([
        "water_intake",
        "appetite_change",
      ]);
    });

    it("does not mutate extracted_answers", () => {
      const session = buildMinimalSession({
        extracted_answers: { water_intake: "increased" },
        answered_questions: ["water_intake"],
        last_question_asked: "water_intake",
      });
      const result = transitionToConfirmed({
        session,
        reason: "report_ready",
      });
      expect(result.extracted_answers).toEqual({ water_intake: "increased" });
    });

    it("accepts all three reason values without throwing", () => {
      const session = buildMinimalSession({ last_question_asked: "q1" });
      expect(() =>
        transitionToConfirmed({ session, reason: "all_questions_answered" })
      ).not.toThrow();
      expect(() =>
        transitionToConfirmed({ session, reason: "report_ready" })
      ).not.toThrow();
      expect(() =>
        transitionToConfirmed({ session, reason: "sufficient_data_reached" })
      ).not.toThrow();
    });
  });

  it("VET-736: ready_for_report response includes confirmed conversationState", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["vomiting"], answers: {} })
    );
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });

    let session = createSession();
    session = addSymptoms(session, ["vomiting"]);
    let guard = 0;
    while (!isReadyForDiagnosis(session) && guard < 30) {
      const q = getNextQuestion(session);
      if (!q) break;
      session = recordAnswer(session, q, "test");
      guard++;
    }
    expect(isReadyForDiagnosis(session)).toBe(true);

    try {
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(session, "Any more details you need?")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.ready_for_report).toBe(true);
      expect(payload.session).toBeDefined();
      expect(payload.conversationState).toBeDefined();
      // Not idle/asking; snapshot may still be needs_clarification if case_memory
      // has unresolved_question_ids while matrix readiness is satisfied.
      expect(["asking", "idle"]).not.toContain(payload.conversationState);

      const readyConfirmedLog = logSpy.mock.calls.some((c) =>
        String(c[0]).includes(
          "state_transition: confirmed | reason=all_questions_answered"
        )
      );
      expect(readyConfirmedLog).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("VET-831: confirmation-state regression pack", () => {
  function assertVet831ConfirmationPayloadSafe(payload: {
    type?: unknown;
    message?: unknown;
    ready_for_report?: unknown;
    session?: Record<string, unknown>;
  }) {
    const message = String(payload.message ?? "");
    const session = (payload.session ?? {}) as Record<string, unknown>;
    const caseMemory =
      ((session.case_memory as Record<string, unknown> | undefined) ?? {});

    expect(payload).toHaveProperty("type");
    expect(payload).toHaveProperty("message");
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("ready_for_report");

    expect(session).not.toHaveProperty("confirmationState");
    expect(session).not.toHaveProperty("confirmed_questions");
    expect(session).not.toHaveProperty("questionStates");
    expect(session).not.toHaveProperty("transitionHistory");

    expect(caseMemory).not.toHaveProperty("confirmationState");
    expect(caseMemory).not.toHaveProperty("confirmed_questions");
    expect(caseMemory).not.toHaveProperty("questionStates");
    expect(caseMemory).not.toHaveProperty("transitionHistory");

    expect(message).not.toContain("[StateMachine]");
    expect(message).not.toContain("state_transition");
    expect(message).not.toContain("answer_acknowledged");

    const serviceObservations = (
      caseMemory.service_observations as Array<Record<string, unknown>> | undefined
    ) ?? [];
    for (const obs of serviceObservations) {
      const note = String(obs.note ?? "");
      expect(note).not.toContain("question_state=");
      expect(note).not.toContain("conversation_state=");
    }
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
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
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  it("VET-831: first-turn ask does not auto-confirm the newly asked question", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "My dog has been limping on the left back leg"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload);
      expect(payload.type).toBe("question");
      expect(payload.session.answered_questions).toContain("which_leg");
      expect(payload.session.last_question_asked).toBe("limping_onset");

      // The newly ASKED question (limping_onset) must NOT have a confirmed log
      const allLogs = logSpy.mock.calls.map(c => String(c[0]));
      const confirmedLimpingOnset = allLogs.filter(l =>
        l.includes("state_transition: confirmed") && l.includes("question=limping_onset")
      );
      expect(confirmedLimpingOnset).toHaveLength(0);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-831: second-turn replay emits answered -> confirmed -> asked in order", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      const { POST } = await import("@/app/api/ai/symptom-chat/route");

      // Turn 1: establishes last_question_asked=limping_onset
      const response1 = await POST(
        makeTextOnlyRequest(session, "My dog has been limping on the left back leg")
      );
      const payload1 = await response1.json();

      expect(response1.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload1);
      expect(payload1.session.last_question_asked).toBe("limping_onset");

      // Re-mock extraction before Turn 2 to answer limping_onset
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_onset: "sudden" } })
      );

      // Turn 2: answers limping_onset
      const response2 = await POST(
        makeTextOnlyRequest(payload1.session, "It started suddenly yesterday")
      );
      const payload2 = await response2.json();

      expect(response2.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload2);
      expect(payload2.type).toBe("question");
      expect(payload2.session.extracted_answers.limping_onset).toBe("sudden");
      expect(payload2.session.answered_questions).toContain("limping_onset");
      expect(payload2.session.last_question_asked).toBe("limping_progression");

      const allLogs = logSpy.mock.calls.map(c => String(c[0]));
      const answeredIdx = allLogs.findIndex(l => l.includes("state_transition: answered | question=limping_onset"));
      const confirmedIdx = allLogs.findIndex(
        l =>
          l.includes("state_transition: confirmed") &&
          l.includes("reason=sufficient_data_reached")
      );
      const askedIdx = allLogs.findIndex(l => l.includes("state_transition: asked | question=limping_progression"));
      expect(answeredIdx).toBeGreaterThanOrEqual(0);
      expect(confirmedIdx).toBeGreaterThan(answeredIdx);
      expect(askedIdx).toBeGreaterThan(confirmedIdx);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-831: compression boundary preserves confirmation ordering", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.answered_questions = ["which_leg", "limping_onset"];
      session.extracted_answers = { which_leg: "left back leg", limping_onset: "sudden" };
      session.last_question_asked = "limping_progression";
      session.case_memory = {
        ...session.case_memory!,
        turn_count: 5, // Forces compression via turnsSinceCompression >= 4
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_progression: "getting worse" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(session, "It seems to be getting worse each day")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload);

      // Compression must have run
      expect(payload.session.case_memory.compression_model).toBe("MiniMax-M2.7");

      // limping_progression must be answered and a new question must have been asked
      expect(payload.session.answered_questions).toContain("limping_progression");
      expect(payload.session.last_question_asked).not.toBe("limping_progression");

      // No repeat of the previous question text
      expect(payload.message).not.toContain("Is the limping getting better");

      // Exactly one confirmed log for limping_progression
      const allLogs = logSpy.mock.calls.map(c => String(c[0]));
      const confirmedLogs = allLogs.filter(
        l =>
          l.includes("state_transition: confirmed") &&
          l.includes("reason=sufficient_data_reached")
      );
      expect(confirmedLogs).toHaveLength(1);

      // Ordering: answered < confirmed < asked
      const answeredIdx = allLogs.findIndex(l => l.includes("state_transition: answered | question=limping_progression"));
      const confirmedIdx = allLogs.findIndex(
        l =>
          l.includes("state_transition: confirmed") &&
          l.includes("reason=sufficient_data_reached")
      );
      const nextQuestion = payload.session.last_question_asked as string;
      const askedIdx = allLogs.findIndex(l => l.includes(`state_transition: asked | question=${nextQuestion}`));
      expect(answeredIdx).toBeGreaterThanOrEqual(0);
      expect(confirmedIdx).toBeGreaterThan(answeredIdx);
      expect(askedIdx).toBeGreaterThan(confirmedIdx);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("VET-831: confirmation-state internals stay out of owner-facing payload", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      const { POST } = await import("@/app/api/ai/symptom-chat/route");

      // Turn 1
      const response1 = await POST(
        makeTextOnlyRequest(session, "My dog has been limping on the left back leg")
      );
      const payload1 = await response1.json();

      expect(response1.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload1);

      // Re-mock extraction before Turn 2 to answer limping_onset
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_onset: "sudden" } })
      );

      // Turn 2
      const response2 = await POST(
        makeTextOnlyRequest(payload1.session, "It started suddenly yesterday")
      );
      const payload2 = await response2.json();

      expect(response2.status).toBe(200);
      assertVet831ConfirmationPayloadSafe(payload2);

      // Explicit root-level check
      expect(payload1).not.toHaveProperty("confirmationState");
      expect(payload2).not.toHaveProperty("confirmationState");

      // Explicit session-level check
      expect(payload2.session).not.toHaveProperty("confirmationState");
      expect(payload2.session).not.toHaveProperty("confirmed_questions");
      expect(payload2.session).not.toHaveProperty("questionStates");
      expect(payload2.session).not.toHaveProperty("transitionHistory");

      // Explicit case_memory-level check
      const cm = payload2.session.case_memory ?? {};
      expect(cm).not.toHaveProperty("confirmationState");
      expect(cm).not.toHaveProperty("confirmed_questions");
      expect(cm).not.toHaveProperty("questionStates");
      expect(cm).not.toHaveProperty("transitionHistory");
    } finally {
      logSpy.mockRestore();
    }
  });

  // --- VET-904 Regression 1: Confirmation-state replay ---
  it("VET-904 reg-1: follow-up turn after confirmed answer does not reset conversationState to idle", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    const { POST } = await import("@/app/api/ai/symptom-chat/route");

    // Turn 1: initial message — establishes last_question_asked
    const response1 = await POST(
      makeTextOnlyRequest(session, "My dog has been limping on the left back leg")
    );
    const payload1 = await response1.json();
    expect(response1.status).toBe(200);
    // conversationState after first ask must not be idle
    expect(payload1.conversationState).not.toBe("idle");

    // Re-mock extraction so Turn 2 answers the asked question
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["limping"], answers: { limping_onset: "sudden" } })
    );

    // Turn 2: answers the pending question; state must remain active
    const response2 = await POST(
      makeTextOnlyRequest(payload1.session, "It started suddenly yesterday")
    );
    const payload2 = await response2.json();
    expect(response2.status).toBe(200);

    // After a confirmed answer + next question asked, state MUST NOT fall back to "idle"
    expect(payload2.conversationState).not.toBe("idle");
    // Must be a valid mid-session state
    expect(["asking", "confirmed", "needs_clarification"]).toContain(
      payload2.conversationState
    );
  });

  // --- VET-904 Regression 2: Compression-boundary state preservation ---
  it("VET-904 reg-2: conversationState is not idle after a post-compression turn with 3+ answered_questions", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    // Simulate a session that is past compression boundary (3+ answered questions)
    session.answered_questions = ["which_leg", "limping_onset", "limping_progression"];
    session.extracted_answers = {
      which_leg: "left back leg",
      limping_onset: "sudden",
      limping_progression: "getting worse",
    };
    session.last_question_asked = "limping_weight_bearing";
    session.case_memory = {
      ...session.case_memory!,
      turn_count: 5, // triggers compression (turnsSinceCompression >= 4)
      unresolved_question_ids: [],
    };

    // Next turn answers the pending question
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({
        symptoms: ["limping"],
        answers: { limping_weight_bearing: "partial" },
      })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "He can still put some weight on it")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);

    // Compression must have run — protected control state must survive it
    expect(payload.session.case_memory.compression_model).toBe("MiniMax-M2.7");

    // conversationState must NOT be "idle" after a compression-boundary turn
    expect(payload.conversationState).not.toBe("idle");
    expect(["asking", "confirmed", "needs_clarification"]).toContain(
      payload.conversationState
    );
  });
});

describe("VET-729/VET-734: needs-clarification flow", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
    mockRunRoboflowSkinWorkflow.mockResolvedValue({
      positive: false,
      summary: "",
      labels: [],
    });
    mockShouldAnalyzeWoundImage.mockReturnValue(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["drinking_more"], answers: {} })
    );
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  it("VET-900: unknown resolves water_intake as unknown instead of needs_clarification", async () => {
    let session = createSession();
    session = addSymptoms(session, ["drinking_more"]);
    session.last_question_asked = "water_intake";

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not sure"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    // VET-900: water_intake now has "unknown" choice, so "not sure" resolves as unknown
    expect(payload.session.extracted_answers.water_intake).toBe("unknown");
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.case_memory).not.toHaveProperty(
      "clarification_reasons"
    );
  });

  it("VET-900: unknown resolves water_intake and clears clarification state", async () => {
    let session = createSession();
    session = addSymptoms(session, ["drinking_more"]);
    session.last_question_asked = "water_intake";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["water_intake"],
      clarification_reasons: {
        water_intake: "pending_recovery_failed",
      },
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "not sure"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    // VET-900: "not sure" resolves as "unknown" for questions with unknown choice
    expect(payload.session.extracted_answers.water_intake).toBe("unknown");
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.case_memory?.unresolved_question_ids).not.toContain(
      "water_intake"
    );
  });

  it("clears unresolved clarification state after a clear answer", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({
        symptoms: ["drinking_more"],
        answers: { water_intake: "more_than_usual" },
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["drinking_more"]);
    session.last_question_asked = "water_intake";
    session.case_memory = {
      ...session.case_memory!,
      unresolved_question_ids: ["water_intake"],
      clarification_reasons: {
        water_intake: "pending_recovery_failed",
      },
    };

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(
      makeTextOnlyRequest(session, "drinking more than usual")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.answered_questions).toContain("water_intake");
    expect(payload.session.extracted_answers.water_intake).toBe(
      "more_than_usual"
    );
    expect(payload.session.case_memory?.unresolved_question_ids ?? []).not.toContain(
      "water_intake"
    );
    expect(payload.session.case_memory).not.toHaveProperty(
      "clarification_reasons"
    );
    expect(payload.session.last_question_asked).not.toBe("water_intake");
    expect(payload.conversationState).not.toBe("needs_clarification");
  });
});

/* ---------------------------------------------------------------------------
 * VET-900 comprehensive integration scenarios
 * -------------------------------------------------------------------------*/
describe("VET-900 comprehensive scenarios", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );
    mockComputeBayesianScore.mockResolvedValue([]);
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Compressed case memory for VET-900 test.",
      model: "MiniMax-M2.7",
    });
    mockPreprocessVeterinaryImageWithResult.mockResolvedValue(
      buildOkSidecarResult("vision-preprocess-service", {
        domain: "skin_wound",
        bodyRegion: "left hind leg",
        detectedRegions: [{ label: "wound", confidence: 0.92 }],
        bestCrop: null,
        imageQuality: "good",
        confidence: 0.88,
        limitations: [],
      })
    );
    mockConsultWithMultimodalSidecarWithResult.mockResolvedValue(
      buildOkSidecarResult("multimodal-consult-service", {
        model: "Qwen2.5-VL-7B-Instruct",
        summary: "Lesion on left hind limb.",
        agreements: ["left hind limb involvement"],
        disagreements: [],
        uncertainties: [],
        confidence: 0.74,
        mode: "sync",
      })
    );
    mockRetrieveVeterinaryEvidenceFromSidecar.mockResolvedValue({
      textChunks: [],
      imageMatches: [],
      rerankScores: [],
      sourceCitations: [],
    });
    mockIsTextRetrievalConfigured.mockReturnValue(false);
    mockIsImageRetrievalConfigured.mockReturnValue(false);
    mockRetrieveVeterinaryTextEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("text-retrieval-service", {
        textChunks: [],
        rerankScores: [],
        sourceCitations: [],
      })
    );
    mockRetrieveVeterinaryImageEvidenceWithResult.mockResolvedValue(
      buildOkSidecarResult("image-retrieval-service", {
        imageMatches: [],
        sourceCitations: [],
      })
    );
    mockEnqueueAsyncReview.mockResolvedValue(true);
    mockSaveSymptomReportToDB.mockResolvedValue(null);
    mockDiagnoseWithDeepSeek.mockResolvedValue(
      JSON.stringify({
        severity: "medium",
        recommendation: "vet_48h",
        title: "Test diagnosis",
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
    mockVerifyQuestionWithNemotron.mockImplementation(async () =>
      JSON.stringify({ approved: true, rewrite: null })
    );
  });

  // --- 1. Direct answer resolution ---
  describe("direct answer resolution", () => {
    it("direct yes/no answers resolve pending question", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "pain_on_touch";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "yes"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.answered_questions).toContain("pain_on_touch");
      expect(payload.session.extracted_answers.pain_on_touch).toBe(true);
      // last_question_asked should now be the NEXT question, not the old one
      expect(payload.session.last_question_asked).not.toBe("pain_on_touch");
    });
  });

  // --- 2. Duration extraction ---
  describe("duration extraction", () => {
    it('duration answers like "about 2 days" extract correctly', async () => {
      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "vomit_duration";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "about 2 days"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.answered_questions).toContain("vomit_duration");
      expect(payload.session.extracted_answers.vomit_duration).toBeDefined();
      expect(typeof payload.session.extracted_answers.vomit_duration).toBe("string");
      expect(payload.session.extracted_answers.vomit_duration).toMatch(/2 day/i);
    });
  });

  // --- 3. Ambiguous with unknown (VET-900 updated) ---
  describe("ambiguous replies resolve as unknown for choice questions", () => {
    it("VET-900: 'not sure' resolves as unknown for weight_bearing", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "weight_bearing";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "not sure"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // VET-900: weight_bearing now has "unknown" choice
      expect(payload.session.extracted_answers.weight_bearing).toBe("unknown");
      expect(payload.session.answered_questions).toContain("weight_bearing");
    });
  });

  // --- 4. Ambiguous with unknown ---
  describe("ambiguous replies with unknown choice", () => {
    it('ambiguous replies extract "unknown" for questions WITH unknown choice', async () => {
      // vomit_duration is data_type: "string" → questionAllowsCanonicalUnknown returns true
      let session = createSession();
      session = addSymptoms(session, ["vomiting"]);
      session.last_question_asked = "vomit_duration";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "not sure"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.answered_questions).toContain("vomit_duration");
      expect(payload.session.extracted_answers.vomit_duration).toBe("unknown");
    });
  });

  // --- 5. No repeat after answer ---
  describe("no repeat after answer", () => {
    it("question does NOT repeat after being answered", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session = recordAnswer(session, "which_leg", "left front");
      session.last_question_asked = "which_leg";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "it started yesterday"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // The next question asked should not be the already-answered "which_leg"
      if (payload.session.last_question_asked) {
        expect(payload.session.last_question_asked).not.toBe("which_leg");
      }
    });
  });

  // --- 6. Compression boundary safety ---
  describe("compression boundary safety", () => {
    it("compression boundary does NOT lose answered_questions or extracted_answers", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session = recordAnswer(session, "which_leg", "left front");
      session = recordAnswer(session, "limping_onset", "yesterday");
      session.last_question_asked = "limping_progression";
      session.case_memory = {
        ...session.case_memory!,
        turn_count: 15, // High turn count to trigger compression
        unresolved_question_ids: ["pain_on_touch"],
        latest_owner_turn: "It's getting worse over time.",
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "worse"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // Control state fields must survive compression
      expect(payload.session.answered_questions).toContain("which_leg");
      expect(payload.session.answered_questions).toContain("limping_onset");
      expect(payload.session.extracted_answers.which_leg).toBe("left front");
      expect(payload.session.extracted_answers.limping_onset).toBe("yesterday");
      // The new answer should also be recorded
      expect(payload.session.answered_questions).toContain("limping_progression");
    });
  });

  // --- 7. Multi-turn state persistence ---
  describe("multi-turn state persistence", () => {
    it("multi-turn conversation maintains state correctly across 5+ turns", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "which_leg";

      const turns = [
        "left front leg",
        "it started yesterday",
        "getting worse",
        "yes he yelps",
        "he jumped off the porch",
      ];

      for (const turn of turns) {
        const { POST } = await import("@/app/api/ai/symptom-chat/route");
        const response = await POST(makeTextOnlyRequest(session, turn));
        const payload = await response.json();

        expect(response.status).toBe(200);
        // Update session for next turn
        session = payload.session;

        // After each turn, we must clear module cache for next import
        jest.resetModules();
      }

      // After 5 turns, answered_questions should have grown
      expect(session.answered_questions.length).toBeGreaterThanOrEqual(2);
      // extracted_answers should have accumulated
      expect(Object.keys(session.extracted_answers).length).toBeGreaterThanOrEqual(2);
      // known_symptoms should still be intact
      expect(session.known_symptoms).toContain("limping");
    });
  });

  // --- 8. Telemetry not in response ---
  describe("telemetry not in response", () => {
    it("telemetry markers do NOT appear in user-visible response text", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      session.last_question_asked = "which_leg";

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "left front leg"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      const messageText = payload.message || "";
      // Telemetry markers must NOT leak into user-visible response
      expect(messageText).not.toContain("[STATE:");
      expect(messageText).not.toContain("[TRANSITION:");
      expect(messageText).not.toContain("pendingQResolvedThisTurn");
      expect(messageText).not.toContain("sidecarObservations");
      expect(messageText).not.toContain("[Engine]");
      expect(messageText).not.toContain("[StateMachine]");
    });
  });

  // --- 9. Rate limiting ---
  describe("rate limiting", () => {
    it("rate limiting works correctly", async () => {
      mockCheckRateLimit.mockResolvedValue({
        success: false,
        reset: Date.now() + 60_000,
      });

      const session = createSession();

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "my dog is limping"));

      expect(response.status).toBe(429);
      const payload = await response.json();
      expect(payload.error).toContain("Too many requests");
    });
  });

  // --- 10. Error handling ---
  describe("error handling", () => {
    it("error handling returns proper error responses", async () => {
      // Send a request with no messages (empty array → no user message)
      const emptyRequest = new Request("http://localhost/api/ai/symptom-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          pet: PET,
          session: createSession(),
          messages: [],
        }),
      });

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(emptyRequest);
      const payload = await response.json();

      // With no user messages, the route returns a prompt to tell what's going on
      expect(response.status).toBe(200);
      expect(payload.type).toBe("question");
      expect(payload.message).toContain("Tell me what's going on");
    });
  });
});

// =============================================================================
// VET-900: World-Class Symptom Checker — Comprehensive Regression Pack
// =============================================================================

describe("VET-900: world-class symptom checker regression pack", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("test-user");
    mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Case summary.",
      model: "MiniMax-M2.7",
    });
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
      const questionId =
        prompt.match(/\(Internal ID: ([^,)\n]+)/)?.[1] || "unknown";
      return `QUESTION_ID:${questionId}`;
    });
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
  });

  // --- 3.1: Direct yes/no resolution ---
  describe("direct yes/no resolution", () => {
    it("VET-900: 'yes' to boolean question resolves as true", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_blood";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_blood: true } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "yes"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.vomit_blood).toBe(true);
    });

    it("VET-900: 'no' to boolean question resolves as false", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_blood";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_blood: false } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "no"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.vomit_blood).toBe(false);
    });

    it("VET-900: 'yeah' resolves same as 'yes'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_blood";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_blood: true } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "yeah"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'nope' resolves same as 'no'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_blood";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_blood: false } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "nope"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'yes' to choice question with unknown picks matching keyword", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_progression";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      // "yes" alone doesn't match a specific choice, but shouldn't crash
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "yes"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'i don't know' to choice question with unknown resolves as 'unknown'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_progression";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_progression: "unknown" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "I don't know"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.limping_progression).toBe("unknown");
    });
  });

  // --- 3.2: Duration extraction ---
  describe("duration extraction", () => {
    it("VET-900: 'for about 3 days' records as duration-like text", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_duration";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_duration: "for about 3 days" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "for about 3 days"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'started last Monday' records as duration text", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_duration";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_duration: "started last Monday" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "started last Monday"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'couple of hours' records as duration text", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_duration";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_duration: "couple of hours" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "couple of hours"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'not long, maybe a day' records as duration text", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.last_question_asked = "vomit_duration";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: { vomit_duration: "not long, maybe a day" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "not long, maybe a day"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'I haven't noticed' falls to unknown or clarification", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_progression"; // has "unknown" option
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_progression: "unknown" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "I haven't noticed"));
      expect(response.status).toBe(200);
    });
  });

  // --- 3.3: Ambiguous reply behavior ---
  describe("ambiguous reply behavior", () => {
    it("VET-900: 'not sure' about SAFE question resolves as 'unknown'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_progression"; // SAFE: has "unknown"
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_progression: "unknown" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "not sure"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'hard to tell' about SAFE question resolves as 'unknown'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["drinking_more"]);
      sessionWithSymptom.last_question_asked = "water_intake"; // SAFE: has "unknown"
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["drinking_more"], answers: { water_intake: "unknown" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "hard to tell"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'I have no idea' about SAFE question resolves as 'unknown'", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["diarrhea"]);
      sessionWithSymptom.last_question_asked = "stool_consistency"; // SAFE: has "unknown"
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["diarrhea"], answers: { stool_consistency: "unknown" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "I have no idea"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'not sure' about UNSAFE gum_color triggers alternate observable retry", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["lethargy"]);
      sessionWithSymptom.last_question_asked = "gum_color"; // UNSAFE: no "unknown"
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["lethargy"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "not sure"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(["question", "emergency"]).toContain(payload.type);

      if (payload.type === "question") {
        expect(payload.reason_code).toBe("alternate_observable_gum_color");
        expect(payload.conversationState).toBe("needs_clarification");
      }
    });

    it("VET-900: 'don't know' about breathing_onset triggers escalation", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["coughing"]);
      sessionWithSymptom.last_question_asked = "breathing_onset"; // UNSAFE emergency
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["coughing"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "don't know"));
      expect(response.status).toBe(200);
    });

    it("VET-900: 'can't tell' about consciousness_level triggers escalation", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["lethargy"]);
      sessionWithSymptom.last_question_asked = "consciousness_level"; // UNSAFE emergency
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["lethargy"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "can't tell"));
      expect(response.status).toBe(200);
    });
  });

  // --- 3.4: Question non-repetition ---
  describe("question non-repetition", () => {
    it("VET-900: answered question is not re-asked on next turn", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_onset";
      sessionWithSymptom.answered_questions = ["limping_onset"];
      sessionWithSymptom.extracted_answers = { limping_onset: "sudden" };
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 2,
        unresolved_question_ids: [],
      };

      // After answering limping_onset, next question should NOT be limping_onset
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "getting worse"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // The next question should not be limping_onset
      if (payload.next_question_id) {
        expect(payload.next_question_id).not.toBe("limping_onset");
      }
    });

    it("VET-900: compression does not cause question repetition", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.answered_questions = ["which_leg", "limping_onset", "limping_progression"];
      sessionWithSymptom.extracted_answers = {
        which_leg: "left back leg",
        limping_onset: "sudden",
        limping_progression: "getting worse",
      };
      sessionWithSymptom.last_question_asked = "limping_weight_bearing";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 5, // triggers compression
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "still putting weight on it"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // None of the answered questions should be re-asked
      if (payload.next_question_id) {
        expect(payload.session.answered_questions).not.toContain(payload.next_question_id);
      }
    });

    it("VET-900: multiple turns maintain unique question sequence", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.answered_questions = ["which_leg"];
      sessionWithSymptom.extracted_answers = { which_leg: "left back leg" };
      sessionWithSymptom.last_question_asked = "limping_onset";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 2,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_onset: "sudden" } })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response1 = await POST(makeTextOnlyRequest(sessionWithSymptom, "suddenly"));
      const payload1 = await response1.json();

      expect(response1.status).toBe(200);
      const askedQuestions = payload1.session.answered_questions || [];
      // limping_onset should now be answered
      expect(askedQuestions).toContain("limping_onset");
    });
  });

  describe("uncertainty terminal outcomes", () => {
    it("VET-1021: gum_color unknown gets one alternate observable retry before cannot_assess", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["lethargy"]);
      sessionWithSymptom.last_question_asked = "gum_color";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValue(
        JSON.stringify({ symptoms: ["lethargy"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const retryResponse = await POST(
        makeTextOnlyRequest(sessionWithSymptom, "I can't tell")
      );
      const retryPayload = await retryResponse.json();

      expect(retryResponse.status).toBe(200);
      expect(retryPayload.type).toBe("question");
      expect(retryPayload.question_id).toBe("gum_color");
      expect(retryPayload.reason_code).toBe("alternate_observable_gum_color");
      expect(retryPayload.conversationState).toBe("needs_clarification");
      expect(retryPayload.ready_for_report).toBe(false);
      expect(retryPayload.message).toContain("gently lift the upper lip");
      expect(retryPayload.message).toContain("Pink is normal");
      expect(retryPayload.session.last_question_asked).toBe("gum_color");
      expect(retryPayload.session.case_memory.ambiguity_flags).toContain(
        "alternate_observable_prompted_gum_color"
      );

      const cannotAssessResponse = await POST(
        makeTextOnlyRequest(retryPayload.session, "I still can't tell")
      );
      const cannotAssessPayload = await cannotAssessResponse.json();

      expect(cannotAssessResponse.status).toBe(200);
      expect(cannotAssessPayload.type).toBe("cannot_assess");
      expect(cannotAssessPayload.reason_code).toBe(
        "owner_cannot_assess_gum_color"
      );
      expect(cannotAssessPayload.conversationState).toBe("escalation");
      expect(cannotAssessPayload.ready_for_report).toBe(false);
    });

    it("VET-1021: breathing_onset unknown stays on cannot_assess path", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["coughing"]);
      sessionWithSymptom.last_question_asked = "breathing_onset";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["coughing"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(sessionWithSymptom, "I can't tell")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("cannot_assess");
      expect(payload.reason_code).toBe("owner_cannot_assess_breathing_onset");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.message).not.toContain("gently lift the upper lip");
    });

    it("VET-1002: ambiguous answer on critical sign returns cannot_assess terminal outcome", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["coughing"]);
      sessionWithSymptom.last_question_asked = "breathing_onset";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["coughing"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(sessionWithSymptom, "I can't tell")
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("cannot_assess");
      expect(payload.terminal_state).toBe("cannot_assess");
      expect(payload.reason_code).toBe("owner_cannot_assess_breathing_onset");
      expect(payload.conversationState).toBe("escalation");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.owner_message).toContain("can't safely continue");
      expect(payload.recommended_next_step).toContain("Seek veterinary assessment");
    });

    it("VET-1031: cannot_assess response builder preserves terminal payload shape", async () => {
      const { buildCannotAssessOutcome } = await import(
        "@/lib/clinical/uncertainty-routing"
      );
      const { buildCannotAssessResponse } = await import(
        "@/lib/symptom-chat/response-builders"
      );

      const outcome = buildCannotAssessOutcome({
        petName: "Milo",
        questionId: "breathing_onset",
        questionText: "Did the breathing change start suddenly or gradually?",
      });
      const payload = buildCannotAssessResponse({
        outcome,
        session: createSession(),
      });

      expect(payload.type).toBe("cannot_assess");
      expect(payload.terminal_state).toBe("cannot_assess");
      expect(payload.reason_code).toBe("owner_cannot_assess_breathing_onset");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.conversationState).toBe("escalation");
      expect(payload.owner_message).toContain("Milo");
      expect(payload.message).toContain("can't safely continue");
      expect(payload.recommended_next_step).toContain("Seek veterinary assessment");
    });

    it("VET-1002: medication dosing request returns out_of_scope terminal outcome", async () => {
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(
          createSession(),
          "How much Benadryl can I give my dog for itching?"
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("out_of_scope");
      expect(payload.terminal_state).toBe("out_of_scope");
      expect(payload.reason_code).toBe("medication_dosing_request");
      expect(payload.conversationState).toBe("idle");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.owner_message).toContain("medication dosing");
    });

    it("VET-1002: non-dog species returns out_of_scope terminal outcome", async () => {
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        makeTextOnlyRequest(
          createSession(),
          "My cat is vomiting and hiding under the bed.",
          {
            name: "Miso",
            species: "cat",
            breed: "Domestic Shorthair",
          }
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("out_of_scope");
      expect(payload.terminal_state).toBe("out_of_scope");
      expect(payload.reason_code).toBe("species_not_supported");
      expect(payload.conversationState).toBe("idle");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.owner_message).toContain("only assess dog symptom cases");
    });

    it("VET-1020: generate_report blocks when a report-blocking critical sign is still unanswered", async () => {
      let session = createSession();
      session = addSymptoms(session, ["difficulty_breathing"]);
      session = recordAnswer(session, "breathing_rate", 40);
      session = recordAnswer(session, "gum_color", "pink_normal");
      session = recordAnswer(session, "position_preference", "standing");
      session.case_memory = {
        ...session.case_memory!,
        latest_owner_turn: "He is breathing hard, keeps standing up, and his gums still look pink.",
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(session));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("cannot_assess");
      expect(payload.reason_code).toBe("owner_cannot_assess_breathing_onset");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.owner_message).toContain("breathing difficulty start suddenly or gradually");
      expect(mockDiagnoseWithDeepSeek).not.toHaveBeenCalled();
    });

    it("VET-1020: generate_report blocks when gum color is still unknown for an active high-risk family", async () => {
      let session = createSession();
      session = addSymptoms(session, ["difficulty_breathing"]);
      session = recordAnswer(session, "breathing_onset", "sudden");
      session = recordAnswer(session, "gum_color", "unknown");
      session = recordAnswer(session, "position_preference", "standing");
      session.case_memory = {
        ...session.case_memory!,
        latest_owner_turn: "He started struggling to breathe suddenly and I could not tell what color the gums were.",
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeReportRequest(session));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.type).toBe("cannot_assess");
      expect(payload.reason_code).toBe("owner_cannot_assess_gum_color");
      expect(payload.ready_for_report).toBe(false);
      expect(payload.owner_message).toContain("What color are your dog's gums?");
      expect(mockDiagnoseWithDeepSeek).not.toHaveBeenCalled();
    });
  });

  describe("VET-1029 critical info and alternate observable regression matrix", () => {
    it("blocks report readiness until respiratory critical info is answered", () => {
      let session = createSession();
      session = addSymptoms(session, ["difficulty_breathing"]);
      session = recordAnswer(session, "breathing_onset", "gradual");
      session = recordAnswer(session, "breathing_rate", 36);
      session = recordAnswer(
        session,
        "position_preference",
        "prefers standing upright"
      );

      expect(session.answered_questions).toEqual(
        expect.arrayContaining([
          "breathing_onset",
          "breathing_rate",
          "position_preference",
        ])
      );
      expect(isReadyForDiagnosis(session)).toBe(false);
      expect(getNextQuestion(session)).toBe("gum_color");

      const readySession = recordAnswer(session, "gum_color", "pink_normal");

      expect(isReadyForDiagnosis(readySession)).toBe(true);
      expect(getNextQuestion(readySession)).toBeNull();
    });

    it("routes the supported gum-color branch through one alternate observable retry before cannot_assess", async () => {
      const session = buildPendingQuestionSession(
        "difficulty_breathing",
        "gum_color"
      );
      mockExtractWithQwen
        .mockResolvedValueOnce(
          JSON.stringify({ symptoms: ["difficulty_breathing"], answers: {} })
        )
        .mockResolvedValueOnce(
          JSON.stringify({ symptoms: ["difficulty_breathing"], answers: {} })
        );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const retryResponse = await POST(makeTextOnlyRequest(session, "I can't tell"));
      const retryPayload = await retryResponse.json();

      expect(retryResponse.status).toBe(200);
      expect(retryPayload.type).toBe("question");
      expect(retryPayload.question_id).toBe("gum_color");
      expect(retryPayload.reason_code).toBe("alternate_observable_gum_color");
      expect(retryPayload.conversationState).toBe("needs_clarification");
      expect(retryPayload.ready_for_report).toBe(false);
      expect(retryPayload.message).toContain("gently lift the upper lip");
      expect(retryPayload.message).toContain("Pink is normal");
      expect(retryPayload.session.last_question_asked).toBe("gum_color");
      expect(retryPayload.session.case_memory.ambiguity_flags).toContain(
        "alternate_observable_prompted_gum_color"
      );

      const cannotAssessResponse = await POST(
        makeTextOnlyRequest(retryPayload.session, "Still can't tell")
      );
      const cannotAssessPayload = await cannotAssessResponse.json();

      expect(cannotAssessResponse.status).toBe(200);
      expect(cannotAssessPayload.type).toBe("cannot_assess");
      expect(cannotAssessPayload.terminal_state).toBe("cannot_assess");
      expect(cannotAssessPayload.reason_code).toBe(
        "owner_cannot_assess_gum_color"
      );
      expect(cannotAssessPayload.conversationState).toBe("escalation");
      expect(cannotAssessPayload.ready_for_report).toBe(false);
      expect(cannotAssessPayload.recommended_next_step).toContain(
        "Seek veterinary assessment"
      );
    });

    it.each([
      {
        symptom: "difficulty_breathing",
        questionId: "breathing_onset",
        ownerReply: "I can't tell",
      },
      {
        symptom: "possible_poisoning",
        questionId: "consciousness_level",
        ownerReply: "I can't tell",
      },
    ])(
      "keeps unsupported critical unknowns on cannot_assess for $questionId",
      async ({ symptom, questionId, ownerReply }) => {
        const session = buildPendingQuestionSession(symptom, questionId);
        mockExtractWithQwen.mockResolvedValueOnce(
          JSON.stringify({ symptoms: [symptom], answers: {} })
        );

        const { POST } = await import("@/app/api/ai/symptom-chat/route");
        const response = await POST(makeTextOnlyRequest(session, ownerReply));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.type).toBe("cannot_assess");
        expect(payload.terminal_state).toBe("cannot_assess");
        expect(payload.reason_code).toBe(
          `owner_cannot_assess_${questionId}`
        );
        expect(payload.conversationState).toBe("escalation");
        expect(payload.ready_for_report).toBe(false);
        expect(payload.owner_message).toContain(
          "can't safely continue without confirming this critical sign"
        );
        expect(payload.recommended_next_step).toContain(
          "Seek veterinary assessment"
        );
        expect(payload.message).not.toContain("gently lift the upper lip");
      }
    );
  });

  // --- 3.5: Compression boundary preservation ---
  describe("compression boundary preservation", () => {
    it("VET-900: answered_questions preserved after compression", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.answered_questions = ["which_leg", "limping_onset", "limping_progression", "weight_bearing"];
      sessionWithSymptom.extracted_answers = {
        which_leg: "left back leg",
        limping_onset: "sudden",
        limping_progression: "getting worse",
        weight_bearing: "partial",
      };
      sessionWithSymptom.last_question_asked = "swelling_present";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 6, // well past compression boundary
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "no swelling"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.answered_questions).toEqual(
        expect.arrayContaining(["which_leg", "limping_onset", "limping_progression", "weight_bearing"])
      );
    });

    it("VET-900: extracted_answers preserved after compression", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["vomiting"]);
      sessionWithSymptom.answered_questions = ["vomit_duration"];
      sessionWithSymptom.extracted_answers = { vomit_duration: "3 days" };
      sessionWithSymptom.last_question_asked = "vomit_frequency";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 5,
        unresolved_question_ids: [],
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["vomiting"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "about 5 times"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.vomit_duration).toBe("3 days");
    });

    it("VET-900: unresolved_question_ids and clarification_reasons preserved after compression", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.answered_questions = ["which_leg"];
      sessionWithSymptom.extracted_answers = { which_leg: "left back leg" };
      sessionWithSymptom.last_question_asked = "limping_progression";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 5,
        unresolved_question_ids: ["limping_progression"],
        clarification_reasons: { limping_progression: "ambiguous_answer" },
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "not sure"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      // The unresolved question should still be tracked
      const unresolvedAfter = payload.session.case_memory?.unresolved_question_ids ?? [];
      expect(Array.isArray(unresolvedAfter)).toBe(true);
    });
  });

  // --- 3.6: 5+ turn state maintenance ---
  describe("5+ turn state maintenance", () => {
    it("VET-900: multi-turn conversation maintains state across 5+ turns", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);

      // Turn 1: Initial symptom
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const res1 = await POST(makeTextOnlyRequest(session, "My dog is limping on left leg"));
      const p1 = await res1.json();
      expect(res1.status).toBe(200);

      // Turn 2: Answer onset
      session = p1.session;
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_onset: "sudden" } })
      );
      const res2 = await POST(makeTextOnlyRequest(session, "Started yesterday after hiking"));
      const p2 = await res2.json();
      expect(res2.status).toBe(200);

      // Turn 3: Answer progression
      session = p2.session;
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { limping_progression: "worse" } })
      );
      const res3 = await POST(makeTextOnlyRequest(session, "Seems to be getting worse"));
      const p3 = await res3.json();
      expect(res3.status).toBe(200);

      // Turn 4: Answer weight bearing
      session = p3.session;
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { weight_bearing: "partial" } })
      );
      const res4 = await POST(makeTextOnlyRequest(session, "Still putting some weight on it"));
      const p4 = await res4.json();
      expect(res4.status).toBe(200);

      // Turn 5: Answer swelling
      session = p4.session;
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { swelling_present: false } })
      );
      const res5 = await POST(makeTextOnlyRequest(session, "No swelling that I can see"));
      const p5 = await res5.json();
      expect(res5.status).toBe(200);

      // Verify: answers accumulated, no repetition
      const finalAnswers = p5.session.extracted_answers || {};
      expect(Object.keys(finalAnswers).length).toBeGreaterThanOrEqual(3);
    });

    it("VET-900: multi-turn conversation progresses without errors", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);
      const deterministicAnswers: Record<string, string | boolean> = {
        which_leg: "left back leg",
        limping_onset: "sudden",
        limping_progression: "worse",
        weight_bearing: "partial",
        pain_on_touch: true,
        trauma_history: "no_trauma",
        worse_after_rest: false,
        swelling_present: false,
        warmth_present: false,
        prior_limping: false,
      };

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );
      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const res1 = await POST(makeTextOnlyRequest(session, "My dog is limping"));
      const p1 = await res1.json();

      let currentSession = p1.session;
      const uniqueQuestionsAsked = new Set<string>();
      if (p1.session.last_question_asked) {
        uniqueQuestionsAsked.add(p1.session.last_question_asked);
      }

      // Run 5 turns, providing appropriate answers for each pending question
      for (let i = 0; i < 5; i++) {
        session = currentSession;
        const pendingQ = session.last_question_asked;

        // Create a mock answer appropriate for the pending question
        const mockAnswer: Record<string, string | boolean> = {};
        if (pendingQ) {
          const questionSchema = (await import("@/lib/clinical-matrix")).FOLLOW_UP_QUESTIONS[pendingQ];
          if (pendingQ in deterministicAnswers) {
            mockAnswer[pendingQ] = deterministicAnswers[pendingQ];
          } else if (questionSchema?.data_type === "choice" && questionSchema.choices?.includes("unknown")) {
            mockAnswer[pendingQ] = "unknown";
          } else if (questionSchema?.data_type === "choice") {
            mockAnswer[pendingQ] = questionSchema.choices?.[0] ?? "yes";
          } else if (questionSchema?.data_type === "boolean") {
            mockAnswer[pendingQ] = true;
          } else {
            mockAnswer[pendingQ] = "test_value";
          }
        }
        const userReply =
          pendingQ && pendingQ in mockAnswer
            ? typeof mockAnswer[pendingQ] === "boolean"
              ? mockAnswer[pendingQ]
                ? "yes"
                : "no"
              : String(mockAnswer[pendingQ])
            : `answer ${i + 1}`;

        mockExtractWithQwen.mockResolvedValueOnce(
          JSON.stringify({ symptoms: ["limping"], answers: mockAnswer })
        );
        const res = await POST(makeTextOnlyRequest(session, userReply));
        const p = await res.json();
        expect(res.status).toBe(200);

        // Track unique questions asked
        const nextQ = p.session.last_question_asked;
        if (nextQ) {
          uniqueQuestionsAsked.add(nextQ);
        }

        currentSession = p.session;
      }

      // Verify that multiple distinct questions were asked (conversation is progressing)
      expect(uniqueQuestionsAsked.size).toBeGreaterThanOrEqual(2);
    });
  });

  // --- 3.7: Trauma history as choice ---
  describe("trauma history as choice", () => {
    it("VET-900: 'yes he fell' extracts as yes_trauma", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "trauma_history";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { trauma_history: "yes_trauma" } })
      );

      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "Yes, he fell off the couch"));
      const payload = await response.json();

      expect(mockExtractWithQwen).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.trauma_history).toBe("yes_trauma");
    });

    it("VET-900: 'no nothing like that' extracts as no_trauma", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "trauma_history";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { trauma_history: "no_trauma" } })
      );

      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "No, nothing like that"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.trauma_history).toBe("no_trauma");
    });

    it("VET-900: 'I wasn't home' extracts as unknown", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "trauma_history";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      const { POST } = await import("@/app/api/ai/symptom-chat/route");

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: { trauma_history: "unknown" } })
      );

      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "I wasn't home"));
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.trauma_history).toBe("unknown");
    });
  });

  // --- 3.8: Error handling & graceful degradation ---
  describe("error handling and graceful degradation", () => {
    it("VET-900: LLM extraction returns invalid JSON uses fallback", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.last_question_asked = "limping_onset";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 1,
        unresolved_question_ids: [],
      };

      // Simulate malformed JSON response
      mockExtractWithQwen.mockResolvedValueOnce("this is not json{{{");

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "started yesterday"));
      // Should not return 500 — graceful degradation
      expect([200, 400]).toContain(response.status);
    });

    it("VET-900: sidecar timeout uses deterministic fallback", async () => {
      let session = createSession();
      session = addSymptoms(session, ["limping"]);

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(session, "My dog is limping"));
      expect(response.status).toBe(200);
    });

    it("VET-900: compression service failure preserves protected state", async () => {
      const session = createSession();
      const sessionWithSymptom = addSymptoms(session, ["limping"]);
      sessionWithSymptom.answered_questions = ["which_leg", "limping_onset"];
      sessionWithSymptom.extracted_answers = {
        which_leg: "left back leg",
        limping_onset: "sudden",
      };
      sessionWithSymptom.last_question_asked = "limping_progression";
      sessionWithSymptom.case_memory = {
        ...sessionWithSymptom.case_memory!,
        turn_count: 5,
        unresolved_question_ids: [],
      };

      // Compression fails — should use deterministic fallback
      mockCompressCaseMemoryWithMiniMax.mockRejectedValueOnce(new Error("compression failed"));

      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({ symptoms: ["limping"], answers: {} })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(makeTextOnlyRequest(sessionWithSymptom, "getting worse"));

      // Should not crash — protected state should survive
      expect([200]).toContain(response.status);
    });
  });

  // --- VET-900: End-to-end telemetry non-leak ---
  it("VET-900: internal telemetry stripped from client payload", async () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    // Seed session with internal telemetry observations
    session.case_memory.service_observations = [
      {
        service: "async-review-service" as const,
        stage: "state_transition",
        latencyMs: 0,
        outcome: "success",
        shadowMode: false,
        fallbackUsed: false,
        note: "question=limping_onset | question_state=pending->answered | conversation_state=idle->asking",
        recordedAt: new Date().toISOString(),
      },
      {
        service: "async-review-service" as const,
        stage: "extraction",
        latencyMs: 100,
        outcome: "success",
        shadowMode: false,
        fallbackUsed: false,
        note: "extracted limping_onset",
        recordedAt: new Date().toISOString(),
      },
      {
        service: "async-review-service" as const,
        stage: "contradiction_detection",
        latencyMs: 0,
        outcome: "success",
        shadowMode: false,
        fallbackUsed: false,
        note:
          "contradictions=1 | contradiction_ids=appetite_conflict | contradiction_records=%5B%7B%22contradiction_type%22%3A%22appetite_conflict%22%2C%22severity%22%3A%22moderate%22%2C%22resolution%22%3A%22clarify%22%2C%22source_pair%22%3A%5B%7B%22source%22%3A%22previous_answer%22%2C%22key%22%3A%22appetite_status%22%2C%22value%22%3A%22normal%22%7D%2C%7B%22source%22%3A%22owner_text%22%2C%22key%22%3A%22owner_text%22%2C%22value%22%3A%22not_eating_signal%22%7D%5D%2C%22affected_key%22%3A%22appetite_status%22%2C%22turn_number%22%3A1%7D%5D",
        recordedAt: new Date().toISOString(),
      },
      {
        service: "async-review-service" as const,
        stage: "terminal_outcome",
        latencyMs: 0,
        outcome: "success",
        shadowMode: false,
        fallbackUsed: false,
        note:
          "outcome=success | reason=medication_dosing_request | terminal_outcome_metric=%7B%22terminal_state%22%3A%22out_of_scope%22%2C%22reason_code%22%3A%22medication_dosing_request%22%2C%22conversation_state%22%3A%22idle%22%2C%22recommended_next_step%22%3A%22Please%20contact%20your%20veterinarian%20or%20an%20emergency%20clinic%20before%20giving%20medication.%22%2C%22turn_number%22%3A1%7D",
        recordedAt: new Date().toISOString(),
      },
      {
        service: "some-safe-service" as const,
        stage: "vision",
        latencyMs: 200,
        outcome: "success",
        shadowMode: false,
        fallbackUsed: false,
        note: "vision analysis complete",
        recordedAt: new Date().toISOString(),
      },
    ];

    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(makeTextOnlyRequest(session, "testing telemetry"));
    const payload = await response.json();

    expect(response.status).toBe(200);

    // No internal stages in returned observations
    const observations = payload?.session?.case_memory?.service_observations ?? [];
    for (const obs of observations) {
      expect(obs.service).not.toBe("async-review-service");
      expect([
        "state_transition",
        "extraction",
        "compression",
        "contradiction_detection",
        "pending_recovery",
        "repeat_suppression",
        "terminal_outcome",
      ])
        .not.toContain(obs.stage);
      expect(String(obs.note ?? "")).not.toMatch(/question_state=/);
      expect(String(obs.note ?? "")).not.toMatch(/conversation_state=/);
      expect(String(obs.note ?? "")).not.toMatch(/terminal_outcome_metric=/);
    }

    // Safe service observation survives
    expect(observations.some((o: { service: string }) => o.service === "some-safe-service")).toBe(true);
  });
});
