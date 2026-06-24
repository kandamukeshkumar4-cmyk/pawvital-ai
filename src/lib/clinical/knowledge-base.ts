import type { SignalType } from "@/lib/dog-brain/types";

// =============================================================================
// Curated clinical knowledge pack (DETERMINISTIC, NON-AUTHORITATIVE)
//
// A small, hand-curated, vet-safe knowledge layer that connects owner-observable
// Dog Brain signal families to the next useful owner question, the information a
// vet will want, and an escalation floor. It replaces "let the model freestyle
// from internet search" with reviewable, deterministic data.
//
// HARD SAFETY CONTRACT (must never be violated):
//  - This is NOT a diagnosis engine and NOT the deterministic triage urgency.
//    `urgency_floor` here is an owner-facing, question-planning / vet-handoff
//    framing hint ONLY. The authoritative urgency is "low|moderate|high|
//    emergency" in triage-engine / clinical-matrix and is never derived from,
//    overridden by, or lowered by anything in this file.
//  - No medication/supplement dosages, no brand names, no prices, no disease
//    certainty, no treatment plans. Every entry lists `disallowed_outputs` to
//    make that explicit, and a test scans all curated strings for violations.
//  - Pure data + pure lookups. No runtime I/O, no model calls.
// =============================================================================

export type ClinicalDomain =
  | "gi"
  | "urinary"
  | "skin_ear"
  | "respiratory"
  | "mobility"
  | "senior"
  | "medication_supplement"
  | "toxin_exposure";

/**
 * Owner-facing escalation floor — NON-AUTHORITATIVE. Used only to order questions
 * and frame vet-handoff language. NEVER the triage decision and NEVER allowed to
 * lower a deterministic urgency. Ordered weakest→strongest for comparison.
 */
export type KnowledgeUrgencyFloor =
  | "self_monitor"
  | "watch"
  | "call_vet"
  | "urgent"
  | "emergency";

export const URGENCY_FLOOR_RANK: Record<KnowledgeUrgencyFloor, number> = {
  self_monitor: 0,
  watch: 1,
  call_vet: 2,
  urgent: 3,
  emergency: 4,
};

/** Vet-discussion supplement categories — never a product recommendation. */
export type SupplementCategory =
  | "gut_support"
  | "skin_coat"
  | "joint_mobility"
  | "hydration_support"
  | "vet_only_discussion";

export interface ClinicalKnowledgeEntry {
  id: string;
  domain: ClinicalDomain;
  /** Dog Brain signal families this entry is relevant to. */
  trigger_signal_keys: SignalType[];
  /** Plain, owner-answerable questions (no clinical jargon, no diagnosis). */
  owner_observable_questions: string[];
  urgency_floor: KnowledgeUrgencyFloor;
  /** What the owner should check / that the Brain is still missing. */
  missing_information: string[];
  /** What to tell the vet — turns owner observations into a handoff. */
  vet_handoff_points: string[];
  /** Only "ask your vet about" framing — never a product. */
  supplement_discussion_categories?: SupplementCategory[];
  /** Explicit list of outputs that must never be produced for this entry. */
  disallowed_outputs: string[];
  /** Short, citable source labels (curated guidance, not random blogs). */
  source_refs: string[];
}

const NEVER_OUTPUT_BASE = [
  "specific disease diagnosis",
  "medication or supplement dosage",
  "product brand recommendation",
  "any claim a supplement prevents or cures disease",
];

