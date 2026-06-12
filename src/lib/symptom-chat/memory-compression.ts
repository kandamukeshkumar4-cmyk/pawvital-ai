import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import type { ServiceTimeoutRecord } from "@/lib/clinical-evidence";
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
import {
  buildOptionalModelTimeoutRecord,
  shouldSkipOptionalModelStage,
  type TurnBudget,
} from "@/lib/symptom-chat/turn-budget";

export interface SymptomChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MemoryCompressionOptions {
  imageAnalyzed: boolean;
  changedSymptoms: string[];
  changedAnswers: string[];
  modelCompressionDisabled?: boolean;
  modelCompressionDisabledReason?: string;
  turnBudget?: TurnBudget;
  serviceTimeouts?: ServiceTimeoutRecord[];
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

  if (options.modelCompressionDisabled) {
    const reason =
      options.modelCompressionDisabledReason ?? "model_compression_disabled";
    const telemetrySession = recordConversationTelemetry(session, {
      event: "compression",
      turn_count: session.case_memory?.turn_count ?? 0,
      outcome: "fallback",
      model: "deterministic-summary",
      compression_used: false,
      compression_model: "deterministic-summary",
      reason,
      narrative_only: true,
      control_state_preserved: true,
      fallback_used: true,
    });
    const latestCaseMemory = ensureStructuredCaseMemory(telemetrySession);
    return {
      ...telemetrySession,
      case_memory: {
        ...latestCaseMemory,
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
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

  if (shouldSkipOptionalModelStage(options.turnBudget, "memory_compression")) {
    const timeoutRecord = buildOptionalModelTimeoutRecord("memory_compression");
    options.serviceTimeouts?.push(timeoutRecord);
    const telemetrySession = recordConversationTelemetry(session, {
      event: "compression",
      turn_count: session.case_memory?.turn_count ?? 0,
      outcome: "fallback",
      model: "deterministic-summary",
      compression_used: false,
      compression_model: "deterministic-summary",
      reason: timeoutRecord.reason,
      narrative_only: true,
      control_state_preserved: true,
      fallback_used: true,
    });
    const latestCaseMemory = ensureStructuredCaseMemory(telemetrySession);
    return {
      ...telemetrySession,
      case_memory: {
        ...latestCaseMemory,
        service_timeouts: [
          ...(latestCaseMemory.service_timeouts ?? []),
          timeoutRecord,
        ],
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
    const compressed = await compressCaseMemoryWithMiniMax(prompt, {
      deadlineAtMs: options.turnBudget?.deadlineAtMs,
    });
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
    const timedOut =
      error instanceof Error &&
      (error.name === "AbortError" || /timeout|deadline exhausted/i.test(error.message));
    const timeoutRecord = timedOut
      ? buildOptionalModelTimeoutRecord(
          "memory_compression",
          error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "turn_deadline_budget_exhausted"
        )
      : null;
    if (timeoutRecord) {
      options.serviceTimeouts?.push(timeoutRecord);
    }
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
        service_timeouts: timeoutRecord
          ? [
              ...(ensureStructuredCaseMemory(telemetrySession)
                .service_timeouts ?? []),
              timeoutRecord,
            ].slice(-10)
          : ensureStructuredCaseMemory(telemetrySession).service_timeouts,
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
      },
    };
  }
}
