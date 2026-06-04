import type { SymptomCheckEntry } from "@/components/timeline/types";

export type ProductIntelligenceState = "stable" | "watch" | "urgent" | "unknown";
export type ProductIntelligenceConfidence = "high" | "medium" | "low" | "insufficient";

export interface ProductIntelligenceInput {
  entries: SymptomCheckEntry[];
  healthScore?: number | null;
}

export interface ProductIntelligenceSnapshot {
  state: ProductIntelligenceState;
  confidence: ProductIntelligenceConfidence;
  displayScore: number | null;
  evidenceCoverage: number;
  evidenceChips: string[];
  missingEvidenceChips: string[];
  nextEvidencePrompt: string | null;
  deterministicOverride: string | null;
  ownerSummary: string;
  claimGuard: string;
  persistenceAllowed: boolean;
  persistenceBlockedReasons: string[];
}

const CLAIM_GUARD =
  "Evidence only - not a diagnosis, prognosis, treatment plan, or emergency clearance.";

const SCORE_BY_SEVERITY: Record<SymptomCheckEntry["severity"], number> = {
  mild: 92,
  moderate: 78,
  serious: 58,
  critical: 34,
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function sortNewestFirst(entries: SymptomCheckEntry[]): SymptomCheckEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function deriveWellnessIndex(entries: SymptomCheckEntry[]): number | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + SCORE_BY_SEVERITY[entry.severity], 0);
  return clampScore(total / entries.length);
}

function confidenceForCoverage(
  coverage: number,
  state: ProductIntelligenceState
): ProductIntelligenceConfidence {
  if (state === "urgent") return "high";
  if (coverage >= 0.75) return "high";
  if (coverage >= 0.5) return "medium";
  if (coverage > 0) return "low";
  return "insufficient";
}

function stateFromEvidence(
  latestEntry: SymptomCheckEntry | undefined,
  score: number | null
): ProductIntelligenceState {
  if (latestEntry?.urgency === "emergency" || latestEntry?.severity === "critical") {
    return "urgent";
  }

  if (!latestEntry && score === null) return "unknown";

  if (
    latestEntry?.urgency === "urgent" ||
    latestEntry?.severity === "serious" ||
    (score !== null && score < 70)
  ) {
    return "watch";
  }

  if (score !== null && score >= 80 && latestEntry) return "stable";
  return "watch";
}

function ownerSummaryFor(state: ProductIntelligenceState, coverage: number): string {
  if (state === "urgent") {
    return "Urgent evidence is active. Follow the deterministic care guidance from the symptom check.";
  }

  if (state === "stable") {
    return "Available evidence looks close to baseline, with source evidence shown below.";
  }

  if (state === "watch") {
    return "Available evidence suggests a watch state. Add follow-up evidence before trusting the trend.";
  }

  return coverage > 0
    ? "Some evidence is available, but not enough comparable evidence yet."
    : "Not enough comparable evidence yet.";
}

function nextPromptFor(
  missing: string[],
  state: ProductIntelligenceState
): string | null {
  if (state === "urgent") return null;
  if (missing.includes("latest symptom check")) {
    return "Add a symptom check to establish today's baseline.";
  }
  if (missing.includes("7-day trend")) {
    return "Add another comparable check to establish a trend.";
  }
  if (missing.includes("recovery checkpoint")) {
    return "Add a follow-up checkpoint when recovery evidence is available.";
  }
  return null;
}

export function buildProductIntelligenceSnapshot(
  input: ProductIntelligenceInput
): ProductIntelligenceSnapshot {
  const entries = sortNewestFirst(input.entries);
  const latestEntry = entries[0];
  const derivedScore = deriveWellnessIndex(entries);
  const displayScore =
    typeof input.healthScore === "number" ? clampScore(input.healthScore) : derivedScore;

  const evidenceChips: string[] = [];
  const missingEvidenceChips: string[] = [];

  if (displayScore === null) missingEvidenceChips.push("wellness index");
  else evidenceChips.push("wellness index");

  if (latestEntry) evidenceChips.push("latest symptom check");
  else missingEvidenceChips.push("latest symptom check");

  if (entries.length >= 2) evidenceChips.push("7-day trend");
  else missingEvidenceChips.push("7-day trend");

  const evidenceCoverage = evidenceChips.length / (evidenceChips.length + missingEvidenceChips.length);
  const state = stateFromEvidence(latestEntry, displayScore);
  const deterministicOverride =
    state === "urgent" ? "Emergency symptom check forces urgent state." : null;
  const confidence = confidenceForCoverage(evidenceCoverage, state);
  const persistenceBlockedReasons: string[] = [];

  if (state === "urgent") persistenceBlockedReasons.push("urgent override active");
  if (evidenceCoverage < 0.75) persistenceBlockedReasons.push("insufficient evidence coverage");
  if (state === "unknown") persistenceBlockedReasons.push("unknown readiness state");

  return {
    state,
    confidence,
    displayScore,
    evidenceCoverage,
    evidenceChips,
    missingEvidenceChips,
    nextEvidencePrompt: nextPromptFor(missingEvidenceChips, state),
    deterministicOverride,
    ownerSummary: ownerSummaryFor(state, evidenceCoverage),
    claimGuard: CLAIM_GUARD,
    persistenceAllowed: persistenceBlockedReasons.length === 0,
    persistenceBlockedReasons,
  };
}
