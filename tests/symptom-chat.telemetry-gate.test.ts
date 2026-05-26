import {
  addSymptoms,
  createSession,
  recordAnswer,
  type TriageSession,
} from "@/lib/triage-engine";
import type { SidecarObservation } from "@/lib/clinical-evidence";
import { extractTelemetryGateEventsFromObservations } from "@/lib/sidecar-observability";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockIsNvidiaConfigured = jest.fn(() => true);
const mockExtractWithQwen = jest.fn();
const mockComplete = jest.fn();
const mockPhraseWithLlama = jest.fn();
const mockDiagnoseWithDeepSeek = jest.fn();
const mockCompleteWithGrok = jest.fn();
const mockVerifyQuestionWithNemotron = jest.fn();
const mockReviewQuestionPlanWithNemotron = jest.fn();
const mockVerifyWithGLM = jest.fn();
const mockRunRoboflowSkinWorkflow = jest.fn();
const mockShouldAnalyzeWoundImage = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();
const mockComputeBayesianScore = jest.fn();
const mockAppendShadowTelemetrySnapshot = jest.fn();
const mockAppendShadowComparison = jest.fn();
const mockIsVisionPreprocessConfigured = jest.fn(() => false);
const mockIsMultimodalConsultConfigured = jest.fn(() => false);
const mockIsTextRetrievalConfigured = jest.fn(() => false);
const mockIsImageRetrievalConfigured = jest.fn(() => false);

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
  isNvidiaConfigured: (...args: unknown[]) => mockIsNvidiaConfigured(...args),
  extractWithQwen: (...args: unknown[]) => mockExtractWithQwen(...args),
  complete: (...args: unknown[]) => mockComplete(...args),
  phraseWithLlama: (...args: unknown[]) => mockPhraseWithLlama(...args),
  diagnoseWithDeepSeek: (...args: unknown[]) => mockDiagnoseWithDeepSeek(...args),
  verifyQuestionWithNemotron: (...args: unknown[]) =>
    mockVerifyQuestionWithNemotron(...args),
  reviewQuestionPlanWithNemotron: (...args: unknown[]) =>
    mockReviewQuestionPlanWithNemotron(...args),
  runVisionPipeline: jest.fn(),
  parseVisionForMatrix: jest.fn(),
  imageGuardrail: jest.fn(),
  verifyWithGLM: (...args: unknown[]) => mockVerifyWithGLM(...args),
}));

jest.mock("@/lib/xai-grok", () => ({
  completeWithGrok: (...args: unknown[]) => mockCompleteWithGrok(...args),
  isGrokConfigured: () => true,
}));

jest.mock("@/lib/pet-enrichment", () => ({
  detectBreedWithNyckel: jest.fn(),
  fetchBreedProfile: jest.fn(),
  getEffectivePetProfile: (pet: unknown) => pet,
  isLikelyDogContext: () => true,
  runRoboflowSkinWorkflow: (...args: unknown[]) =>
    mockRunRoboflowSkinWorkflow(...args),
  shouldUseImageInferredBreed: () => false,
}));

jest.mock("@/lib/image-gate", () => ({
  evaluateImageGate: jest.fn(),
  shouldAnalyzeWoundImage: (...args: unknown[]) =>
    mockShouldAnalyzeWoundImage(...args),
}));

jest.mock("@/lib/bayesian-scorer", () => ({
  computeBayesianScore: (...args: unknown[]) => mockComputeBayesianScore(...args),
}));

jest.mock("@/lib/minimax", () => ({
  isMiniMaxConfigured: () => true,
  compressCaseMemoryWithMiniMax: (...args: unknown[]) =>
    mockCompressCaseMemoryWithMiniMax(...args),
}));

jest.mock("@/lib/hf-sidecars", () => {
  const actual = jest.requireActual("@/lib/hf-sidecars");
  return {
    ...actual,
    isVisionPreprocessConfigured: (...args: unknown[]) =>
      mockIsVisionPreprocessConfigured(...args),
    isTextRetrievalConfigured: (...args: unknown[]) =>
      mockIsTextRetrievalConfigured(...args),
    isImageRetrievalConfigured: (...args: unknown[]) =>
      mockIsImageRetrievalConfigured(...args),
    isMultimodalConsultConfigured: (...args: unknown[]) =>
      mockIsMultimodalConsultConfigured(...args),
    preprocessVeterinaryImage: jest.fn(),
    consultWithMultimodalSidecar: jest.fn(),
    retrieveVeterinaryEvidenceFromSidecar: jest.fn(),
  };
});

