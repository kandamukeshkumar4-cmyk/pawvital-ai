import type { TriageSession } from "@/lib/triage-engine";
import type {
  SidecarObservation,
  ShadowComparisonRecord,
} from "@/lib/clinical-evidence";
import { appendShadowTelemetrySnapshot } from "@/lib/shadow-telemetry-store";
import {
  recordConversationTelemetry,
  ensureStructuredCaseMemory,
  type SecondOpinionTraceTelemetry,
} from "@/lib/symptom-memory";
import {
  buildSecondOpinionEligibilityTrace,
  extractSecondOpinionPendingAnswer,
  getPrimarySuccessShadowSamplingAttemptCount as resolvePrimarySuccessShadowSamplingAttemptCount,
  type SecondOpinionExtractorMode,
  type SecondOpinionExtractionResult,
} from "@/lib/symptom-chat/second-opinion-extractor";
import { createModelBudgetState, type ModelBudgetState } from "@/lib/model-budget";
import { getModelRoute } from "@/lib/model-router";
import {
  appendShadowComparison,
  describeShadowComparison,
} from "@/lib/sidecar-observability";
import {
  getClarificationAttemptCount,
  getQuestionAskedCount,
} from "@/lib/symptom-chat/pending-question-state";
import {
  publishTriageLiveUpdate,
  type TriageLiveUpdateStatus,
} from "@/lib/azure/web-pubsub";

export type LiveUpdateTarget = {
  action: "chat" | "generate_report";
  sessionId: string;
  userId: string;
};

export async function scheduleTriageLiveUpdate(
  target: LiveUpdateTarget | null,
  status: TriageLiveUpdateStatus
): Promise<void> {
  if (!target) {
    return;
  }

  try {
    await publishTriageLiveUpdate({
      action: target.action,
      sessionId: target.sessionId,
      status,
      userId: target.userId,
    });
  } catch {
    // Live status is an enhancement; never let Web PubSub affect triage output.
  }
}

export async function persistChatShadowTelemetrySnapshot({
  serviceCalls = [],
  shadowComparisons = [],
}: {
  serviceCalls?: SidecarObservation[];
  shadowComparisons?: ShadowComparisonRecord[];
}): Promise<boolean> {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    recentServiceCalls: serviceCalls,
    recentShadowComparisons: shadowComparisons,
    source: "chat" as const,
  };

  try {
    const persisted = await appendShadowTelemetrySnapshot(snapshot);
    return persisted !== false;
  } catch (shadowTelemetryError) {
    console.error(
      "[ShadowTelemetry] Failed to persist chat telemetry:",
      shadowTelemetryError
    );
    return false;
  }
}

export function getLatestSecondOpinionTraceObservation(
  session: TriageSession
): SidecarObservation | undefined {
  return [...(session.case_memory?.service_observations ?? [])]
    .reverse()
    .find(
      (observation) =>
        observation.service === "async-review-service" &&
        observation.stage === "second_opinion"
    );
}

export function getCurrentTurnClarificationAttemptCount(
  session: TriageSession,
  questionId: string
): number {
  // The current owner reply is counted before the repeat-loop path persists it.
  return getClarificationAttemptCount(session, questionId) + 1;
}

export function getPrimarySuccessShadowSamplingAttemptCount(
  session: TriageSession,
  questionId: string
): number {
  return resolvePrimarySuccessShadowSamplingAttemptCount({
    previousClarificationAttempts: getClarificationAttemptCount(
      session,
      questionId
    ),
    questionAskedCount: getQuestionAskedCount(session, questionId),
  });
}

export function getSecondOpinionAcceptanceOutcome(
  result: SecondOpinionExtractionResult
): SecondOpinionTraceTelemetry["acceptance_outcome"] {
  if (result.status === "accepted") {
    return "accepted";
  }
  if (result.status === "rejected") {
    return "rejected";
  }
  if (result.status === "failed") {
    return "failed";
  }
  return undefined;
}

