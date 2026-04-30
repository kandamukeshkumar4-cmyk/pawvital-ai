import {
  getAllComplaintSourceMapEntries,
  getComplaintSourceMapEntry,
  getComplaintSourceMapForModule,
  validateComplaintSourceMap,
} from "@/lib/clinical-intelligence/vet-knowledge/complaint-source-map";
import { getComplaintModuleById, getComplaintModules } from "@/lib/clinical-intelligence/complaint-modules";
import { planRetrieval } from "@/lib/clinical-intelligence/vet-knowledge/retrieval-planner";
import { buildCitations } from "@/lib/clinical-intelligence/vet-knowledge/citation-builder";

const ALL_MODULE_IDS = [
  "skin_itching_allergy",
  "gi_vomiting_diarrhea",
  "limping_mobility_pain",
  "respiratory_distress",
  "seizure_collapse_neuro",
  "urinary_obstruction",
  "toxin_poisoning_exposure",
];

describe("vet knowledge complaint source map", () => {
  describe("all complaint modules are mapped", () => {
    it("exports entries for all 7 complaint modules", () => {
      const entries = getAllComplaintSourceMapEntries();

      expect(entries.length).toBe(7);
    });

    it.each(ALL_MODULE_IDS)("maps module %s", (moduleId) => {
      const entry = getComplaintSourceMapEntry(moduleId);

      expect(entry).toBeDefined();
      expect(entry?.complaintModuleId).toBe(moduleId);
    });
  });

  describe("mapped module IDs exist in complaint module registry", () => {
    it.each(ALL_MODULE_IDS)("module %s exists in registry", (moduleId) => {
      const complaintModule = getComplaintModuleById(moduleId);

      expect(complaintModule).toBeDefined();
    });

    it("all registered modules have a map entry", () => {
      const registeredModules = getComplaintModules();
      const mappedIds = new Set(
        getAllComplaintSourceMapEntries().map((e) => e.complaintModuleId)
      );

      for (const complaintModule of registeredModules) {
        expect(mappedIds.has(complaintModule.id)).toBe(true);
      }
    });
  });

  describe("complaint families cover vet-knowledge sources", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has at least one vet-knowledge family",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);

        expect(entry).toBeDefined();
        expect(entry?.vetKnowledgeFamilies.length).toBeGreaterThan(0);
      }
    );

    it("skin_itching_allergy maps to dermatological family", () => {
      const entry = getComplaintSourceMapEntry("skin_itching_allergy");

      expect(entry?.vetKnowledgeFamilies).toContain("dermatological");
    });

    it("gi_vomiting_diarrhea maps to gastrointestinal family", () => {
      const entry = getComplaintSourceMapEntry("gi_vomiting_diarrhea");

      expect(entry?.vetKnowledgeFamilies).toContain("gastrointestinal");
    });

    it("limping_mobility_pain maps to musculoskeletal family", () => {
      const entry = getComplaintSourceMapEntry("limping_mobility_pain");

      expect(entry?.vetKnowledgeFamilies).toContain("musculoskeletal");
    });

    it("respiratory_distress maps to respiratory family", () => {
      const entry = getComplaintSourceMapEntry("respiratory_distress");

      expect(entry?.vetKnowledgeFamilies).toContain("respiratory");
    });

    it("seizure_collapse_neuro maps to neurological family", () => {
      const entry = getComplaintSourceMapEntry("seizure_collapse_neuro");

      expect(entry?.vetKnowledgeFamilies).toContain("neurological");
    });

    it("urinary_obstruction maps to emergency family", () => {
      const entry = getComplaintSourceMapEntry("urinary_obstruction");

      expect(entry?.vetKnowledgeFamilies).toContain("emergency");
    });

    it("toxin_poisoning_exposure maps to gastrointestinal and emergency families", () => {
      const entry = getComplaintSourceMapEntry("toxin_poisoning_exposure");

      expect(entry?.vetKnowledgeFamilies).toContain("gastrointestinal");
      expect(entry?.vetKnowledgeFamilies).toContain("emergency");
    });
  });

  describe("red flags are relevant to each module", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has at least one relevant red flag",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);

        expect(entry).toBeDefined();
        expect(entry?.relevantRedFlags.length).toBeGreaterThan(0);
      }
    );

    it("skin_itching_allergy includes breathing_difficulty red flag", () => {
      const entry = getComplaintSourceMapEntry("skin_itching_allergy");

      expect(entry?.relevantRedFlags).toContain("breathing_difficulty");
    });

    it("gi_vomiting_diarrhea includes unproductive_retching red flag", () => {
      const entry = getComplaintSourceMapEntry("gi_vomiting_diarrhea");

      expect(entry?.relevantRedFlags).toContain("unproductive_retching");
    });

    it("seizure_collapse_neuro includes seizure_activity red flag", () => {
      const entry = getComplaintSourceMapEntry("seizure_collapse_neuro");

      expect(entry?.relevantRedFlags).toContain("seizure_activity");
    });

    it("urinary_obstruction includes urinary_blockage red flag", () => {
      const entry = getComplaintSourceMapEntry("urinary_obstruction");

      expect(entry?.relevantRedFlags).toContain("urinary_blockage");
    });

    it("toxin_poisoning_exposure includes toxin_confirmed red flag", () => {
      const entry = getComplaintSourceMapEntry("toxin_poisoning_exposure");

      expect(entry?.relevantRedFlags).toContain("toxin_confirmed");
    });
  });

  describe("citation/retrieval intent behavior", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has valid retrieval intent",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);

        expect(entry).toBeDefined();
        const validIntents = [
          "retrieval_summary_only",
          "owner_visible_citation",
          "internal_reasoning",
          "none",
        ];
        expect(validIntents).toContain(entry?.retrievalIntent);
      }
    );

    it.each(ALL_MODULE_IDS)(
      "module %s has valid citation intent",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);

        expect(entry).toBeDefined();
        const validIntents = [
          "owner_visible_citation",
          "none",
        ];
        expect(validIntents).toContain(entry?.citationIntent);
      }
    );

    it("owner-visible citation intent only uses eligible sources", () => {
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
            expect(citation).toHaveProperty("sourceId");
            expect(citation).toHaveProperty("title");
            expect(citation).toHaveProperty("publisher");
          }
        }
      }
    });

    it("urinary_obstruction has no owner-visible citation intent", () => {
      const entry = getComplaintSourceMapEntry("urinary_obstruction");

      expect(entry?.citationIntent).toBe("none");
    });
  });

  describe("rationale notes", () => {
    it.each(ALL_MODULE_IDS)(
      "module %s has at least one rationale note",
      (moduleId) => {
        const entry = getComplaintSourceMapEntry(moduleId);

        expect(entry).toBeDefined();
        expect(entry?.rationaleNotes.length).toBeGreaterThan(0);
      }
    );

    it("rationale notes do not contain forbidden clinical advice", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const note of entry.rationaleNotes) {
          expect(note.toLowerCase()).not.toMatch(
            /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
          );
          expect(note.toLowerCase()).not.toMatch(
            /treatment\s*(plan|protocol|regimen)/i
          );
          expect(note.toLowerCase()).not.toMatch(
            /diagnosis\s*(is|:|—)/i
          );
        }
      }
    });
  });

  describe("defensive clone behavior", () => {
    it("getAllComplaintSourceMapEntries returns defensive clones", () => {
      const entries1 = getAllComplaintSourceMapEntries();
      const entries2 = getAllComplaintSourceMapEntries();

      expect(entries1).not.toBe(entries2);

      if (entries1.length > 0 && entries2.length > 0) {
        expect(entries1[0]).not.toBe(entries2[0]);
        expect(entries1[0].vetKnowledgeFamilies).not.toBe(
          entries2[0].vetKnowledgeFamilies
        );
        expect(entries1[0].relevantRedFlags).not.toBe(
          entries2[0].relevantRedFlags
        );
        expect(entries1[0].rationaleNotes).not.toBe(entries2[0].rationaleNotes);
      }
    });

    it("getComplaintSourceMapEntry returns defensive clones", () => {
      const entry1 = getComplaintSourceMapEntry("skin_itching_allergy");
      const entry2 = getComplaintSourceMapEntry("skin_itching_allergy");

      expect(entry1).not.toBe(entry2);

      if (entry1 && entry2) {
        entry1.vetKnowledgeFamilies.push("mutated_family");
        expect(entry2.vetKnowledgeFamilies).not.toContain("mutated_family");
      }
    });

    it("mutating returned entry does not affect subsequent calls", () => {
      const entry1 = getComplaintSourceMapEntry("gi_vomiting_diarrhea");

      if (entry1) {
        entry1.relevantRedFlags.push("mutated_flag");
        entry1.rationaleNotes.push("mutated note");
      }

      const entry2 = getComplaintSourceMapEntry("gi_vomiting_diarrhea");

      if (entry2) {
        expect(entry2.relevantRedFlags).not.toContain("mutated_flag");
        expect(entry2.rationaleNotes).not.toContain("mutated note");
      }
    });
  });

  describe("unknown module behavior", () => {
    it("returns undefined for unknown module ID", () => {
      const entry = getComplaintSourceMapEntry("nonexistent_module_xyz");

      expect(entry).toBeUndefined();
    });

    it("getComplaintSourceMapForModule returns empty safe result for unknown module", () => {
      const result = getComplaintSourceMapForModule("nonexistent_module_xyz");

      expect(result.entry).toBeNull();
      expect(result.retrievalSourceCount).toBe(0);
      expect(result.citationCount).toBe(0);
    });

    it("does not throw for unknown module ID", () => {
      expect(() =>
        getComplaintSourceMapEntry("nonexistent_module_xyz")
      ).not.toThrow();

      expect(() =>
        getComplaintSourceMapForModule("nonexistent_module_xyz")
      ).not.toThrow();
    });
  });

  describe("getComplaintSourceMapForModule", () => {
    it("returns valid result for skin_itching_allergy", () => {
      const result = getComplaintSourceMapForModule("skin_itching_allergy");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("skin_itching_allergy");
      expect(typeof result.retrievalSourceCount).toBe("number");
      expect(typeof result.citationCount).toBe("number");
    });

    it("returns valid result for gi_vomiting_diarrhea", () => {
      const result = getComplaintSourceMapForModule("gi_vomiting_diarrhea");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("gi_vomiting_diarrhea");
    });

    it("returns valid result for respiratory_distress", () => {
      const result = getComplaintSourceMapForModule("respiratory_distress");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("respiratory_distress");
    });

    it("returns valid result for seizure_collapse_neuro", () => {
      const result = getComplaintSourceMapForModule("seizure_collapse_neuro");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("seizure_collapse_neuro");
    });

    it("returns valid result for urinary_obstruction", () => {
      const result = getComplaintSourceMapForModule("urinary_obstruction");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("urinary_obstruction");
      expect(result.entry?.citationIntent).toBe("none");
    });

    it("returns valid result for toxin_poisoning_exposure", () => {
      const result = getComplaintSourceMapForModule("toxin_poisoning_exposure");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("toxin_poisoning_exposure");
    });

    it("returns valid result for limping_mobility_pain", () => {
      const result = getComplaintSourceMapForModule("limping_mobility_pain");

      expect(result.entry).not.toBeNull();
      expect(result.entry?.complaintModuleId).toBe("limping_mobility_pain");
    });
  });

  describe("validateComplaintSourceMap", () => {
    it("passes validation with no errors", () => {
      const result = validateComplaintSourceMap();

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns warnings array", () => {
      const result = validateComplaintSourceMap();

      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("all mapped modules exist in registry", () => {
      const result = validateComplaintSourceMap();

      for (const error of result.errors) {
        expect(error).not.toMatch(/does not exist in registry/);
      }
    });
  });

  describe("entry shape", () => {
    it("each entry has all required fields", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        expect(entry).toHaveProperty("complaintModuleId");
        expect(entry).toHaveProperty("displayName");
        expect(entry).toHaveProperty("vetKnowledgeFamilies");
        expect(entry).toHaveProperty("relevantRedFlags");
        expect(entry).toHaveProperty("retrievalIntent");
        expect(entry).toHaveProperty("citationIntent");
        expect(entry).toHaveProperty("rationaleNotes");
      }
    });

    it("vetKnowledgeFamilies is an array", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        expect(Array.isArray(entry.vetKnowledgeFamilies)).toBe(true);
      }
    });

    it("relevantRedFlags is an array", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        expect(Array.isArray(entry.relevantRedFlags)).toBe(true);
      }
    });

    it("rationaleNotes is an array", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        expect(Array.isArray(entry.rationaleNotes)).toBe(true);
      }
    });
  });

  describe("pack coverage", () => {
    it("covers all MVP modules (pack 1)", () => {
      const mvpIds = [
        "skin_itching_allergy",
        "gi_vomiting_diarrhea",
        "limping_mobility_pain",
      ];

      for (const id of mvpIds) {
        const entry = getComplaintSourceMapEntry(id);
        expect(entry).toBeDefined();
      }
    });

    it("covers all Pack 2 modules", () => {
      const pack2Ids = [
        "respiratory_distress",
        "seizure_collapse_neuro",
        "urinary_obstruction",
      ];

      for (const id of pack2Ids) {
        const entry = getComplaintSourceMapEntry(id);
        expect(entry).toBeDefined();
      }
    });

    it("covers Pack 3 toxin module", () => {
      const entry = getComplaintSourceMapEntry("toxin_poisoning_exposure");

      expect(entry).toBeDefined();
    });
  });

  describe("vet-knowledge scaffold integration", () => {
    it("mapped families return safe metadata from retrieval planner", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        for (const family of entry.vetKnowledgeFamilies) {
          expect(() => planRetrieval({ complaintFamily: family })).not.toThrow();
        }
      }
    });

    it("mapped red flags return safe metadata from retrieval planner", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        if (entry.relevantRedFlags.length > 0) {
          expect(() =>
            planRetrieval({ redFlags: entry.relevantRedFlags })
          ).not.toThrow();
        }
      }
    });

    it("owner-visible citation intent returns safe metadata from citation builder", () => {
      const entries = getAllComplaintSourceMapEntries();

      for (const entry of entries) {
        if (entry.citationIntent === "owner_visible_citation") {
          expect(() =>
            buildCitations({
              complaintFamily: entry.vetKnowledgeFamilies[0],
              redFlags:
                entry.relevantRedFlags.length > 0
                  ? entry.relevantRedFlags
                  : undefined,
            })
          ).not.toThrow();
        }
      }
    });
  });
});
