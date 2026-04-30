import {
  getAllCoverageEntries,
  getCoverageByModuleId,
  filterBySourceCoverage,
  filterByOwnerVisibleCitationCoverage,
  validateCoverageRegistry,
} from "@/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import { getComplaintModuleById, getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";

const ACTIVE_MODULE_IDS = [
  "skin_itching_allergy",
  "gi_vomiting_diarrhea",
  "limping_mobility_pain",
  "respiratory_distress",
  "seizure_collapse_neuro",
  "urinary_obstruction",
  "toxin_poisoning_exposure",
  "bloat_gdv",
  "collapse_weakness",
];

const FUTURE_PENDING_IDS: string[] = [];

const ALL_MODULE_IDS = [...ACTIVE_MODULE_IDS, ...FUTURE_PENDING_IDS];

describe("vet knowledge coverage gap registry", () => {
  describe("all modules are covered", () => {
    it("exports entries for all 9 complaint modules (all active)", () => {
      const entries = getAllCoverageEntries();
      expect(entries.length).toBe(9);
    });

    it.each(ALL_MODULE_IDS)("covers module %s", (moduleId) => {
      const entry = getCoverageByModuleId(moduleId);
      expect(entry).toBeDefined();
      expect(entry?.complaintModuleId).toBe(moduleId);
    });
  });

  describe("active modules exist in complaint module registry", () => {
    it.each(ACTIVE_MODULE_IDS)("active module %s exists in registry", (moduleId) => {
      const complaintModule = getComplaintModuleById(moduleId);
      expect(complaintModule).toBeDefined();
    });

    it("all registered modules have a coverage entry", () => {
      const registeredModules = getComplaintModules();
      const coveredIds = new Set(
        getAllCoverageEntries().map((e) => e.complaintModuleId)
      );

      for (const complaintModule of registeredModules) {
        expect(coveredIds.has(complaintModule.id)).toBe(true);
      }
    });
  });

  describe("future_pending modules", () => {
    it("no modules are currently future_pending", () => {
      const entries = getAllCoverageEntries();
      const pending = entries.filter((e) => e.status === "future_pending");
      expect(pending.length).toBe(0);
    });
  });

  describe("source coverage levels", () => {
    it("gi_vomiting_diarrhea has strong source coverage", () => {
      const entry = getCoverageByModuleId("gi_vomiting_diarrhea");
      expect(entry?.sourceCoverage).toBe("strong");
    });

    it("respiratory_distress has strong source coverage", () => {
      const entry = getCoverageByModuleId("respiratory_distress");
      expect(entry?.sourceCoverage).toBe("strong");
    });

    it("skin_itching_allergy has partial source coverage", () => {
      const entry = getCoverageByModuleId("skin_itching_allergy");
      expect(entry?.sourceCoverage).toBe("partial");
    });

    it("limping_mobility_pain has partial source coverage", () => {
      const entry = getCoverageByModuleId("limping_mobility_pain");
      expect(entry?.sourceCoverage).toBe("partial");
    });

    it("urinary_obstruction has missing source coverage", () => {
      const entry = getCoverageByModuleId("urinary_obstruction");
      expect(entry?.sourceCoverage).toBe("missing");
    });
  });

  describe("owner visible citation coverage", () => {
    it("gi_vomiting_diarrhea has available owner-visible citations", () => {
      const entry = getCoverageByModuleId("gi_vomiting_diarrhea");
      expect(entry?.ownerVisibleCitationCoverage).toBe("available");
    });

    it("respiratory_distress has available owner-visible citations", () => {
      const entry = getCoverageByModuleId("respiratory_distress");
      expect(entry?.ownerVisibleCitationCoverage).toBe("available");
    });

    it("skin_itching_allergy has emergency_only owner-visible citations", () => {
      const entry = getCoverageByModuleId("skin_itching_allergy");
      expect(entry?.ownerVisibleCitationCoverage).toBe("emergency_only");
    });

    it("urinary_obstruction has missing owner-visible citations", () => {
      const entry = getCoverageByModuleId("urinary_obstruction");
      expect(entry?.ownerVisibleCitationCoverage).toBe("missing");
    });
  });

  describe("missing source needs", () => {
    it.each(ACTIVE_MODULE_IDS)("module %s has missingSourceNeeds array", (moduleId) => {
      const entry = getCoverageByModuleId(moduleId);
      expect(Array.isArray(entry?.missingSourceNeeds)).toBe(true);
    });

    it("strong coverage modules may have empty missingSourceNeeds", () => {
      const strongEntries = filterBySourceCoverage("strong");
      for (const entry of strongEntries) {
        expect(Array.isArray(entry.missingSourceNeeds)).toBe(true);
      }
    });

    it("missing coverage modules have non-empty missingSourceNeeds", () => {
      const missingEntries = filterBySourceCoverage("missing");
      for (const entry of missingEntries) {
        expect(entry.missingSourceNeeds.length).toBeGreaterThan(0);
      }
    });
  });

  describe("recommended publisher types", () => {
    const VALID_PUBLISHERS = new Set(["Merck", "Cornell", "AAHA", "AVMA", "InternalVetReviewed"]);

    it.each(ALL_MODULE_IDS)("module %s has valid publisher types", (moduleId) => {
      const entry = getCoverageByModuleId(moduleId);
      expect(entry).toBeDefined();
      for (const publisher of entry!.recommendedPublisherTypes) {
        expect(VALID_PUBLISHERS.has(publisher)).toBe(true);
      }
    });

    it("strong coverage modules have no recommended publisher types", () => {
      const strongEntries = filterBySourceCoverage("strong");
      for (const entry of strongEntries) {
        expect(entry.recommendedPublisherTypes.length).toBe(0);
      }
    });

    it("partial/missing coverage modules have recommended publisher types", () => {
      const partialEntries = filterBySourceCoverage("partial");
      const missingEntries = filterBySourceCoverage("missing");
      const needsRecommendation = [...partialEntries, ...missingEntries];

      for (const entry of needsRecommendation) {
        expect(entry.recommendedPublisherTypes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("safety notes", () => {
    it.each(ALL_MODULE_IDS)("module %s has safety notes", (moduleId) => {
      const entry = getCoverageByModuleId(moduleId);
      expect(Array.isArray(entry?.safetyNotes)).toBe(true);
      expect(entry?.safetyNotes.length).toBeGreaterThan(0);
    });

    it("safety notes do not contain diagnosis/treatment language", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        for (const note of entry.safetyNotes) {
          expect(note.toLowerCase()).not.toMatch(/diagnos/i);
          expect(note.toLowerCase()).not.toMatch(/treat(ment|ments|ing|ed)?\b/i);
          expect(note.toLowerCase()).not.toMatch(/prescri/i);
          expect(note.toLowerCase()).not.toMatch(/surg/i);
          expect(note.toLowerCase()).not.toMatch(/prognosis/i);
          expect(note.toLowerCase()).not.toMatch(/\bcure\b/i);
          expect(note.toLowerCase()).not.toMatch(/antibiotic/i);
          expect(note.toLowerCase()).not.toMatch(/steroid/i);
          expect(note.toLowerCase()).not.toMatch(/vaccine/i);
          expect(note.toLowerCase()).not.toMatch(
            /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
          );
          expect(note.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
        }
      }
    });
  });

  describe("defensive clone behavior", () => {
    it("getAllCoverageEntries returns defensive clones", () => {
      const entries1 = getAllCoverageEntries();
      const entries2 = getAllCoverageEntries();

      expect(entries1).not.toBe(entries2);
      if (entries1.length > 0 && entries2.length > 0) {
        expect(entries1[0]).not.toBe(entries2[0]);
        expect(entries1[0].missingSourceNeeds).not.toBe(entries2[0].missingSourceNeeds);
        expect(entries1[0].safetyNotes).not.toBe(entries2[0].safetyNotes);
      }
    });

    it("getCoverageByModuleId returns defensive clones", () => {
      const entry1 = getCoverageByModuleId("skin_itching_allergy");
      const entry2 = getCoverageByModuleId("skin_itching_allergy");

      expect(entry1).not.toBe(entry2);
      if (entry1 && entry2) {
        entry1.missingSourceNeeds.push("mutated_need");
        expect(entry2.missingSourceNeeds).not.toContain("mutated_need");
      }
    });

    it("mutating returned entry does not affect subsequent calls", () => {
      const entry1 = getCoverageByModuleId("gi_vomiting_diarrhea");
      if (entry1) {
        entry1.safetyNotes.push("mutated note");
        entry1.recommendedPublisherTypes.push("Merck" as never);
      }

      const entry2 = getCoverageByModuleId("gi_vomiting_diarrhea");
      if (entry2) {
        expect(entry2.safetyNotes).not.toContain("mutated note");
        expect(entry2.recommendedPublisherTypes).not.toContain("Merck");
      }
    });

    it("filterBySourceCoverage returns defensive clones", () => {
      const results1 = filterBySourceCoverage("partial");
      const results2 = filterBySourceCoverage("partial");

      expect(results1).not.toBe(results2);
      if (results1.length > 0 && results2.length > 0) {
        expect(results1[0]).not.toBe(results2[0]);
      }
    });

    it("filterByOwnerVisibleCitationCoverage returns defensive clones", () => {
      const results1 = filterByOwnerVisibleCitationCoverage("emergency_only");
      const results2 = filterByOwnerVisibleCitationCoverage("emergency_only");

      expect(results1).not.toBe(results2);
      if (results1.length > 0 && results2.length > 0) {
        expect(results1[0]).not.toBe(results2[0]);
      }
    });
  });

  describe("filterBySourceCoverage", () => {
    it("returns only entries matching the specified level", () => {
      const strongEntries = filterBySourceCoverage("strong");
      expect(strongEntries.length).toBeGreaterThan(0);
      expect(strongEntries.every((e) => e.sourceCoverage === "strong")).toBe(true);
    });

    it("returns only partial entries", () => {
      const partialEntries = filterBySourceCoverage("partial");
      expect(partialEntries.length).toBeGreaterThan(0);
      expect(partialEntries.every((e) => e.sourceCoverage === "partial")).toBe(true);
    });

    it("returns only missing entries", () => {
      const missingEntries = filterBySourceCoverage("missing");
      expect(missingEntries.length).toBeGreaterThan(0);
      expect(missingEntries.every((e) => e.sourceCoverage === "missing")).toBe(true);
    });

    it("returns empty array for valid level with no matches", () => {
      const allLevels = new Set(getAllCoverageEntries().map((e) => e.sourceCoverage));
      for (const level of allLevels) {
        const filtered = filterBySourceCoverage(level);
        expect(filtered.length).toBeGreaterThan(0);
      }
    });
  });

  describe("filterByOwnerVisibleCitationCoverage", () => {
    it("returns only entries matching the specified level", () => {
      const availableEntries = filterByOwnerVisibleCitationCoverage("available");
      expect(availableEntries.length).toBeGreaterThan(0);
      expect(availableEntries.every((e) => e.ownerVisibleCitationCoverage === "available")).toBe(true);
    });

    it("returns only emergency_only entries", () => {
      const emergencyEntries = filterByOwnerVisibleCitationCoverage("emergency_only");
      expect(emergencyEntries.length).toBeGreaterThan(0);
      expect(emergencyEntries.every((e) => e.ownerVisibleCitationCoverage === "emergency_only")).toBe(true);
    });

    it("returns only missing entries", () => {
      const missingEntries = filterByOwnerVisibleCitationCoverage("missing");
      expect(missingEntries.length).toBeGreaterThan(0);
      expect(missingEntries.every((e) => e.ownerVisibleCitationCoverage === "missing")).toBe(true);
    });
  });

  describe("getCoverageByModuleId", () => {
    it("returns undefined for unknown module ID", () => {
      const entry = getCoverageByModuleId("nonexistent_module_xyz");
      expect(entry).toBeUndefined();
    });

    it("does not throw for unknown module ID", () => {
      expect(() => getCoverageByModuleId("nonexistent_module_xyz")).not.toThrow();
    });
  });

  describe("validateCoverageRegistry", () => {
    it("passes validation for the default registry", () => {
      const result = validateCoverageRegistry();
      expect(result.valid).toBe(true);
      expect(result.duplicateIds).toEqual([]);
      expect(result.missingModuleIds).toEqual([]);
      expect(result.safetyNoteViolations).toEqual([]);
    });

    it("returns all required fields in validation result", () => {
      const result = validateCoverageRegistry();
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("duplicateIds");
      expect(result).toHaveProperty("missingModuleIds");
      expect(result).toHaveProperty("safetyNoteViolations");
    });

    it("all active module IDs exist in complaint module registry", () => {
      const result = validateCoverageRegistry();
      for (const error of result.missingModuleIds) {
        expect(error).not.toBeDefined();
      }
    });
  });

  describe("entry shape", () => {
    it("each entry has all required fields", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        expect(entry).toHaveProperty("complaintModuleId");
        expect(entry).toHaveProperty("status");
        expect(entry).toHaveProperty("sourceCoverage");
        expect(entry).toHaveProperty("ownerVisibleCitationCoverage");
        expect(entry).toHaveProperty("missingSourceNeeds");
        expect(entry).toHaveProperty("recommendedPublisherTypes");
        expect(entry).toHaveProperty("safetyNotes");
      }
    });

    it("all arrays are arrays", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        expect(Array.isArray(entry.missingSourceNeeds)).toBe(true);
        expect(Array.isArray(entry.recommendedPublisherTypes)).toBe(true);
        expect(Array.isArray(entry.safetyNotes)).toBe(true);
      }
    });

    it("status is either active or future_pending", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        expect(["active", "future_pending"]).toContain(entry.status);
      }
    });

    it("sourceCoverage is a valid level", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        expect(["strong", "partial", "missing"]).toContain(entry.sourceCoverage);
      }
    });

    it("ownerVisibleCitationCoverage is a valid level", () => {
      const entries = getAllCoverageEntries();
      for (const entry of entries) {
        expect(["available", "emergency_only", "missing"]).toContain(
          entry.ownerVisibleCitationCoverage
        );
      }
    });
  });

  describe("coverage distribution", () => {
    it("has at least one strong coverage module", () => {
      const strong = filterBySourceCoverage("strong");
      expect(strong.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one partial coverage module", () => {
      const partial = filterBySourceCoverage("partial");
      expect(partial.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one missing coverage module", () => {
      const missing = filterBySourceCoverage("missing");
      expect(missing.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one available owner-visible citation module", () => {
      const available = filterByOwnerVisibleCitationCoverage("available");
      expect(available.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one emergency_only owner-visible citation module", () => {
      const emergencyOnly = filterByOwnerVisibleCitationCoverage("emergency_only");
      expect(emergencyOnly.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one missing owner-visible citation module", () => {
      const missing = filterByOwnerVisibleCitationCoverage("missing");
      expect(missing.length).toBeGreaterThanOrEqual(1);
    });
  });
});
