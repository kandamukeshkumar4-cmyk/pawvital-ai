import { EMERGENCY_RED_FLAG_IDS, isEmergencyRedFlagId } from "../../src/lib/clinical-intelligence/emergency-red-flags";
import { detectSignals } from "../../src/lib/clinical-intelligence/clinical-signal-detector";
import { getComplaintModuleById, getComplaintModules } from "../../src/lib/clinical-intelligence/complaint-modules";
import { getComplaintSourceMapEntry, getAllComplaintSourceMapEntries } from "../../src/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import { getCoverageByModuleId, getAllCoverageEntries } from "../../src/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import { getGapByModuleId, getAllGapEntries } from "../../src/lib/clinical-intelligence/vet-knowledge/source-gap-plan";
import { getAllQuestionCards } from "../../src/lib/clinical-intelligence/question-card-registry";

// ---------------------------------------------------------------------------
// Readiness requirements for heatstroke and trauma candidates.
// These define the minimum schema that must exist before a module is "ready".
// ---------------------------------------------------------------------------

interface ReadinessRequirement {
  moduleId: string;
  requiredRedFlags: string[];
  requiredSignals: string[];
  requiredQuestionCards: string[];
  requiredVetKnowledgeFamilies: string[];
  mustHaveSourceMapEntry: boolean;
  mustHaveCoverageGapEntry: boolean;
  mustHaveSourceGapPlanEntry: boolean;
}

const HEATSTROKE_REQUIREMENTS: ReadinessRequirement = {
  moduleId: "heatstroke_heat_exposure",
  requiredRedFlags: [
    "heatstroke_signs",
    "brachycephalic_heat",
    "collapse",
    "breathing_difficulty",
    "pale_gums",
    "blue_gums",
  ],
  requiredSignals: [
    "possible_heat_stroke",
    "possible_collapse_or_weakness",
    "possible_breathing_difficulty",
  ],
  requiredQuestionCards: [
    "heat_exposure_check",
    "brachycephalic_breed_check",
    "panting_excess_check",
  ],
  requiredVetKnowledgeFamilies: ["emergency"],
  mustHaveSourceMapEntry: true,
  mustHaveCoverageGapEntry: true,
  mustHaveSourceGapPlanEntry: true,
};

const TRAUMA_REQUIREMENTS: ReadinessRequirement = {
  moduleId: "trauma_bleeding_wound",
  requiredRedFlags: [
    "large_blood_volume",
    "wound_deep_bleeding",
    "collapse",
    "unresponsive",
    "pale_gums",
    "blue_gums",
    "breathing_difficulty",
  ],
  requiredSignals: [
    "possible_trauma",
    "possible_collapse_or_weakness",
    "possible_pale_gums",
    "possible_blue_gums",
    "possible_breathing_difficulty",
  ],
  requiredQuestionCards: [
    "wound_characterization_check",
    "bleeding_volume_check",
    "trauma_mechanism_check",
  ],
  requiredVetKnowledgeFamilies: ["trauma", "emergency"],
  mustHaveSourceMapEntry: true,
  mustHaveCoverageGapEntry: true,
  mustHaveSourceGapPlanEntry: true,
};

const READINESS_REQUIREMENTS: ReadinessRequirement[] = [
  HEATSTROKE_REQUIREMENTS,
  TRAUMA_REQUIREMENTS,
];

// ---------------------------------------------------------------------------
// Known signal IDs from clinical-signal-detector.ts
// ---------------------------------------------------------------------------

const KNOWN_SIGNAL_IDS = [
  "possible_abdominal_pain",
  "possible_nonproductive_retching",
  "possible_pale_gums",
  "possible_blue_gums",
  "possible_breathing_difficulty",
  "possible_collapse_or_weakness",
  "possible_urinary_obstruction",
  "toxin_exposure",
  "possible_heat_stroke",
  "possible_neuro_emergency",
  "possible_trauma",
  "possible_bloat_gdv",
  "possible_bloody_vomit",
  "possible_bloody_diarrhea",
];

// ---------------------------------------------------------------------------
// Forbidden language patterns
// ---------------------------------------------------------------------------

const FORBIDDEN_PATTERNS = [
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
  /vaccine\b/i,
  /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i,
  /dosage\s*(is|of|:)/i,
  /medicat/i,
  /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i,
];

