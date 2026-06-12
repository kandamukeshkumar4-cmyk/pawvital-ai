import type { TriageSession } from "@/lib/triage-engine";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import type { ShadowComparisonRecord } from "@/lib/clinical-evidence";
import { buildClinicalCaseStateFromSession } from "./session-case-state-bridge";
import { buildShadowPlannerComplaintIntegration } from "./shadow-planner-complaint-adapter";
import type { ShadowPlannerComplaintIntegrationResult } from "./shadow-planner-complaint-adapter";

export interface ClinicalTurnOrchestratorInput {
  session: TriageSession;
  ownerText: string;
  productionQuestionId: string | null;
}

export interface ClinicalTurnOrchestratorResult {
  integration: ShadowPlannerComplaintIntegrationResult;
  shadowComparisonRecord: ShadowComparisonRecord | null;
  plannerQuestionId: string | null;
}

function isPlannerFallbackResult(
  result: ShadowPlannerComplaintIntegrationResult["plannerResult"]
): result is { type: string } {
  return "type" in result;
}

export function isClinicalTurnOrchestratorLiveEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.CLINICAL_TURN_ORCHESTRATOR_LIVE === "1";
}

export function runClinicalTurnOrchestrator(
  input: ClinicalTurnOrchestratorInput
): ClinicalTurnOrchestratorResult {
  const caseState = buildClinicalCaseStateFromSession({
    session: input.session,
    ownerText: input.ownerText,
  });

  const integration = buildShadowPlannerComplaintIntegration({
    ownerText: input.ownerText,
    caseState,
    existingQuestionId: input.productionQuestionId,
  });

  const plannerQuestionId = isPlannerFallbackResult(integration.plannerResult)
    ? null
    : integration.plannerResult.questionId;

  const comparison = integration.comparison;
  const shadowComparisonRecord: ShadowComparisonRecord | null =
    comparison.existingQuestionId !== comparison.plannedQuestionId
      ? {
          service: "text-retrieval-service",
          usedStrategy: comparison.existingQuestionId ?? "none",
          shadowStrategy: comparison.plannedQuestionId ?? "none",
          summary: comparison.plannedShortReason ?? "shadow_planner_comparison",
          disagreementCount:
            comparison.existingQuestionId === comparison.plannedQuestionId ? 0 : 1,
          recordedAt: new Date().toISOString(),
        }
      : null;

  return {
    integration,
    shadowComparisonRecord,
    plannerQuestionId,
  };
}

export function appendClinicalTurnOrchestratorShadow(
  session: TriageSession,
  record: ShadowComparisonRecord | null
): TriageSession {
  if (!record) {
    return session;
  }

  const caseMemory = ensureStructuredCaseMemory(session);
  return {
    ...session,
    case_memory: {
      ...caseMemory,
      shadow_comparisons: [...caseMemory.shadow_comparisons, record].slice(-10),
    },
  };
}
