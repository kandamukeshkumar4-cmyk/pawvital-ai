import type { VetKnowledgeAllowedUse } from "./source-registry";
import { OWNER_VISIBLE_ALLOWED_USE, FORBIDDEN_CONTENT_PATTERNS, containsForbiddenContent } from "./retrieval-policy";

export const DEFAULT_MAX_CITATIONS = 3;

export const OWNER_VISIBLE_ALLOWED_USES: VetKnowledgeAllowedUse[] = [
  OWNER_VISIBLE_ALLOWED_USE,
];

export function isEligibleForOwnerCitation(
  allowedUse: VetKnowledgeAllowedUse
): boolean {
  return allowedUse === OWNER_VISIBLE_ALLOWED_USE;
}

export function isExcludedFromOwnerCitation(
  allowedUse: VetKnowledgeAllowedUse
): boolean {
  return allowedUse !== OWNER_VISIBLE_ALLOWED_USE;
}

export function validateCitationContent(text: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(`forbidden pattern matched: ${pattern.source}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function getCitationPolicyConstraints(): Record<string, unknown> {
  return {
    ownerVisibleAllowedUses: OWNER_VISIBLE_ALLOWED_USES,
    defaultMaxCitations: DEFAULT_MAX_CITATIONS,
    metadataOnly: true,
    noUrlFetching: true,
    noOpenWebSearch: true,
    noSourceScraping: true,
    noDiagnosisGeneration: true,
    noTreatmentGeneration: true,
    noMedicationGeneration: true,
    noDosageGeneration: true,
    noHomeCareGeneration: true,
  };
}

export { containsForbiddenContent };
