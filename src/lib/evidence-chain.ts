import type {
  RetrievalBundle,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
} from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";

export interface StructuredEvidenceChainItem {
  source: string;
  finding: string;
  supporting: string[];
  contradicting: string[];
  confidence: number;
}

function toSupportingTextEvidence(entry: RetrievalTextEvidence): string[] {
  return [
    entry.title,
    entry.citation || entry.sourceUrl || "Unknown source",
  ].filter(Boolean);
}

function toSupportingImageEvidence(entry: RetrievalImageEvidence): string[] {
  return [
    entry.title,
    entry.conditionLabel || "unlabeled condition",
    entry.citation || entry.assetUrl || "Unknown image source",
  ].filter(Boolean);
}

export function buildStructuredEvidenceChain(
  session: TriageSession,
  retrievalBundle: RetrievalBundle
): StructuredEvidenceChainItem[] {
  const items: StructuredEvidenceChainItem[] = [];

  for (const visual of session.case_memory?.visual_evidence?.slice(-3) || []) {
    items.push({
      source: "visual-analysis",
      finding:
        visual.findings[0] ||
        `${visual.domain} evidence in ${visual.bodyRegion || "unknown region"}`,
      supporting: [
        visual.domain,
        visual.bodyRegion || "unknown body region",
        ...visual.supportedSymptoms.slice(0, 3),
      ].filter(Boolean),
      contradicting: visual.contradictions,
      confidence: visual.confidence ?? 0.5,
    });
  }

  for (const consult of session.case_memory?.consult_opinions?.slice(-2) || []) {
    items.push({
      source: consult.model,
      finding: consult.summary,
      supporting: consult.agreements,
      contradicting: consult.disagreements,
      confidence: consult.confidence,
    });
  }

  for (const text of retrievalBundle.textChunks.slice(0, 2)) {
    items.push({
      source: "text-retrieval",
      finding: text.summary,
      supporting: toSupportingTextEvidence(text),
      contradicting: [],
      confidence: text.score,
    });
  }

  for (const image of retrievalBundle.imageMatches.slice(0, 2)) {
    items.push({
      source: "image-retrieval",
      finding: image.summary || image.conditionLabel || image.title,
      supporting: toSupportingImageEvidence(image),
      contradicting: [],
      confidence: image.score,
    });
  }

  return items.slice(0, 8);
}
