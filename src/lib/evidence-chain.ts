import type {
  RetrievalBundle,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
} from "./clinical-evidence";
import { DISEASE_DB } from "./clinical-matrix";
import {
  getBreedModifierProvenance,
  getDispositionProvenance,
  getProvenanceForDiseases,
  getProvenanceForRedFlags,
  type EvidenceTier,
  type ProvenanceEntry,
} from "./provenance-registry";
import type { PetProfile, TriageSession } from "./triage-engine";

export interface StructuredEvidenceChainItem {
  source: string;
  source_kind: "deterministic_rule" | "visual" | "consult" | "retrieval";
  finding: string;
  supporting: string[];
  contradicting: string[];
  confidence: number;
  claim_id?: string;
  provenance_ids?: string[];
  evidence_tier?: EvidenceTier;
  last_reviewed_at?: string;
  deterministic_only?: boolean;
  high_stakes?: boolean;
}

interface BuildStructuredEvidenceChainInput {
  session: TriageSession;
  retrievalBundle: RetrievalBundle;
  pet: PetProfile;
  highestUrgency: string;
}

function humanizeKey(value: string): string {
  return value.replace(/[_-]+/g, " ").trim();
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

function toDeterministicItem(
  provenance: ProvenanceEntry,
  finding: string,
  supporting: string[],
  confidence = 0.95
): StructuredEvidenceChainItem {
  return {
    source: "deterministic rule",
    source_kind: "deterministic_rule",
    finding,
    supporting: [provenance.source, ...supporting].filter(Boolean),
    contradicting: [],
    confidence,
    claim_id: provenance.rule_id,
    provenance_ids: [provenance.rule_id],
    evidence_tier: provenance.evidence_tier,
    last_reviewed_at: provenance.review_date,
    deterministic_only: true,
    high_stakes: Boolean(provenance.high_stakes),
  };
}

function buildDeterministicItems(
  session: TriageSession,
  pet: PetProfile,
  highestUrgency: string
): StructuredEvidenceChainItem[] {
  const items: StructuredEvidenceChainItem[] = [];

  for (const provenance of getProvenanceForRedFlags(session.red_flags_triggered)) {
    const matchedFlags = (provenance.red_flags ?? []).filter((flag) =>
      session.red_flags_triggered.includes(flag)
    );
    items.push(
      toDeterministicItem(
        provenance,
        `Emergency red flag identified: ${matchedFlags
          .map(humanizeKey)
          .join(", ")}`,
        matchedFlags.map((flag) => `Triggered flag: ${humanizeKey(flag)}`),
        0.99
      )
    );
  }

  for (const provenance of getDispositionProvenance({
    highestUrgency,
    redFlags: session.red_flags_triggered,
    knownSymptoms: session.known_symptoms,
  })) {
    items.push(
      toDeterministicItem(
        provenance,
        `Deterministic urgency floor: ${humanizeKey(highestUrgency)}`,
        [
          `Known symptoms: ${session.known_symptoms
            .slice(0, 4)
            .map(humanizeKey)
            .join(", ") || "none"}`,
          session.red_flags_triggered.length > 0
            ? `Red flags: ${session.red_flags_triggered
                .slice(0, 4)
                .map(humanizeKey)
                .join(", ")}`
            : "",
        ].filter(Boolean),
        0.96
      )
    );
  }

  for (const provenance of getProvenanceForDiseases(session.candidate_diseases)) {
    const diseaseKey = (provenance.diseases ?? [])[0];
    const diseaseLabel =
      diseaseKey && DISEASE_DB[diseaseKey]
        ? DISEASE_DB[diseaseKey].medical_term
        : humanizeKey(diseaseKey || provenance.rule_id);
    items.push(
      toDeterministicItem(
        provenance,
        `Must-not-miss differential: ${diseaseLabel}`,
        [
          `Candidate disease key: ${diseaseKey || "unknown"}`,
          `Urgency: ${
            diseaseKey && DISEASE_DB[diseaseKey]
              ? DISEASE_DB[diseaseKey].urgency
              : highestUrgency
          }`,
        ],
        0.92
      )
    );
  }

  for (const provenance of getBreedModifierProvenance(
    pet.breed,
    session.candidate_diseases
  )) {
    const diseaseKey = (provenance.diseases ?? [])[0];
    const diseaseLabel =
      diseaseKey && DISEASE_DB[diseaseKey]
        ? DISEASE_DB[diseaseKey].medical_term
        : humanizeKey(diseaseKey || provenance.rule_id);
    items.push(
      toDeterministicItem(
        provenance,
        `${pet.breed} increases risk for ${diseaseLabel}`,
        [
          `Breed context: ${pet.breed}`,
          diseaseKey ? `Modifier linked to: ${diseaseKey}` : "",
        ].filter(Boolean),
        0.9
      )
    );
  }

  return items;
}

export function buildStructuredEvidenceChain({
  session,
  retrievalBundle,
  pet,
  highestUrgency,
}: BuildStructuredEvidenceChainInput): StructuredEvidenceChainItem[] {
  const items: StructuredEvidenceChainItem[] = [
    ...buildDeterministicItems(session, pet, highestUrgency),
  ];

  for (const visual of session.case_memory?.visual_evidence?.slice(-3) || []) {
    items.push({
      source: "visual-analysis",
      source_kind: "visual",
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
      source_kind: "consult",
      finding: consult.summary,
      supporting: consult.agreements,
      contradicting: consult.disagreements,
      confidence: consult.confidence,
    });
  }

  for (const text of retrievalBundle.textChunks.slice(0, 2)) {
    items.push({
      source: "text-retrieval",
      source_kind: "retrieval",
      finding: text.summary,
      supporting: toSupportingTextEvidence(text),
      contradicting: [],
      confidence: text.score,
    });
  }

  for (const image of retrievalBundle.imageMatches.slice(0, 2)) {
    items.push({
      source: "image-retrieval",
      source_kind: "retrieval",
      finding: image.summary || image.conditionLabel || image.title,
      supporting: toSupportingImageEvidence(image),
      contradicting: [],
      confidence: image.score,
    });
  }

  return items.slice(0, 10);
}
