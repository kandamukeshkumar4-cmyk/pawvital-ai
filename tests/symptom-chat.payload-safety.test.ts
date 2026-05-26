import {
  addSymptoms,
  createSession,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import { isInternalTelemetry } from "@/lib/sidecar-observability";

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
const mockAppendShadowTelemetrySnapshot = jest.fn();
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
  isMiniMaxConfigured: () => false,
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
    if (!result?.ok) throw new Error(result?.error || "preprocess failed");
    return result.data;
  },
  consultWithMultimodalSidecarWithResult: (...args: unknown[]) =>
    mockConsultWithMultimodalSidecarWithResult(...args),
  consultWithMultimodalSidecar: async (...args: unknown[]) => {
    const result = await mockConsultWithMultimodalSidecarWithResult(...args);
    if (!result?.ok) throw new Error(result?.error || "consult failed");
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
    if (!result?.ok) throw new Error(result?.error || "text retrieval failed");
    return result.data;
  },
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: (...args: unknown[]) =>
    mockIsImageRetrievalConfigured(...args),
  retrieveVeterinaryImageEvidence: async (...args: unknown[]) => {
    const result = await mockRetrieveVeterinaryImageEvidenceWithResult(...args);
    if (!result?.ok) throw new Error(result?.error || "image retrieval failed");
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

jest.mock("@/lib/shadow-telemetry-store", () => ({
  appendShadowTelemetrySnapshot: (...args: unknown[]) =>
    mockAppendShadowTelemetrySnapshot(...args),
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

const DOG: PetProfile = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

const HIDDEN_MARKER = "internal-safety-marker";

type ClientPayload = {
  system_observability?: unknown;
  session: {
    case_memory: {
      clarification_reasons?: unknown;
      shadow_comparisons?: unknown[];
      service_timeouts?: unknown[];
      service_observations?: Array<Parameters<typeof isInternalTelemetry>[0]>;
    };
  };
};

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

function seedInternalTelemetry(session: TriageSession): TriageSession {
  session.case_memory!.clarification_reasons = {
    gum_color: `${HIDDEN_MARKER}-clarification`,
  };
  session.case_memory!.service_timeouts = [
    {
      service: "multimodal-consult-service",
      stage: "sync-consult",
      reason: "timeout-hidden",
    },
  ];
  session.case_memory!.shadow_comparisons = [
    {
      service: "vision-preprocess-service",
      usedStrategy: "fallback-domain-inference",
      shadowStrategy: "hf-vision-preprocess",
      summary: `${HIDDEN_MARKER}-shadow`,
      disagreementCount: 1,
      recordedAt: "2026-04-13T00:00:00.000Z",
    },
  ];
  session.case_memory!.service_observations = [
    {
      service: "vision-preprocess-service",
      stage: "preprocess",
      latencyMs: 12,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note: "domain=skin_wound",
      recordedAt: "2026-04-13T00:00:00.000Z",
    },
    {
      service: "async-review-service",
      stage: "state_transition",
      latencyMs: 0,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note: `conversation_state=question->escalation | ${HIDDEN_MARKER}-state`,
      recordedAt: "2026-04-13T00:00:01.000Z",
    },
    {
      service: "vision-preprocess-service",
      stage: "compression",
      latencyMs: 0,
      outcome: "fallback",
      shadowMode: false,
      fallbackUsed: true,
      note: `question_state=asked | ${HIDDEN_MARKER}-compression`,
      recordedAt: "2026-04-13T00:00:02.000Z",
    },
    {
      service: "vision-preprocess-service",
      stage: "preprocess",
      latencyMs: 0,
      outcome: "success",
      shadowMode: false,
      fallbackUsed: false,
      note: `clarification_reason=internal_only | ${HIDDEN_MARKER}-note`,
      recordedAt: "2026-04-13T00:00:03.000Z",
    },
    {
      service: "async-review-service",
      stage: "second_opinion",
      latencyMs: 0,
      outcome: "fallback",
      shadowMode: false,
      fallbackUsed: true,
      note:
        `eligibility_reason=eligible | request_outcome=requested | ` +
        `acceptance_outcome=rejected | extractor_reason=low_confidence | ${HIDDEN_MARKER}-second-opinion`,
      recordedAt: "2026-04-13T00:00:04.000Z",
    },
  ];

  return session;
}

function buildRequest(
  session: TriageSession,
  pet: PetProfile,
  message: string
) {
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

function buildReportRequest(session: TriageSession, pet: PetProfile) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate_report",
      pet,
      session,
      messages: [{ role: "user", content: "Please generate the report." }],
    }),
  });
}