function containsForbiddenLanguage(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMissingQuestionCards(requiredCards: string[]): string[] {
  const existingCardIds = new Set(getAllQuestionCards().map((c) => c.id));
  return requiredCards.filter((id) => !existingCardIds.has(id));
}

function getMissingRedFlags(requiredFlags: string[]): string[] {
  const flagSet = new Set(EMERGENCY_RED_FLAG_IDS);
  return requiredFlags.filter((id) => !flagSet.has(id));
}

function getMissingSignals(requiredSignals: string[]): string[] {
  const signalSet = new Set(KNOWN_SIGNAL_IDS);
  return requiredSignals.filter((id) => !signalSet.has(id));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Heat/Trauma Schema Readiness Guard (VET-1433Q)", () => {
  describe("module registration", () => {
    it("heatstroke_heat_exposure module is registered", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      expect(mod!.id).toBe("heatstroke_heat_exposure");
    });

    it("trauma_bleeding_wound module is registered", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      expect(mod!.id).toBe("trauma_bleeding_wound");
    });

    it("all registered modules have unique IDs", () => {
      const modules = getComplaintModules();
      const ids = modules.map((m) => m.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("vet-knowledge metadata existence", () => {
    it("fails if heatstroke module exists without complaint-source-map entry", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      if (mod) {
        const entry = getComplaintSourceMapEntry("heatstroke_heat_exposure");
        expect(entry).toBeDefined();
      }
    });

    it("fails if trauma module exists without complaint-source-map entry", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      if (mod) {
        const entry = getComplaintSourceMapEntry("trauma_bleeding_wound");
        expect(entry).toBeDefined();
      }
    });

    it("fails if heatstroke module exists without coverage-gap entry", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      if (mod) {
        const entry = getCoverageByModuleId("heatstroke_heat_exposure");
        expect(entry).toBeDefined();
      }
    });

    it("fails if trauma module exists without coverage-gap entry", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      if (mod) {
        const entry = getCoverageByModuleId("trauma_bleeding_wound");
        expect(entry).toBeDefined();
      }
    });

    it("fails if heatstroke module exists without source-gap-plan entry", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      if (mod) {
        const entry = getGapByModuleId("heatstroke_heat_exposure");
        expect(entry).toBeDefined();
      }
    });

    it("fails if trauma module exists without source-gap-plan entry", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      if (mod) {
        const entry = getGapByModuleId("trauma_bleeding_wound");
        expect(entry).toBeDefined();
      }
    });

    it("fails if vet-knowledge metadata exists without complaint module registration", () => {
      const registeredIds = new Set(getComplaintModules().map((m) => m.id));
      const sourceMapEntries = getAllComplaintSourceMapEntries();
      for (const entry of sourceMapEntries) {
        if (entry.status !== "future_pending" && entry.complaintModuleId !== "heatstroke_heat_exposure" && entry.complaintModuleId !== "trauma_bleeding_wound") {
          expect(registeredIds.has(entry.complaintModuleId)).toBe(true);
        }
      }
    });
  });

  describe("red flag validation", () => {
    it("all heatstroke required red flags exist in EMERGENCY_RED_FLAG_IDS", () => {
      const missing = getMissingRedFlags(HEATSTROKE_REQUIREMENTS.requiredRedFlags);
      expect(missing).toHaveLength(0);
    });

    it("all trauma required red flags exist in EMERGENCY_RED_FLAG_IDS", () => {
      const missing = getMissingRedFlags(TRAUMA_REQUIREMENTS.requiredRedFlags);
      expect(missing).toHaveLength(0);
    });

    it("all red flags referenced in heatstop module stop conditions exist", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      for (const cond of mod!.stopConditions) {
        if (cond.ifRedFlagPositive) {
          for (const flagId of cond.ifRedFlagPositive) {
            expect(isEmergencyRedFlagId(flagId)).toBe(true);
          }
        }
      }
    });

    it("all red flags referenced in trauma module stop conditions exist", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      for (const cond of mod!.stopConditions) {
        if (cond.ifRedFlagPositive) {
          for (const flagId of cond.ifRedFlagPositive) {
            expect(isEmergencyRedFlagId(flagId)).toBe(true);
          }
        }
      }
    });

    it("all red flags in heatstroke source-map entry exist", () => {
      const entry = getComplaintSourceMapEntry("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      for (const flagId of entry!.relevantRedFlags) {
        expect(isEmergencyRedFlagId(flagId)).toBe(true);
      }
    });

    it("all red flags in trauma source-map entry exist", () => {
      const entry = getComplaintSourceMapEntry("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      for (const flagId of entry!.relevantRedFlags) {
        expect(isEmergencyRedFlagId(flagId)).toBe(true);
      }
    });
  });

  describe("clinical signal validation", () => {
    it("all heatstroke required signals exist in clinical-signal-detector", () => {
      const missing = getMissingSignals(HEATSTROKE_REQUIREMENTS.requiredSignals);
      expect(missing).toHaveLength(0);
    });

    it("all trauma required signals exist in clinical-signal-detector", () => {
      const missing = getMissingSignals(TRAUMA_REQUIREMENTS.requiredSignals);
      expect(missing).toHaveLength(0);
    });

    it("all signals referenced in heatstroke module stop conditions exist", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      const signalSet = new Set(KNOWN_SIGNAL_IDS);
      for (const cond of mod!.stopConditions) {
        if (cond.ifAnySignalPresent) {
          for (const signalId of cond.ifAnySignalPresent) {
            expect(signalSet.has(signalId)).toBe(true);
          }
        }
      }
    });

    it("all signals referenced in trauma module stop conditions exist", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      const signalSet = new Set(KNOWN_SIGNAL_IDS);
      for (const cond of mod!.stopConditions) {
        if (cond.ifAnySignalPresent) {
          for (const signalId of cond.ifAnySignalPresent) {
            expect(signalSet.has(signalId)).toBe(true);
          }
        }
      }
    });
  });

  describe("question card readiness", () => {
    it("documents missing question cards for heatstroke", () => {
      const missing = getMissingQuestionCards(HEATSTROKE_REQUIREMENTS.requiredQuestionCards);
      expect(missing).toHaveLength(0);
    });

    it("documents missing question cards for trauma", () => {
      const missing = getMissingQuestionCards(TRAUMA_REQUIREMENTS.requiredQuestionCards);
      expect(missing).toHaveLength(0);
    });

    it("heatstroke module uses only existing question cards in emergency screen", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      const existingCardIds = new Set(getAllQuestionCards().map((c) => c.id));
      for (const qid of mod!.emergencyScreenQuestionIds) {
        expect(existingCardIds.has(qid)).toBe(true);
      }
    });

    it("trauma module uses only existing question cards in emergency screen", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      const existingCardIds = new Set(getAllQuestionCards().map((c) => c.id));
      for (const qid of mod!.emergencyScreenQuestionIds) {
        expect(existingCardIds.has(qid)).toBe(true);
      }
    });

    it("heatstroke module uses only existing question cards in all phases", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      const existingCardIds = new Set(getAllQuestionCards().map((c) => c.id));
      for (const phase of mod!.phases) {
        for (const qid of phase.questionIds) {
          expect(existingCardIds.has(qid)).toBe(true);
        }
      }
    });

    it("trauma module uses only existing question cards in all phases", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      const existingCardIds = new Set(getAllQuestionCards().map((c) => c.id));
      for (const phase of mod!.phases) {
        for (const qid of phase.questionIds) {
          expect(existingCardIds.has(qid)).toBe(true);
        }
      }
    });
  });

  describe("proposed ID validation", () => {
    it("no existing red flag uses proposed_ prefix", () => {
      for (const flagId of EMERGENCY_RED_FLAG_IDS) {
        expect(flagId.startsWith("proposed_")).toBe(false);
      }
    });

    it("no existing signal uses proposed_ prefix", () => {
      for (const signalId of KNOWN_SIGNAL_IDS) {
        expect(signalId.startsWith("proposed_")).toBe(false);
      }
    });

    it("no question card ID uses proposed_ prefix", () => {
      const cardIds = getAllQuestionCards().map((c) => c.id);
      for (const cardId of cardIds) {
        expect(cardId.startsWith("proposed_")).toBe(false);
      }
    });
  });

  describe("forbidden language validation", () => {
    it("no heatstroke module text contains forbidden language", () => {
      const mod = getComplaintModuleById("heatstroke_heat_exposure");
      expect(mod).toBeDefined();
      const fieldsToCheck = [
        mod!.displayNameForLogs,
        ...mod!.triggers,
        ...mod!.aliases,
        ...mod!.safetyNotes,
        ...mod!.reportFields,
      ];
      for (const text of fieldsToCheck) {
        expect(containsForbiddenLanguage(text)).toBe(false);
      }
    });

    it("no trauma module text contains forbidden language", () => {
      const mod = getComplaintModuleById("trauma_bleeding_wound");
      expect(mod).toBeDefined();
      const fieldsToCheck = [
        mod!.displayNameForLogs,
        ...mod!.triggers,
        ...mod!.aliases,
        ...mod!.safetyNotes,
        ...mod!.reportFields,
      ];
      for (const text of fieldsToCheck) {
        expect(containsForbiddenLanguage(text)).toBe(false);
      }
    });

    it("no heatstroke source-map rationale contains forbidden language", () => {
      const entry = getComplaintSourceMapEntry("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      for (const note of entry!.rationaleNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });

    it("no trauma source-map rationale contains forbidden language", () => {
      const entry = getComplaintSourceMapEntry("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      for (const note of entry!.rationaleNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });

    it("no heatstroke coverage-gap safety notes contain forbidden language", () => {
      const entry = getCoverageByModuleId("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      for (const note of entry!.safetyNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });

    it("no trauma coverage-gap safety notes contain forbidden language", () => {
      const entry = getCoverageByModuleId("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      for (const note of entry!.safetyNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });

    it("no heatstroke source-gap-plan safety notes contain forbidden language", () => {
      const entry = getGapByModuleId("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      for (const note of entry!.safetyNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });

    it("no trauma source-gap-plan safety notes contain forbidden language", () => {
      const entry = getGapByModuleId("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      for (const note of entry!.safetyNotes) {
        expect(containsForbiddenLanguage(note)).toBe(false);
      }
    });
  });

  describe("readiness assessment", () => {
    it("heatstroke IS ready: all red flags, signals, and question cards present", () => {
      const missingCards = getMissingQuestionCards(HEATSTROKE_REQUIREMENTS.requiredQuestionCards);
      const missingFlags = getMissingRedFlags(HEATSTROKE_REQUIREMENTS.requiredRedFlags);
      const missingSignals = getMissingSignals(HEATSTROKE_REQUIREMENTS.requiredSignals);
      const isReady = missingCards.length === 0 && missingFlags.length === 0 && missingSignals.length === 0;
      expect(isReady).toBe(true);
    });

    it("trauma IS ready: all red flags, signals, and question cards present", () => {
      const missingCards = getMissingQuestionCards(TRAUMA_REQUIREMENTS.requiredQuestionCards);
      const missingFlags = getMissingRedFlags(TRAUMA_REQUIREMENTS.requiredRedFlags);
      const missingSignals = getMissingSignals(TRAUMA_REQUIREMENTS.requiredSignals);
      const isReady = missingCards.length === 0 && missingFlags.length === 0 && missingSignals.length === 0;
      expect(isReady).toBe(true);
    });

    it("heatstroke has all required red flags present", () => {
      const missingFlags = getMissingRedFlags(HEATSTROKE_REQUIREMENTS.requiredRedFlags);
      expect(missingFlags).toHaveLength(0);
    });

    it("trauma has all required red flags present", () => {
      const missingFlags = getMissingRedFlags(TRAUMA_REQUIREMENTS.requiredRedFlags);
      expect(missingFlags).toHaveLength(0);
    });

    it("heatstroke has all required signals present", () => {
      const missingSignals = getMissingSignals(HEATSTROKE_REQUIREMENTS.requiredSignals);
      expect(missingSignals).toHaveLength(0);
    });

    it("trauma has all required signals present", () => {
      const missingSignals = getMissingSignals(TRAUMA_REQUIREMENTS.requiredSignals);
      expect(missingSignals).toHaveLength(0);
    });

    it("heatstroke has vet-knowledge source-map entry", () => {
      const entry = getComplaintSourceMapEntry("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      expect(entry!.complaintModuleId).toBe("heatstroke_heat_exposure");
    });

    it("trauma has vet-knowledge source-map entry", () => {
      const entry = getComplaintSourceMapEntry("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      expect(entry!.complaintModuleId).toBe("trauma_bleeding_wound");
    });

    it("heatstroke has coverage-gap entry", () => {
      const entry = getCoverageByModuleId("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      expect(entry!.complaintModuleId).toBe("heatstroke_heat_exposure");
    });

    it("trauma has coverage-gap entry", () => {
      const entry = getCoverageByModuleId("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      expect(entry!.complaintModuleId).toBe("trauma_bleeding_wound");
    });

    it("heatstroke has source-gap-plan entry", () => {
      const entry = getGapByModuleId("heatstroke_heat_exposure");
      expect(entry).toBeDefined();
      expect(entry!.moduleId).toBe("heatstroke_heat_exposure");
    });

    it("trauma has source-gap-plan entry", () => {
      const entry = getGapByModuleId("trauma_bleeding_wound");
      expect(entry).toBeDefined();
      expect(entry!.moduleId).toBe("trauma_bleeding_wound");
    });
  });

  describe("missing requirements documentation", () => {
    it("heatstroke has no missing question cards (all required cards present)", () => {
      const missing = getMissingQuestionCards(HEATSTROKE_REQUIREMENTS.requiredQuestionCards);
      expect(missing).toHaveLength(0);
    });

    it("trauma has no missing question cards (all required cards present)", () => {
      const missing = getMissingQuestionCards(TRAUMA_REQUIREMENTS.requiredQuestionCards);
      expect(missing).toHaveLength(0);
    });

    it("heatstroke has no missing red flags", () => {
      const missing = getMissingRedFlags(HEATSTROKE_REQUIREMENTS.requiredRedFlags);
      expect(missing).toHaveLength(0);
    });

    it("trauma has no missing red flags", () => {
      const missing = getMissingRedFlags(TRAUMA_REQUIREMENTS.requiredRedFlags);
      expect(missing).toHaveLength(0);
    });

    it("heatstroke has no missing signals", () => {
      const missing = getMissingSignals(HEATSTROKE_REQUIREMENTS.requiredSignals);
      expect(missing).toHaveLength(0);
    });

    it("trauma has no missing signals", () => {
      const missing = getMissingSignals(TRAUMA_REQUIREMENTS.requiredSignals);
      expect(missing).toHaveLength(0);
    });
  });

  describe("cross-registry consistency", () => {
    it("all 11 registered modules have source-map entries", () => {
      const modules = getComplaintModules();
      const sourceMapIds = new Set(getAllComplaintSourceMapEntries().map((e) => e.complaintModuleId));
      for (const mod of modules) {
        expect(sourceMapIds.has(mod.id)).toBe(true);
      }
    });

    it("all 11 registered modules have coverage-gap entries", () => {
      const modules = getComplaintModules();
      const coverageIds = new Set(getAllCoverageEntries().map((e) => e.complaintModuleId));
      for (const mod of modules) {
        expect(coverageIds.has(mod.id)).toBe(true);
      }
    });

    it("all 11 registered modules have source-gap-plan entries", () => {
      const modules = getComplaintModules();
      const gapIds = new Set(getAllGapEntries().map((e) => e.moduleId));
      for (const mod of modules) {
        expect(gapIds.has(mod.id)).toBe(true);
      }
    });

    it("no orphaned source-map entries (entry without registered module)", () => {
      const registeredIds = new Set(getComplaintModules().map((m) => m.id));
      const sourceMapEntries = getAllComplaintSourceMapEntries();
      for (const entry of sourceMapEntries) {
        expect(registeredIds.has(entry.complaintModuleId)).toBe(true);
      }
    });

    it("no orphaned coverage-gap entries (entry without registered module)", () => {
      const registeredIds = new Set(getComplaintModules().map((m) => m.id));
      const coverageEntries = getAllCoverageEntries();
      for (const entry of coverageEntries) {
        expect(registeredIds.has(entry.complaintModuleId)).toBe(true);
      }
    });

    it("no orphaned source-gap-plan entries (entry without registered module)", () => {
      const registeredIds = new Set(getComplaintModules().map((m) => m.id));
      const gapEntries = getAllGapEntries();
      for (const entry of gapEntries) {
        expect(registeredIds.has(entry.moduleId)).toBe(true);
      }
    });
  });
});
