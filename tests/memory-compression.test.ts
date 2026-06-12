import type { PetProfile, TriageSession } from "@/lib/triage-engine";

const mockBuildDeterministicCaseSummary = jest.fn();
const mockBuildNarrativeSnapshot = jest.fn();
const mockEnsureStructuredCaseMemory = jest.fn();
const mockGetProtectedConversationState = jest.fn();
const mockMergeCompressionResult = jest.fn();
const mockRecordConversationTelemetry = jest.fn();
const mockShouldCompressCaseMemory = jest.fn();
const mockCompressCaseMemoryWithMiniMax = jest.fn();
const mockIsMiniMaxConfigured = jest.fn();

jest.mock("@/lib/symptom-memory", () => ({
  buildDeterministicCaseSummary: (...args: unknown[]) =>
    mockBuildDeterministicCaseSummary(...args),
  buildNarrativeSnapshot: (...args: unknown[]) =>
    mockBuildNarrativeSnapshot(...args),
  ensureStructuredCaseMemory: (...args: unknown[]) =>
    mockEnsureStructuredCaseMemory(...args),
  getProtectedConversationState: (...args: unknown[]) =>
    mockGetProtectedConversationState(...args),
  mergeCompressionResult: (...args: unknown[]) =>
    mockMergeCompressionResult(...args),
  recordConversationTelemetry: (...args: unknown[]) =>
    mockRecordConversationTelemetry(...args),
  shouldCompressCaseMemory: (...args: unknown[]) =>
    mockShouldCompressCaseMemory(...args),
}));

jest.mock("@/lib/minimax", () => ({
  compressCaseMemoryWithMiniMax: (...args: unknown[]) =>
    mockCompressCaseMemoryWithMiniMax(...args),
  isMiniMaxConfigured: (...args: unknown[]) => mockIsMiniMaxConfigured(...args),
}));

const SESSION = {
  known_symptoms: ["limping"],
  answered_questions: ["which_leg"],
  extracted_answers: { which_leg: "left_hind" },
  case_memory: {
    turn_count: 6,
    compressed_summary: "",
  },
} as unknown as TriageSession;

const PET = {
  name: "Bruno",
} as PetProfile;

const MESSAGES = [{ role: "user", content: "He is limping on the left back leg." }] as const;