function expectNoInternalTelemetry(payload: ClientPayload) {
  const serialized = JSON.stringify(payload);
  const observations = payload.session.case_memory.service_observations ?? [];

  expect(payload.system_observability).toBeUndefined();
  expect(payload.session.case_memory.clarification_reasons).toBeUndefined();
  expect(payload.session.case_memory.shadow_comparisons).toEqual([]);
  expect(payload.session.case_memory.service_timeouts).toEqual([]);
  expect(observations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        service: "vision-preprocess-service",
        stage: "preprocess",
        note: "domain=skin_wound",
      }),
    ])
  );
  expect(observations.every((item: unknown) => !isInternalTelemetry(item as never))).toBe(
    true
  );
  expect(serialized).not.toContain(HIDDEN_MARKER);
  expect(serialized).not.toContain("conversation_state=");
  expect(serialized).not.toContain("question_state=");
  expect(serialized).not.toContain("eligibility_reason=");
  expect(serialized).not.toContain("request_outcome=");
  expect(serialized).not.toContain("acceptance_outcome=");
  expect(serialized).not.toContain("timeout-hidden");
}

async function runChat(
  session: TriageSession,
  pet: PetProfile,
  message: string
) {
  const { POST } = await import("@/app/api/ai/symptom-chat/route");
  const response = await POST(buildRequest(session, pet, message));
  const payload = await response.json();
  return { response, payload };
}

async function runReport(session: TriageSession, pet: PetProfile) {
  const { POST } = await import("@/app/api/ai/symptom-chat/route");
  const response = await POST(buildReportRequest(session, pet));
  const payload = await response.json();
  return { response, payload };
}

