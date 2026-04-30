import type { VetKnowledgeAllowedUse } from "./source-registry";

export const DEFAULT_MAX_SOURCES = 5;

export const CURATED_ONLY = true;

export const OPEN_WEB_SEARCH_ALLOWED = false;

export const RUNTIME_SOURCE_FETCH_ALLOWED = false;

export const DIAGNOSIS_GENERATION_ALLOWED = false;

export const TREATMENT_GENERATION_ALLOWED = false;

export const MEDICATION_GENERATION_ALLOWED = false;

export const DOSAGE_GENERATION_ALLOWED = false;

export const HOME_CARE_GENERATION_ALLOWED = false;

export const OWNER_VISIBLE_ALLOWED_USE: VetKnowledgeAllowedUse =
  "owner_visible_citation";

export const FORBIDDEN_CONTENT_PATTERNS = [
  /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose|times\s+a\s+day)/i,
  /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /dosage\s*(is|of|:)/i,
  /prescribe/i,
  /treatment\s*(plan|protocol|regimen)/i,
  /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i,
  /apply\s+(a\s+)?(bandage|ointment|cream|compress)/i,
  /feed\s+(your\s+)?(pet|dog|cat)\s+/i,
  /diagnosis\s*(is|:|—)/i,
];

export function isOwnerVisibleAllowed(
  allowedUse: VetKnowledgeAllowedUse
): boolean {
  return allowedUse === OWNER_VISIBLE_ALLOWED_USE;
}

export function containsForbiddenContent(text: string): boolean {
  return FORBIDDEN_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function getPolicyConstraints(): Record<string, unknown> {
  return {
    curatedOnly: CURATED_ONLY,
    openWebSearchAllowed: OPEN_WEB_SEARCH_ALLOWED,
    runtimeSourceFetchAllowed: RUNTIME_SOURCE_FETCH_ALLOWED,
    diagnosisGenerationAllowed: DIAGNOSIS_GENERATION_ALLOWED,
    treatmentGenerationAllowed: TREATMENT_GENERATION_ALLOWED,
    medicationGenerationAllowed: MEDICATION_GENERATION_ALLOWED,
    dosageGenerationAllowed: DOSAGE_GENERATION_ALLOWED,
    homeCareGenerationAllowed: HOME_CARE_GENERATION_ALLOWED,
    defaultMaxSources: DEFAULT_MAX_SOURCES,
    ownerVisibleAllowedUse: OWNER_VISIBLE_ALLOWED_USE,
  };
}
