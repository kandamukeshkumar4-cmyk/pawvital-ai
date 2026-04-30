import type { VetKnowledgePublisher } from "./source-registry";
import { getComplaintModuleById, getComplaintModules } from "../complaint-modules";

export type CoverageLevel = "strong" | "partial" | "missing";
export type OwnerVisibleCitationLevel = "available" | "emergency_only" | "missing";
export type CoverageEntryStatus = "active" | "future_pending";

export interface CoverageGapEntry {
  complaintModuleId: string;
  status: CoverageEntryStatus;
  sourceCoverage: CoverageLevel;
  ownerVisibleCitationCoverage: OwnerVisibleCitationLevel;
  missingSourceNeeds: string[];
  recommendedPublisherTypes: VetKnowledgePublisher[];
  safetyNotes: string[];
}

export interface CoverageValidationResult {
  valid: boolean;
  duplicateIds: string[];
  missingModuleIds: string[];
  safetyNoteViolations: string[];
}

const SAFETY_NOTE_FORBIDDEN_PATTERNS = [
  /diagnos/i,
  /treat(ment|ments|ing|ed)?\b/i,
  /prescri/i,
  /surg/i,
  /prognosis/i,
  /\bdisease\b/i,
  /\bcure\b/i,
  /\bheal/i,
  /antibiotic/i,
  /steroid/i,
  /vaccine/i,
  /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /dosage\s*(is|of|:)/i,
];

