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
});
