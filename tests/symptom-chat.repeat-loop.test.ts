import {
  addSymptoms,
  createSession,
  type TriageSession,
} from "@/lib/triage-engine";
import {
  getProtectedConversationState,
  mergeCompressionResult,
} from "@/lib/symptom-memory";
import { getPendingQuestionId } from "@/lib/symptom-chat/pending-question-state";

const mockCheckRateLimit = jest.fn();
const mockGetRateLimitId = jest.fn();
const mockCreateServerSupabaseClient = jest.fn();
const mockIsNvidiaConfigured = jest.fn(() => true);
const mockExtractWithQwen = jest.fn();
const mockComplete = jest.fn();
const mockPhraseWithLlama = jest.fn();
const mockVerifyQuestionWithNemotron = jest.fn();
const mockRunRoboflowSkinWorkflow = jest.fn();
const mockShouldAnalyzeWoundImage = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();
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
  verifyQuestionWithNemotron: (...args: unknown[]) =>
    mockVerifyQuestionWithNemotron(...args),
  reviewQuestionPlanWithNemotron: jest.fn(),
  runVisionPipeline: jest.fn(),
  parseVisionForMatrix: jest.fn(),
  imageGuardrail: jest.fn(),
  diagnoseWithDeepSeek: jest.fn(),
  verifyWithGLM: jest.fn(),
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

async function postTurn(session: TriageSession, message: string) {
  const { POST } = await import("@/app/api/ai/symptom-chat/route");
  const response = await POST(makeTextOnlyRequest(session, message));
  const payload = await response.json();
  return { response, payload };
}

