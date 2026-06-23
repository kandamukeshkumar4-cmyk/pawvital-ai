import type { SignalType } from "@/lib/dog-brain/types";
import type { SupplementCategory } from "@/lib/clinical/knowledge-base";

// =============================================================================
// Supplement guardrails — "vet discussion trials", never product recommendations
//
// A supplement suggestion is only ever "ask your vet whether X is appropriate
// BECAUSE this dog has Y evidence". This module defines that contract, a builder
// that refuses to produce a suggestion without dog-specific evidence, and a
// HARD-FAIL validator that rejects dosage, brand, price, disease claims, and
// evidence-free suggestions.
//
// SAFETY CONTRACT (hard fails — enforced by validateSupplementSuggestion):
//  - NO dosage (mg/ml/IU/"twice daily"/etc.)
//  - NO brand name (™/® or known brand denylist)
//  - NO price ($ / "price" / "cost")
//  - NO "prevents / cures disease" claim
//  - NO suggestion without dog-specific evidence (reason signal + memory ids +
//    evidence summary)
//  Pure. No I/O.
// =============================================================================

export interface SupplementSuggestion {
  name: string;
  category: SupplementCategory;
  purpose: string;
  why_ask_vet: string;
  evidence_summary: string;
  reason_signal_key: string;
  related_memory_ids: string[];
  safety_note: string;
  follow_up_question: string;
  follow_up_due_days: number;
  priority: "ask_vet" | "monitor";
}

export type GuardrailCode =
  | "dosage"
  | "brand"
  | "price"
  | "disease_claim"
  | "no_evidence";

export interface GuardrailViolation {
  code: GuardrailCode;
  detail: string;
}

// Dosage: a number followed by a dose unit, or an explicit frequency phrase.
const DOSAGE_UNIT = /\b\d+(\.\d+)?\s*(mg|mcg|µg|g|kg|ml|l|iu|cc|tsp|tbsp|drops?|capsules?|tablets?|scoops?|chews?)\b/i;
const DOSAGE_FREQUENCY = /\b(once|twice|thrice|[1-9]\s*x|\d+\s*times?)\b[\s\w]*\b(daily|a day|per day|day|week)\b/i;
const PRICE = /(\$\s*\d|\b\d+\s*(usd|dollars?)\b|\bprice\b|\bcost\s*\$|\bbuy\b|\bdiscount\b)/i;
const DISEASE_CLAIM = /\b(prevent|prevents|cure|cures|treat|treats|reverse|reverses|fix|fixes)\b[\s\w]*\b(disease|cancer|arthritis|infection|illness|parvo|diabetes)\b/i;
const TRADEMARK = /[®™]/;

// A small denylist of common supplement brand tokens. Not exhaustive — the
// builder never emits brands, so this is a backstop against hand-written input.
const BRAND_DENYLIST = [
  "nutramax",
  "cosequin",
  "dasuquin",
  "zesty paws",
  "purina",
  "vetriscience",
  "nordic naturals",
];

function scanText(s: string): GuardrailViolation[] {
  const out: GuardrailViolation[] = [];
  if (DOSAGE_UNIT.test(s) || DOSAGE_FREQUENCY.test(s)) {
    out.push({ code: "dosage", detail: `dosage-like text: "${s}"` });
  }
  if (PRICE.test(s)) {
    out.push({ code: "price", detail: `price-like text: "${s}"` });
  }
  if (DISEASE_CLAIM.test(s)) {
    out.push({ code: "disease_claim", detail: `disease claim: "${s}"` });
  }
  const lower = s.toLowerCase();
  if (TRADEMARK.test(s) || BRAND_DENYLIST.some((b) => lower.includes(b))) {
    out.push({ code: "brand", detail: `brand-like text: "${s}"` });
  }
  return out;
}

/**
 * HARD-FAIL validation. Returns ok=false with every violation found. A
 * suggestion is rejected if any user-visible string contains dosage/brand/price/
 * disease-claim text, or if it lacks dog-specific evidence. Pure.
 */
export function validateSupplementSuggestion(
  s: SupplementSuggestion,
): { ok: boolean; violations: GuardrailViolation[] } {
  const violations: GuardrailViolation[] = [];

  const textFields = [
    s.name,
    s.purpose,
    s.why_ask_vet,
    s.evidence_summary,
    s.safety_note,
    s.follow_up_question,
  ];
  for (const field of textFields) {
    violations.push(...scanText(field));
  }

  // Evidence gate: a suggestion MUST be tied to this dog's evidence.
  if (
    !s.reason_signal_key.trim() ||
    s.related_memory_ids.length === 0 ||
    !s.evidence_summary.trim()
  ) {
    violations.push({
      code: "no_evidence",
      detail: "missing reason_signal_key, related_memory_ids, or evidence_summary",
    });
  }

  // Dedupe by code+detail.
  const seen = new Set<string>();
  const deduped = violations.filter((v) => {
    const key = `${v.code}:${v.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { ok: deduped.length === 0, violations: deduped };
}

const SIGNAL_TO_CATEGORY: Partial<Record<SignalType, SupplementCategory>> = {
  stool_change: "gut_support",
  vomiting_trend: "gut_support",
  appetite_drop: "gut_support",
  water_urination_change: "hydration_support",
  skin_ear_change: "skin_coat",
  mobility_pain_change: "joint_mobility",
};

function categoryLabel(category: SupplementCategory): string {
  switch (category) {
    case "gut_support":
      return "gut-support";
    case "skin_coat":
      return "skin-and-coat";
    case "joint_mobility":
      return "joint-mobility";
    case "hydration_support":
      return "hydration-support";
    case "vet_only_discussion":
      return "vet-discussion";
  }
}

export interface SupplementBuildInput {
  signalKey: SignalType;
  /** Owner-facing, non-diagnostic evidence (dog-specific). Required. */
  evidenceSummary: string;
  /** Evidence ids backing this suggestion. Required (non-empty). */
  relatedMemoryIds: string[];
}

/**
 * Build a vet-discussion supplement suggestion ONLY when there is dog-specific
 * evidence. Returns null otherwise (never a generic wellness suggestion). The
 * result is guaranteed to pass validateSupplementSuggestion. Pure.
 */
export function buildSupplementSuggestion(
  input: SupplementBuildInput,
): SupplementSuggestion | null {
  if (!input.evidenceSummary.trim() || input.relatedMemoryIds.length === 0) {
    return null;
  }
  const category = SIGNAL_TO_CATEGORY[input.signalKey] ?? "vet_only_discussion";
  const label = categoryLabel(category);

  return {
    name: `${label} supplement (ask your vet)`,
    category,
    purpose: `Whether a ${label} supplement might help, decided with your vet.`,
    why_ask_vet: `Ask your vet whether a ${label} supplement is appropriate, because of the pattern noticed for your dog.`,
    evidence_summary: input.evidenceSummary.trim(),
    reason_signal_key: input.signalKey,
    related_memory_ids: [...input.relatedMemoryIds],
    safety_note:
      "Only start a supplement if your vet agrees it is appropriate for your dog.",
    follow_up_question:
      "After your vet visit, did things get better, stay the same, or get worse?",
    follow_up_due_days: 7,
    priority: "ask_vet",
  };
}
