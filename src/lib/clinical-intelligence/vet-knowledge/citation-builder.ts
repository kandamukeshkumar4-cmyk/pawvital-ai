import type { VetKnowledgePublisher, VetKnowledgeAllowedUse } from "./source-registry";
import { VET_KNOWLEDGE_SOURCES } from "./source-summaries";
import { planRetrieval, type VetKnowledgeRetrievalPlan } from "./retrieval-planner";
import {
  DEFAULT_MAX_CITATIONS,
  isEligibleForOwnerCitation,
  validateCitationContent,
} from "./citation-policy";

export interface VetKnowledgeCitationRequest {
  complaintFamily?: string;
  redFlags?: string[];
  maxCitations?: number;
}

export interface VetKnowledgeCitation {
  sourceId: string;
  title: string;
  publisher: VetKnowledgePublisher;
  url?: string;
  topic: string;
  lastReviewedAt: string;
}

export interface VetKnowledgeCitationResult {
  citations: VetKnowledgeCitation[];
  excludedReasons: string[];
  policyWarnings: string[];
}

function safeEmptyResult(): VetKnowledgeCitationResult {
  return {
    citations: [],
    excludedReasons: [],
    policyWarnings: [],
  };
}

function toCitation(source: {
  id: string;
  title: string;
  publisher: VetKnowledgePublisher;
  url?: string;
  topic: string;
  lastReviewedAt: string;
}): VetKnowledgeCitation {
  return {
    sourceId: source.id,
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    topic: source.topic,
    lastReviewedAt: source.lastReviewedAt,
  };
}

export function buildCitations(
  request: VetKnowledgeCitationRequest = {}
): VetKnowledgeCitationResult {
  try {
    const excludedReasons: string[] = [];
    const policyWarnings: string[] = [];

    const retrievalPlan = planRetrieval({
      complaintFamily: request.complaintFamily,
      redFlags: request.redFlags,
      allowedUse: "owner_visible_citation",
      maxSources: request.maxCitations ?? DEFAULT_MAX_CITATIONS,
    });

    if (retrievalPlan.blockedReasons.length > 0) {
      excludedReasons.push(...retrievalPlan.blockedReasons);
    }

    if (retrievalPlan.policyWarnings.length > 0) {
      policyWarnings.push(...retrievalPlan.policyWarnings);
    }

    const ownerVisibleSources = retrievalPlan.sources.filter((s) =>
      isEligibleForOwnerCitation(s.allowedUse)
    );

    for (const source of retrievalPlan.sources) {
      if (!isEligibleForOwnerCitation(source.allowedUse)) {
        excludedReasons.push(
          `source ${source.id} excluded: allowedUse="${source.allowedUse}" is not owner-visible`
        );
      }
    }

    const citations: VetKnowledgeCitation[] = [];

    for (const source of ownerVisibleSources) {
      const combinedText = `${source.title} ${source.topic}`;
      const contentValidation = validateCitationContent(combinedText);

      if (!contentValidation.valid) {
        policyWarnings.push(
          `source ${source.id} has forbidden content: ${contentValidation.violations.join("; ")}`
        );
        continue;
      }

      citations.push(toCitation(source));
    }

    const maxCitations = request.maxCitations ?? DEFAULT_MAX_CITATIONS;

    if (citations.length > maxCitations) {
      citations.length = maxCitations;
      policyWarnings.push(`limited to ${maxCitations} citations`);
    }

    return {
      citations,
      excludedReasons,
      policyWarnings,
    };
  } catch {
    return safeEmptyResult();
  }
}

export function buildCitationsFromRetrievalPlan(
  retrievalPlan: VetKnowledgeRetrievalPlan,
  maxCitations?: number
): VetKnowledgeCitationResult {
  try {
    const excludedReasons: string[] = [...retrievalPlan.blockedReasons];
    const policyWarnings: string[] = [...retrievalPlan.policyWarnings];

    const ownerVisibleSources = retrievalPlan.sources.filter((s) =>
      isEligibleForOwnerCitation(s.allowedUse)
    );

    for (const source of retrievalPlan.sources) {
      if (!isEligibleForOwnerCitation(source.allowedUse)) {
        excludedReasons.push(
          `source ${source.id} excluded: allowedUse="${source.allowedUse}" is not owner-visible`
        );
      }
    }

    const citations: VetKnowledgeCitation[] = [];

    for (const source of ownerVisibleSources) {
      const combinedText = `${source.title} ${source.topic}`;
      const contentValidation = validateCitationContent(combinedText);

      if (!contentValidation.valid) {
        policyWarnings.push(
          `source ${source.id} has forbidden content: ${contentValidation.violations.join("; ")}`
        );
        continue;
      }

      citations.push(toCitation(source));
    }

    const limit = maxCitations ?? DEFAULT_MAX_CITATIONS;

    if (citations.length > limit) {
      citations.length = limit;
      policyWarnings.push(`limited to ${limit} citations`);
    }

    return {
      citations,
      excludedReasons,
      policyWarnings,
    };
  } catch {
    return safeEmptyResult();
  }
}
