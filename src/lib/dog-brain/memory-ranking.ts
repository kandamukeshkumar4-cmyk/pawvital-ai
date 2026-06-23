import {
  BRAIN_SIGNAL_SYMPTOM_KEYS,
} from "@/lib/dog-brain/question-priority";
import type { DetectedSignal, SignalSeverity, SignalType } from "@/lib/dog-brain/types";

// =============================================================================
// Dog Brain → 60/90-day memory ranking (SUPPORTIVE TIEBREAK ORDERING ONLY)
//
// Orders the owner-logged Dog Brain signals so the symptom checker's tiebreak
// prefers the *most useful* long-memory facts (recent / repeated / worsening /
// follow-up-linked) over isolated old notes — instead of a flat severity sort.
//
// HARD SAFETY CONTRACT (must never be violated):
//  - This module ONLY reorders the supportive priority-symptom tiebreak list.
//    It NEVER emits, raises, or lowers a deterministic urgency. The clinical
//    matrix / triage engine never read this output.
//  - Severity stays the dominant ranking term (alert > watch > info), so a
//    benign-but-recent memory can never outrank a higher-severity signal. This
//    preserves the existing severity-first ordering at the top tier; the finer
//    signals only break ties *within* a severity tier.
//  - Pure + side-effect free. Empty input → empty output. Absent context →
//    ordering depends only on the signals themselves (deterministic).
// =============================================================================

/** Context the ranking may consult — all optional, all best-effort. */
export interface MemoryRankingContext {
  /** Pending/active follow-up prompts (owner-facing text + status). */
  followups?: ReadonlyArray<{ prompt?: string | null; status?: string | null }>;
  /** Supplement trial outcomes (outcome / status). */
  supplementTrials?: ReadonlyArray<{ outcome?: string | null; status?: string | null }>;
  /** Concatenated imported vet-record text (owner-uploaded extraction). */
  vetRecordText?: string | null;
}

export interface RankedSignalComponents {
  severity: number;
  symptomMapMatch: number;
  recency: number;
  repetition: number;
  confidence: number;
  unresolvedFollowup: number;
  supplementConcern: number;
  vetRelevance: number;
}

export interface RankedSignal {
  signal: DetectedSignal;
  /** Higher = more useful to surface. Explanation/telemetry only — never urgency. */
  score: number;
  components: RankedSignalComponents;
}

// Severity dominates: the gap between tiers (500) exceeds the maximum total of
// every other term combined (<=128), so severity ordering is never overturned.
const SEVERITY_WEIGHT: Record<SignalSeverity, number> = {
  alert: 1000,
  watch: 500,
  info: 0,
};

// Owner-observable domain terms per signal — used to match a signal against
// follow-up prompts and imported vet-record text (substring, case-insensitive).
const SIGNAL_DOMAIN_TERMS: Record<SignalType, readonly string[]> = {
  appetite_drop: ["appetite", "eating", "not eating", "food", "hunger"],
  stool_change: ["stool", "diarrhea", "poop", "bowel", "feces"],
  vomiting_trend: ["vomit", "throw up", "nausea", "regurgitat"],
  weight_downtrend: ["weight", "thin", "losing weight"],
  water_urination_change: ["water", "thirst", "drinking", "urin", "pee", "hydrat"],
  mobility_pain_change: ["limp", "stiff", "mobility", "pain", "joint", "lame"],
  breathing_cough_change: ["cough", "breath", "panting", "wheez"],
  skin_ear_change: ["skin", "ear", "itch", "scratch", "odor", "rash"],
  energy_behavior_change: ["energy", "lethargy", "behavior", "tired", "lethargic"],
  possible_med_side_effect: ["medication", "med", "supplement", "side effect", "dose"],
};

// Signal types a gut/GI-oriented supplement "worse" / "side_effect" outcome is
// most relevant to. A worsening supplement trial nudges these signals up.
const SUPPLEMENT_RESPONSIVE: ReadonlySet<SignalType> = new Set<SignalType>([
  "stool_change",
  "vomiting_trend",
  "appetite_drop",
  "water_urination_change",
  "possible_med_side_effect",
]);

const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;

/** Distinct ISO dates referenced by a dedupe_key (proxy for repeated logging). */
function distinctSignalDates(dedupeKey: string): number[] {
  const matches = dedupeKey.match(ISO_DATE);
  if (!matches) return [];
  const seen = new Set<number>();
  for (const iso of matches) {
    const t = Date.parse(`${iso}T00:00:00Z`);
    if (Number.isFinite(t)) seen.add(t);
  }
  return [...seen];
}

