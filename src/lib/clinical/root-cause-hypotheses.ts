import type { SignalType } from "@/lib/dog-brain/types";
import {
  CLINICAL_KNOWLEDGE,
  URGENCY_FLOOR_RANK,
  maxUrgencyFloor,
  type KnowledgeUrgencyFloor,
} from "@/lib/clinical/knowledge-base";
import {
  matchClinicalPatterns,
  type ClinicalPattern,
} from "@/lib/clinical/clinical-patterns";

// =============================================================================
// Non-diagnostic root-cause hypotheses (DETERMINISTIC)
//
// Turns matched signal patterns + the dog's own evidence into doctor-like, but
// strictly NON-DIAGNOSTIC, hypotheses: a pattern label, the supporting evidence,
// what is still missing, the single best next question, an owner-facing urgency
// floor, and an explicit safety boundary.
//
// SAFETY CONTRACT:
//  - Labels are everyday patterns, never disease names.
//  - A hypothesis is produced ONLY when there is dog-specific evidence for at
//    least one member signal. No evidence → no hypothesis (never invents).
//  - `urgency_floor` is NON-AUTHORITATIVE (question framing only). Every
//    hypothesis carries a safety_boundary that emergency signs override it.
//  - Pure. No I/O, no model calls.
// =============================================================================

export const HYPOTHESIS_SAFETY_BOUNDARY =
  "This is not a diagnosis. Emergency signs override this pattern — if your dog shows emergency signs, contact a vet right away.";

export interface RootCauseHypothesis {
  hypothesis_label: string;
  supporting_evidence: string[];
  missing_information: string[];
  next_best_question: string;
  urgency_floor: KnowledgeUrgencyFloor;
  safety_boundary: string;
}

export interface HypothesisInput {
  /** Signal families currently present for this dog. */
  presentSignalKeys: SignalType[];
  /** Owner-facing, non-diagnostic evidence per present signal (dog-specific). */
  evidenceSummaries: Partial<Record<SignalType, string>>;
}

function knowledgeForKeys(keys: SignalType[]) {
  const present = new Set(keys);
  return CLINICAL_KNOWLEDGE.filter((e) =>
    e.trigger_signal_keys.some((k) => present.has(k)),
  );
}

function buildOne(
  pattern: ClinicalPattern,
  input: HypothesisInput,
): RootCauseHypothesis | null {
  // Supporting evidence = the dog's own summaries for member signals that are
  // both present AND have a non-empty summary. No dog-specific evidence → skip.
  const supporting_evidence = pattern.member_signal_keys
    .map((k) => input.evidenceSummaries[k]?.trim())
    .filter((s): s is string => Boolean(s));
  if (supporting_evidence.length === 0) return null;

  const relatedKnowledge = knowledgeForKeys(pattern.member_signal_keys);

  // Missing info + next question come from the strongest-floor knowledge entry
  // among the member signals, so the question targets the most useful gap.
  const strongest = relatedKnowledge
    .slice()
    .sort(
      (a, b) =>
        URGENCY_FLOOR_RANK[b.urgency_floor] - URGENCY_FLOOR_RANK[a.urgency_floor],
    )[0];

  const missing_information = Array.from(
    new Set(relatedKnowledge.flatMap((e) => e.missing_information)),
  ).slice(0, 4);

  const next_best_question =
    strongest?.owner_observable_questions[0] ??
    "What have you noticed change most for your dog recently?";

  const urgency_floor = relatedKnowledge.reduce<KnowledgeUrgencyFloor>(
    (acc, e) => maxUrgencyFloor(acc, e.urgency_floor),
    pattern.urgency_floor,
  );

  return {
    hypothesis_label: pattern.label,
    supporting_evidence,
    missing_information,
    next_best_question,
    urgency_floor,
    safety_boundary: HYPOTHESIS_SAFETY_BOUNDARY,
  };
}

/**
 * Build non-diagnostic hypotheses from matched patterns + dog-specific evidence,
 * strongest urgency floor first. Returns [] when no pattern has supporting
 * evidence. Pure.
 */
export function buildRootCauseHypotheses(
  input: HypothesisInput,
): RootCauseHypothesis[] {
  return matchClinicalPatterns(input.presentSignalKeys)
    .map((p) => buildOne(p, input))
    .filter((h): h is RootCauseHypothesis => h !== null);
}