describe("VET-1014 terminal payload safety pack", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    jest.spyOn(console, "warn").mockImplementation(() => undefined);

    mockCheckRateLimit.mockResolvedValue({
      success: true,
      reset: Date.now() + 60_000,
    });
    mockGetRateLimitId.mockReturnValue("payload-safety-test");
    mockCreateServerSupabaseClient.mockResolvedValue(buildAuthSupabase(null));
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: [], answers: {} })
    );
    mockPhraseWithLlama.mockResolvedValue("Can you tell me a bit more?");
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({
        include_image_context: false,
        use_deterministic_fallback: false,
        reason: "payload-safety-test",
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
    mockDiagnoseWithDeepSeek.mockResolvedValue("{}");
    mockVerifyWithGLM.mockResolvedValue({});
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
      summary: "compressed",
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
    mockAppendShadowTelemetrySnapshot.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps question payloads free of internal telemetry", async () => {
    const session = seedInternalTelemetry(createSession());
    const { response, payload } = await runChat(
      session,
      DOG,
      "He seems a little off today."
    );

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.ready_for_report).toBe(false);
    expectNoInternalTelemetry(payload);
  });

  it("keeps emergency payloads free of internal telemetry", async () => {
    let session = seedInternalTelemetry(createSession());
    session = addSymptoms(session, ["vomiting"]);
    session.red_flags_triggered = ["vomit_blood"];

    const { response, payload } = await runChat(
      session,
      DOG,
      "He is still vomiting."
    );

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.ready_for_report).toBe(true);
    expectNoInternalTelemetry(payload);
  });

  it("keeps high-risk gum-color emergency payloads free of internal telemetry", async () => {
    let session = seedInternalTelemetry(createSession());
    session = addSymptoms(session, ["difficulty_breathing"]);
    session.last_question_asked = "gum_color";

    const { response: retryResponse, payload: retryPayload } = await runChat(
      session,
      DOG,
      "I don't know."
    );

    expect(retryResponse.status).toBe(200);
    expect(retryPayload.type).toBe("question");
    expect(retryPayload.reason_code).toBe("alternate_observable_gum_color");
    expect(retryPayload.ready_for_report).toBe(false);
    expectNoInternalTelemetry(retryPayload);

    const { response, payload } = await runChat(
      retryPayload.session,
      DOG,
      "I still don't know."
    );

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.ready_for_report).toBe(true);
    expect(payload.session.red_flags_triggered).toContain(
      "respiratory_distress_unknown_gum_color"
    );
    expectNoInternalTelemetry(payload);
  });

  it("keeps out_of_scope payloads free of internal telemetry", async () => {
    const session = seedInternalTelemetry(createSession());
    const catPet: PetProfile = {
      ...DOG,
      species: "cat",
      name: "Milo",
    };

    const { response, payload } = await runChat(
      session,
      catPet,
      "My cat is limping today."
    );

    expect(response.status).toBe(200);
    expect(payload.type).toBe("out_of_scope");
    expect(payload.terminal_state).toBe("out_of_scope");
    expect(payload.reason_code).toBe("species_not_supported");
    expect(payload.ready_for_report).toBe(false);
    expectNoInternalTelemetry(payload);
  });

  it("persists only sanitized aggregate shadow readout fields and keeps owner report telemetry stripped", async () => {
    const forbiddenMarkers = [
      "recentServiceCalls",
      "recentShadowComparisons",
      "internal_reason_code",
      "prompt=raw-owner-prompt",
      "provider_payload=https://provider.example/secret-token",
      "raw model output with provider payload",
      "reason=provider_error",
      "reason=budget_exceeded",
      "owner said honking loudly",
    ];

    const session = addSymptoms(createSession(), ["vomiting"]);
    session.case_memory = {
      ...session.case_memory!,
      service_timeouts: [
        {
          service: "async-review-service",
          stage: "final_safety",
          reason: "timeout-hidden",
        },
      ],
      service_observations: [
        {
          service: "async-review-service",
          stage: "final_safety",
          latencyMs: 1200,
          outcome: "error",
          shadowMode: true,
          fallbackUsed: true,
          note:
            "internal_reason_code=final_safety | reason=provider_error | prompt=raw-owner-prompt | provider_payload=https://provider.example/secret-token",
          recordedAt: "2026-05-19T00:00:00.000Z",
        },
        {
          service: "async-review-service",
          stage: "final_safety",
          latencyMs: 0,
          outcome: "fallback",
          shadowMode: false,
          fallbackUsed: true,
          note: "reason=budget_exceeded",
          recordedAt: "2026-05-19T00:00:01.000Z",
        },
        {
          service: "async-review-service",
          stage: "second_opinion",
          latencyMs: 0,
          outcome: "fallback",
          shadowMode: false,
          fallbackUsed: true,
          note:
            "eligibility_reason=eligible | request_outcome=requested | acceptance_outcome=rejected | comparison_append_outcome=not_applicable | comparison_write_outcome=not_applicable | extractor_reason=owner said honking loudly",
          recordedAt: "2026-05-19T00:00:03.000Z",
        },
      ],
      shadow_comparisons: [
        {
          service: "async-review-service",
          usedStrategy: "nvidia-primary",
          shadowStrategy: "grok-final-safety-shadow",
          summary: "raw model output with provider payload",
          disagreementCount: 1,
          recordedAt: "2026-05-19T00:00:02.000Z",
        },
      ],
    };
    mockDiagnoseWithDeepSeek.mockResolvedValueOnce(
      JSON.stringify({
        severity: "medium",
        recommendation: "vet_48h",
        title: "Vomiting needs veterinary follow-up",
        explanation: "Vomiting can worsen if hydration declines.",
        differential_diagnoses: [],
        clinical_notes: "Monitor hydration and energy.",
        recommended_tests: [],
        home_care: [],
        actions: ["Call your veterinarian if vomiting continues."],
        warning_signs: ["Repeated vomiting"],
        vet_questions: [],
        confidence: 0.7,
      })
    );
    mockVerifyWithGLM.mockResolvedValueOnce(
      JSON.stringify({
        safe: true,
        corrections: {},
        reasoning: "Report is safe.",
      })
    );

    const { response, payload } = await runReport(session, DOG);
    const persistedReport = mockSaveSymptomReportToDB.mock.calls[0]?.[2] as
      | { system_observability?: Record<string, unknown> }
      | undefined;
    const ownerTelemetry = payload.report?.system_observability as
      | Record<string, unknown>
      | undefined;
    const persistedTelemetry = persistedReport?.system_observability;
    const readout = persistedTelemetry?.shadowReadout as
      | Record<string, unknown>
      | undefined;

    expect(response.status).toBe(200);
    expect(payload.type).toBe("report");
    expect(ownerTelemetry).toEqual({
      timeoutCount: expect.any(Number),
      fallbackCount: expect.any(Number),
    });
    expect(ownerTelemetry?.shadowReadout).toBeUndefined();
    expect(readout).toEqual(
      expect.objectContaining({
        reportPresent: true,
        sessionPresent: true,
        observationCount: expect.any(Number),
        shadowComparisonCount: expect.any(Number),
        timeoutCount: expect.any(Number),
        fallbackCount: expect.any(Number),
        providerErrorCount: expect.any(Number),
        budgetExceededCount: expect.any(Number),
        secondOpinionTrace: expect.objectContaining({
          total: 1,
          eligibilityReasonCounts: { eligible: 1 },
          requestOutcomeCounts: { requested: 1 },
          acceptanceOutcomeCounts: { rejected: 1 },
          comparisonAppendOutcomeCounts: { not_applicable: 1 },
          comparisonWriteOutcomeCounts: { not_applicable: 1 },
          extractorReasonCounts: { invalid_code: 1 },
          readoutCountedCount: 0,
        }),
      })
    );
    expect(readout?.observationCount).toBeGreaterThanOrEqual(2);
    expect(readout?.shadowComparisonCount).toBe(1);
    expect(readout?.providerErrorCount).toBeGreaterThanOrEqual(1);
    expect(readout?.budgetExceededCount).toBeGreaterThanOrEqual(1);
    expect(persistedTelemetry?.recentServiceCalls).toBeUndefined();
    expect(persistedTelemetry?.recentShadowComparisons).toBeUndefined();

    const ownerJson = JSON.stringify(payload);
    const persistedJson = JSON.stringify(persistedReport);
    expect(ownerJson).not.toContain("secondOpinionTrace");
    for (const marker of forbiddenMarkers) {
      expect(ownerJson).not.toContain(marker);
      expect(persistedJson).not.toContain(marker);
    }
  });

  it("reconstructs a sanitized second-opinion report trace after client session sanitization", async () => {
    const originalMode = process.env.SECOND_OPINION_EXTRACTOR;
    process.env.SECOND_OPINION_EXTRACTOR = "shadow";

    let session = addSymptoms(createSession(), ["limping"]);
    session = {
      ...session,
      answered_questions: ["limping_onset"],
      extracted_answers: {
        ...session.extracted_answers,
        limping_onset: "sudden_today",
      },
      last_question_asked: "limping_onset",
      case_memory: {
        ...session.case_memory!,
        pending_question_id: undefined,
        unresolved_question_ids: [],
        question_asked_counts: {
          ...session.case_memory!.question_asked_counts,
          limping_onset: 2,
        },
        clarification_attempts: {
          ...session.case_memory!.clarification_attempts,
          limping_onset: 1,
        },
        service_observations: [],
        shadow_comparisons: [],
      },
    };

    mockDiagnoseWithDeepSeek.mockResolvedValueOnce(
      JSON.stringify({
        severity: "medium",
        recommendation: "vet_48h",
        title: "Limping needs veterinary follow-up",
        explanation: "A sudden limp can reflect pain or injury.",
        differential_diagnoses: [],
        clinical_notes: "Monitor mobility and pain.",
        recommended_tests: [],
        home_care: [],
        actions: ["Limit activity and call your veterinarian."],
        warning_signs: ["Unable to bear weight"],
        vet_questions: [],
        confidence: 0.7,
      })
    );
    mockVerifyWithGLM.mockResolvedValueOnce(
      JSON.stringify({
        safe: true,
        corrections: {},
        reasoning: "Report is safe.",
      })
    );

    try {
      const { response, payload } = await runReport(session, DOG);
      const persistedReport = mockSaveSymptomReportToDB.mock.calls[0]?.[2] as
        | { system_observability?: Record<string, unknown> }
        | undefined;
      const ownerTelemetry = payload.report?.system_observability as
        | Record<string, unknown>
        | undefined;
      const readout = persistedReport?.system_observability?.shadowReadout as
        | Record<string, unknown>
        | undefined;
      const secondOpinionTrace = readout?.secondOpinionTrace as
        | Record<string, unknown>
        | undefined;

      expect(response.status).toBe(200);
      expect(payload.type).toBe("report");
      expect(ownerTelemetry).toEqual({
        timeoutCount: expect.any(Number),
        fallbackCount: expect.any(Number),
      });
      expect(ownerTelemetry?.shadowReadout).toBeUndefined();
      expect(secondOpinionTrace).toEqual(
        expect.objectContaining({
          total: 1,
          eligibilityReasonCounts: { primary_extraction_succeeded: 1 },
          requestOutcomeCounts: { not_requested: 1 },
          comparisonAppendOutcomeCounts: { not_applicable: 1 },
          comparisonWriteOutcomeCounts: { not_applicable: 1 },
          extractorReasonCounts: { primary_extraction_succeeded: 1 },
          readoutCountedCount: 0,
        })
      );

      const ownerJson = JSON.stringify(payload);
      const persistedJson = JSON.stringify(persistedReport);
      expect(ownerJson).not.toContain("shadowReadout");
      expect(ownerJson).not.toContain("secondOpinionTrace");
      expect(ownerJson).not.toContain("eligibility_reason=");
      expect(ownerJson).not.toContain("request_outcome=");
      expect(persistedJson).not.toContain("Please generate the report.");
    } finally {
      if (originalMode === undefined) {
        delete process.env.SECOND_OPINION_EXTRACTOR;
      } else {
        process.env.SECOND_OPINION_EXTRACTOR = originalMode;
      }
    }
  });
});
