/**
 * Clinical Inference Engine — Phase 1 Foundation
 *
 * Connects structured triage data to knowledge retrieval,
 * case similarity, and reference image matching.
 *
 * Does NOT replace the deterministic clinical matrix.
 * Provides supplementary evidence for diagnosis context.
 */

import {
  searchClinicalCases,
  searchKnowledgeChunks,
  searchReferenceImages,
  formatKnowledgeContext,
  formatClinicalCaseContext,
  formatReferenceImageContext,
} from "./knowledge-retrieval";
import type { ClinicalCaseMatch } from "./knowledge-retrieval";
import type { ReferenceImageMatch } from "./knowledge-retrieval";

export type { ClinicalCaseMatch, ReferenceImageMatch };

export interface InferenceContext {
  symptoms: string[];
  breed?: string;
  species?: string;
  age?: number;
  topConditions?: string[];
}

export interface InferenceEvidence {
  knowledgeContext: string;
  caseContext: string;
  referenceImageContext: string;
  casesFound: number;
  knowledgeChunksFound: number;
  referenceImagesFound: number;
}

/**
 * Gather all available evidence for a given clinical context.
 * Returns formatted context strings ready for LLM consumption.
 *
 * This is a read-only evidence gatherer. It does NOT make medical decisions.
 * The deterministic clinical matrix remains the source of truth.
 */
export async function gatherClinicalEvidence(
  ctx: InferenceContext
): Promise<InferenceEvidence> {
  const searchText = [
    ...ctx.symptoms,
    ctx.breed,
    ctx.species,
    ...(ctx.topConditions || []),
  ]
    .filter(Boolean)
    .join(" ");

  const [knowledgeChunks, clinicalCases, referenceImages] = await Promise.all([
    searchKnowledgeChunks(searchText, 8).catch(() => []),
    searchClinicalCases(ctx.symptoms, ctx.breed, 5).catch(() => []),
    searchReferenceImages(
      searchText,
      5,
      ctx.topConditions?.map((c) => c.toLowerCase().replace(/\s+/g, "_"))
    ).catch(() => []),
  ]);

  return {
    knowledgeContext: formatKnowledgeContext(knowledgeChunks),
    caseContext: formatClinicalCaseContext(clinicalCases),
    referenceImageContext: formatReferenceImageContext(referenceImages),
    casesFound: clinicalCases.length,
    knowledgeChunksFound: knowledgeChunks.length,
    referenceImagesFound: referenceImages.length,
  };
}

/**
 * Build a combined evidence summary for inclusion in LLM diagnosis prompts.
 */
export function formatEvidenceSummary(evidence: InferenceEvidence): string {
  const sections: string[] = [];

  if (evidence.knowledgeContext) sections.push(evidence.knowledgeContext);
  if (evidence.caseContext) sections.push(evidence.caseContext);
  if (evidence.referenceImageContext)
    sections.push(evidence.referenceImageContext);

  if (!sections.length) return "";

  return `\n\n---\n## Supporting Clinical Evidence\n\n${sections.join("\n\n")}`;
}
