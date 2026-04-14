import fs from "node:fs";
import path from "node:path";

import {
  addSymptoms,
  createSession,
  type PetProfile,
  type TriageSession,
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

interface ReplayFixture {
  benchmarkId: string;
  mode: "first_turn" | "followup_unknown";
  message?: string;
  mockExtraction: {
    symptoms: string[];
    answers: Record<string, string | boolean | number>;
  };
  seedSession?: {
    knownSymptoms: string[];
    lastQuestionAsked: string;
  };
  expected: {
    allowedTypes: string[];
    knownSymptoms: string[];
    redFlags?: string[];
    reasonCode?: string;
  };
}

interface BenchmarkCase {
  id: string;
  request: {
    pet: PetProfile;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };
}

const FIXTURE_PATH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "clinical",
  "route-sentinel-replay-cases.json"
);
const BENCHMARK_PATH = path.join(
  process.cwd(),
  "data",
  "benchmarks",
  "dog-triage",
  "gold-v1-enriched.jsonl"
);

const replayFixtures = JSON.parse(
  fs.readFileSync(FIXTURE_PATH, "utf8")
) as ReplayFixture[];
const benchmarkCases = new Map(
  fs
    .readFileSync(BENCHMARK_PATH, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as BenchmarkCase)
    .map((entry) => [entry.id, entry])
);

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

function buildRequest(session: TriageSession, pet: PetProfile, message: string) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "chat",
      pet,
      session,
      messages: [{ role: "user", content: message }],
    }),
  });
}

function buildSeededSession(fixture: ReplayFixture) {
  let session = createSession();
  for (const symptom of fixture.seedSession?.knownSymptoms ?? []) {
    session = addSymptoms(session, [symptom]);
  }
  if (fixture.seedSession?.lastQuestionAsked) {
    session.last_question_asked = fixture.seedSession.lastQuestionAsked;
  }
  return session;
}

function configureDefaultMocks() {
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    reset: Date.now() + 60_000,
  });
  mockGetRateLimitId.mockReturnValue("route-sentinel-test");
  mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
  mockExtractWithQwen.mockResolvedValue(JSON.stringify({ symptoms: [], answers: {} }));
  mockPhraseWithLlama.mockResolvedValue("QUESTION_ID:generic");
  mockReviewQuestionPlanWithNemotron.mockResolvedValue(
    JSON.stringify({
      include_image_context: false,
      use_deterministic_fallback: true,
      reason: "route-sentinel-test",
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

describe("VET-1012 route-backed emergency sentinel replay", () => {
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

  it("keeps the replay pack broad enough to cover direct emergencies and safe question paths", () => {
    const firstTurnCount = replayFixtures.filter(
      (fixture) => fixture.mode === "first_turn"
    ).length;
    const followupUnknownCount = replayFixtures.filter(
      (fixture) => fixture.mode === "followup_unknown"
    ).length;

    expect(replayFixtures.length).toBeGreaterThanOrEqual(24);
    expect(firstTurnCount).toBeGreaterThanOrEqual(18);
    expect(followupUnknownCount).toBeGreaterThanOrEqual(4);
  });

  it.each(replayFixtures)("$benchmarkId stays in a safety-approved route path", async (fixture) => {
    const benchmark = benchmarkCases.get(fixture.benchmarkId);
    expect(benchmark).toBeDefined();

    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify(fixture.mockExtraction)
    );

    const session = buildSeededSession(fixture);
    const message = fixture.message ?? benchmark!.request.messages[0]?.content ?? "";
    const { POST } = await import("@/app/api/ai/symptom-chat/route");
    const response = await POST(buildRequest(session, benchmark!.request.pet, message));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fixture.expected.allowedTypes).toContain(payload.type);
    expect(payload.session.known_symptoms).toEqual(
      expect.arrayContaining(fixture.expected.knownSymptoms)
    );

    if (fixture.expected.redFlags?.length) {
      expect(payload.session.red_flags_triggered).toEqual(
        expect.arrayContaining(fixture.expected.redFlags)
      );
    }

    if (payload.type === "emergency") {
      expect(payload.ready_for_report).toBe(true);
    }

    if (payload.type === "cannot_assess") {
      expect(payload.ready_for_report).toBe(false);
      expect(payload.reason_code).toBe(fixture.expected.reasonCode);
      expect(payload.terminal_state).toBe("cannot_assess");
    }
  });
});
