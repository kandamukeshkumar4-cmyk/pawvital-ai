import type { TriageSession, PetProfile } from "@/lib/triage-engine";
import type { ShadowComparisonRecord } from "@/lib/clinical-evidence";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import {
  runClinicalTurnPipeline,
  readPersistedClinicalCaseState,
  buildClinicalCaseStateFromSession,
} from "@/lib/symptom-chat/turn-pipeline";
import type { ClinicalTurnPipelineResult } from "@/lib/symptom-chat/turn-pipeline/types";

export {
  readPersistedClinicalCaseState,
  buildClinicalCaseStateFromSession,
};

export interface ClinicalTurnOrchestratorInput {
  session: TriageSession;
  ownerText: string;
  productionQuestionId: string | null;
  pet?: PetProfile;
  hasImage?: boolean;
}

const DEFAULT_PET: PetProfile = {
  name: "Pet",
  age_years: 5,
  species: "dog",
  breed: "mixed",
  weight: 0,
};

export type ClinicalTurnOrchestratorResult = ClinicalTurnPipelineResult;

export function runClinicalTurnOrchestrator(
  input: ClinicalTurnOrchestratorInput
): ClinicalTurnOrchestratorResult {
  return runClinicalTurnPipeline({
    session: input.session,
    pet: input.pet ?? DEFAULT_PET,
    ownerText: input.ownerText,
    legacyQuestionId: input.productionQuestionId,
    hasImage: Boolean(input.hasImage),
  });
}

export function isClinicalTurnOrchestratorLiveEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.CLINICAL_TURN_ORCHESTRATOR_LIVE === "1";
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
