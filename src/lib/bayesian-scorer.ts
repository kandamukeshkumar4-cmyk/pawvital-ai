import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { SYMPTOM_MAP, FOLLOW_UP_QUESTIONS } from "./clinical-matrix";
import type { DiseaseProbability, TriageSession } from "./triage-engine";

const PRIOR_SOURCE_SLUG = "csv-pet-health-symptoms";
const PRIOR_SOURCE_FILES = [
  resolve(process.cwd(), "corpus", "data", "pet-health-symptoms-dataset.csv"),
  resolve(process.cwd(), "corpus", "data", "pet-health-symptoms.csv"),
];
const PRIOR_SMOOTHING = 1;
const PRIOR_QUERY_END = 4999;

export type ClinicalMatrix = DiseaseProbability;

export interface ScoredDifferential {
  condition: string;
  disease_key: string;
  probability: number;
  confidence: number;
  evidence_count: number;
  prior_probability: number;
  matched_symptoms: string[];
}

interface PriorFrequencySnapshot {
  total: number;
  frequencies: Record<string, number>;
}

interface KnowledgeChunkPriorRow {
  metadata?: {
    case_data?: {
      condition?: string;
    } | null;
  } | null;
}

interface PriorMatch {
  count: number;
  matched: boolean;
}

const EMPTY_PRIOR_SNAPSHOT: PriorFrequencySnapshot = {
  total: 0,
  frequencies: {},
};

let priorFrequencySnapshotPromise: Promise<PriorFrequencySnapshot> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToFour(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function normalizeClinicalLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeClinicalLabel(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  result.push(current);
  return result;
}

function buildPriorFrequencySnapshot(labels: string[]): PriorFrequencySnapshot {
  const frequencies: Record<string, number> = {};

  for (const label of labels) {
    const normalized = normalizeClinicalLabel(label);
    if (!normalized) {
      continue;
    }

    frequencies[normalized] = (frequencies[normalized] || 0) + 1;
  }

  const total = Object.values(frequencies).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    total,
    frequencies,
  };
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl.startsWith("http") || (!serviceRoleKey && !anonKey)) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey || anonKey);
}

async function loadPriorFrequenciesFromKnowledgeChunks(): Promise<PriorFrequencySnapshot> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return EMPTY_PRIOR_SNAPSHOT;
  }

  try {
    const { data, error } = await supabase
      .from("knowledge_chunks")
      .select("metadata, knowledge_sources!inner(slug, active)")
      .eq("knowledge_sources.slug", PRIOR_SOURCE_SLUG)
      .eq("knowledge_sources.active", true)
      .range(0, PRIOR_QUERY_END);

    if (error || !data?.length) {
      return EMPTY_PRIOR_SNAPSHOT;
    }

    const conditions = (data as KnowledgeChunkPriorRow[])
      .map((row) => row.metadata?.case_data?.condition || "")
      .filter((value): value is string => Boolean(value));

    return buildPriorFrequencySnapshot(conditions);
  } catch {
    return EMPTY_PRIOR_SNAPSHOT;
  }
}

function parsePriorFrequenciesFromCsv(csvText: string): PriorFrequencySnapshot {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return EMPTY_PRIOR_SNAPSHOT;
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const conditionIndex = headers.findIndex(
    (header) => header.toLowerCase() === "condition"
  );

  if (conditionIndex === -1) {
    return EMPTY_PRIOR_SNAPSHOT;
  }

  const conditions: string[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const condition = values[conditionIndex]?.trim();
    if (condition) {
      conditions.push(condition);
    }
  }

  return buildPriorFrequencySnapshot(conditions);
}

async function loadPriorFrequenciesFromCsv(): Promise<PriorFrequencySnapshot> {
  for (const filePath of PRIOR_SOURCE_FILES) {
    try {
      const csvText = await readFile(filePath, "utf8");
      const snapshot = parsePriorFrequenciesFromCsv(csvText);
      if (snapshot.total > 0) {
        return snapshot;
      }
    } catch {
      continue;
    }
  }

  return EMPTY_PRIOR_SNAPSHOT;
}

async function loadPriorFrequencySnapshot(): Promise<PriorFrequencySnapshot> {
  if (!priorFrequencySnapshotPromise) {
    priorFrequencySnapshotPromise = (async () => {
      const knowledgeChunkSnapshot = await loadPriorFrequenciesFromKnowledgeChunks();
      if (knowledgeChunkSnapshot.total > 0) {
        return knowledgeChunkSnapshot;
      }

      const csvSnapshot = await loadPriorFrequenciesFromCsv();
      if (csvSnapshot.total === 0) {
        console.warn("[bayesian-scorer] operating with uniform priors — CSV data unavailable");
      }
      return csvSnapshot;
    })();
  }

  return priorFrequencySnapshotPromise;
}

