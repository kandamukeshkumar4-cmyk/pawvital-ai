import type { SignalType } from "@/lib/dog-brain/types";
import {
  URGENCY_FLOOR_RANK,
  type KnowledgeUrgencyFloor,
} from "@/lib/clinical/knowledge-base";

// =============================================================================
// Curated symptom-cluster patterns (DETERMINISTIC, NON-DIAGNOSTIC)
//
// Common owner-observable signal associations — e.g. "soft stool + reduced
// appetite + vomiting" reads as a digestive pattern. These are PATTERNS, not
// diseases: the labels are everyday phrases, never medical diagnoses.
//
// SAFETY CONTRACT:
//  - `urgency_floor` is the same NON-AUTHORITATIVE owner-facing floor as the
//    knowledge base — never the triage decision, never lowers a real urgency.
//  - A pattern matches only when ENOUGH of its member signals are present
//    (`min_signals`), so a single benign note never fabricates a pattern.
//  - Pure data + pure matcher. No disease names, no diagnosis.
// =============================================================================

export interface ClinicalPattern {
  id: string;
  /** Everyday, non-diagnostic label (e.g. "digestive pattern"). */
  label: string;
  member_signal_keys: SignalType[];
  /** How many member signals must be present for the pattern to apply. */
  min_signals: number;
  owner_summary: string;
  urgency_floor: KnowledgeUrgencyFloor;
  disallowed_outputs: string[];
}

const NEVER_OUTPUT = [
  "specific disease diagnosis",
  "medication or supplement dosage",
  "product brand recommendation",
];

export const CLINICAL_PATTERNS: readonly ClinicalPattern[] = [
  {
    id: "digestive_pattern",
    label: "digestive pattern",
    member_signal_keys: ["stool_change", "vomiting_trend", "appetite_drop"],
    min_signals: 2,
    owner_summary:
      "A few digestive signs are showing up together, which is worth a closer look.",
    urgency_floor: "watch",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "hydration_concern",
    label: "hydration concern",
    member_signal_keys: ["water_urination_change", "vomiting_trend", "energy_behavior_change"],
    min_signals: 2,
    owner_summary:
      "Signs that can affect hydration are appearing together — keeping water down matters here.",
    urgency_floor: "call_vet",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "appetite_energy_pattern",
    label: "appetite-energy pattern",
    member_signal_keys: ["appetite_drop", "energy_behavior_change", "weight_downtrend"],
    min_signals: 2,
    owner_summary:
      "Appetite, energy, and weight changes are tracking together over time.",
    urgency_floor: "call_vet",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "skin_itch_pattern",
    label: "skin/itch pattern",
    member_signal_keys: ["skin_ear_change"],
    min_signals: 1,
    owner_summary: "A recurring skin or ear irritation is showing up.",
    urgency_floor: "watch",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "mobility_discomfort_pattern",
    label: "mobility discomfort pattern",
    member_signal_keys: ["mobility_pain_change"],
    min_signals: 1,
    owner_summary: "Signs of stiffness or discomfort when moving are showing up.",
    urgency_floor: "call_vet",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "respiratory_pattern",
    label: "breathing pattern",
    member_signal_keys: ["breathing_cough_change"],
    min_signals: 1,
    owner_summary: "A cough or breathing change is showing up and is worth watching closely.",
    urgency_floor: "urgent",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
  {
    id: "medication_supplement_reaction_possibility",
    label: "medication/supplement reaction possibility",
    member_signal_keys: ["possible_med_side_effect"],
    min_signals: 1,
    owner_summary:
      "A recent medication or supplement change lines up with new signs.",
    urgency_floor: "call_vet",
    disallowed_outputs: [...NEVER_OUTPUT],
  },
];

/**
 * Patterns whose member signals are present at or above their `min_signals`
 * threshold, strongest urgency floor first. Pure; empty input → empty output.
 */
export function matchClinicalPatterns(
  presentSignalKeys: SignalType[],
): ClinicalPattern[] {
  const present = new Set(presentSignalKeys);
  return CLINICAL_PATTERNS.filter((p) => {
    const hits = p.member_signal_keys.filter((k) => present.has(k)).length;
    return hits >= p.min_signals;
  }).sort(
    (a, b) =>
      URGENCY_FLOOR_RANK[b.urgency_floor] - URGENCY_FLOOR_RANK[a.urgency_floor],
  );
}
