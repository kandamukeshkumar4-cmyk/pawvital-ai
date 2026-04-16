import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import {
  buildDeterministicCaseSummary,
  buildNarrativeSnapshot,
  ensureStructuredCaseMemory,
  getProtectedConversationState,
  mergeCompressionResult,
  recordConversationTelemetry,
  shouldCompressCaseMemory,
} from "@/lib/symptom-memory";
import {
  compressCaseMemoryWithMiniMax,
  isMiniMaxConfigured,
} from "@/lib/minimax";

export interface SymptomChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MemoryCompressionOptions {
  imageAnalyzed: boolean;
  changedSymptoms: string[];
  changedAnswers: string[];
}

export async function maybeCompressStructuredCaseMemory(
  session: TriageSession,
  pet: PetProfile,
  messages: SymptomChatMessage[],
  latestUserMessage: string,
  options: MemoryCompressionOptions
): Promise<TriageSession> {
  const shouldRefresh = shouldCompressCaseMemory(session, messages, options);
  const caseMemory = ensureStructuredCaseMemory(session);
  const fallbackSummary = buildDeterministicCaseSummary(session, pet);

  if (!shouldRefresh) {
    return {
      ...session,
      case_memory: {
        ...caseMemory,
        compressed_summary: caseMemory.compressed_summary || fallbackSummary,
      },
    };
  }

  if (!isMiniMaxConfigured()) {
    return {
      ...session,
      case_memory: {
        ...caseMemory,
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
      },
    };
  }

  const protectedState = getProtectedConversationState(session);

  const prompt = `You are compressing an active veterinary triage case into stable memory for downstream reasoning.

Summarize only confirmed or strongly supported facts. Preserve:
- main symptoms
- direct owner answers
- important negative findings
- image findings when present

Do NOT include or reference question IDs, answer tracking, conversation control state, or telemetry entries. Telemetry data is already excluded from this snapshot.

Keep the summary under 180 words and avoid diagnosis language unless already explicit in the case.

CASE SNAPSHOT:
${buildNarrativeSnapshot(session, messages, latestUserMessage)}

Return ONLY the summary text.`;

  try {
    const compressed = await compressCaseMemoryWithMiniMax(prompt);
    const mergedSession = mergeCompressionResult(
      session,
      compressed,
      protectedState
    );
    return recordConversationTelemetry(mergedSession, {
      event: "compression",
      turn_count: mergedSession.case_memory?.turn_count ?? 0,
      outcome: "success",
      model: compressed.model,
      compression_used: true,
      compression_model: compressed.model,
      narrative_only: true,
      control_state_preserved: true,
    });
  } catch (error) {
    console.error("MiniMax memory compression failed:", error);
    const telemetrySession = recordConversationTelemetry(session, {
      event: "compression",
      turn_count: session.case_memory?.turn_count ?? 0,
      outcome: "fallback",
      model: "deterministic-summary",
      compression_used: false,
      compression_model: "deterministic-summary",
      reason: error instanceof Error ? error.message : "unknown error",
      narrative_only: true,
      control_state_preserved: true,
      fallback_used: true,
    });
    return {
      ...telemetrySession,
      case_memory: {
        ...ensureStructuredCaseMemory(telemetrySession),
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
      },
    };
  }
}
