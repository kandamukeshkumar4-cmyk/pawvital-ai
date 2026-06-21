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
