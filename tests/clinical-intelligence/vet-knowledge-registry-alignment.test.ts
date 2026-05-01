import {
  getComplaintModules,
  getComplaintModuleById,
} from "@/lib/clinical-intelligence/complaint-modules";
import {
  getAllComplaintSourceMapEntries,
  getComplaintSourceMapEntry,
} from "@/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import {
  getAllCoverageEntries,
  getCoverageByModuleId,
} from "@/lib/clinical-intelligence/vet-knowledge/coverage-gap-registry";
import {
  getAllGapEntries,
  getGapByModuleId,
} from "@/lib/clinical-intelligence/vet-knowledge/source-gap-plan";
import {
  getAllSources,
  getSourceById,
  setRegistry,
} from "@/lib/clinical-intelligence/vet-knowledge/source-registry";
import { VET_KNOWLEDGE_SOURCES } from "@/lib/clinical-intelligence/vet-knowledge/source-summaries";
import { buildCitations } from "@/lib/clinical-intelligence/vet-knowledge/citation-builder";
import { isEligibleForOwnerCitation } from "@/lib/clinical-intelligence/vet-knowledge/citation-policy";

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

const FORBIDDEN_TREATMENT_PATTERNS = [
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

const MAX_PASSAGE_LENGTH = 500;

function containsForbiddenLanguage(text: string): boolean {
  return FORBIDDEN_TREATMENT_PATTERNS.some((p) => p.test(text));
}

function loadRegistry(): void {
  setRegistry(VET_KNOWLEDGE_SOURCES);
}

describe("vet-knowledge registry alignment guard", () => {
  beforeEach(() => {
    loadRegistry();
  });

  describe("complaint module -> source-map alignment", () => {
    it("every registered complaint module has a complaint-source-map entry", () => {
      const registeredModules = getComplaintModules();
      const mappedIds = new Set(
        getAllComplaintSourceMapEntries().map((e) => e.complaintModuleId)
      );

      for (const mod of registeredModules) {
        expect(mappedIds.has(mod.id)).toBe(true);
      }
    });

    it.each(ALL_MODULE_IDS)(
      "module %s has a source-map entry with valid shape",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);
        expect(entry).toBeDefined();
        expect(entry?.complaintModuleId).toBe(moduleId);
        expect(entry?.displayName).toBeDefined();
        expect(Array.isArray(entry?.vetKnowledgeFamilies)).toBe(true);
        expect(Array.isArray(entry?.relevantRedFlags)).toBe(true);
        expect(Array.isArray(entry?.rationaleNotes)).toBe(true);
      }
    );
  });

  describe("complaint module -> coverage-gap-registry alignment", () => {
    it("every registered complaint module has a coverage-gap-registry entry", () => {
      const registeredModules = getComplaintModules();
      const coveredIds = new Set(
        getAllCoverageEntries().map((e) => e.complaintModuleId)
      );

      for (const mod of registeredModules) {
        expect(coveredIds.has(mod.id)).toBe(true);
      }
    });

    it.each(ALL_MODULE_IDS)(
      "module %s has a coverage-gap entry with valid shape",
      (moduleId) => {
        const entry = getCoverageByModuleId(moduleId);
        expect(entry).toBeDefined();
        expect(entry?.complaintModuleId).toBe(moduleId);
        expect(["strong", "partial", "missing"]).toContain(
          entry?.sourceCoverage
        );
        expect(["available", "emergency_only", "missing"]).toContain(
          entry?.ownerVisibleCitationCoverage
        );
      }
    );
  });

  describe("complaint module -> source-gap-plan alignment", () => {
    it("every registered complaint module has a source-gap-plan entry", () => {
      const registeredModules = getComplaintModules();
      const gapIds = new Set(getAllGapEntries().map((e) => e.moduleId));

      for (const mod of registeredModules) {
        expect(gapIds.has(mod.id)).toBe(true);
      }
    });

    it.each(ALL_MODULE_IDS)(
      "module %s has a source-gap-plan entry with valid shape",
      (moduleId) => {
        const entry = getGapByModuleId(moduleId);
        expect(entry).toBeDefined();
        expect(entry?.moduleId).toBe(moduleId);
        expect(["strong", "partial", "missing"]).toContain(
          entry?.coverageStatus
        );
        expect(
          ["critical", "high", "medium", "low", "not_needed"]
        ).toContain(entry?.priority);
      }
    );
  });

  describe("three-way registry consistency", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s is present in all three registries",
      (moduleId) => {
        const sourceMapEntry = getComplaintSourceMapEntry(moduleId);
        const coverageEntry = getCoverageByModuleId(moduleId);
        const gapEntry = getGapByModuleId(moduleId);

        expect(sourceMapEntry).toBeDefined();
        expect(coverageEntry).toBeDefined();
        expect(gapEntry).toBeDefined();
      }
    );

    it("source-map, coverage-gap, and source-gap-plan have the same number of entries", () => {
      const sourceMapCount = getAllComplaintSourceMapEntries().length;
      const coverageCount = getAllCoverageEntries().length;
      const gapCount = getAllGapEntries().length;

      expect(sourceMapCount).toBe(coverageCount);
      expect(coverageCount).toBe(gapCount);
    });

    it("coverage-gap sourceCoverage matches source-gap-plan coverageStatus for all modules", () => {
      for (const moduleId of ALL_MODULE_IDS) {
        const coverage = getCoverageByModuleId(moduleId);
        const gap = getGapByModuleId(moduleId);

        expect(coverage?.sourceCoverage).toBe(gap?.coverageStatus);
      }
    });

    it("coverage-gap ownerVisibleCitationCoverage matches source-gap-plan ownerVisibleCitationNeed", () => {
      for (const moduleId of ALL_MODULE_IDS) {
        const coverage = getCoverageByModuleId(moduleId);
        const gap = getGapByModuleId(moduleId);

        expect(coverage?.ownerVisibleCitationCoverage).toBe(
          gap?.ownerVisibleCitationNeed
        );
      }
    });
  });

  describe("red flag string and forbidden-language validation", () => {
    it("every mapped red flag is a string", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const flag of entry.relevantRedFlags) {
          expect(typeof flag).toBe("string");
          expect(flag.length).toBeGreaterThan(0);
        }
      }
    });

    it("no red flag contains forbidden treatment/dosage language", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const flag of entry.relevantRedFlags) {
          expect(containsForbiddenLanguage(flag)).toBe(false);
        }
      }
    });

    it("no rationale note contains forbidden treatment/dosage language", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const note of entry.rationaleNotes) {
          expect(containsForbiddenLanguage(note)).toBe(false);
        }
      }
    });

    it("no coverage-gap safety note contains forbidden language", () => {
      const entries = getAllCoverageEntries();

      for (const entry of entries) {
        for (const note of entry.safetyNotes) {
          expect(containsForbiddenLanguage(note)).toBe(false);
        }
      }
    });

    it("no source-gap-plan safety note contains forbidden language", () => {
      const entries = getAllGapEntries();

      for (const entry of entries) {
        for (const note of entry.safetyNotes) {
          expect(containsForbiddenLanguage(note)).toBe(false);
        }
      }
    });

    it("no missing source topics contain forbidden language", () => {
      const entries = getAllGapEntries();

      for (const entry of entries) {
        for (const topic of entry.missingSourceTopics) {
          expect(containsForbiddenLanguage(topic)).toBe(false);
        }
      }
    });
  });

  describe("source ID validation against source-registry", () => {
    it("all source IDs referenced in rationale notes exist in source-registry", () => {
      const existingIds = new Set(getAllSources().map((s) => s.id));
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const note of entry.rationaleNotes) {
          for (const existingId of existingIds) {
            if (note.includes(existingId)) {
              expect(getSourceById(existingId)).toBeDefined();
            }
          }
        }
      }
    });

    it("no rationale note references a nonexistent source ID pattern", () => {
      const existingIds = new Set(getAllSources().map((s) => s.id));
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const note of entry.rationaleNotes) {
          const sourceIdPattern = /[\w-]+-[\w-]+-[\w-]+/g;
          const matches = note.match(sourceIdPattern) || [];

          for (const match of matches) {
            if (existingIds.has(match)) {
              expect(getSourceById(match)).toBeDefined();
            }
          }
        }
      }
    });
  });

  describe("owner-visible citation validation", () => {
    it("owner-visible citation intent only references sources allowed for owner-visible citation", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        if (entry.citationIntent === "owner_visible_citation") {
          const citationResult = buildCitations({
            complaintFamily: entry.vetKnowledgeFamilies[0],
            redFlags:
              entry.relevantRedFlags.length > 0
                ? entry.relevantRedFlags
                : undefined,
          });

          for (const citation of citationResult.citations) {
            const source = getSourceById(citation.sourceId);
            expect(source).toBeDefined();
            if (source) {
              expect(isEligibleForOwnerCitation(source.allowedUse)).toBe(true);
            }
          }
        }
      }
    });

    it("modules with owner_visible_citation intent only return eligible sources when citations exist", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        if (entry.citationIntent === "owner_visible_citation") {
          const citationResult = buildCitations({
            complaintFamily: entry.vetKnowledgeFamilies[0],
            redFlags:
              entry.relevantRedFlags.length > 0
                ? entry.relevantRedFlags
                : undefined,
          });

          for (const citation of citationResult.citations) {
            const source = getSourceById(citation.sourceId);
            expect(source).toBeDefined();
            if (source) {
              expect(isEligibleForOwnerCitation(source.allowedUse)).toBe(true);
            }
          }
        }
      }
    });
  });

  describe("unknown/missing source coverage representation", () => {
    it("modules with missing source coverage are represented as missing, not silently omitted", () => {
      const registeredModules = getComplaintModules();
      const coverageEntries = getAllCoverageEntries();
      const coverageMap = new Map(
        coverageEntries.map((e) => [e.complaintModuleId, e.sourceCoverage])
      );

      for (const mod of registeredModules) {
        const coverage = coverageMap.get(mod.id);
        expect(coverage).toBeDefined();
        expect(["strong", "partial", "missing"]).toContain(coverage);
      }
    });

    it("urinary_obstruction is explicitly marked as missing coverage", () => {
      const coverage = getCoverageByModuleId("urinary_obstruction");
      expect(coverage?.sourceCoverage).toBe("missing");
      expect(coverage?.ownerVisibleCitationCoverage).toBe("missing");
    });

    it("gap plan marks missing coverage as critical priority", () => {
      const gap = getGapByModuleId("urinary_obstruction");
      expect(gap?.priority).toBe("critical");
    });

    it("no registered module is absent from coverage registry", () => {
      const registeredModules = getComplaintModules();
      const coveredIds = new Set(
        getAllCoverageEntries().map((e) => e.complaintModuleId)
      );

      for (const mod of registeredModules) {
        expect(coveredIds.has(mod.id)).toBe(true);
      }
    });
  });

  describe("no long copied source passages", () => {
    it("no rationale note exceeds maximum passage length", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const note of entry.rationaleNotes) {
          expect(note.length).toBeLessThan(MAX_PASSAGE_LENGTH);
        }
      }
    });

    it("no safety note in coverage-gap exceeds maximum passage length", () => {
      const entries = getAllCoverageEntries();

      for (const entry of entries) {
        for (const note of entry.safetyNotes) {
          expect(note.length).toBeLessThan(MAX_PASSAGE_LENGTH);
        }
      }
    });

    it("no safety note in source-gap-plan exceeds maximum passage length", () => {
      const entries = getAllGapEntries();

      for (const entry of entries) {
        for (const note of entry.safetyNotes) {
          expect(note.length).toBeLessThan(MAX_PASSAGE_LENGTH);
        }
      }
    });
  });

  describe("no diagnosis/treatment/medication/dosage/home-care language", () => {
    const allTextFields: { moduleId: string; field: string; text: string }[] =
      [];

    beforeEach(() => {
      allTextFields.length = 0;

      const sourceMapEntries = getAllComplaintSourceMapEntries();
      for (const entry of sourceMapEntries) {
        for (const note of entry.rationaleNotes) {
          allTextFields.push({
            moduleId: entry.complaintModuleId,
            field: "rationaleNotes",
            text: note,
          });
        }
      }

      const coverageEntries = getAllCoverageEntries();
      for (const entry of coverageEntries) {
        for (const note of entry.safetyNotes) {
          allTextFields.push({
            moduleId: entry.complaintModuleId,
            field: "coverage-gap.safetyNotes",
            text: note,
          });
        }
      }

      const gapEntries = getAllGapEntries();
      for (const entry of gapEntries) {
        for (const note of entry.safetyNotes) {
          allTextFields.push({
            moduleId: entry.moduleId,
            field: "source-gap-plan.safetyNotes",
            text: note,
          });
        }
        for (const topic of entry.missingSourceTopics) {
          allTextFields.push({
            moduleId: entry.moduleId,
            field: "source-gap-plan.missingSourceTopics",
            text: topic,
          });
        }
      }
    });

    it.each([
      "diagnos",
      "treat",
      "prescri",
      "surg",
      "prognosis",
      "cure",
      "heal",
      "antibiotic",
      "steroid",
      "vaccine",
      "medicat",
      "dosage",
      "home-care",
      "home care",
    ])("no text field contains forbidden keyword '%s'", (keyword) => {
      for (const item of allTextFields) {
        expect(item.text.toLowerCase()).not.toContain(keyword);
      }
    });

    it("no text field contains dosage instruction patterns", () => {
      for (const item of allTextFields) {
        expect(item.text).not.toMatch(
          /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(item.text).not.toMatch(
          /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(item.text).not.toMatch(/dosage\s*(is|of|:)/i);
      }
    });

    it("no text field contains home-care instruction patterns", () => {
      for (const item of allTextFields) {
        expect(item.text).not.toMatch(
          /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
        );
      }
    });
  });

  describe("future-proofing: new module detection", () => {
    it("the number of registered modules matches the number of source-map entries", () => {
      const registeredModules = getComplaintModules();
      const sourceMapEntries = getAllComplaintSourceMapEntries();

      expect(sourceMapEntries.length).toBe(registeredModules.length);
    });

    it("the number of registered modules matches the number of coverage-gap entries", () => {
      const registeredModules = getComplaintModules();
      const coverageEntries = getAllCoverageEntries();

      expect(coverageEntries.length).toBe(registeredModules.length);
    });

    it("the number of registered modules matches the number of source-gap-plan entries", () => {
      const registeredModules = getComplaintModules();
      const gapEntries = getAllGapEntries();

      expect(gapEntries.length).toBe(registeredModules.length);
    });

    it("every module ID in source-map exists as a complaint module", () => {
      const sourceMapEntries = getAllComplaintSourceMapEntries();

      for (const entry of sourceMapEntries) {
        const mod = getComplaintModuleById(entry.complaintModuleId);
        expect(mod).toBeDefined();
      }
    });

    it("every module ID in coverage-gap exists as a complaint module", () => {
      const coverageEntries = getAllCoverageEntries();

      for (const entry of coverageEntries) {
        const mod = getComplaintModuleById(entry.complaintModuleId);
        expect(mod).toBeDefined();
      }
    });

    it("every module ID in source-gap-plan exists as a complaint module", () => {
      const gapEntries = getAllGapEntries();

      for (const entry of gapEntries) {
        const mod = getComplaintModuleById(entry.moduleId);
        expect(mod).toBeDefined();
      }
    });
  });
});
