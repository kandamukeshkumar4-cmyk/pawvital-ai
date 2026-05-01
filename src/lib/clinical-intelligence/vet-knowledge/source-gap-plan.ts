import type { VetKnowledgePublisher } from "./source-registry";
import { getComplaintModuleById, getComplaintModules } from "../complaint-modules";
import { getCoverageByModuleId, getAllCoverageEntries, type CoverageLevel, type OwnerVisibleCitationLevel } from "./coverage-gap-registry";

export type GapPriority = "critical" | "high" | "medium" | "low" | "not_needed";

export interface SourceGapPlanEntry {
  moduleId: string;
  coverageStatus: CoverageLevel;
  missingSourceTopics: string[];
  neededPublisherTypes: VetKnowledgePublisher[];
  ownerVisibleCitationNeed: OwnerVisibleCitationLevel;
  internalReasoningNeed: boolean;
  priority: GapPriority;
  safetyNotes: string[];
}

export interface GapPlanValidationResult {
  valid: boolean;
  duplicateIds: string[];
  missingModuleIds: string[];
  safetyNoteViolations: string[];
}

const FORBIDDEN_CLINICAL_PATTERNS = [
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
  /medicat/i,
  /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i,
];

function containsForbiddenClinicalLanguage(text: string): boolean {
  return FORBIDDEN_CLINICAL_PATTERNS.some((pattern) => pattern.test(text));
}

function derivePriority(
  coverageStatus: CoverageLevel,
  ownerVisibleCitationNeed: OwnerVisibleCitationLevel
): GapPriority {
  if (coverageStatus === "missing") return "critical";
  if (coverageStatus === "partial" && ownerVisibleCitationNeed === "missing")
    return "high";
  if (coverageStatus === "partial" && ownerVisibleCitationNeed === "emergency_only")
    return "high";
  if (coverageStatus === "partial") return "medium";
  return "not_needed";
}

function buildGapEntries(): SourceGapPlanEntry[] {
  const coverageEntries = getAllCoverageEntries();

  return coverageEntries.map((coverage) => {
    const internalReasoningNeed = coverage.sourceCoverage !== "strong";

    return {
      moduleId: coverage.complaintModuleId,
      coverageStatus: coverage.sourceCoverage,
      missingSourceTopics: coverage.missingSourceNeeds,
      neededPublisherTypes: coverage.recommendedPublisherTypes,
      ownerVisibleCitationNeed: coverage.ownerVisibleCitationCoverage,
      internalReasoningNeed,
      priority: derivePriority(
        coverage.sourceCoverage,
        coverage.ownerVisibleCitationCoverage
      ),
      safetyNotes: coverage.safetyNotes,
    };
  });
}

const SOURCE_GAP_PLAN: SourceGapPlanEntry[] = buildGapEntries();

const MODULE_ID_TO_GAP = new Map<string, SourceGapPlanEntry>(
  SOURCE_GAP_PLAN.map((entry) => [entry.moduleId, entry])
);

function defensiveCloneEntry(entry: SourceGapPlanEntry): SourceGapPlanEntry {
  return {
    ...entry,
    missingSourceTopics: [...entry.missingSourceTopics],
    neededPublisherTypes: [...entry.neededPublisherTypes],
    safetyNotes: [...entry.safetyNotes],
  };
}

export function getAllGapEntries(): SourceGapPlanEntry[] {
  return SOURCE_GAP_PLAN.map(defensiveCloneEntry);
}

export function getGapByModuleId(
  moduleId: string
): SourceGapPlanEntry | undefined {
  const entry = MODULE_ID_TO_GAP.get(moduleId);
  return entry ? defensiveCloneEntry(entry) : undefined;
}

export function filterByPriority(level: GapPriority): SourceGapPlanEntry[] {
  return SOURCE_GAP_PLAN.filter((e) => e.priority === level).map(
    defensiveCloneEntry
  );
}

export function filterByCoverageStatus(
  status: CoverageLevel
): SourceGapPlanEntry[] {
  return SOURCE_GAP_PLAN.filter((e) => e.coverageStatus === status).map(
    defensiveCloneEntry
  );
}

export function getCriticalGaps(): SourceGapPlanEntry[] {
  return filterByPriority("critical");
}

export function getHighPriorityGaps(): SourceGapPlanEntry[] {
  return filterByPriority("high");
}

export function validateGapPlan(): GapPlanValidationResult {
  const duplicateIds: string[] = [];
  const missingModuleIds: string[] = [];
  const safetyNoteViolations: string[] = [];

  const seenIds = new Set<string>();

  for (const entry of SOURCE_GAP_PLAN) {
    if (seenIds.has(entry.moduleId)) {
      duplicateIds.push(entry.moduleId);
    }
    seenIds.add(entry.moduleId);

    const complaintModule = getComplaintModuleById(entry.moduleId);
    if (!complaintModule) {
      missingModuleIds.push(entry.moduleId);
    }

    for (const note of entry.safetyNotes) {
      if (containsForbiddenClinicalLanguage(note)) {
        safetyNoteViolations.push(`${entry.moduleId}: "${note}"`);
      }
    }
  }

  const registeredModules = getComplaintModules();
  const registeredIds = new Set(registeredModules.map((m) => m.id));

  for (const entry of SOURCE_GAP_PLAN) {
    if (!registeredIds.has(entry.moduleId)) {
      if (!missingModuleIds.includes(entry.moduleId)) {
        missingModuleIds.push(entry.moduleId);
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
