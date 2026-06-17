import type { TriageSession } from "@/lib/triage-engine";
import {
  createInitialClinicalCaseState,
  deserializeClinicalCaseState,
  serializeClinicalCaseState,
  type ClinicalCaseState,
} from "@/lib/clinical-intelligence/case-state";
import {
  recordAnsweredQuestion,
  recordAskedQuestion,
} from "@/lib/clinical-intelligence/case-state-update";
import { detectShadowComplaintModuleId } from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";
import { evaluateEmergencySentinel } from "@/lib/clinical-intelligence/emergency-sentinel";
import { buildShadowPlannerComplaintIntegration } from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";
import { isPlannerFallbackResult } from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import type { ShadowComparisonRecord } from "@/lib/clinical-evidence";
import {
  getClinicalPlannerMode,
  shouldRecordPlannerShadow,
  shouldUseLegacyQuestionSelection,
  shouldUsePlannerQuestionLive,
} from "./planner-mode";
import type {
  ClinicalTurnPipelineInput,
  ClinicalTurnPipelineResult,
} from "./types";

export function readPersistedClinicalCaseState(
  session: TriageSession
): ClinicalCaseState | null {
  const serialized = session.case_memory?.clinical_case_state;
  if (!serialized) {
    return null;
  }

  try {
    return deserializeClinicalCaseState(serialized);
  } catch {
    return null;
  }
}

export function buildClinicalCaseStateFromSession(
  session: TriageSession,
  ownerText: string
): ClinicalCaseState {
  const persisted = readPersistedClinicalCaseState(session);
  const activeComplaintModule =
    persisted?.activeComplaintModule ??
    detectShadowComplaintModuleId(ownerText) ??
    null;

  let state =
    persisted ?? createInitialClinicalCaseState(activeComplaintModule);

  const askedIds = new Set<string>([
    ...session.answered_questions,
    ...(session.last_question_asked ? [session.last_question_asked] : []),
  ]);

  for (const questionId of askedIds) {
    state = recordAskedQuestion(state, questionId);
  }

  for (const [answerKey, value] of Object.entries(session.extracted_answers)) {
    state = recordAnsweredQuestion(state, answerKey, answerKey, value);
  }

  return state;
}

function buildShadowComparisonRecord(
  integration: ReturnType<typeof buildShadowPlannerComplaintIntegration>,
  legacyQuestionId: string | null
): ShadowComparisonRecord | null {
  const comparison = integration.comparison;
  if (comparison.existingQuestionId === comparison.plannedQuestionId) {
    return null;
  }

  return {
    service: "text-retrieval-service",
    usedStrategy: legacyQuestionId ?? "none",
    shadowStrategy: comparison.plannedQuestionId ?? "none",
    summary: comparison.plannedShortReason ?? "shadow_planner_comparison",
    disagreementCount:
      comparison.existingQuestionId === comparison.plannedQuestionId ? 0 : 1,
    recordedAt: new Date().toISOString(),
  };
}

function persistClinicalCaseState(
  session: TriageSession,
  caseState: ClinicalCaseState,
  askingBecause: string | null,
  shadowRecord: ShadowComparisonRecord | null
): TriageSession {
  const caseMemory = ensureStructuredCaseMemory(session);
  const shadowComparisons = shadowRecord
    ? [...caseMemory.shadow_comparisons, shadowRecord].slice(-10)
    : caseMemory.shadow_comparisons;

  return {
    ...session,
    case_memory: {
      ...caseMemory,
      clinical_case_state: serializeClinicalCaseState(caseState),
      asking_because: askingBecause ?? caseMemory.asking_because,
      shadow_comparisons: shadowComparisons,
    },
  };
}

export function runClinicalTurnPipeline(
  input: ClinicalTurnPipelineInput
): ClinicalTurnPipelineResult {
  const plannerMode = getClinicalPlannerMode();
  const caseState = buildClinicalCaseStateFromSession(
    input.session,
    input.ownerText
  );

  const sentinelDecision = evaluateEmergencySentinel(caseState, {
    complaintModule: caseState.activeComplaintModule
      ? { id: caseState.activeComplaintModule }
      : undefined,
  });

  const integration = buildShadowPlannerComplaintIntegration({
    ownerText: input.ownerText,
    caseState,
    existingQuestionId: input.legacyQuestionId,
  });

  const plannerQuestionId = isPlannerFallbackResult(integration.plannerResult)
    ? null
    : integration.plannerResult.questionId;

  const askingBecause = isPlannerFallbackResult(integration.plannerResult)
    ? null
    : integration.plannerResult.shortReason ?? null;

  let selectedQuestionId = input.legacyQuestionId;
  let usedPlannerLive = false;

  if (shouldUsePlannerQuestionLive(plannerMode, plannerQuestionId)) {
    selectedQuestionId = plannerQuestionId;
    usedPlannerLive = true;
  } else if (shouldUseLegacyQuestionSelection(plannerMode)) {
    selectedQuestionId = input.legacyQuestionId;
  }

  const shadowComparisonRecord = shouldRecordPlannerShadow(plannerMode)
    ? buildShadowComparisonRecord(integration, input.legacyQuestionId)
    : null;

  let session = persistClinicalCaseState(
    input.session,
    caseState,
    askingBecause,
    shadowComparisonRecord
  );

  if (usedPlannerLive && selectedQuestionId) {
    session = {
      ...session,
      last_question_asked: selectedQuestionId,
    };
  }

  return {
    session,
    caseState,
    sentinelDecision,
    integration,
    selectedQuestionId,
    shadowComparisonRecord,
    askingBecause,
    usedPlannerLive,
  };
}