export async function recordSecondOpinionNotRequestedTrace({
  session,
  mode,
  pendingQuestionId,
  ownerMessage,
  primaryExtractionFailed,
  deterministicResolved,
  clarificationAttempts,
  hadUnresolved,
  pendingAfter,
  budgetState,
}: {
  session: TriageSession;
  mode: SecondOpinionExtractorMode;
  pendingQuestionId: string;
  ownerMessage: string;
  primaryExtractionFailed: boolean;
  deterministicResolved: boolean;
  clarificationAttempts: number;
  hadUnresolved: boolean;
  pendingAfter: boolean;
  budgetState: ModelBudgetState;
}): Promise<TriageSession> {
  if (mode === "off") {
    return session;
  }

  const eligibilityTrace = buildSecondOpinionEligibilityTrace({
    mode,
    pendingQuestionId,
    ownerMessage,
    primaryExtractionFailed,
    deterministicResolved,
    clarificationAttempts,
    repeatGuardAlreadyFired: false,
    budgetState,
  });

  if (eligibilityTrace.request_outcome === "requested") {
    return session;
  }

  const secondOpinionTrace: SecondOpinionTraceTelemetry = {
    ...eligibilityTrace,
    comparison_append_outcome: "not_applicable",
    comparison_write_outcome: "not_applicable",
    extractor_reason: eligibilityTrace.eligibility_reason,
  };
  let nextSession = recordConversationTelemetry(session, {
    event: "second_opinion",
    turn_count: session.case_memory?.turn_count ?? 0,
    question_id: pendingQuestionId,
    outcome: "second_opinion_skipped",
    source: "second_opinion",
    reason: eligibilityTrace.eligibility_reason,
    pending_before: hadUnresolved,
    pending_after: pendingAfter,
    second_opinion_trace: secondOpinionTrace,
  });

  const latestSecondOpinionTrace =
    getLatestSecondOpinionTraceObservation(nextSession);
  if (!latestSecondOpinionTrace) {
    return nextSession;
  }

  const chatTelemetryPersisted = await persistChatShadowTelemetrySnapshot({
    serviceCalls: [latestSecondOpinionTrace],
    shadowComparisons: [],
  });
  if (!chatTelemetryPersisted) {
    nextSession = recordConversationTelemetry(nextSession, {
      event: "second_opinion",
      turn_count: nextSession.case_memory?.turn_count ?? 0,
      question_id: pendingQuestionId,
      outcome: "second_opinion_failed",
      source: "second_opinion",
      reason: "telemetry_write_failed",
      pending_before: hadUnresolved,
      pending_after: pendingAfter,
      second_opinion_trace: {
        ...secondOpinionTrace,
        extractor_reason: "telemetry_write_failed",
      },
    });
  }

  return nextSession;
}