describe("VET-1423 pending question repeat-loop guardrails", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.SECOND_OPINION_EXTRACTOR;

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
      JSON.stringify({ symptoms: [], answers: {} })
    );
    mockComplete.mockResolvedValue(
      JSON.stringify({
        answered: false,
        questionId: "unknown",
        answerValue: null,
        confidence: 0,
        ownerPhrase: "",
        needsClarification: true,
      })
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

  it("resolves duration-style pending answers and does not repeat the answered question", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_duration", {
      askedCount: 1,
      clarificationAttempts: 0,
      unresolved: true,
    });

    const { response, payload } = await postTurn(session, "For about two days.");

    expect(response.status).toBe(200);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_duration).toBe(
      "For about two days."
    );
    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.last_question_asked).not.toBe("cough_duration");
    expect(payload.session.case_memory?.unresolved_question_ids ?? []).not.toContain(
      "cough_duration"
    );
    expect(payload.session.case_memory?.pending_question_id).not.toBe(
      "cough_duration"
    );
  });

  it("does not loop forever on repeated 'not sure' replies", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({
        symptoms: ["drinking_more", "weight_loss"],
        answers: {},
      })
    );

    let session = createSession();
    session = addSymptoms(session, ["drinking_more", "weight_loss"]);
    session = seedPendingQuestion(session, "appetite_change", {
      askedCount: 1,
      clarificationAttempts: 0,
      unresolved: true,
    });

    const firstTurn = await postTurn(session, "not sure");

    expect(firstTurn.response.status).toBe(200);
    expect(firstTurn.payload.type).toBe("question");
    expect(firstTurn.payload.session.last_question_asked).toBe(
      "appetite_change"
    );
    expect(
      firstTurn.payload.session.case_memory?.question_asked_counts
        ?.appetite_change
    ).toBe(2);
    expect(
      firstTurn.payload.session.case_memory?.clarification_attempts
        ?.appetite_change
    ).toBe(1);

    const secondTurn = await postTurn(firstTurn.payload.session, "not sure");

    expect(secondTurn.response.status).toBe(200);
    expect(secondTurn.payload.type).toBe("cannot_assess");
    expect(secondTurn.payload.reason_code).toBe(
      "owner_cannot_assess_appetite_change"
    );
  });

  it("does not re-ask the same non-critical question more than twice after skipped replies", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["limping"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = seedPendingQuestion(session, "swelling_present", {
      askedCount: 1,
      clarificationAttempts: 0,
      unresolved: true,
    });

    const firstTurn = await postTurn(session, "skip");

    expect(firstTurn.response.status).toBe(200);
    expect(firstTurn.payload.type).toBe("question");
    expect(firstTurn.payload.session.last_question_asked).toBe(
      "swelling_present"
    );
    expect(
      firstTurn.payload.session.case_memory?.question_asked_counts
        ?.swelling_present
    ).toBe(2);
    expect(
      firstTurn.payload.session.case_memory?.clarification_attempts
        ?.swelling_present
    ).toBe(1);

    const secondTurn = await postTurn(firstTurn.payload.session, "skip");

    expect(secondTurn.response.status).toBe(200);
    expect(secondTurn.payload.type).toBe("question");
    expect(secondTurn.payload.session.extracted_answers.swelling_present).toBe(
      "unknown"
    );
    expect(secondTurn.payload.session.answered_questions).toContain(
      "swelling_present"
    );
    expect(secondTurn.payload.session.last_question_asked).not.toBe(
      "swelling_present"
    );
    expect(
      secondTurn.payload.session.case_memory?.unresolved_question_ids ?? []
    ).not.toContain("swelling_present");
    expect(
      secondTurn.payload.session.case_memory?.question_asked_counts
        ?.swelling_present
    ).toBe(2);
    expect(
      secondTurn.payload.session.case_memory?.clarification_attempts
        ?.swelling_present
    ).toBe(2);
  });

  it("escalates safely when a critical pending question reaches the third attempt", async () => {
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_type", {
      askedCount: 1,
      clarificationAttempts: 0,
      unresolved: true,
    });

    const firstTurn = await postTurn(
      session,
      "I'm not sure what kind of cough it is."
    );

    expect(firstTurn.response.status).toBe(200);
    expect(firstTurn.payload.type).toBe("question");
    expect(firstTurn.payload.session.last_question_asked).toBe("cough_type");
    expect(
      firstTurn.payload.session.case_memory?.question_asked_counts?.cough_type
    ).toBe(2);

    const secondTurn = await postTurn(
      firstTurn.payload.session,
      "I'm still not sure what kind of cough it is."
    );

    expect(secondTurn.response.status).toBe(200);
    expect(secondTurn.payload.type).toBe("cannot_assess");
    expect(secondTurn.payload.terminal_state).toBe("cannot_assess");
    expect(secondTurn.payload.reason_code).toBe(
      "owner_cannot_assess_cough_type"
    );
  });

  it("does not re-add an answered pending question back into unresolved ids", async () => {
    mockExtractWithQwen.mockResolvedValueOnce(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_duration", {
      askedCount: 1,
      clarificationAttempts: 0,
      unresolved: true,
    });

    const { payload } = await postTurn(session, "For about two days");

    expect(payload.session.answered_questions).toContain("cough_duration");
    expect(payload.session.case_memory?.unresolved_question_ids ?? []).not.toContain(
      "cough_duration"
    );
  });

  it("does not resurrect an answered last question as pending fallback state", () => {
    let session = createSession();
    session = seedPendingQuestion(session, "cough_duration", {
      askedCount: 2,
      clarificationAttempts: 1,
      unresolved: false,
    });
    session = {
      ...session,
      answered_questions: ["cough_duration"],
      extracted_answers: { cough_duration: "For about two days." },
      case_memory: {
        ...session.case_memory!,
        pending_question_id: undefined,
      },
    };

    expect(getPendingQuestionId(session)).toBeUndefined();
  });

  it("preserves pending question state and ask counts across compression", () => {
    let session = createSession();
    session = addSymptoms(session, ["limping"]);
    session = seedPendingQuestion(session, "swelling_present", {
      askedCount: 2,
      clarificationAttempts: 1,
      unresolved: true,
    });
    session.answered_questions = ["which_leg"];
    session.extracted_answers = { which_leg: "left back leg" };

    const protectedState = getProtectedConversationState(session);
    const compressed = mergeCompressionResult(
      session,
      { summary: "Compressed summary.", model: "MiniMax-M2.7" },
      protectedState
    );

    expect(compressed.case_memory?.pending_question_id).toBe(
      "swelling_present"
    );
    expect(
      compressed.case_memory?.question_asked_counts?.swelling_present
    ).toBe(2);
    expect(
      compressed.case_memory?.clarification_attempts?.swelling_present
    ).toBe(1);
    expect(compressed.answered_questions).toEqual(["which_leg"]);
  });

  it("uses second-opinion extraction on the first clarification retry without triggering the repeat guard", async () => {
    process.env.SECOND_OPINION_EXTRACTOR = "on";
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
      unresolved: true,
    });

    const { response, payload } = await postTurn(
      session,
      "It has a honking sound."
    );

    expect(response.status).toBe(200);
    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(payload.type).toBe("question");
    expect(payload.session.extracted_answers.cough_type).toBe("dry_honking");
    expect(payload.session.answered_questions).toContain("cough_type");
    expect(payload.session.case_memory?.pending_question_id).not.toBe(
      "cough_type"
    );
    expect(payload.session.case_memory?.unresolved_question_ids ?? []).not.toContain(
      "cough_type"
    );
    expect(
      payload.session.case_memory?.clarification_attempts?.cough_type
    ).toBe(1);
    expect(payload.session.case_memory?.model_budget_state).toBeUndefined();
  });

  it("fails closed to the repeat guard when the second-opinion session budget is exhausted", async () => {
    process.env.SECOND_OPINION_EXTRACTOR = "on";
    mockExtractWithQwen.mockResolvedValue(
      JSON.stringify({ symptoms: ["coughing"], answers: {} })
    );

    let session = createSession();
    session = addSymptoms(session, ["coughing"]);
    session = seedPendingQuestion(session, "cough_type", {
      askedCount: 2,
      clarificationAttempts: 1,
      unresolved: true,
    });
    session.case_memory = {
      ...session.case_memory,
      model_budget_state: {
        callCounts: {
          second_opinion: 2,
        },
        circuitOpen: {},
      },
    };

    const { response, payload } = await postTurn(
      session,
      "It has a honking sound."
    );

    expect(response.status).toBe(200);
    expect(mockComplete).not.toHaveBeenCalled();
    expect(payload.type).toBe("cannot_assess");
    expect(payload.session.extracted_answers.cough_type).toBeUndefined();
    expect(payload.session.answered_questions).not.toContain("cough_type");
    expect(payload.session.case_memory?.pending_question_id).not.toBe("cough_type");
    expect(payload.session.case_memory?.model_budget_state).toBeUndefined();
  });
});
