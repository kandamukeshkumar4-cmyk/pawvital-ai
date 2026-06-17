import type { TurnDeadline } from "@/lib/symptom-chat/turn-deadline";
import type { TurnDepth } from "@/lib/symptom-chat/turn-depth";
import type { TriageSession } from "@/lib/triage-engine";
import type { PetProfile } from "@/lib/triage-engine";
import type { ShadowComparisonRecord } from "@/lib/clinical-evidence";
import type { ClinicalCaseState } from "@/lib/clinical-intelligence/case-state";
import type { EmergencySentinelDecision } from "@/lib/clinical-intelligence/emergency-sentinel";
import type { ShadowPlannerComplaintIntegrationResult } from "@/lib/clinical-intelligence/shadow-planner-complaint-adapter";

export type TurnPipelineStage =
  | "normalizeInput"
  | "extractFacts"
  | "updateCaseState"
  | "evaluateSentinel"
  | "planNextQuestion"
  | "phraseQuestion"
  | "verifyReport";

export interface ClinicalTurnPipelineInput {
  session: TriageSession;
  pet: PetProfile;
  ownerText: string;
  legacyQuestionId: string | null;
  turnDeadline?: TurnDeadline;
  turnDepth?: TurnDepth;
  hasImage: boolean;
}

export interface ClinicalTurnPipelineResult {
  session: TriageSession;
  caseState: ClinicalCaseState;
  sentinelDecision: EmergencySentinelDecision;
  integration: ShadowPlannerComplaintIntegrationResult;
  selectedQuestionId: string | null;
  shadowComparisonRecord: ShadowComparisonRecord | null;
  askingBecause: string | null;
  usedPlannerLive: boolean;
}
