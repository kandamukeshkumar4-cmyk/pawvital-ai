import type {
  RetrievalBundle,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
} from "./clinical-evidence";
import type { TriageSession } from "./triage-engine";
import { getICD10CodesForDisease } from "./icd-10-mapper";

export interface StructuredEvidenceChainItem {
  source: string;
  finding: string;
  supporting: string[];
  contradicting: string[];
  confidence: number;
}

interface EvidenceChainOptions {
  bayesianDifferentials?: Array<{
    disease_key: string;
    posteriorProbability: number;
  }>;
  topDiseaseKey?: string;
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
  retrievalBundle: RetrievalBundle,
  options?: EvidenceChainOptions
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

  // Phase 4: Add Bayesian prior evidence item
  if (options?.bayesianDifferentials && options.bayesianDifferentials.length > 0) {
    const top3 = options.bayesianDifferentials.slice(0, 3);
    items.push({
      source: "bayesian-prior",
      finding: `Epidemiological baseline for ${top3.map((d) => d.disease_key).join(", ")}`,
      supporting: top3.map(
        (d) => `${d.disease_key}: posterior=${d.posteriorProbability.toFixed(3)}`
      ),
      contradicting: [],
      confidence: 0.5, // Priors are baselines, not direct evidence
    });
  }

  // Phase 4: Add ICD-10 mapping evidence item
  if (options?.topDiseaseKey) {
    const icd10 = getICD10CodesForDisease(options.topDiseaseKey);
    if (icd10) {
      items.push({
        source: "icd-10-mapping",
        finding: `${icd10.primary_code.code}: ${icd10.primary_code.description}`,
        supporting: [
          `Category: ${icd10.primary_code.category}`,
          `Urgency: ${icd10.primary_code.urgency}`,
        ],
        contradicting: [],
        confidence: icd10.confidence,
      });
    }
  }

  return items.slice(0, 8);
}