function containsForbiddenSafetyLanguage(text: string): boolean {
  return SAFETY_NOTE_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

const COVERAGE_GAP_REGISTRY: CoverageGapEntry[] = [
  {
    complaintModuleId: "skin_itching_allergy",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "dedicated dermatology source",
      "allergy differentiation guidance",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell"],
    safetyNotes: [
      "Skin complaints may indicate systemic allergic reaction; escalate if breathing difficulty or facial swelling present.",
      "Do not apply topical products without veterinary assessment.",
    ],
  },
  {
    complaintModuleId: "gi_vomiting_diarrhea",
    status: "active",
    sourceCoverage: "strong",
    ownerVisibleCitationCoverage: "available",
    missingSourceNeeds: [],
    recommendedPublisherTypes: [],
    safetyNotes: [
      "Persistent vomiting with inability to retain water requires urgent veterinary assessment.",
      "Blood in vomit or stool is an emergency red flag.",
    ],
  },
  {
    complaintModuleId: "limping_mobility_pain",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "dedicated musculoskeletal source",
      "orthopedic triage guidance",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell", "AAHA"],
    safetyNotes: [
      "Non-weight-bearing lameness after trauma warrants urgent evaluation.",
      "Do not recommend splinting or bandaging without veterinary guidance.",
    ],
  },
  {
    complaintModuleId: "respiratory_distress",
    status: "active",
    sourceCoverage: "strong",
    ownerVisibleCitationCoverage: "available",
    missingSourceNeeds: [],
    recommendedPublisherTypes: [],
    safetyNotes: [
      "Any breathing difficulty is a potential emergency; prioritize airway assessment.",
      "Blue or pale gums indicate systemic compromise requiring immediate care.",
    ],
  },
  {
    complaintModuleId: "seizure_collapse_neuro",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "dedicated neurology source",
      "seizure first-aid guidance",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell"],
    safetyNotes: [
      "Prolonged seizure activity (>5 minutes) is a life-threatening emergency.",
      "Do not place objects in the pet mouth during a seizure.",
    ],
  },
  {
    complaintModuleId: "urinary_obstruction",
    status: "active",
    sourceCoverage: "missing",
    ownerVisibleCitationCoverage: "missing",
    missingSourceNeeds: [
      "dedicated urinary/renal source",
      "blockage recognition guidance",
      "feline urinary syndrome reference",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell", "AAHA"],
    safetyNotes: [
      "Urinary blockage is a life-threatening emergency requiring immediate veterinary care.",
      "No urine output for 24 hours indicates possible obstruction.",
    ],
  },
  {
    complaintModuleId: "toxin_poisoning_exposure",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "dedicated toxicology source",
      "ASPCA poison control reference",
      "common household toxin list",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell", "AVMA"],
    safetyNotes: [
      "Confirmed toxin ingestion requires immediate veterinary contact.",
      "Do not induce vomiting without professional guidance.",
    ],
  },
  {
    complaintModuleId: "bloat_gdv",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "breed risk stratification guidance",
      "post-operative care reference",
    ],
    recommendedPublisherTypes: ["Cornell", "Merck", "AAHA"],
    safetyNotes: [
      "GDV is an immediate emergency; unproductive retching with distended abdomen requires urgent veterinary care.",
    ],
  },
  {
    complaintModuleId: "collapse_weakness",
    status: "active",
    sourceCoverage: "partial",
    ownerVisibleCitationCoverage: "emergency_only",
    missingSourceNeeds: [
      "dedicated collapse/weakness differential source",
      "cardiac emergency guidance",
      "metabolic crisis reference",
    ],
    recommendedPublisherTypes: ["Merck", "Cornell", "AAHA"],
    safetyNotes: [
      "Sudden collapse with pale gums is a life-threatening emergency.",
      "Do not attempt to feed or give water to an unconscious pet.",
    ],
  },
];

const MODULE_ID_TO_ENTRY = new Map<string, CoverageGapEntry>(
  COVERAGE_GAP_REGISTRY.map((entry) => [entry.complaintModuleId, entry])
);

function defensiveCloneEntry(entry: CoverageGapEntry): CoverageGapEntry {
  return {
    ...entry,
    missingSourceNeeds: [...entry.missingSourceNeeds],
    recommendedPublisherTypes: [...entry.recommendedPublisherTypes],
    safetyNotes: [...entry.safetyNotes],
  };
}

export function getAllCoverageEntries(): CoverageGapEntry[] {
  return COVERAGE_GAP_REGISTRY.map(defensiveCloneEntry);
}

export function getCoverageByModuleId(
  moduleId: string
): CoverageGapEntry | undefined {
  const entry = MODULE_ID_TO_ENTRY.get(moduleId);
  return entry ? defensiveCloneEntry(entry) : undefined;
}

export function filterBySourceCoverage(
  level: CoverageLevel
): CoverageGapEntry[] {
  return COVERAGE_GAP_REGISTRY.filter(
    (e) => e.sourceCoverage === level
  ).map(defensiveCloneEntry);
}

export function filterByOwnerVisibleCitationCoverage(
  level: OwnerVisibleCitationLevel
): CoverageGapEntry[] {
  return COVERAGE_GAP_REGISTRY.filter(
    (e) => e.ownerVisibleCitationCoverage === level
  ).map(defensiveCloneEntry);
}

export function validateCoverageRegistry(): CoverageValidationResult {
  const duplicateIds: string[] = [];
  const missingModuleIds: string[] = [];
  const safetyNoteViolations: string[] = [];

  const seenIds = new Set<string>();

  for (const entry of COVERAGE_GAP_REGISTRY) {
    if (seenIds.has(entry.complaintModuleId)) {
      duplicateIds.push(entry.complaintModuleId);
    }
    seenIds.add(entry.complaintModuleId);

    if (entry.status !== "future_pending") {
      const complaintModule = getComplaintModuleById(entry.complaintModuleId);
      if (!complaintModule) {
        missingModuleIds.push(entry.complaintModuleId);
      }
    }

    for (const note of entry.safetyNotes) {
      if (containsForbiddenSafetyLanguage(note)) {
        safetyNoteViolations.push(
          `${entry.complaintModuleId}: "${note}"`
        );
      }
    }
  }

  const registeredModules = getComplaintModules();
  const registeredIds = new Set(registeredModules.map((m) => m.id));

  for (const entry of COVERAGE_GAP_REGISTRY) {
    if (
      entry.status !== "future_pending" &&
      !registeredIds.has(entry.complaintModuleId)
    ) {
      if (!missingModuleIds.includes(entry.complaintModuleId)) {
        missingModuleIds.push(entry.complaintModuleId);
      }
    }
  }

  const valid =
    duplicateIds.length === 0 &&
    missingModuleIds.length === 0 &&
    safetyNoteViolations.length === 0;

  return {
    valid,
    duplicateIds,
    missingModuleIds,
    safetyNoteViolations,
  };
}