describe("memory-compression helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureStructuredCaseMemory.mockReturnValue({
      turn_count: 6,
      compressed_summary: "",
    });
    mockBuildDeterministicCaseSummary.mockReturnValue("Fallback summary");
    mockBuildNarrativeSnapshot.mockReturnValue("Narrative snapshot");
    mockGetProtectedConversationState.mockReturnValue({});
    mockRecordConversationTelemetry.mockImplementation((session) => session);
  });

  it("backfills compressed_summary without telemetry when refresh is not needed", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(false);

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    const result = await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: false,
        changedSymptoms: [],
        changedAnswers: [],
      }
    );

    expect(result.case_memory?.compressed_summary).toBe("Fallback summary");
    expect(mockIsMiniMaxConfigured).not.toHaveBeenCalled();
    expect(mockRecordConversationTelemetry).not.toHaveBeenCalled();
  });

  it("returns deterministic-summary without telemetry when MiniMax is disabled", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(true);
    mockIsMiniMaxConfigured.mockReturnValue(false);

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    const result = await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: true,
        changedSymptoms: ["limping"],
        changedAnswers: ["which_leg"],
      }
    );

    expect(result.case_memory).toEqual(
      expect.objectContaining({
        compressed_summary: "Fallback summary",
        compression_model: "deterministic-summary",
        last_compressed_turn: 6,
      })
    );
    expect(mockCompressCaseMemoryWithMiniMax).not.toHaveBeenCalled();
    expect(mockRecordConversationTelemetry).not.toHaveBeenCalled();
  });

  it("uses deterministic compression when the text-turn model-call cap reserves the second call", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(true);

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    const result = await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: false,
        changedSymptoms: ["limping"],
        changedAnswers: ["which_leg"],
        modelCompressionDisabled: true,
        modelCompressionDisabledReason: "text_turn_model_call_cap",
      }
    );

    expect(mockIsMiniMaxConfigured).not.toHaveBeenCalled();
    expect(mockCompressCaseMemoryWithMiniMax).not.toHaveBeenCalled();
    expect(mockRecordConversationTelemetry).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({
        event: "compression",
        outcome: "fallback",
        reason: "text_turn_model_call_cap",
      })
    );
    expect(result.case_memory).toEqual(
      expect.objectContaining({
        compressed_summary: "Fallback summary",
        compression_model: "deterministic-summary",
        last_compressed_turn: 6,
      })
    );
  });

  it("skips MiniMax compression when the turn deadline has too little budget left", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(true);
    mockIsMiniMaxConfigured.mockReturnValue(true);
    mockEnsureStructuredCaseMemory.mockReturnValue({
      turn_count: 6,
      compressed_summary: "",
      service_timeouts: [],
    });
    const serviceTimeouts = [];

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    const result = await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: true,
        changedSymptoms: ["limping"],
        changedAnswers: ["which_leg"],
        turnBudget: {
          startedAtMs: Date.now() - 60_000,
          deadlineAtMs: Date.now(),
        },
        serviceTimeouts,
      }
    );

    expect(mockCompressCaseMemoryWithMiniMax).not.toHaveBeenCalled();
    expect(mockRecordConversationTelemetry).toHaveBeenCalledWith(
      SESSION,
      expect.objectContaining({
        event: "compression",
        outcome: "fallback",
        reason: "turn_deadline_budget_exhausted",
      })
    );
    expect(serviceTimeouts).toEqual([
      {
        service: "minimax",
        stage: "memory_compression",
        reason: "turn_deadline_budget_exhausted",
      },
    ]);
    expect(result.case_memory).toEqual(
      expect.objectContaining({
        compressed_summary: "Fallback summary",
        compression_model: "deterministic-summary",
        service_timeouts: serviceTimeouts,
      })
    );
  });

  it("passes the shared turn deadline into MiniMax compression", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(true);
    mockIsMiniMaxConfigured.mockReturnValue(true);
    mockCompressCaseMemoryWithMiniMax.mockResolvedValue({
      summary: "Compressed summary",
      model: "MiniMax-M2.7",
    });
    const mergedSession = {
      ...SESSION,
      case_memory: {
        turn_count: 6,
        compressed_summary: "Compressed summary",
        compression_model: "MiniMax-M2.7",
      },
    } as unknown as TriageSession;
    mockMergeCompressionResult.mockReturnValue(mergedSession);
    const deadlineAtMs = Date.now() + 20_000;

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: true,
        changedSymptoms: ["limping"],
        changedAnswers: ["which_leg"],
        turnBudget: {
          startedAtMs: deadlineAtMs - 5_000,
          deadlineAtMs,
        },
      }
    );

    expect(mockCompressCaseMemoryWithMiniMax).toHaveBeenCalledWith(
      expect.any(String),
      { deadlineAtMs }
    );
    expect(mockRecordConversationTelemetry).toHaveBeenCalledWith(
      mergedSession,
      expect.objectContaining({
        event: "compression",
        outcome: "success",
        compression_model: "MiniMax-M2.7",
      })
    );
  });

  it("records service timeout telemetry when MiniMax aborts after starting", async () => {
    mockShouldCompressCaseMemory.mockReturnValue(true);
    mockIsMiniMaxConfigured.mockReturnValue(true);
    mockEnsureStructuredCaseMemory.mockReturnValue({
      turn_count: 6,
      compressed_summary: "",
      service_timeouts: [],
    });
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mockCompressCaseMemoryWithMiniMax.mockRejectedValue(abortError);
    const serviceTimeouts = [];

    const { maybeCompressStructuredCaseMemory } = await import(
      "@/lib/symptom-chat/memory-compression"
    );

    const result = await maybeCompressStructuredCaseMemory(
      SESSION,
      PET,
      [...MESSAGES],
      MESSAGES[0].content,
      {
        imageAnalyzed: true,
        changedSymptoms: ["limping"],
        changedAnswers: ["which_leg"],
        turnBudget: {
          startedAtMs: Date.now(),
          deadlineAtMs: Date.now() + 20_000,
        },
        serviceTimeouts,
      }
    );

    expect(serviceTimeouts).toEqual([
      {
        service: "minimax",
        stage: "memory_compression",
        reason: "timeout",
      },
    ]);
    expect(result.case_memory).toEqual(
      expect.objectContaining({
        compressed_summary: "Fallback summary",
        compression_model: "deterministic-summary",
        service_timeouts: serviceTimeouts,
      })
    );
  });
});
