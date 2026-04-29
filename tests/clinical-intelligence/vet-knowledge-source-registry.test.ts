import {
  getAllSources,
  getSourceById,
  getSourcesByComplaintFamily,
  getSourcesByRedFlag,
  getSourcesByAllowedUse,
  validateRegistry,
  setRegistry,
  type VetKnowledgeSource,
} from "@/lib/clinical-intelligence/vet-knowledge/source-registry";
import {
  VET_KNOWLEDGE_SOURCES,
  getAllVetKnowledgeSummaries,
  getVetKnowledgeSummaryById,
} from "@/lib/clinical-intelligence/vet-knowledge/source-summaries";

const MINIMUM_SOURCE_COUNT = 5;

function loadRegistry(): void {
  setRegistry(VET_KNOWLEDGE_SOURCES);
}

describe("vet knowledge source registry", () => {
  beforeEach(() => {
    loadRegistry();
  });

  describe("source summaries", () => {
    it("exports all summaries as defensive clones", () => {
      const summaries = getAllVetKnowledgeSummaries();

      expect(summaries.length).toBeGreaterThanOrEqual(MINIMUM_SOURCE_COUNT);

      const first = summaries[0];
      first.title = "mutated";
      first.complaintFamilies.push("mutated");

      const second = getAllVetKnowledgeSummaries();
      expect(second[0].title).not.toBe("mutated");
      expect(second[0].complaintFamilies).not.toContain("mutated");
    });

    it("retrieves a summary safely by id", () => {
      const summary = getVetKnowledgeSummaryById(
        "merck-emergency-triage-xabcde"
      );

      expect(summary).toBeDefined();
      expect(summary?.id).toBe("merck-emergency-triage-xabcde");
      expect(summary?.publisher).toBe("Merck");
    });

    it("returns undefined for unknown summary id", () => {
      expect(getVetKnowledgeSummaryById("nonexistent")).toBeUndefined();
    });
  });

  describe("minimum source groups", () => {
    it("includes Merck emergency triage / XABCDE source", () => {
      const merck = VET_KNOWLEDGE_SOURCES.find(
        (s) => s.id === "merck-emergency-triage-xabcde"
      );

      expect(merck).toBeDefined();
      expect(merck?.publisher).toBe("Merck");
      expect(merck?.complaintFamilies).toContain("emergency");
    });

    it("includes AAHA pet emergency signs source", () => {
      const aaha = VET_KNOWLEDGE_SOURCES.find(
        (s) => s.id === "aaha-pet-emergency-signs"
      );

      expect(aaha).toBeDefined();
      expect(aaha?.publisher).toBe("AAHA");
    });

    it("includes AVMA teletriage / VCPR framing source", () => {
      const avma = VET_KNOWLEDGE_SOURCES.find(
        (s) => s.id === "avma-teletriage-vcpr"
      );

      expect(avma).toBeDefined();
      expect(avma?.publisher).toBe("AVMA");
    });

    it("includes Cornell bloat / GDV owner-facing resource", () => {
      const cornell = VET_KNOWLEDGE_SOURCES.find(
        (s) => s.id === "cornell-bloat-gdv-owner"
      );

      expect(cornell).toBeDefined();
      expect(cornell?.publisher).toBe("Cornell");
      expect(cornell?.complaintFamilies).toContain("bloat");
    });

    it("includes internal vet-reviewed question notes source", () => {
      const internal = VET_KNOWLEDGE_SOURCES.find(
        (s) => s.id === "internal-vet-reviewed-question-notes"
      );

      expect(internal).toBeDefined();
      expect(internal?.publisher).toBe("InternalVetReviewed");
    });
  });

  describe("getAllSources", () => {
    it("returns all registered sources", () => {
      const sources = getAllSources();

      expect(sources.length).toBeGreaterThanOrEqual(MINIMUM_SOURCE_COUNT);
    });

    it("returns defensive clones", () => {
      const first = getAllSources()[0];
      first.title = "mutated";

      const second = getAllSources();
      expect(second[0].title).not.toBe("mutated");
    });
  });

  describe("getSourceById", () => {
    it("returns a source by id", () => {
      const source = getSourceById("merck-emergency-triage-xabcde");

      expect(source).toBeDefined();
      expect(source?.id).toBe("merck-emergency-triage-xabcde");
    });

    it("returns undefined for unknown id", () => {
      expect(getSourceById("nonexistent_id")).toBeUndefined();
    });

    it("returns a defensive clone", () => {
      const first = getSourceById("aaha-pet-emergency-signs");
      expect(first).toBeDefined();
      if (!first) throw new Error("Expected source to exist");

      first.title = "mutated";

      const second = getSourceById("aaha-pet-emergency-signs");
      expect(second?.title).not.toBe("mutated");
    });
  });

  describe("getSourcesByComplaintFamily", () => {
    it("filters sources by complaint family", () => {
      const emergencySources = getSourcesByComplaintFamily("emergency");

      expect(emergencySources.length).toBeGreaterThan(0);
      expect(
        emergencySources.every((s) =>
          s.complaintFamilies.includes("emergency")
        )
      ).toBe(true);
    });

    it("returns empty array for unknown family", () => {
      const result = getSourcesByComplaintFamily("nonexistent_family");

      expect(result).toEqual([]);
    });

    it("returns defensive clones", () => {
      const first = getSourcesByComplaintFamily("emergency");
      if (first.length > 0) {
        first[0].title = "mutated";

        const second = getSourcesByComplaintFamily("emergency");
        expect(second[0].title).not.toBe("mutated");
      }
    });
  });

  describe("getSourcesByRedFlag", () => {
    it("filters sources by red flag", () => {
      const bloatSources = getSourcesByRedFlag("unproductive_retching");

      expect(bloatSources.length).toBeGreaterThan(0);
      expect(
        bloatSources.every((s) => s.redFlags.includes("unproductive_retching"))
      ).toBe(true);
    });

    it("returns empty array for unknown red flag", () => {
      const result = getSourcesByRedFlag("nonexistent_flag");

      expect(result).toEqual([]);
    });
  });

  describe("getSourcesByAllowedUse", () => {
    it("filters sources by allowed use", () => {
      const retrievalSources = getSourcesByAllowedUse(
        "retrieval_summary_only"
      );

      expect(retrievalSources.length).toBeGreaterThan(0);
      expect(
        retrievalSources.every(
          (s) => s.allowedUse === "retrieval_summary_only"
        )
      ).toBe(true);
    });

    it("filters owner_visible_citation sources", () => {
      const ownerSources = getSourcesByAllowedUse("owner_visible_citation");

      expect(ownerSources.length).toBeGreaterThan(0);
      expect(
        ownerSources.every(
          (s) => s.allowedUse === "owner_visible_citation"
        )
      ).toBe(true);
    });

    it("filters internal_reasoning sources", () => {
      const internalSources = getSourcesByAllowedUse("internal_reasoning");

      expect(internalSources.length).toBeGreaterThan(0);
      expect(
        internalSources.every((s) => s.allowedUse === "internal_reasoning")
      ).toBe(true);
    });
  });

  describe("validateRegistry", () => {
    it("passes validation for the default registry", () => {
      const result = validateRegistry();

      expect(result.valid).toBe(true);
      expect(result.duplicateIds).toEqual([]);
      expect(result.missingRequiredFields).toEqual([]);
      expect(result.missingReviewedAt).toEqual([]);
      expect(result.treatmentInstructionViolations).toEqual([]);
    });

    it("catches duplicate source IDs", () => {
      const badSources: VetKnowledgeSource[] = [
        {
          id: "duplicate-id",
          title: "First",
          publisher: "Merck",
          topic: "Topic one",
          complaintFamilies: ["emergency"],
          redFlags: [],
          lastReviewedAt: "2026-04-01",
          licenseStatus: "link_only",
          allowedUse: "retrieval_summary_only",
        },
        {
          id: "duplicate-id",
          title: "Second",
          publisher: "AAHA",
          topic: "Topic two",
          complaintFamilies: ["emergency"],
          redFlags: [],
          lastReviewedAt: "2026-04-01",
          licenseStatus: "summarized",
          allowedUse: "owner_visible_citation",
        },
      ];

      const result = validateRegistry(badSources);

      expect(result.valid).toBe(false);
      expect(result.duplicateIds).toContain("duplicate-id");
    });

    it("catches missing required fields", () => {
      const badSources: VetKnowledgeSource[] = [
        {
          id: "missing-fields",
          title: "",
          publisher: "Merck",
          topic: "",
          complaintFamilies: [],
          redFlags: [],
          lastReviewedAt: "2026-04-01",
          licenseStatus: "link_only",
          allowedUse: "retrieval_summary_only",
        },
      ];

      const result = validateRegistry(badSources);

      expect(result.valid).toBe(false);
      expect(result.missingRequiredFields.length).toBeGreaterThan(0);
    });

    it("catches missing lastReviewedAt", () => {
      const badSources: VetKnowledgeSource[] = [
        {
          id: "no-reviewed-at",
          title: "Test",
          publisher: "Merck",
          topic: "Test topic",
          complaintFamilies: ["emergency"],
          redFlags: [],
          lastReviewedAt: "",
          licenseStatus: "link_only",
          allowedUse: "retrieval_summary_only",
        },
      ];

      const result = validateRegistry(badSources);

      expect(result.valid).toBe(false);
      expect(result.missingReviewedAt).toContain("no-reviewed-at");
    });

    it("catches treatment instruction violations in source metadata", () => {
      const badSources: VetKnowledgeSource[] = [
        {
          id: "treatment-violation",
          title: "Give your dog 10mg of medication twice a day",
          publisher: "Merck",
          topic: "Test topic",
          complaintFamilies: ["emergency"],
          redFlags: [],
          lastReviewedAt: "2026-04-01",
          licenseStatus: "link_only",
          allowedUse: "retrieval_summary_only",
        },
      ];

      const result = validateRegistry(badSources);

      expect(result.valid).toBe(false);
      expect(result.treatmentInstructionViolations).toContain(
        "treatment-violation"
      );
    });

    it("catches dosage patterns in source title", () => {
      const badSources: VetKnowledgeSource[] = [
        {
          id: "dosage-violation",
          title: "Dosage: 5ml per kg body weight",
          publisher: "AAHA",
          topic: "Test",
          complaintFamilies: ["emergency"],
          redFlags: [],
          lastReviewedAt: "2026-04-01",
          licenseStatus: "link_only",
          allowedUse: "retrieval_summary_only",
        },
      ];

      const result = validateRegistry(badSources);

      expect(result.valid).toBe(false);
      expect(result.treatmentInstructionViolations).toContain("dosage-violation");
    });
  });

  describe("publisher coverage", () => {
    it("covers all required publishers", () => {
      const publishers = new Set(VET_KNOWLEDGE_SOURCES.map((s) => s.publisher));

      expect(publishers.has("Merck")).toBe(true);
      expect(publishers.has("Cornell")).toBe(true);
      expect(publishers.has("AAHA")).toBe(true);
      expect(publishers.has("AVMA")).toBe(true);
      expect(publishers.has("InternalVetReviewed")).toBe(true);
    });
  });

  describe("complaint family coverage", () => {
    it("covers emergency complaint family", () => {
      const families = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.complaintFamilies)
      );

      expect(families.has("emergency")).toBe(true);
    });

    it("covers multiple complaint families across sources", () => {
      const families = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.complaintFamilies)
      );

      expect(families.size).toBeGreaterThanOrEqual(5);
    });
  });

  describe("red flag coverage", () => {
    it("covers GDV-related red flags", () => {
      const redFlags = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.redFlags)
      );

      expect(redFlags.has("unproductive_retching")).toBe(true);
      expect(redFlags.has("rapid_onset_distension")).toBe(true);
    });

    it("covers respiratory red flags", () => {
      const redFlags = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.redFlags)
      );

      expect(redFlags.has("blue_gums")).toBe(true);
      expect(redFlags.has("breathing_difficulty")).toBe(true);
    });

    it("covers neurological red flags", () => {
      const redFlags = new Set(
        VET_KNOWLEDGE_SOURCES.flatMap((s) => s.redFlags)
      );

      expect(redFlags.has("seizure_activity")).toBe(true);
      expect(redFlags.has("collapse")).toBe(true);
    });
  });

  describe("diagnosis/treatment policy constraints", () => {
    it("no source title contains treatment instructions", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(source.title.toLowerCase()).not.toMatch(
          /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(source.title.toLowerCase()).not.toMatch(
          /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(source.title.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
        expect(source.title.toLowerCase()).not.toMatch(/prescribe/i);
        expect(source.title.toLowerCase()).not.toMatch(
          /treatment\s*(plan|protocol|regimen)/i
        );
        expect(source.title.toLowerCase()).not.toMatch(
          /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
        );
      }
    });

    it("no source topic contains treatment instructions", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(source.topic.toLowerCase()).not.toMatch(
          /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(source.topic.toLowerCase()).not.toMatch(
          /administer\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(source.topic.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
        expect(source.topic.toLowerCase()).not.toMatch(/prescribe/i);
      }
    });

    it("registry validation confirms no treatment instruction violations", () => {
      const result = validateRegistry();

      expect(result.treatmentInstructionViolations).toEqual([]);
    });
  });

  describe("license status and allowed use", () => {
    it("every source has a valid license status", () => {
      const validStatuses = new Set([
        "link_only",
        "summarized",
        "internal_allowed",
      ]);

      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(validStatuses.has(source.licenseStatus)).toBe(true);
      }
    });

    it("every source has a valid allowed use", () => {
      const validUses = new Set([
        "retrieval_summary_only",
        "owner_visible_citation",
        "internal_reasoning",
      ]);

      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(validUses.has(source.allowedUse)).toBe(true);
      }
    });

    it("link_only sources have a URL", () => {
      const linkOnlySources = VET_KNOWLEDGE_SOURCES.filter(
        (s) => s.licenseStatus === "link_only"
      );

      for (const source of linkOnlySources) {
        expect(source.url).toBeTruthy();
      }
    });
  });

  describe("source metadata completeness", () => {
    it("every source has a non-empty title", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(source.title.length).toBeGreaterThan(0);
      }
    });

    it("every source has a non-empty topic", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(source.topic.length).toBeGreaterThan(0);
      }
    });

    it("every source has at least one complaint family", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        expect(source.complaintFamilies.length).toBeGreaterThan(0);
      }
    });

    it("every source has a valid lastReviewedAt date", () => {
      for (const source of VET_KNOWLEDGE_SOURCES) {
        const date = new Date(source.lastReviewedAt);
        expect(isNaN(date.getTime())).toBe(false);
      }
    });
  });
});