export async function recordSecondOpinionShadowSample({
  session,
  pendingQuestionId,
  ownerMessage,
  primaryExtractionFailed,
  clarificationAttempts,
  knownSymptomsBeforeTurn,
  primaryAnswerValue,
  hadUnresolved,
}: {
  session: TriageSession;
  pendingQuestionId: string;
  ownerMessage: string;
  primaryExtractionFailed: boolean;
  clarificationAttempts: number;
  knownSymptomsBeforeTurn: string[];
  primaryAnswerValue: string | boolean | number;
  hadUnresolved: boolean;
}): Promise<TriageSession> {
  const budgetState = createModelBudgetState(
    ensureStructuredCaseMemory(session).model_budget_state
  );
  const eligibilityTrace = buildSecondOpinionEligibilityTrace({
    mode: "shadow",
    pendingQuestionId,
    ownerMessage,
    primaryExtractionFailed,
    deterministicResolved: true,
    clarificationAttempts,
    repeatGuardAlreadyFired: false,
    budgetState,
    isShadowSampling: true,
  });

  const shadowResult = await extractSecondOpinionPendingAnswer({
    mode: "shadow",
    pendingQuestionId,
    ownerMessage,
    primaryExtractionFailed,
    deterministicResolved: true,
    clarificationAttempts,
    knownSymptomsBeforeTurn,
    budgetState,
    isShadowSampling: true,
  });

  if (shadowResult.budgetState) {
    session = {
      ...session,
      case_memory: {
        ...ensureStructuredCaseMemory(session),
        model_budget_state: shadowResult.budgetState,
      },
    };
  }

  let recordedShadowComparison: ShadowComparisonRecord | undefined;
  let comparisonAppendOutcome: SecondOpinionTraceTelemetry["comparison_append_outcome"] =
    "not_applicable";
  let comparisonWriteOutcome: SecondOpinionTraceTelemetry["comparison_write_outcome"] =
    "not_applicable";

  if (shadowResult.status === "accepted") {
    const disagreed =
      String(primaryAnswerValue) === String(shadowResult.answer.answerValue)
        ? 0
        : 1;
    const shadowComparison = describeShadowComparison(
      "async-review-service",
      "primary_extraction_succeeded",
      "second_opinion_extractor",
      `q=${pendingQuestionId}; shadow_answer_recorded=true; conf=${shadowResult.answer.confidence.toFixed(2)}; agreed=${disagreed === 0}`,
      disagreed
    );
    session = appendShadowComparison(session, shadowComparison);
    const recordedShadowComparisons =
      session.case_memory?.shadow_comparisons ?? [];
    recordedShadowComparison =
      recordedShadowComparisons[recordedShadowComparisons.length - 1];
    if (recordedShadowComparison) {
      comparisonAppendOutcome = "comparison_appended";
      comparisonWriteOutcome = "comparison_write_succeeded";
    } else {
      comparisonAppendOutcome = "comparison_append_failed";
      comparisonWriteOutcome = "comparison_write_failed";
    }
  }

  const telemetryOutcome =
    shadowResult.status === "accepted"
      ? "second_opinion_used"
      : shadowResult.status === "failed"
        ? "second_opinion_failed"
        : shadowResult.status === "rejected"
          ? "second_opinion_rejected"
          : eligibilityTrace.request_outcome === "budget_exhausted"
            ? "second_opinion_failed"
            : "second_opinion_skipped";
  const secondOpinionTrace: SecondOpinionTraceTelemetry = {
    ...eligibilityTrace,
    acceptance_outcome: getSecondOpinionAcceptanceOutcome(shadowResult),
    comparison_append_outcome: comparisonAppendOutcome,
    comparison_write_outcome: comparisonWriteOutcome,
    extractor_reason:
      shadowResult.status === "accepted"
        ? undefined
        : shadowResult.reason ?? eligibilityTrace.eligibility_reason,
  };
  const gateEvents =
    shadowResult.status === "accepted"
      ? (["second_opinion_used"] as const)
      : shadowResult.status === "failed"
        ? (["second_opinion_failed"] as const)
        : shadowResult.status === "rejected"
          ? (["second_opinion_rejected"] as const)
          : ([] as const);

  session = recordConversationTelemetry(session, {
    event: "second_opinion",
    turn_count: session.case_memory?.turn_count ?? 0,
    question_id: pendingQuestionId,
    outcome: telemetryOutcome,
    source: "second_opinion",
    reason:
      shadowResult.status === "accepted"
        ? undefined
        : shadowResult.reason ?? eligibilityTrace.eligibility_reason,
    model:
      shadowResult.status === "skipped"
        ? undefined
        : getModelRoute("extraction").primaryModel,
    pending_before: hadUnresolved,
    pending_after: false,
    second_opinion_trace: secondOpinionTrace,
    gate_events: [...gateEvents],
  });

  const latestSecondOpinionTrace =
    getLatestSecondOpinionTraceObservation(session);
  if (!latestSecondOpinionTrace) {
    return session;
  }

  const chatTelemetryPersisted = await persistChatShadowTelemetrySnapshot({
    serviceCalls: [latestSecondOpinionTrace],
    shadowComparisons: recordedShadowComparison
      ? [recordedShadowComparison]
      : [],
  });
  if (chatTelemetryPersisted) {
    return session;
  }

  const telemetryPersistenceFailureReason = recordedShadowComparison
    ? "comparison_write_failed"
    : "telemetry_write_failed";
  return recordConversationTelemetry(session, {
    event: "second_opinion",
    turn_count: session.case_memory?.turn_count ?? 0,
    question_id: pendingQuestionId,
    outcome: "second_opinion_failed",
    source: "second_opinion",
    reason: telemetryPersistenceFailureReason,
    pending_before: hadUnresolved,
    pending_after: false,
    second_opinion_trace: {
      ...secondOpinionTrace,
      comparison_write_outcome: recordedShadowComparison
        ? "comparison_write_failed"
        : secondOpinionTrace.comparison_write_outcome,
      extractor_reason: telemetryPersistenceFailureReason,
    },
    gate_events: recordedShadowComparison ? ["second_opinion_failed"] : [],
  });
}
