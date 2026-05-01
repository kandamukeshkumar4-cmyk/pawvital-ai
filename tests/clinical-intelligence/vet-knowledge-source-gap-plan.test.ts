import {
  getAllGapEntries,
  getGapByModuleId,
  filterByPriority,
  filterByCoverageStatus,
  getCriticalGaps,
  getHighPriorityGaps,
  validateGapPlan,
  type SourceGapPlanEntry,
} from "@/lib/clinical-intelligence/vet-knowledge/source-gap-plan";
import { getComplaintModuleById, getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import { getCoverageByModuleId } from "@/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import { getAllSources } from "@/lib/clinical-intelligence/vet-knowledge/source-registry";

const ALL_MODULE_IDS = [
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

const VALID_PUBLISHERS = new Set([
  "Merck",
  "Cornell",
  "AAHA",
  "AVMA",
  "InternalVetReviewed",
]);

describe("vet knowledge source gap plan", () => {
  describe("all active complaint modules represented", () => {
    it("exports entries for all 9 active complaint modules", () => {
      const entries = getAllGapEntries();
      expect(entries.length).toBe(9);
    });

    it.each(ALL_MODULE_IDS)("module %s has a gap plan entry", (moduleId) => {
      const entry = getGapByModuleId(moduleId);
      expect(entry).toBeDefined();
      expect(entry?.moduleId).toBe(moduleId);
    });

    it("all registered modules have a gap entry", () => {
      const registeredModules = getComplaintModules();
      const gapIds = new Set(getAllGapEntries().map((e) => e.moduleId));

      for (const complaintModule of registeredModules) {
        expect(gapIds.has(complaintModule.id)).toBe(true);
      }
    });
  });

  describe("urinary obstruction coverage gap", () => {
    it("urinary_obstruction is flagged as missing source coverage", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry).toBeDefined();
      expect(entry?.coverageStatus).toBe("missing");
    });

    it("urinary_obstruction has missing owner-visible citation need", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry?.ownerVisibleCitationNeed).toBe("missing");
    });

    it("urinary_obstruction is a critical priority gap", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry?.priority).toBe("critical");
    });

    it("urinary_obstruction has non-empty missing source topics", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry?.missingSourceTopics.length).toBeGreaterThan(0);
    });

    it("urinary_obstruction has recommended publisher types", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry?.neededPublisherTypes.length).toBeGreaterThan(0);
    });
  });

  describe("partial coverage gaps", () => {
    it("skin_itching_allergy is partial coverage", () => {
      const entry = getGapByModuleId("skin_itching_allergy");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("limping_mobility_pain is partial coverage", () => {
      const entry = getGapByModuleId("limping_mobility_pain");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("seizure_collapse_neuro is partial coverage", () => {
      const entry = getGapByModuleId("seizure_collapse_neuro");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("toxin_poisoning_exposure is partial coverage", () => {
      const entry = getGapByModuleId("toxin_poisoning_exposure");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("bloat_gdv is partial coverage", () => {
      const entry = getGapByModuleId("bloat_gdv");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("collapse_weakness is partial coverage", () => {
      const entry = getGapByModuleId("collapse_weakness");
      expect(entry?.coverageStatus).toBe("partial");
    });

    it("all partial coverage modules have high priority", () => {
      const partialEntries = filterByCoverageStatus("partial");
      for (const entry of partialEntries) {
        expect(["high", "medium"]).toContain(entry.priority);
      }
    });
  });

  describe("strong coverage modules", () => {
    it("gi_vomiting_diarrhea has strong coverage", () => {
      const entry = getGapByModuleId("gi_vomiting_diarrhea");
      expect(entry?.coverageStatus).toBe("strong");
    });

    it("respiratory_distress has strong coverage", () => {
      const entry = getGapByModuleId("respiratory_distress");
      expect(entry?.coverageStatus).toBe("strong");
    });

    it("strong coverage modules have not_needed priority", () => {
      const strongEntries = filterByCoverageStatus("strong");
      for (const entry of strongEntries) {
        expect(entry.priority).toBe("not_needed");
      }
    });

    it("strong coverage modules have empty missing source topics", () => {
      const strongEntries = filterByCoverageStatus("strong");
      for (const entry of strongEntries) {
        expect(entry.missingSourceTopics.length).toBe(0);
      }
    });
  });

  describe("owner-visible citation gaps", () => {
    it("modules with missing citations have critical or high priority", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.ownerVisibleCitationNeed === "missing") {
          expect(["critical", "high"]).toContain(entry.priority);
        }
      }
    });

    it("urinary_obstruction has missing owner-visible citation", () => {
      const entry = getGapByModuleId("urinary_obstruction");
      expect(entry?.ownerVisibleCitationNeed).toBe("missing");
    });

    it("modules with emergency_only citations have high priority", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.ownerVisibleCitationNeed === "emergency_only") {
          expect(entry.priority).toBe("high");
        }
      }
    });

    it("modules with available citations are not critical", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.ownerVisibleCitationNeed === "available") {
          expect(entry.priority).not.toBe("critical");
        }
      }
    });
  });

  describe("internal reasoning need", () => {
    it("non-strong coverage modules need internal reasoning", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.coverageStatus !== "strong") {
          expect(entry.internalReasoningNeed).toBe(true);
        }
      }
    });

    it("strong coverage modules do not need internal reasoning", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.coverageStatus === "strong") {
          expect(entry.internalReasoningNeed).toBe(false);
        }
      }
    });
  });

  describe("missing source topics", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has missingSourceTopics array",
      (moduleId) => {
        const entry = getGapByModuleId(moduleId);
        expect(Array.isArray(entry?.missingSourceTopics)).toBe(true);
      }
    );

    it("missing/partial coverage modules have non-empty missing source topics", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        if (entry.coverageStatus === "missing" || entry.coverageStatus === "partial") {
          expect(entry.missingSourceTopics.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("needed publisher types", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has valid publisher types",
      (moduleId) => {
        const entry = getGapByModuleId(moduleId);
        expect(entry).toBeDefined();
        for (const publisher of entry!.neededPublisherTypes) {
          expect(VALID_PUBLISHERS.has(publisher)).toBe(true);
        }
      }
    );

    it("strong coverage modules have no needed publisher types", () => {
      const strongEntries = filterByCoverageStatus("strong");
      for (const entry of strongEntries) {
        expect(entry.neededPublisherTypes.length).toBe(0);
      }
    });

    it("partial/missing coverage modules have needed publisher types", () => {
      const partialEntries = filterByCoverageStatus("partial");
      const missingEntries = filterByCoverageStatus("missing");
      const needsRecommendation = [...partialEntries, ...missingEntries];

      for (const entry of needsRecommendation) {
        expect(entry.neededPublisherTypes.length).toBeGreaterThan(0);
      }
    });
  });

  describe("no nonexistent source IDs referenced", () => {
    it("gap plan does not reference any source IDs", () => {
      const entries = getAllGapEntries();
      const existingSourceIds = new Set(
        getAllSources().map((s) => s.id)
      );

      for (const entry of entries) {
        const allText = [
          ...entry.missingSourceTopics,
          ...entry.safetyNotes,
        ].join(" ");

        for (const sourceId of existingSourceIds) {
          expect(allText).not.toContain(sourceId);
        }
      }
    });
  });

  describe("no forbidden clinical instruction language", () => {
    it("safety notes contain no diagnosis/treatment/medication/dosage/home-care language", () => {
      const entries = getAllGapEntries();
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
          expect(note.toLowerCase()).not.toMatch(/medicat/i);
          expect(note.toLowerCase()).not.toMatch(
            /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
          );
          expect(note.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
          expect(note.toLowerCase()).not.toMatch(
            /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
          );
        }
      }
    });

    it("missing source topics contain no forbidden clinical language", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        for (const topic of entry.missingSourceTopics) {
          expect(topic.toLowerCase()).not.toMatch(/diagnos/i);
          expect(topic.toLowerCase()).not.toMatch(/medicat/i);
          expect(topic.toLowerCase()).not.toMatch(/dosage/i);
          expect(topic.toLowerCase()).not.toMatch(
            /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
          );
        }
      }
    });
  });

  describe("defensive clone behavior", () => {
    it("getAllGapEntries returns defensive clones", () => {
      const entries1 = getAllGapEntries();
      const entries2 = getAllGapEntries();

      expect(entries1).not.toBe(entries2);
      if (entries1.length > 0 && entries2.length > 0) {
        expect(entries1[0]).not.toBe(entries2[0]);
        expect(entries1[0].missingSourceTopics).not.toBe(
          entries2[0].missingSourceTopics
        );
        expect(entries1[0].safetyNotes).not.toBe(entries2[0].safetyNotes);
      }
    });

    it("getGapByModuleId returns defensive clones", () => {
      const entry1 = getGapByModuleId("urinary_obstruction");
      const entry2 = getGapByModuleId("urinary_obstruction");

      expect(entry1).not.toBe(entry2);
      if (entry1 && entry2) {
        entry1.missingSourceTopics.push("mutated_topic");
        expect(entry2.missingSourceTopics).not.toContain("mutated_topic");
      }
    });

    it("mutating returned entry does not affect subsequent calls", () => {
      const entry1 = getGapByModuleId("skin_itching_allergy");
      if (entry1) {
        entry1.safetyNotes.push("mutated note");
        entry1.neededPublisherTypes.push("AVMA" as never);
      }

      const entry2 = getGapByModuleId("skin_itching_allergy");
      if (entry2) {
        expect(entry2.safetyNotes).not.toContain("mutated note");
        expect(entry2.neededPublisherTypes).not.toContain("AVMA");
      }
    });

    it("filterByPriority returns defensive clones", () => {
      const results1 = filterByPriority("high");
      const results2 = filterByPriority("high");

      expect(results1).not.toBe(results2);
      if (results1.length > 0 && results2.length > 0) {
        expect(results1[0]).not.toBe(results2[0]);
      }
    });

    it("filterByCoverageStatus returns defensive clones", () => {
      const results1 = filterByCoverageStatus("partial");
      const results2 = filterByCoverageStatus("partial");

      expect(results1).not.toBe(results2);
      if (results1.length > 0 && results2.length > 0) {
        expect(results1[0]).not.toBe(results2[0]);
      }
    });
  });

  describe("filterByPriority", () => {
    it("returns only entries matching the specified priority", () => {
      const criticalEntries = filterByPriority("critical");
      expect(criticalEntries.length).toBeGreaterThan(0);
      expect(criticalEntries.every((e) => e.priority === "critical")).toBe(true);
    });

    it("returns high priority entries", () => {
      const highEntries = filterByPriority("high");
      expect(highEntries.length).toBeGreaterThan(0);
      expect(highEntries.every((e) => e.priority === "high")).toBe(true);
    });

    it("returns not_needed entries", () => {
      const notNeededEntries = filterByPriority("not_needed");
      expect(notNeededEntries.length).toBeGreaterThan(0);
      expect(
        notNeededEntries.every((e) => e.priority === "not_needed")
      ).toBe(true);
    });
  });

  describe("filterByCoverageStatus", () => {
    it("returns only entries matching the specified coverage status", () => {
      const missingEntries = filterByCoverageStatus("missing");
      expect(missingEntries.length).toBeGreaterThan(0);
      expect(
        missingEntries.every((e) => e.coverageStatus === "missing")
      ).toBe(true);
    });

    it("returns partial entries", () => {
      const partialEntries = filterByCoverageStatus("partial");
      expect(partialEntries.length).toBeGreaterThan(0);
      expect(
        partialEntries.every((e) => e.coverageStatus === "partial")
      ).toBe(true);
    });

    it("returns strong entries", () => {
      const strongEntries = filterByCoverageStatus("strong");
      expect(strongEntries.length).toBeGreaterThan(0);
      expect(
        strongEntries.every((e) => e.coverageStatus === "strong")
      ).toBe(true);
    });
  });

  describe("getCriticalGaps", () => {
    it("returns only critical priority entries", () => {
      const criticalGaps = getCriticalGaps();
      expect(criticalGaps.length).toBeGreaterThan(0);
      expect(criticalGaps.every((e) => e.priority === "critical")).toBe(true);
    });

    it("includes urinary_obstruction", () => {
      const criticalGaps = getCriticalGaps();
      const urinaryGap = criticalGaps.find((e) => e.moduleId === "urinary_obstruction");
      expect(urinaryGap).toBeDefined();
    });
  });

  describe("getHighPriorityGaps", () => {
    it("returns only high priority entries", () => {
      const highGaps = getHighPriorityGaps();
      expect(highGaps.length).toBeGreaterThan(0);
      expect(highGaps.every((e) => e.priority === "high")).toBe(true);
    });
  });

  describe("getGapByModuleId", () => {
    it("returns undefined for unknown module ID", () => {
      const entry = getGapByModuleId("nonexistent_module_xyz");
      expect(entry).toBeUndefined();
    });

    it("does not throw for unknown module ID", () => {
      expect(() => getGapByModuleId("nonexistent_module_xyz")).not.toThrow();
    });
  });

  describe("validateGapPlan", () => {
    it("passes validation for the default gap plan", () => {
      const result = validateGapPlan();
      expect(result.valid).toBe(true);
      expect(result.duplicateIds).toEqual([]);
      expect(result.missingModuleIds).toEqual([]);
      expect(result.safetyNoteViolations).toEqual([]);
    });

    it("returns all required fields in validation result", () => {
      const result = validateGapPlan();
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("duplicateIds");
      expect(result).toHaveProperty("missingModuleIds");
      expect(result).toHaveProperty("safetyNoteViolations");
    });

    it("all module IDs exist in complaint module registry", () => {
      const result = validateGapPlan();
      expect(result.missingModuleIds.length).toBe(0);
    });
  });

  describe("entry shape", () => {
    it("each entry has all required fields", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(entry).toHaveProperty("moduleId");
        expect(entry).toHaveProperty("coverageStatus");
        expect(entry).toHaveProperty("missingSourceTopics");
        expect(entry).toHaveProperty("neededPublisherTypes");
        expect(entry).toHaveProperty("ownerVisibleCitationNeed");
        expect(entry).toHaveProperty("internalReasoningNeed");
        expect(entry).toHaveProperty("priority");
        expect(entry).toHaveProperty("safetyNotes");
      }
    });

    it("all arrays are arrays", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(Array.isArray(entry.missingSourceTopics)).toBe(true);
        expect(Array.isArray(entry.neededPublisherTypes)).toBe(true);
        expect(Array.isArray(entry.safetyNotes)).toBe(true);
      }
    });

    it("coverageStatus is a valid level", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(["strong", "partial", "missing"]).toContain(
          entry.coverageStatus
        );
      }
    });

    it("ownerVisibleCitationNeed is a valid level", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(["available", "emergency_only", "missing"]).toContain(
          entry.ownerVisibleCitationNeed
        );
      }
    });

    it("priority is a valid level", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(["critical", "high", "medium", "low", "not_needed"]).toContain(
          entry.priority
        );
      }
    });

    it("internalReasoningNeed is a boolean", () => {
      const entries = getAllGapEntries();
      for (const entry of entries) {
        expect(typeof entry.internalReasoningNeed).toBe("boolean");
      }
    });
  });

  describe("coverage distribution", () => {
    it("has at least one critical gap", () => {
      const critical = filterByPriority("critical");
      expect(critical.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one high priority gap", () => {
      const high = filterByPriority("high");
      expect(high.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one not_needed entry", () => {
      const notNeeded = filterByPriority("not_needed");
      expect(notNeeded.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one missing coverage entry", () => {
      const missing = filterByCoverageStatus("missing");
      expect(missing.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one partial coverage entry", () => {
      const partial = filterByCoverageStatus("partial");
      expect(partial.length).toBeGreaterThanOrEqual(1);
    });

    it("has at least one strong coverage entry", () => {
      const strong = filterByCoverageStatus("strong");
      expect(strong.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("consistency with coverage-gap-registry", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s gap plan matches coverage registry",
      (moduleId) => {
        const gapEntry = getGapByModuleId(moduleId);
        const coverageEntry = getCoverageByModuleId(moduleId);

        expect(gapEntry).toBeDefined();
        expect(coverageEntry).toBeDefined();

        if (gapEntry && coverageEntry) {
          expect(gapEntry.coverageStatus).toBe(coverageEntry.sourceCoverage);
          expect(gapEntry.ownerVisibleCitationNeed).toBe(
            coverageEntry.ownerVisibleCitationCoverage
          );
          expect(gapEntry.missingSourceTopics).toEqual(
            coverageEntry.missingSourceNeeds
          );
          expect(gapEntry.neededPublisherTypes).toEqual(
            coverageEntry.recommendedPublisherTypes
          );
          expect(gapEntry.safetyNotes).toEqual(coverageEntry.safetyNotes);
        }
      }
    );
  });
});