jest.mock("@/lib/text-retrieval-service", () => ({
  isTextRetrievalConfigured: (...args: unknown[]) =>
    mockIsTextRetrievalConfigured(...args),
  retrieveVeterinaryTextEvidence: jest.fn(),
}));

jest.mock("@/lib/image-retrieval-service", () => ({
  isImageRetrievalConfigured: (...args: unknown[]) =>
    mockIsImageRetrievalConfigured(...args),
  retrieveVeterinaryImageEvidence: jest.fn(),
}));

jest.mock("@/lib/async-review-client", () => ({
  enqueueAsyncReview: jest.fn(),
}));

jest.mock("@/lib/confidence-calibrator", () => ({
  calibrateDiagnosticConfidence: jest.fn(),
}));

jest.mock("@/lib/icd-10-mapper", () => ({
  getICD10CodesForDisease: () => null,
  generateICD10Summary: () => [],
}));

jest.mock("@/lib/report-storage", () => ({
  saveSymptomReportToDB: jest.fn(),
}));

jest.mock("@/lib/shadow-telemetry-store", () => ({
  appendShadowTelemetrySnapshot: (...args: unknown[]) =>
    mockAppendShadowTelemetrySnapshot(...args),
}));

jest.mock("@/lib/sidecar-observability", () => {
  const actual = jest.requireActual(
    "@/lib/sidecar-observability"
  ) as typeof import("@/lib/sidecar-observability");
  return {
    ...actual,
    appendShadowComparison: (
      session: TriageSession,
      comparison: Parameters<typeof actual.appendShadowComparison>[1]
    ) => {
      mockAppendShadowComparison(session, comparison);
      return actual.appendShadowComparison(session, comparison);
    },
  };
});

jest.mock("@/lib/events/event-bus", () => ({
  EventType: {
    REPORT_READY: "REPORT_READY",
    URGENCY_HIGH: "URGENCY_HIGH",
    OUTCOME_REQUESTED: "OUTCOME_REQUESTED",
    SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
    PET_ADDED: "PET_ADDED",
  },
  emit: jest.fn(),
}));

jest.mock("@/lib/events/notification-handler", () => ({}));

const PET = {
  name: "Bruno",
  breed: "Golden Retriever",
  age_years: 5,
  weight: 72,
  species: "dog",
};

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

