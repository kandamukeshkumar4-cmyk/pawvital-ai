import type { DetectedSignal, SignalType } from "@/lib/dog-brain/types";

// =============================================================================
// Dog Brain → symptom-checker question priority (SUPPORTIVE TIEBREAK ONLY)
//
// Maps each owner-observable Dog Brain signal to the deterministic SYMPTOM_MAP
// keys whose follow-up questions are clinically relevant to that pattern. The
// symptom checker consumes these keys ONLY as a tiebreak: the current turn's
// complaint is always asked first; Brain memory only surfaces an *already-legal*
// follow-up after the complaint is exhausted, before the generic fallback.
//
// Safety contract (must never be violated):
//  - These keys NEVER invent questions — they are looked up against SYMPTOM_MAP,
//    so an unknown / follow-up-less key degrades to a no-op.
//  - They NEVER change the candidate set, NEVER reorder red-flag / pending
//    clarification selection, and NEVER reach deterministic urgency logic.
//  - Pure + side-effect free; an empty signal list yields an empty array, which
//    makes the downstream selector byte-identical to its pre-Brain behavior.
// =============================================================================

const BRAIN_SIGNAL_SYMPTOM_KEYS: Record<SignalType, readonly string[]> = {
  appetite_drop: ["not_eating"],
  // Daily-log stool is normal/soft/diarrhea/none/blood — never constipation — so
  // a stool_change signal always points at loose/bloody stool, not constipation.
  stool_change: ["diarrhea", "blood_in_stool"],
  vomiting_trend: ["vomiting"],
  weight_downtrend: ["weight_loss"],
  water_urination_change: ["drinking_more", "urination_problem"],
  mobility_pain_change: ["limping", "generalized_stiffness"],
  breathing_cough_change: ["coughing", "difficulty_breathing"],
  skin_ear_change: ["excessive_scratching", "recurrent_skin", "recurrent_ear"],
  energy_behavior_change: ["lethargy", "behavior_change"],
  // No owner-observable symptom maps cleanly to a medication note; it informs
  // the report/follow-up loop, not which clinical question to ask next.
  possible_med_side_effect: [],
};

const SEVERITY_RANK: Record<DetectedSignal["severity"], number> = {
  alert: 0,
  watch: 1,
  info: 2,
};

/**
 * Owner-friendly, non-diagnostic evidence for a single Brain-prioritised symptom
 * key — explanation-only metadata that NEVER alters question selection, urgency,
 * or any control state. Surfaced to the owner as a calm "Why this came up" line.
 */
export interface BrainSymptomEvidence {
  /** The Dog Brain signal type that made this symptom relevant. */
  signal_type: SignalType;
  /** Owner-friendly, non-diagnostic summary derived from the signal. */
  evidence_summary: string;
  /** Relative phrase like "in recent check-ins"; omitted when no date is reliable. */
  evidence_date_range?: string;
}

/** Match an ISO date (YYYY-MM-DD) anywhere in a signal's dedupe_key. */
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;

/**
 * Derive a relative date phrase from the dates a signal embeds in its dedupe_key.
 * Returns undefined when no reliable date can be parsed (NEVER guesses).
 */
function deriveEvidenceDateRange(
  dedupeKey: string,
  now: Date,
): string | undefined {
  const matches = dedupeKey.match(ISO_DATE);
  if (!matches || matches.length === 0) {
    return undefined;
  }

  const times = matches
    .map((iso) => Date.parse(`${iso}T00:00:00Z`))
    .filter((t) => Number.isFinite(t));
  if (times.length === 0) {
    return undefined;
  }

  // Use the most recent date the signal references.
  const newest = Math.max(...times);
  const days = Math.round((now.getTime() - newest) / 86_400_000);

  if (!Number.isFinite(days) || days < 0) {
    // A future/garbled date is not trustworthy — omit rather than guess.
    return undefined;
  }
  if (days === 0) return "today";
  if (days === 1) return "about a day ago";
  if (days <= 30) return `about ${days} days ago`;
  return "in recent check-ins";
}

/**
 * Map each Brain-prioritised symptom key back to the source signal plus an
 * owner-friendly, non-diagnostic evidence summary. Pure + side-effect free.
 *
 * Safety contract:
 *  - No disease names, no diagnosis — the summary is the signal's own
 *    owner_message (already owner-facing) plus an optional relative date.
 *  - An unknown / unmapped signal degrades to a no-op (skipped, never thrown).
 *  - Highest-severity signal wins when two signals map to the same symptom key,
 *    matching brainPrioritySymptomsFromSignals' ordering.
 */
export function brainPrioritySymptomEvidence(
  signals: DetectedSignal[],
  now: Date = new Date(),
): Record<string, BrainSymptomEvidence> {
  const ordered = [...signals].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );

  const evidence: Record<string, BrainSymptomEvidence> = {};
  for (const signal of ordered) {
    const keys = BRAIN_SIGNAL_SYMPTOM_KEYS[signal.signal_type];
    if (!keys || keys.length === 0) continue;

    const summary = (signal.owner_message ?? "").trim();
    if (!summary) continue;

    const dateRange = deriveEvidenceDateRange(signal.dedupe_key ?? "", now);

    for (const key of keys) {
      // First (highest-severity) signal to claim a key wins — don't overwrite.
      if (evidence[key]) continue;
      evidence[key] = {
        signal_type: signal.signal_type,
        evidence_summary: summary,
        ...(dateRange ? { evidence_date_range: dateRange } : {}),
      };
    }
  }
  return evidence;
}

/**
 * Derive the supportive symptom keys the Dog Brain would like the symptom
 * checker to consider — highest-severity signals first, deduped. Pure.
 */
export function brainPrioritySymptomsFromSignals(
  signals: DetectedSignal[],
): string[] {
  const ordered = [...signals].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );

  const keys: string[] = [];
  for (const signal of ordered) {
    for (const key of BRAIN_SIGNAL_SYMPTOM_KEYS[signal.signal_type] ?? []) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}