export const CLINICAL_KNOWLEDGE: readonly ClinicalKnowledgeEntry[] = [
  {
    id: "gi-stool-vomit",
    domain: "gi",
    trigger_signal_keys: ["stool_change", "vomiting_trend", "appetite_drop"],
    owner_observable_questions: [
      "Have you seen blood, or black or tarry stool, today?",
      "Is your dog able to keep water down?",
      "Has there been a recent diet change, new treat, or chance of trash or scavenging?",
      "How many days has the soft stool or vomiting been going on?",
    ],
    urgency_floor: "watch",
    missing_information: [
      "presence of blood or black/tarry stool",
      "ability to keep water down (hydration)",
      "how long symptoms have lasted",
      "any known diet change or scavenging",
    ],
    vet_handoff_points: [
      "timeline of stool changes and vomiting",
      "whether the dog can keep water down",
      "appetite and energy alongside the GI signs",
    ],
    supplement_discussion_categories: ["gut_support"],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["Cornell CVM — canine diarrhea owner guidance"],
  },
  {
    id: "urinary-frequency-thirst",
    domain: "urinary",
    trigger_signal_keys: ["water_urination_change"],
    owner_observable_questions: [
      "Is your dog straining or unable to pass urine?",
      "Have you noticed accidents, increased thirst, or a change in urine color?",
      "Is your dog drinking much more or much less than usual?",
    ],
    urgency_floor: "call_vet",
    missing_information: [
      "straining or inability to urinate (this can be an emergency in male dogs)",
      "changes in thirst or urine color",
    ],
    vet_handoff_points: [
      "any straining or inability to urinate",
      "changes in thirst and urine appearance",
    ],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General small-animal urinary owner guidance"],
  },
  {
    id: "skin-ear-itch",
    domain: "skin_ear",
    trigger_signal_keys: ["skin_ear_change"],
    owner_observable_questions: [
      "Where is the itching or licking focused, and how long has it lasted?",
      "Is there redness, odor, discharge, or a hot spot you can see?",
      "Has anything changed recently — food, environment, or grooming?",
    ],
    urgency_floor: "watch",
    missing_information: [
      "location and duration of itch or licking",
      "visible redness, odor, or discharge",
    ],
    vet_handoff_points: [
      "where the skin or ear problem is and how long it has lasted",
      "a clear photo of the affected area if you have one",
    ],
    supplement_discussion_categories: ["skin_coat"],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General small-animal dermatology owner guidance"],
  },
  {
    id: "respiratory-cough-breathing",
    domain: "respiratory",
    trigger_signal_keys: ["breathing_cough_change"],
    owner_observable_questions: [
      "Is your dog struggling to breathe, or are the gums blue or grey?",
      "Is the cough new, and is it worse with exercise or at night?",
      "Have you seen any collapse or fainting?",
    ],
    urgency_floor: "urgent",
    missing_information: [
      "any breathing difficulty or blue/grey gums (emergency signs)",
      "cough pattern and exercise tolerance",
    ],
    vet_handoff_points: [
      "breathing effort and gum color",
      "when the cough started and what makes it worse",
    ],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General small-animal respiratory owner guidance"],
  },
  {
    id: "mobility-pain",
    domain: "mobility",
    trigger_signal_keys: ["mobility_pain_change"],
    owner_observable_questions: [
      "Which leg or area seems sore, and is your dog bearing weight on it?",
      "Is the stiffness worse after rest or after exercise?",
      "Was there a recent injury, fall, or jump?",
    ],
    urgency_floor: "call_vet",
    missing_information: [
      "which limb is affected and whether the dog will bear weight",
      "any known injury",
    ],
    vet_handoff_points: [
      "which limb or area, and weight-bearing",
      "what makes the stiffness better or worse",
    ],
    supplement_discussion_categories: ["joint_mobility"],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General small-animal orthopedic owner guidance"],
  },
  {
    id: "senior-decline",
    domain: "senior",
    trigger_signal_keys: ["weight_downtrend", "appetite_drop", "energy_behavior_change"],
    owner_observable_questions: [
      "Have you noticed weight loss, appetite change, or lower energy over recent weeks?",
      "Any changes in drinking, urination, or confusion?",
      "Is your dog sleeping or pacing more than usual?",
    ],
    urgency_floor: "call_vet",
    missing_information: [
      "trend in weight, appetite, and energy over weeks",
      "changes in drinking, urination, or behavior",
    ],
    vet_handoff_points: [
      "the multi-week trend in weight, appetite, and energy",
      "any drinking, urination, or behavior changes",
    ],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General senior-dog wellness owner guidance"],
  },
  {
    id: "medication-supplement-reaction",
    domain: "medication_supplement",
    trigger_signal_keys: ["possible_med_side_effect"],
    owner_observable_questions: [
      "Did anything start, stop, or change with a medication or supplement recently?",
      "Since the change, did things get better, stay the same, or get worse?",
      "Have you noticed any new signs you think could be a side effect?",
    ],
    urgency_floor: "call_vet",
    missing_information: [
      "what changed and when",
      "whether signs improved or worsened after the change",
    ],
    vet_handoff_points: [
      "the medication or supplement change and its timing",
      "any new signs since the change",
    ],
    supplement_discussion_categories: ["vet_only_discussion"],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["WSAVA Global Nutrition Guidelines — owner framing"],
  },
  {
    id: "toxin-exposure",
    domain: "toxin_exposure",
    trigger_signal_keys: ["vomiting_trend", "energy_behavior_change"],
    owner_observable_questions: [
      "Could your dog have eaten something toxic — trash, plants, human medicine, or a sweetener like xylitol?",
      "Roughly when do you think the exposure happened?",
      "Are there new signs like tremors, drooling, or unsteadiness?",
    ],
    urgency_floor: "urgent",
    missing_information: [
      "what was eaten and when",
      "any neurologic signs (tremors, unsteadiness)",
    ],
    vet_handoff_points: [
      "what your dog may have eaten and when",
      "any tremors, drooling, or unsteadiness",
    ],
    disallowed_outputs: [...NEVER_OUTPUT_BASE],
    source_refs: ["General small-animal toxicology owner guidance"],
  },
];

/** Knowledge entries whose triggers include the given Dog Brain signal. Pure. */
export function getKnowledgeForSignal(
  signalType: SignalType,
): ClinicalKnowledgeEntry[] {
  return CLINICAL_KNOWLEDGE.filter((e) =>
    e.trigger_signal_keys.includes(signalType),
  );
}

/** Knowledge entries for a domain. Pure. */
export function getKnowledgeByDomain(
  domain: ClinicalDomain,
): ClinicalKnowledgeEntry[] {
  return CLINICAL_KNOWLEDGE.filter((e) => e.domain === domain);
}

/** The stronger of two floors (never lowers). Pure. */
export function maxUrgencyFloor(
  a: KnowledgeUrgencyFloor,
  b: KnowledgeUrgencyFloor,
): KnowledgeUrgencyFloor {
  return URGENCY_FLOOR_RANK[a] >= URGENCY_FLOOR_RANK[b] ? a : b;
}