function recencyScore(dates: number[], now: Date): number {
  if (dates.length === 0) return 0;
  const newest = Math.max(...dates);
  const days = Math.round((now.getTime() - newest) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return 0; // future/garbled → no credit
  if (days <= 0) return 25;
  if (days <= 3) return 18;
  if (days <= 7) return 12;
  if (days <= 14) return 6;
  if (days <= 30) return 3;
  return 0;
}

/** Repeated-pattern credit: more distinct logged dates → stronger pattern. */
function repetitionScore(dates: number[]): number {
  if (dates.length <= 1) return 0;
  return Math.min(dates.length, 5) * 5; // up to 25
}

function confidenceScore(confidence: number | undefined): number {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return 0;
  const clamped = Math.min(Math.max(confidence, 0), 1);
  return Math.round(clamped * 10); // up to 10
}

function matchesDomain(text: string, signalType: SignalType): boolean {
  const haystack = text.toLowerCase();
  return (SIGNAL_DOMAIN_TERMS[signalType] ?? []).some((term) =>
    haystack.includes(term),
  );
}

const UNRESOLVED_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "open",
  "active",
  "due",
  "scheduled",
  "",
]);

function unresolvedFollowupScore(
  signalType: SignalType,
  ctx: MemoryRankingContext,
): number {
  for (const f of ctx.followups ?? []) {
    const status = (f.status ?? "").toLowerCase();
    if (!UNRESOLVED_STATUSES.has(status)) continue;
    if (matchesDomain(f.prompt ?? "", signalType)) return 15;
  }
  return 0;
}

const CONCERNING_OUTCOMES: ReadonlySet<string> = new Set([
  "worse",
  "worsened",
  "side_effect",
  "side effect",
  "adverse",
]);

function supplementConcernScore(
  signalType: SignalType,
  ctx: MemoryRankingContext,
): number {
  if (!SUPPLEMENT_RESPONSIVE.has(signalType)) return 0;
  for (const t of ctx.supplementTrials ?? []) {
    const outcome = (t.outcome ?? "").toLowerCase();
    const status = (t.status ?? "").toLowerCase();
    if (CONCERNING_OUTCOMES.has(outcome) || CONCERNING_OUTCOMES.has(status)) {
      return 15;
    }
  }
  return 0;
}

function vetRelevanceScore(
  signalType: SignalType,
  ctx: MemoryRankingContext,
): number {
  const text = ctx.vetRecordText ?? "";
  if (!text.trim()) return 0;
  return matchesDomain(text, signalType) ? 8 : 0;
}

function symptomMapMatchScore(signalType: SignalType): number {
  // Signals whose pattern maps to an actual deterministic follow-up question are
  // more useful as a tiebreak than ones that map to nothing (e.g. med notes).
  const keys = BRAIN_SIGNAL_SYMPTOM_KEYS[signalType];
  return keys && keys.length > 0 ? 30 : 0;
}

/**
 * Score a single signal for tiebreak usefulness. Pure. The returned score is
 * explanation/telemetry only and is NEVER an urgency value.
 */
export function scoreDetectedSignal(
  signal: DetectedSignal,
  ctx: MemoryRankingContext = {},
  now: Date = new Date(),
): RankedSignal {
  const dates = distinctSignalDates(signal.dedupe_key ?? "");
  const components: RankedSignalComponents = {
    severity: SEVERITY_WEIGHT[signal.severity] ?? 0,
    symptomMapMatch: symptomMapMatchScore(signal.signal_type),
    recency: recencyScore(dates, now),
    repetition: repetitionScore(dates),
    confidence: confidenceScore(signal.confidence),
    unresolvedFollowup: unresolvedFollowupScore(signal.signal_type, ctx),
    supplementConcern: supplementConcernScore(signal.signal_type, ctx),
    vetRelevance: vetRelevanceScore(signal.signal_type, ctx),
  };
  const score = Object.values(components).reduce((a, b) => a + b, 0);
  return { signal, score, components };
}

/**
 * Rank detected signals by tiebreak usefulness, returning the scored records in
 * descending order. Stable for equal scores (input order preserved). Pure.
 */
export function rankDetectedSignalsWithScores(
  signals: DetectedSignal[],
  ctx: MemoryRankingContext = {},
  now: Date = new Date(),
): RankedSignal[] {
  return signals
    .map((signal, index) => ({ ranked: scoreDetectedSignal(signal, ctx, now), index }))
    .sort((a, b) => b.ranked.score - a.ranked.score || a.index - b.index)
    .map((entry) => entry.ranked);
}

/**
 * Rank detected signals and return just the signals, most-useful first. This is
 * the ordering the symptom-checker tiebreak should consume. Pure; NEVER urgency.
 */
export function rankDetectedSignals(
  signals: DetectedSignal[],
  ctx: MemoryRankingContext = {},
  now: Date = new Date(),
): DetectedSignal[] {
  return rankDetectedSignalsWithScores(signals, ctx, now).map((r) => r.signal);
}