function makeReportRequest(session: TriageSession) {
  return new Request("http://localhost/api/ai/symptom-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate_report",
      pet: PET,
      session,
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

function seedPendingQuestion(
  session: TriageSession,
  questionId: string,
  options?: {
    askedCount?: number;
    clarificationAttempts?: number;
    unresolved?: boolean;
  }
): TriageSession {
  const askedCount = options?.askedCount ?? 1;
  const clarificationAttempts = options?.clarificationAttempts ?? 0;
  const unresolved = options?.unresolved ?? true;
  const caseMemory = session.case_memory!;

  return {
    ...session,
    last_question_asked: questionId,
    case_memory: {
      ...caseMemory,
      pending_question_id: questionId,
      question_asked_counts: {
        ...(caseMemory.question_asked_counts ?? {}),
        [questionId]: askedCount,
      },
      clarification_attempts: {
        ...(caseMemory.clarification_attempts ?? {}),
        [questionId]: clarificationAttempts,
      },
      unresolved_question_ids: unresolved
        ? Array.from(
            new Set([...(caseMemory.unresolved_question_ids ?? []), questionId])
          )
        : caseMemory.unresolved_question_ids ?? [],
      clarification_reasons: unresolved
        ? {
            ...(caseMemory.clarification_reasons ?? {}),
            [questionId]: "pending_recovery_failed",
          }
        : caseMemory.clarification_reasons ?? {},
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

async function postTurn(session: TriageSession, message: string) {
  const { POST } = await import("@/app/api/ai/symptom-chat/route");
  const response = await POST(makeTextOnlyRequest(session, message));
  const payload = await response.json();
  return { response, payload };
}

async function postReport(session: TriageSession) {
  const { POST } = await import("@/app/api/ai/symptom-chat/route");
  const response = await POST(makeReportRequest(session));
  const payload = await response.json();
  return { response, payload };
}

function getGateEventsFromLogs(logSpy: { mock: { calls: unknown[][] } }) {
  const gateEvents = new Set<string>();

  for (const call of logSpy.mock.calls) {
    for (const entry of call) {
      if (typeof entry !== "string") {
        continue;
      }

      const jsonStart = entry.indexOf("{");
      if (jsonStart === -1) {
        continue;
      }

      try {
        const parsed = JSON.parse(entry.slice(jsonStart)) as {
          gate_events?: string[];
        };
        for (const gateEvent of parsed.gate_events ?? []) {
          gateEvents.add(gateEvent);
        }
      } catch {
        // Ignore non-JSON console lines.
      }
    }
  }

  return Array.from(gateEvents);
}

function getLatestShadowSnapshotGateEvents() {
  const latestSnapshot = mockAppendShadowTelemetrySnapshot.mock.calls.at(-1)?.[0] as
    | { recentServiceCalls?: SidecarObservation[] }
    | undefined;

  return extractTelemetryGateEventsFromObservations(
    latestSnapshot?.recentServiceCalls ?? []
  );
}

function getSecondOpinionShadowComparisonCalls() {
  return mockAppendShadowComparison.mock.calls
    .map((call) => call[1] as { shadowStrategy?: unknown })
    .filter(
      (comparison) => comparison.shadowStrategy === "second_opinion_extractor"
    );
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("VET-1428 repeat-loop + hallucination telemetry gate", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SECOND_OPINION_EXTRACTOR;
    delete process.env.GROK_FINAL_SAFETY;

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
    mockPhraseWithLlama.mockImplementation(async (prompt: string) => {
      const questionId =
        prompt.match(/Internal ID: ([^\n]+)/)?.[1]?.trim() || "unknown";
      return JSON.stringify({ message: `Next: ${questionId}?` });
    });
    mockReviewQuestionPlanWithNemotron.mockResolvedValue(
      JSON.stringify({
        include_image_context: false,
        use_deterministic_fallback: false,
        reason: "gate_clean",
      })
    );
    mockVerifyQuestionWithNemotron.mockImplementation(async (prompt: string) => {
      const questionText =
        prompt.match(/Exact question text: "([^"]+)"/)?.[1]?.trim() ||
        "Can you tell me more?";
      return JSON.stringify({ message: questionText });
    });
    mockVerifyWithGLM.mockResolvedValue(
      JSON.stringify({
        safe: true,
        corrections: {
          severity: null,
          recommendation: null,
          add_warning_signs: [],
          add_to_explanation: null,
          safety_note: null,
        },
        reasoning: "Report is clinically sound",
      })
    );
    mockComputeBayesianScore.mockResolvedValue([]);
    mockAppendShadowTelemetrySnapshot.mockResolvedValue(undefined);
    mockDiagnoseWithDeepSeek.mockResolvedValue(
      JSON.stringify({
        severity: "low",
        recommendation: "monitor",
        title: "Acute gastrointestinal upset",
        explanation:
          "This pattern is more consistent with a gastrointestinal concern and should guide a vet visit if it continues.",
        differential_diagnoses: [
          {
            condition: "Gastroenteritis",
            likelihood: "moderate",
            description: "GI inflammation can cause vomiting and appetite changes.",
          },
        ],
        clinical_notes: "Monitor hydration and abdominal comfort.",
        recommended_tests: [
          {
            test: "CBC",
            reason: "Check hydration and inflammation markers",
          },
        ],
        home_care: [],
        actions: ["Offer small amounts of water."],
        warning_signs: ["Repeated vomiting"],
        vet_questions: ["Should we run stool or blood testing?"],
      })
    );
  });

  it("resolves duration replies with coercion telemetry and without repeat-loop detection", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_duration");

    try {
      const { response, payload } = await postTurn(session, "For about two days.");

      expect(response.status).toBe(200);
      expect(payload.session.extracted_answers.cough_duration).toBe(
        "For about two days."
      );
      expect(getGateEventsFromLogs(logSpy)).toEqual(
        expect.arrayContaining(["coercion_used", "pending_question_resolved"])
      );
      expect(getGateEventsFromLogs(logSpy)).not.toContain("repeat_loop_detected");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("does not loop forever on repeated unknown replies", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["drinking_more", "weight_loss"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["drinking_more", "weight_loss"]);
    session = seedPendingQuestion(session, "appetite_change");

    try {
      const firstTurn = await postTurn(session, "not sure");
      const secondTurn = await postTurn(firstTurn.payload.session, "not sure");

      expect(firstTurn.response.status).toBe(200);
      expect(secondTurn.response.status).toBe(200);
      expect(secondTurn.payload.type).toBe("cannot_assess");
      expect(getGateEventsFromLogs(logSpy)).toContain("repeat_loop_detected");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("records second-opinion shadow acceptance without changing the owner-facing output", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "dry_honking",
        confidence: 0.9,
        ownerPhrase: "honking",
        needsClarification: false,
      })
    );

    let baselineSession = createSession();
    baselineSession = addSymptoms(baselineSession, ["coughing"]);
    baselineSession = seedPendingQuestion(baselineSession, "cough_type", {
      askedCount: 2,
      clarificationAttempts: 1,
    });

    try {
      const offTurn = await postTurn(baselineSession, "It has a honking sound.");

      process.env.SECOND_OPINION_EXTRACTOR = "shadow";

      let shadowSession = createSession();
      shadowSession = addSymptoms(shadowSession, ["coughing"]);
      shadowSession = seedPendingQuestion(shadowSession, "cough_type", {
        askedCount: 2,
        clarificationAttempts: 1,
      });

      const shadowTurn = await postTurn(shadowSession, "It has a honking sound.");

      expect(shadowTurn.response.status).toBe(200);
      expect(shadowTurn.payload.type).toBe(offTurn.payload.type);
      expect(shadowTurn.payload.reason_code).toBe(offTurn.payload.reason_code);
      expect(shadowTurn.payload.message).toBe(offTurn.payload.message);
      expect(getGateEventsFromLogs(logSpy)).toContain("second_opinion_used");

      // VET-1520C: shadow acceptance records an internal comparison while
      // preserving the client-visible telemetry redaction boundary.
      expect(getSecondOpinionShadowComparisonCalls()).toEqual([
        expect.objectContaining({
          service: "async-review-service",
          shadowStrategy: "second_opinion_extractor",
          usedStrategy: "deterministic_extraction_failed",
          disagreementCount: 1,
          summary: "q=cough_type; shadow_answer_recorded=true; conf=0.90",
        }),
      ]);
      expect(JSON.stringify(getSecondOpinionShadowComparisonCalls())).not.toContain(
        "dry_honking"
      );
      expect(JSON.stringify(getSecondOpinionShadowComparisonCalls())).not.toContain(
        "honking"
      );
      expect(
        shadowTurn.payload.session.case_memory?.shadow_comparisons ?? []
      ).toHaveLength(0);
      expect(mockAppendShadowTelemetrySnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "chat",
          recentServiceCalls: [
            expect.objectContaining({
              service: "async-review-service",
              stage: "second_opinion",
              note: expect.stringContaining("eligibility_reason=eligible"),
            }),
          ],
          recentShadowComparisons: [
            expect.objectContaining({
              shadowStrategy: "second_opinion_extractor",
              summary: "q=cough_type; shadow_answer_recorded=true; conf=0.90",
            }),
          ],
        })
      );
      const storedAcceptedTraceJson = JSON.stringify(
        mockAppendShadowTelemetrySnapshot.mock.calls.at(-1)?.[0]
      );
      expect(storedAcceptedTraceJson).toContain("request_outcome=requested");
      expect(storedAcceptedTraceJson).toContain("acceptance_outcome=accepted");
      expect(storedAcceptedTraceJson).toContain(
        "comparison_append_outcome=comparison_appended"
      );
      expect(storedAcceptedTraceJson).toContain(
        "comparison_write_outcome=comparison_write_succeeded"
      );
      expect(storedAcceptedTraceJson).not.toContain("dry_honking");
      expect(storedAcceptedTraceJson).not.toContain("honking");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("records second-opinion shadow rejection without changing the owner-facing output", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "dry_honking",
        confidence: 0.5,
        ownerPhrase: "honking",
        needsClarification: false,
      })
    );

    let baselineSession = createSession();
    baselineSession = addSymptoms(baselineSession, ["coughing"]);
    baselineSession = seedPendingQuestion(baselineSession, "cough_type", {
      askedCount: 2,
      clarificationAttempts: 1,
    });

    try {
      const offTurn = await postTurn(baselineSession, "It has a honking sound.");

      process.env.SECOND_OPINION_EXTRACTOR = "shadow";

      let shadowSession = createSession();
      shadowSession = addSymptoms(shadowSession, ["coughing"]);
      shadowSession = seedPendingQuestion(shadowSession, "cough_type", {
        askedCount: 2,
        clarificationAttempts: 1,
      });

      const shadowTurn = await postTurn(shadowSession, "It has a honking sound.");

      expect(shadowTurn.response.status).toBe(200);
      expect(shadowTurn.payload.type).toBe(offTurn.payload.type);
      expect(shadowTurn.payload.reason_code).toBe(offTurn.payload.reason_code);
      expect(shadowTurn.payload.message).toBe(offTurn.payload.message);
      expect(getGateEventsFromLogs(logSpy)).toContain("second_opinion_rejected");

      // VET-1520C: rejected second-opinion must NOT record a shadow comparison
      expect(getSecondOpinionShadowComparisonCalls()).toHaveLength(0);
      expect(
        shadowTurn.payload.session.case_memory?.shadow_comparisons ?? []
      ).toHaveLength(0);

      const storedTraceSnapshot =
        mockAppendShadowTelemetrySnapshot.mock.calls.at(-1)?.[0];
      const storedTraceJson = JSON.stringify(storedTraceSnapshot);
      expect(storedTraceSnapshot).toEqual(
        expect.objectContaining({
          source: "chat",
          recentShadowComparisons: [],
          recentServiceCalls: [
            expect.objectContaining({
              service: "async-review-service",
              stage: "second_opinion",
              note: expect.stringContaining("eligibility_reason=eligible"),
            }),
          ],
        })
      );
      expect(storedTraceJson).toContain("request_outcome=requested");
      expect(storedTraceJson).toContain("acceptance_outcome=rejected");
      expect(storedTraceJson).toContain("extractor_reason=low_confidence");
      expect(storedTraceJson).not.toContain("dry_honking");
      expect(storedTraceJson).not.toContain("honking");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("Grok provider failure does not suppress second-opinion shadow comparison", async () => {
    // VET-1520C: Grok runs during report generation; second-opinion runs during chat turns.
    // Configuring GROK_FINAL_SAFETY=shadow with a failing Grok mock must not prevent
    // the second-opinion shadow comparison from being recorded on a chat turn.
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.GROK_FINAL_SAFETY = "shadow";
    process.env.SECOND_OPINION_EXTRACTOR = "shadow";
    mockCompleteWithGrok.mockRejectedValue(new Error("XAI_API_KEY missing"));
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "dry_honking",
        confidence: 0.9,
        ownerPhrase: "honking",
        needsClarification: false,
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_type", {
      askedCount: 2,
      clarificationAttempts: 1,
    });

    try {
      const { response, payload } = await postTurn(
        session,
        "It has a honking sound."
      );

      expect(response.status).toBe(200);
      // Grok is not called during chat turns; second-opinion comparison must be present
      expect(mockCompleteWithGrok).not.toHaveBeenCalled();
      expect(getSecondOpinionShadowComparisonCalls()).toEqual([
        expect.objectContaining({
          shadowStrategy: "second_opinion_extractor",
        }),
      ]);
      expect(payload.session.case_memory?.shadow_comparisons ?? []).toHaveLength(
        0
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("records a sanitized comparison write failure when chat telemetry persistence is refused", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    process.env.SECOND_OPINION_EXTRACTOR = "shadow";
    mockAppendShadowTelemetrySnapshot.mockResolvedValueOnce(false);
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({
        answered: true,
        questionId: "cough_type",
        answerValue: "dry_honking",
        confidence: 0.9,
        ownerPhrase: "honking",
        needsClarification: false,
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_type", {
      askedCount: 2,
      clarificationAttempts: 1,
    });

    try {
      const { response, payload } = await postTurn(
        session,
        "It has a honking sound."
      );
      const serializedLogs = JSON.stringify(logSpy.mock.calls);

      expect(response.status).toBe(200);
      expect(payload.session.case_memory?.shadow_comparisons ?? []).toHaveLength(
        0
      );
      expect(getSecondOpinionShadowComparisonCalls()).toHaveLength(1);
      expect(serializedLogs).toContain("comparison_write_failed");
      expect(serializedLogs).not.toContain("dry_honking");
      expect(serializedLogs).not.toContain("honking");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("records shadow Grok safety findings internally while keeping the deterministic handoff stable", async () => {
    process.env.GROK_FINAL_SAFETY = "shadow";
    mockCompleteWithGrok.mockResolvedValueOnce(
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: ["vomit_blood"],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "emergency",
        vetHandoffNotes: ["Vomited blood this morning"],
        safeToShow: true,
      })
    );

    const { response, payload } = await postReport(buildEmergencyReportSession());
    await flushAsyncWork();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("report");
    expect(payload.report.recommendation).toBe("emergency_vet");
    expect(payload.report.vet_handoff_summary).toContain("Deterministic red flags:");
    expect(payload.report.vet_handoff_summary).not.toContain("Top differentials");
    expect(payload.report.vet_handoff_summary).not.toContain(
      "Recommended diagnostics"
    );
    expect(getLatestShadowSnapshotGateEvents()).toEqual(
      expect.arrayContaining([
        "grok_safety_used",
        "missed_red_flag_detected",
        "report_claim_removed",
        "final_safety_fallback",
      ])
    );
    expect(JSON.stringify(payload.report)).not.toContain("grok_safety_used");
    expect(JSON.stringify(payload.report)).not.toContain("missed_red_flag_detected");
  });

  it("records shadow Grok safety fallback on verifier failure without leaking telemetry", async () => {
    process.env.GROK_FINAL_SAFETY = "shadow";
    mockCompleteWithGrok.mockRejectedValueOnce(new Error("provider timeout"));

    const { response, payload } = await postReport(buildModerateReportSession());
    await flushAsyncWork();

    expect(response.status).toBe(200);
    expect(payload.type).toBe("report");
    expect(getLatestShadowSnapshotGateEvents()).toEqual(
      expect.arrayContaining(["grok_safety_failed", "final_safety_fallback"])
    );
    expect(payload.report.vet_handoff_summary).not.toContain("telemetry");
    expect(payload.report.explanation).not.toContain("grok_safety_failed");
  });

  it("keeps emergency red flags on the deterministic bypass path", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({
        symptoms: ["vomiting"],
        answers: { vomit_blood: true },
      })
    );

    const { response, payload } = await postTurn(
      createSession(),
      "He is vomiting blood right now."
    );

    expect(response.status).toBe(200);
    expect(payload.type).toBe("emergency");
    expect(payload.session.red_flags_triggered).toContain("vomit_blood");
    expect(payload.message).not.toContain("second_opinion");
    expect(payload.message).not.toContain("grok_safety");
  });

  it("keeps telemetry and debug markers out of owner-facing responses", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_duration");

    const chatTurn = await postTurn(session, "For about two days.");

    expect(chatTurn.payload.message).not.toContain("gate_events");
    expect(chatTurn.payload.message).not.toContain("coercion_used");
    expect(chatTurn.payload.message).not.toContain("repeat_loop_detected");

    process.env.GROK_FINAL_SAFETY = "shadow";
    mockCompleteWithGrok.mockResolvedValueOnce(
      JSON.stringify({
        unsafeDowngradeDetected: false,
        missedRedFlags: [],
        diagnosisOrTreatmentClaims: [],
        recommendedUrgencyLanguage: "same_day",
        vetHandoffNotes: ["He keeps scratching around his ears"],
        safeToShow: true,
      })
    );

    const reportTurn = await postReport(buildModerateReportSession());

    expect(reportTurn.payload.report.vet_handoff_summary).not.toContain("gate_events");
    expect(reportTurn.payload.report.vet_handoff_summary).not.toContain(
      "final_safety_fallback"
    );
    expect(reportTurn.payload.report.vet_handoff_summary).not.toContain(
      "report_claim_removed"
    );
  });
});