function resolvePriorMatch(
  finding: ClinicalMatrix,
  snapshot: PriorFrequencySnapshot
): PriorMatch {
  const candidates = [finding.medical_term, finding.name, finding.disease_key]
    .map((value) => normalizeClinicalLabel(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const exactCount = snapshot.frequencies[candidate];
    if (exactCount) {
      return { count: exactCount, matched: true };
    }
  }

  let bestCount = PRIOR_SMOOTHING;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate);
    if (candidateTokens.length === 0) {
      continue;
    }

    for (const [label, count] of Object.entries(snapshot.frequencies)) {
      const labelTokens = tokenize(label);
      if (labelTokens.length === 0) {
        continue;
      }

      const overlapCount = candidateTokens.filter((token) =>
        labelTokens.includes(token)
      ).length;
      const score = overlapCount / Math.max(candidateTokens.length, labelTokens.length);

      if (score > bestScore) {
        bestScore = score;
        bestCount = count;
      }
    }
  }

  if (bestScore >= 0.5) {
    return { count: bestCount, matched: true };
  }

  return { count: PRIOR_SMOOTHING, matched: false };
}

function resolveSymptomKey(symptom: string): string | null {
  if (SYMPTOM_MAP[symptom]) {
    return symptom;
  }

  const normalized = normalizeClinicalLabel(symptom).replace(/\s+/g, "_");
  if (SYMPTOM_MAP[normalized]) {
    return normalized;
  }

  return null;
}

function getMatchedSymptoms(symptoms: string[], diseaseKey: string): string[] {
  const matched = new Set<string>();

  for (const symptom of symptoms) {
    const symptomKey = resolveSymptomKey(symptom);
    if (!symptomKey) {
      continue;
    }

    const entry = SYMPTOM_MAP[symptomKey];
    if (entry?.linked_diseases.includes(diseaseKey)) {
      matched.add(symptomKey);
    }
  }

  return [...matched];
}

export async function computeBayesianScore(
  symptoms: string[],
  breed: string,
  age: number,
  findings: ClinicalMatrix[]
): Promise<ScoredDifferential[]> {
  if (findings.length === 0) {
    return [];
  }

  const priorSnapshot = await loadPriorFrequencySnapshot();
  const ageCategory = age < 1.5 ? "puppy" : age >= 7 ? "senior" : "adult";
  const resolvedSymptoms = symptoms
    .map((symptom) => resolveSymptomKey(symptom))
    .filter((symptomKey): symptomKey is string => Boolean(symptomKey));
  const priorDenominator =
    priorSnapshot.total + findings.length * PRIOR_SMOOTHING ||
    findings.length * PRIOR_SMOOTHING;

  const scored = findings.map((finding) => {
    const priorMatch = resolvePriorMatch(finding, priorSnapshot);
    const matchedSymptoms = getMatchedSymptoms(resolvedSymptoms, finding.disease_key);
    const priorProbability = priorMatch.count / priorDenominator;
    const symptomEvidence =
      resolvedSymptoms.length === 0
        ? 0.5
        : (matchedSymptoms.length + 1) / (resolvedSymptoms.length + 2);
    const breedEvidence = clamp(finding.breed_multiplier || 1, 0.75, 3);
    const ageEvidence = clamp(finding.age_multiplier || 1, 0.75, 2);
    const baselineScore = Math.max(
      finding.raw_score * breedEvidence * ageEvidence,
      0.0001
    );
    const matrixEvidence = clamp(finding.final_score / baselineScore, 0.5, 4);
    const rawPosterior =
      priorProbability * symptomEvidence * breedEvidence * ageEvidence * matrixEvidence;
    const evidenceRatio =
      resolvedSymptoms.length === 0
        ? 0
        : matchedSymptoms.length / resolvedSymptoms.length;
    const confidence = clamp(
      0.28 +
        evidenceRatio * 0.4 +
        (priorMatch.matched ? 0.12 : 0.04) +
        Math.min(Math.abs(breedEvidence - 1), 1) * (breed ? 0.08 : 0) +
        Math.min(Math.abs(ageEvidence - 1), 1) * (ageCategory !== "adult" ? 0.06 : 0) +
        Math.min(Math.max(matrixEvidence - 1, 0), 1.5) * 0.12,
      0.1,
      0.99
    );

    return {
      condition: finding.medical_term,
      disease_key: finding.disease_key,
      rawPosterior,
      prior_probability: priorProbability,
      confidence,
      evidence_count: matchedSymptoms.length,
      matched_symptoms: matchedSymptoms,
    };
  });

  const totalPosterior = scored.reduce(
    (sum, differential) => sum + differential.rawPosterior,
    0
  );
  const normalizationBase = totalPosterior > 0 ? totalPosterior : findings.length;

  return scored
    .map((differential) => ({
      condition: differential.condition,
      disease_key: differential.disease_key,
      probability: roundToFour(differential.rawPosterior / normalizationBase),
      confidence: roundToFour(differential.confidence),
      evidence_count: differential.evidence_count,
      prior_probability: roundToFour(differential.prior_probability),
      matched_symptoms: differential.matched_symptoms,
    }))
    .sort((left, right) => right.probability - left.probability);
}

