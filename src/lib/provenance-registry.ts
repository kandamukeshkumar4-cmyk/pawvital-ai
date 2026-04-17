import fs from "node:fs";
import path from "node:path";

export type EvidenceTier = "A" | "B" | "C" | "D" | "E" | "F";
export type ProvenanceRuleType =
  | "red_flag"
  | "disease"
  | "modifier"
  | "question"
  | "disposition"
  | "guardrail";

export interface ProvenanceEntry {
  rule_id: string;
  rule_type: ProvenanceRuleType;
  evidence_tier: EvidenceTier;
  source: string;
  source_url: string | null;
  review_date: string;
  next_review: string;
  reviewer: string | null;
  notes: string | null;
  high_stakes?: boolean;
  red_flags?: string[];
  diseases?: string[];
  breeds?: string[];
  urgency_levels?: string[];
  symptom_keys?: string[];
}

export interface ProvenanceRegistry {
  version: string;
  last_updated: string;
  required_high_stakes_rule_ids: string[];
  entries: ProvenanceEntry[];
}

const registry = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "data", "provenance-registry.json"),
    "utf8"
  )
) as ProvenanceRegistry;
const GENERIC_BREED_TOKENS = new Set([
  "breed",
  "breeds",
  "dog",
  "dogs",
  "mix",
  "mixed",
]);
const BREED_ALIASES: Record<string, string[]> = {
  "French Bulldog": ["frenchie"],
  "Golden Retriever": ["golden", "golden retriever mix"],
  "Labrador Retriever": ["lab", "labrador", "labrador mix"],
  "Miniature Schnauzer": ["mini schnauzer", "miniature schnauzer mix"],
  "Pembroke Welsh Corgi": ["corgi", "pembroke corgi", "welsh corgi"],
  Pug: ["pug mix"],
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenizeBreed(value: string): string[] {
  return normalizeKey(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !GENERIC_BREED_TOKENS.has(token));
}

function aliasMatchesBreed(inputBreed: string, targetBreed: string): boolean {
  const aliases = BREED_ALIASES[targetBreed] ?? [];
  const normalizedBreed = normalizeKey(inputBreed);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return (
      normalizedBreed === normalizedAlias ||
      normalizedBreed.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedBreed)
    );
  });
}

function breedMatches(inputBreed: string, targetBreed: string): boolean {
  const normalizedBreed = normalizeKey(inputBreed);
  const normalizedTarget = normalizeKey(targetBreed);
  if (!normalizedBreed || !normalizedTarget) return false;

  if (
    normalizedBreed === normalizedTarget ||
    normalizedBreed.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedBreed)
  ) {
    return true;
  }

  if (aliasMatchesBreed(inputBreed, targetBreed)) {
    return true;
  }

  const breedTokens = tokenizeBreed(inputBreed);
  const targetTokens = tokenizeBreed(targetBreed);
  if (breedTokens.length === 0 || targetTokens.length === 0) {
    return false;
  }

  return breedTokens.every((token) => targetTokens.includes(token));
}

function isExpired(nextReview: string, referenceDate: Date): boolean {
  const reviewDate = new Date(`${nextReview}T00:00:00Z`);
  return Number.isFinite(reviewDate.valueOf()) && reviewDate < referenceDate;
}

export function getProvenanceRegistry(): ProvenanceRegistry {
  return registry;
}

export function getRequiredHighStakesRuleIds(): string[] {
  return [...registry.required_high_stakes_rule_ids];
}

export function getAllProvenanceEntries(): ProvenanceEntry[] {
  return [...registry.entries];
}

export function getProvenanceEntry(ruleId: string): ProvenanceEntry | null {
  return registry.entries.find((entry) => entry.rule_id === ruleId) ?? null;
}

export function getMissingHighStakesRuleIds(): string[] {
  return registry.required_high_stakes_rule_ids.filter(
    (ruleId) => !registry.entries.some((entry) => entry.rule_id === ruleId)
  );
}

export function getExpiredHighStakesTierABEntries(
  referenceDate: Date = new Date()
): ProvenanceEntry[] {
  return registry.entries.filter(
    (entry) =>
      entry.high_stakes &&
      (entry.evidence_tier === "A" || entry.evidence_tier === "B") &&
      isExpired(entry.next_review, referenceDate)
  );
}

export function getProvenanceForRedFlag(flag: string): ProvenanceEntry | null {
  return getProvenanceForRedFlags([flag])[0] ?? null;
}

export function getProvenanceForRedFlags(flags: string[]): ProvenanceEntry[] {
  const wanted = new Set(flags.filter(Boolean));
  return registry.entries.filter(
    (entry) =>
      entry.rule_type === "red_flag" &&
      (entry.red_flags ?? []).some((flag) => wanted.has(flag))
  );
}

export function getProvenanceForDisease(
  diseaseKey: string
): ProvenanceEntry | null {
  return getProvenanceForDiseases([diseaseKey])[0] ?? null;
}

export function getProvenanceForDiseases(
  diseaseKeys: string[]
): ProvenanceEntry[] {
  const wanted = new Set(diseaseKeys.filter(Boolean));
  return registry.entries.filter(
    (entry) =>
      entry.rule_type === "disease" &&
      (entry.diseases ?? []).some((disease) => wanted.has(disease))
  );
}

export function getBreedModifierProvenance(
  breed: string,
  diseaseKeys: string[] = []
): ProvenanceEntry[] {
  if (!breed.trim()) return [];

  const wantedDiseases = new Set(diseaseKeys.filter(Boolean));
  return registry.entries.filter((entry) => {
    if (entry.rule_type !== "modifier") return false;
    const breedMatch = (entry.breeds ?? []).some((targetBreed) =>
      breedMatches(breed, targetBreed)
    );
    if (!breedMatch) return false;
    if (wantedDiseases.size === 0) return true;
    return (entry.diseases ?? []).some((disease) => wantedDiseases.has(disease));
  });
}

export function getDispositionProvenance(input: {
  highestUrgency: string;
  redFlags: string[];
  knownSymptoms: string[];
}): ProvenanceEntry[] {
  const redFlags = new Set(input.redFlags.filter(Boolean));
  const knownSymptoms = new Set(input.knownSymptoms.filter(Boolean));

  return registry.entries.filter((entry) => {
    if (entry.rule_type !== "disposition") return false;
    if (
      entry.urgency_levels?.includes(input.highestUrgency) &&
      input.highestUrgency === "emergency"
    ) {
      return true;
    }

    if (entry.rule_id === "disposition.any_red_flag_emergency") {
      return redFlags.size > 0;
    }

    return (entry.symptom_keys ?? []).some(
      (symptomKey) => knownSymptoms.has(symptomKey) || redFlags.has(symptomKey)
    );
  });
}
