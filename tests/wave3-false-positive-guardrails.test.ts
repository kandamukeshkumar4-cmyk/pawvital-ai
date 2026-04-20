import {
  createSession,
  type PetProfile,
} from "@/lib/triage-engine";

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
  searchClinicalCases: jest.fn().mockResolvedValue([]),
  formatClinicalCaseContext: jest.fn().mockReturnValue(""),
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
  isAbortLikeError: () => false,
  preprocessVeterinaryImageWithResult: (...args: unknown[]) =>
    mockPreprocessVeterinaryImageWithResult(...args),
  preprocessVeterinaryImage: async (...args: unknown[]) => {
    const result = await mockPreprocessVeterinaryImageWithResult(...args);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  },
  consultWithMultimodalSidecarWithResult: (...args: unknown[]) =>
    mockConsultWithMultimodalSidecarWithResult(...args),
  consultWithMultimodalSidecar: async (...args: unknown[]) => {
    const result = await mockConsultWithMultimodalSidecarWithResult(...args);
    if (!result.ok) throw new Error(result.error);
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
  EventType: {
    REPORT_READY: "REPORT_READY",
    URGENCY_HIGH: "URGENCY_HIGH",
    OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
    SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
    PET_ADDED: "PET_ADDED",
  },
  emit: (...args: unknown[]) => mockEmit(...args),
}));

jest.mock("@/lib/events/notification-handler", () => ({}));

interface GuardrailCase {
  id: string;
  message: string;
  extractedSymptoms: string[];
  extractedAnswers?: Record<string, string | boolean | number>;
  pet?: Partial<PetProfile>;
}

const ALLOWED_TYPES = ["question", "ready", "report"] as const;

const DEFAULT_PET: PetProfile = {
  name: "Guardrail",
  breed: "Mixed Breed",
  age_years: 5,
  weight: 32,
  species: "dog",
};

const FALSE_POSITIVE_GUARDRAIL_CASES: GuardrailCase[] = [
  {
    id: "mild-gum-irritation-tartar",
    message:
      "My dog has a little tartar and mild gum irritation, but his gums are pink, he is breathing normally, and he ate dinner.",
    extractedSymptoms: ["dental_problem"],
    extractedAnswers: { gum_color: "pink_normal" },
  },
  {
    id: "coughed-once-breathing-normal",
    message:
      "My dog coughed once but is breathing normally and acting like himself now.",
    extractedSymptoms: ["coughing_breathing_combined"],
  },
  {
    id: "tired-after-exercise-normal",
    message:
      "My dog seemed tired after running hard, but his breathing is normal now and his gums look pink.",
    extractedSymptoms: ["lethargy"],
    extractedAnswers: { gum_color: "pink_normal" },
  },
  {
    id: "thunderstorm-trembling-alert",
    message:
      "During the thunderstorm my dog trembled and hid, but he stayed alert and is normal afterward.",
    extractedSymptoms: ["trembling"],
    extractedAnswers: { consciousness_level: "alert" },
  },
  {
    id: "one-mild-vomit-no-red-flags",
    message:
      "My dog vomited once with no blood, then went back to walking and drinking normally.",
    extractedSymptoms: ["vomiting"],
    extractedAnswers: { vomit_blood: false },
  },
  {
    id: "ate-grass-vomited-once-normal",
    message:
      "My dog ate grass and vomited once, but now he is back to normal and wants food.",
    extractedSymptoms: ["vomiting"],
  },
  {
    id: "small-superficial-scrape",
    message:
      "My dog has a small superficial scrape, the bleeding stopped quickly, and he is acting normal.",
    extractedSymptoms: ["wound_skin_issue"],
  },
  {
    id: "normal-nursing-postpartum",
    message:
      "My dog had puppies recently and is nursing them normally, eating, walking, and resting comfortably.",
    extractedSymptoms: ["pregnancy_birth"],
  },
  {
    id: "tick-found-dog-normal",
    message:
      "I found a tick on my dog after a walk, but he is acting normal and breathing fine.",
    extractedSymptoms: ["wound_skin_issue"],
  },
  {
    id: "increased-urination-without-straining",
    message:
      "My dog is peeing more often than usual, but urine is still coming out and she is not straining or crying.",
    extractedSymptoms: ["urination_problem"],
  },
];

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

function buildRequest(pet: PetProfile, message: string) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet,
      session: createSession(),
      messages: [{ role: "user", content: message }],
    }),
  });
}

