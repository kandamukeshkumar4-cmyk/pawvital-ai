import type { VetKnowledgeSource, VetKnowledgeAllowedUse } from "./source-registry";
import { VET_KNOWLEDGE_SOURCES } from "./source-summaries";
import {
  DEFAULT_MAX_SOURCES,
  CURATED_ONLY,
  OPEN_WEB_SEARCH_ALLOWED,
  RUNTIME_SOURCE_FETCH_ALLOWED,
  isOwnerVisibleAllowed,
  containsForbiddenContent,
} from "./retrieval-policy";

export interface VetKnowledgeRetrievalRequest {
  complaintFamily?: string;
  redFlags?: string[];
  allowedUse?: VetKnowledgeAllowedUse;
  maxSources?: number;
}

export interface VetKnowledgeRetrievalPlan {
  sources: VetKnowledgeSource[];
  blockedReasons: string[];
  policyWarnings: string[];
}

function defensiveClone(source: VetKnowledgeSource): VetKnowledgeSource {
  return {
    ...source,
    complaintFamilies: [...source.complaintFamilies],
    redFlags: [...source.redFlags],
  };
}

function safeEmptyPlan(): VetKnowledgeRetrievalPlan {
  return {
    sources: [],
    blockedReasons: [],
    policyWarnings: [],
  };
}

export function planRetrieval(
  request: VetKnowledgeRetrievalRequest = {}
): VetKnowledgeRetrievalPlan {
  try {
    const blockedReasons: string[] = [];
    const policyWarnings: string[] = [];

    if (!CURATED_ONLY) {
      blockedReasons.push("curated-only policy is disabled");
    }

    if (OPEN_WEB_SEARCH_ALLOWED) {
      policyWarnings.push("open-web search is not permitted in this scaffold");
    }

    if (RUNTIME_SOURCE_FETCH_ALLOWED) {
      policyWarnings.push("runtime source fetching is not permitted in this scaffold");
    }

    let candidates = VET_KNOWLEDGE_SOURCES.map(defensiveClone);

    if (request.complaintFamily) {
      const family = request.complaintFamily.toLowerCase();
      const knownFamilies = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.complaintFamilies.map((f) => f.toLowerCase()))
      );

      if (!knownFamilies.has(family)) {
        blockedReasons.push(`unknown complaint family: ${request.complaintFamily}`);
        return {
          sources: [],
          blockedReasons,
          policyWarnings,
        };
      }

      candidates = candidates.filter((s) =>
        s.complaintFamilies.some((f) => f.toLowerCase() === family)
      );
    }

    if (request.redFlags && request.redFlags.length > 0) {
      const knownRedFlags = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.redFlags.map((r) => r.toLowerCase()))
      );

      const unknownFlags = request.redFlags.filter(
        (flag) => !knownRedFlags.has(flag.toLowerCase())
      );

      if (unknownFlags.length === request.redFlags.length) {
        blockedReasons.push(
          `all red flags unknown: ${request.redFlags.join(", ")}`
        );
        return {
          sources: [],
          blockedReasons,
          policyWarnings,
        };
      }

      candidates = candidates.filter((s) =>
        request.redFlags!.some((flag) =>
          s.redFlags.some((r) => r.toLowerCase() === flag.toLowerCase())
        )
      );
    }

    if (request.allowedUse) {
      candidates = candidates.filter(
        (s) => s.allowedUse === request.allowedUse
      );

      if (isOwnerVisibleAllowed(request.allowedUse)) {
        candidates = candidates.filter((s) =>
          isOwnerVisibleAllowed(s.allowedUse)
        );
      }
    }

    const maxSources = request.maxSources ?? DEFAULT_MAX_SOURCES;

    if (candidates.length > maxSources) {
      candidates = candidates.slice(0, maxSources);
      policyWarnings.push(`limited to ${maxSources} sources`);
    }

    for (const source of candidates) {
      const combinedText = `${source.title} ${source.topic}`;
      if (containsForbiddenContent(combinedText)) {
        policyWarnings.push(
          `source ${source.id} contains forbidden content patterns`
        );
      }
    }

    return {
      sources: candidates,
      blockedReasons,
      policyWarnings,
    };
  } catch {
    return safeEmptyPlan();
  }
}

export function getOwnerVisibleSources(
  request: Omit<VetKnowledgeRetrievalRequest, "allowedUse"> = {}
): VetKnowledgeRetrievalPlan {
  return planRetrieval({
    ...request,
    allowedUse: "owner_visible_citation",
  });
}