// --- Negative-evidence penalty helper (A2) ---

/**
 * Returns the set of disease keys implicated by a question.
 * A question implicates the diseases of any symptom in the session
 * that lists that question in its follow_up_questions.
 */
function getDiseasesImplicatedByQuestion(
  questionId: string,
  session: TriageSession
): Set<string> {
  const implicated = new Set<string>();
  for (const symptomKey of session.known_symptoms) {
    const entry = SYMPTOM_MAP[symptomKey];
    if (!entry) continue;
    if (entry.follow_up_questions.includes(questionId)) {
      for (const disease of entry.linked_diseases) {
        implicated.add(disease);
      }
    }
  }
  return implicated;
}

function isNegativeAnswer(value: string | boolean | number): boolean {
  if (value === false) return true;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "no" || lower === "none" || lower === "never";
  }
  return false;
}

// --- Public session-aware API (A1 + A2) ---

/**
 * Score differentials for a session with negative-evidence post-processing.
 *
 * Calls computeBayesianScore with the session's known symptoms, then
 * applies a 0.5x penalty to any differential whose disease is implicated
 * by a critical follow-up question that received a negative answer.
 * Probabilities are renormalized after the penalty step.
 */
export async function scoreDifferentials(
  session: TriageSession,
  pet: { breed: string; age_years: number },
  findings: DiseaseProbability[]
): Promise<ScoredDifferential[]> {
  const scored = await computeBayesianScore(
    session.known_symptoms,
    pet.breed,
    pet.age_years,
    findings
  );

  if (scored.length === 0) return scored;

  // Build the set of (questionId → implicated disease keys) for every
  // critical question that received a negative answer in this session.
  const penaltyMap = new Map<string, Set<string>>();
  for (const [qId, answer] of Object.entries(session.extracted_answers)) {
    const qDef = FOLLOW_UP_QUESTIONS[qId];
    if (!qDef?.critical) continue;
    if (!isNegativeAnswer(answer)) continue;

    const implicated = getDiseasesImplicatedByQuestion(qId, session);
    if (implicated.size > 0) {
      penaltyMap.set(qId, implicated);
    }
  }

  if (penaltyMap.size === 0) return scored;

  // Apply 0.5x penalty for each critical negative question that implicates
  // the disease. Penalties are multiplicative (two negatives = 0.25x).
  const penalized = scored.map((differential) => {
    let probability = differential.probability;
    for (const implicated of penaltyMap.values()) {
      if (implicated.has(differential.disease_key)) {
        probability *= 0.5;
      }
    }
    return { ...differential, probability };
  });

  // Renormalize so probabilities still sum to ~1.
  const total = penalized.reduce((sum, d) => sum + d.probability, 0);
  if (total <= 0) return penalized;

  return penalized.map((d) => ({
    ...d,
    probability: roundToFour(d.probability / total),
  }));
}

/**
 * Returns the top `n` differentials for a session, sorted by probability
 * descending, with only the fields needed for display or downstream use.
 */
export async function getTopDifferentials(
  session: TriageSession,
  n: number,
  pet: { breed: string; age_years: number },
  findings: DiseaseProbability[]
): Promise<Array<{ condition: string; probability: number; urgency: string }>> {
  const scored = await scoreDifferentials(session, pet, findings);
  return scored
    .sort((a, b) => b.probability - a.probability)
    .slice(0, n)
    .map((d) => {
      // Look up urgency from the findings list (ScoredDifferential does not
      // carry urgency; the source DiseaseProbability does).
      const source = findings.find((f) => f.disease_key === d.disease_key);
      return {
        condition: d.condition,
        probability: d.probability,
        urgency: source?.urgency ?? "unknown",
      };
    });
}