function configureDefaultMocks() {
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    reset: Date.now() + 60_000,
  });
  mockGetRateLimitId.mockReturnValue("wave3-false-positive-guardrail-test");
  mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
  mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
  mockPhraseWithLlama.mockResolvedValue("QUESTION_ID:generic");
  mockReviewQuestionPlanWithNemotron.mockResolvedValue(
    JSON.stringify({
      include_image_context: false,
      use_deterministic_fallback: true,
      reason: "wave3-false-positive-guardrail-test",
    })
  );
  mockVerifyQuestionWithNemotron.mockResolvedValue(
    JSON.stringify({ message: "Can you tell me a bit more?" })
  );
  mockRunVisionPipeline.mockResolvedValue(null);
  mockParseVisionForMatrix.mockReturnValue({
    symptoms: [],
    redFlags: [],
    severityClass: "normal",
  });
  mockImageGuardrail.mockReturnValue({
    triggered: false,
    flags: [],
    blockFurtherAnalysis: false,
  });
  mockDiagnoseWithDeepSeek.mockResolvedValue(
    JSON.stringify({
      severity: "medium",
      recommendation: "vet_48h",
      title: "Mock diagnosis",
      explanation: "Mock explanation",
      differential_diagnoses: [],
      clinical_notes: "Mock notes",
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
      reasoning: "Mock verification",
    })
  );
  mockDetectBreedWithNyckel.mockResolvedValue(null);
  mockRunRoboflowSkinWorkflow.mockResolvedValue({
    positive: false,
    summary: "",
    labels: [],
  });
  mockEvaluateImageGate.mockResolvedValue(null);
  mockShouldAnalyzeWoundImage.mockReturnValue(false);
  mockComputeBayesianScore.mockResolvedValue([]);
  mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
    summary: "Mock summary",
    model: "MiniMax-M2.7",
  });
  mockPreprocessVeterinaryImageWithResult.mockResolvedValue({
    ok: true,
    data: null,
    latencyMs: 1,
    service: "vision-preprocess-service",
  });
  mockConsultWithMultimodalSidecarWithResult.mockResolvedValue({
    ok: true,
    data: null,
    latencyMs: 1,
    service: "multimodal-consult-service",
  });
  mockRetrieveVeterinaryEvidenceFromSidecar.mockResolvedValue({
    textChunks: [],
    imageMatches: [],
    rerankScores: [],
    sourceCitations: [],
  });
  mockIsVisionPreprocessConfigured.mockReturnValue(false);
  mockIsRetrievalSidecarConfigured.mockReturnValue(false);
  mockIsMultimodalConsultConfigured.mockReturnValue(false);
  mockIsAsyncReviewServiceConfigured.mockReturnValue(false);
  mockIsTextRetrievalConfigured.mockReturnValue(false);
  mockIsImageRetrievalConfigured.mockReturnValue(false);
  mockRetrieveVeterinaryTextEvidenceWithResult.mockResolvedValue({
    ok: true,
    data: { textChunks: [], rerankScores: [], sourceCitations: [] },
    latencyMs: 1,
    service: "text-retrieval-service",
  });
  mockRetrieveVeterinaryImageEvidenceWithResult.mockResolvedValue({
    ok: true,
    data: { imageMatches: [], sourceCitations: [] },
    latencyMs: 1,
    service: "image-retrieval-service",
  });
  mockEnqueueAsyncReview.mockResolvedValue(true);
  mockSaveSymptomReportToDB.mockResolvedValue(null);
}

describe("Wave 3 false-positive guardrails", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    configureDefaultMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the mild lookalike pack broad enough to cover the final QA guardrails", () => {
    expect(FALSE_POSITIVE_GUARDRAIL_CASES).toHaveLength(10);
  });

  it.each(FALSE_POSITIVE_GUARDRAIL_CASES)(
    "$id stays on a non-emergency route path",
    async (testCase) => {
      mockExtractWithQwen.mockResolvedValueOnce(
        JSON.stringify({
          symptoms: testCase.extractedSymptoms,
          answers: testCase.extractedAnswers ?? {},
        })
      );

      const { POST } = await import("@/app/api/ai/symptom-chat/route");
      const response = await POST(
        buildRequest(
          {
            ...DEFAULT_PET,
            ...(testCase.pet ?? {}),
          },
          testCase.message
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(ALLOWED_TYPES).toContain(payload.type);
      expect(payload.type).not.toBe("emergency");
    }
  );
});
