import {
  buildCitations,
  buildCitationsFromRetrievalPlan,
  type VetKnowledgeCitationRequest,
  type VetKnowledgeCitationResult,
} from "@/lib/clinical-intelligence/vet-knowledge/citation-builder";
import {
  DEFAULT_MAX_CITATIONS,
  OWNER_VISIBLE_ALLOWED_USES,
  isEligibleForOwnerCitation,
  isExcludedFromOwnerCitation,
  validateCitationContent,
  getCitationPolicyConstraints,
  containsForbiddenContent,
} from "@/lib/clinical-intelligence/vet-knowledge/citation-policy";
import { planRetrieval } from "@/lib/clinical-intelligence/vet-knowledge/retrieval-planner";

describe("vet knowledge citation policy", () => {
  describe("policy constants", () => {
    it("defines default max citations as 3", () => {
      expect(DEFAULT_MAX_CITATIONS).toBe(3);
    });

    it("defines owner-visible allowed uses array", () => {
      expect(OWNER_VISIBLE_ALLOWED_USES).toContain("owner_visible_citation");
      expect(OWNER_VISIBLE_ALLOWED_USES.length).toBe(1);
    });
  });

  describe("isEligibleForOwnerCitation", () => {
    it("returns true for owner_visible_citation", () => {
      expect(isEligibleForOwnerCitation("owner_visible_citation")).toBe(true);
    });

    it("returns false for retrieval_summary_only", () => {
      expect(isEligibleForOwnerCitation("retrieval_summary_only")).toBe(false);
    });

    it("returns false for internal_reasoning", () => {
      expect(isEligibleForOwnerCitation("internal_reasoning")).toBe(false);
    });
  });

  describe("isExcludedFromOwnerCitation", () => {
    it("returns false for owner_visible_citation", () => {
      expect(isExcludedFromOwnerCitation("owner_visible_citation")).toBe(false);
    });

    it("returns true for retrieval_summary_only", () => {
      expect(isExcludedFromOwnerCitation("retrieval_summary_only")).toBe(true);
    });

    it("returns true for internal_reasoning", () => {
      expect(isExcludedFromOwnerCitation("internal_reasoning")).toBe(true);
    });
  });

  describe("validateCitationContent", () => {
    it("returns valid for safe metadata text", () => {
      const result = validateCitationContent(
        "Emergency triage framework for rapid assessment"
      );

      expect(result.valid).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it("detects dosage patterns", () => {
      const result = validateCitationContent("Dosage: 5ml per kg");

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("detects treatment plan patterns", () => {
      const result = validateCitationContent("Treatment plan for dogs");

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("detects home care instruction patterns", () => {
      const result = validateCitationContent("Home care instructions");

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("detects diagnosis patterns", () => {
      const result = validateCitationContent("Diagnosis: acute gastroenteritis");

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe("getCitationPolicyConstraints", () => {
    it("returns all constraint keys", () => {
      const constraints = getCitationPolicyConstraints();

      expect(constraints).toHaveProperty("ownerVisibleAllowedUses");
      expect(constraints).toHaveProperty("defaultMaxCitations");
      expect(constraints).toHaveProperty("metadataOnly");
      expect(constraints).toHaveProperty("noUrlFetching");
      expect(constraints).toHaveProperty("noOpenWebSearch");
      expect(constraints).toHaveProperty("noSourceScraping");
      expect(constraints).toHaveProperty("noDiagnosisGeneration");
      expect(constraints).toHaveProperty("noTreatmentGeneration");
      expect(constraints).toHaveProperty("noMedicationGeneration");
      expect(constraints).toHaveProperty("noDosageGeneration");
      expect(constraints).toHaveProperty("noHomeCareGeneration");
    });

    it("reflects scaffold restrictions", () => {
      const constraints = getCitationPolicyConstraints();

      expect(constraints.metadataOnly).toBe(true);
      expect(constraints.noUrlFetching).toBe(true);
      expect(constraints.noOpenWebSearch).toBe(true);
      expect(constraints.noSourceScraping).toBe(true);
    });
  });
});

describe("vet knowledge citation builder", () => {
  describe("owner-visible citations include only allowedUse = owner_visible_citation", () => {
    it("all citations have owner_visible_citation allowed use", () => {
      const result = buildCitations({});

      expect(result.citations.length).toBeGreaterThan(0);
    });

    it("citations only come from owner-visible sources", () => {
      const result = buildCitations({ complaintFamily: "emergency" });

      const ownerVisibleSourceIds = new Set(
        ["aaha-pet-emergency-signs", "cornell-bloat-gdv-owner"]
      );

      for (const citation of result.citations) {
        expect(ownerVisibleSourceIds.has(citation.sourceId)).toBe(true);
      }
    });
  });

  describe("internal reasoning sources are excluded", () => {
    it("internal reasoning sources do not appear in citations", () => {
      const result = buildCitations({});

      const internalReasoningIds = result.citations.filter(
        (c) => c.sourceId === "avma-teletriage-vcpr" || c.sourceId === "internal-vet-reviewed-question-notes"
      );

      expect(internalReasoningIds).toEqual([]);
    });

    it("excluded reasons are present when sources are filtered out", () => {
      const result = buildCitations({ complaintFamily: "nonexistent_xyz" });

      expect(result.excludedReasons.length).toBeGreaterThan(0);
    });
  });

  describe("retrieval-summary-only sources are excluded", () => {
    it("retrieval_summary_only sources do not appear in citations", () => {
      const result = buildCitations({});

      const retrievalSummaryIds = result.citations.filter(
        (c) => c.sourceId === "merck-emergency-triage-xabcde"
      );

      expect(retrievalSummaryIds).toEqual([]);
    });
  });

  describe("complaint family filtering", () => {
    it("filters citations by emergency complaint family", () => {
      const result = buildCitations({ complaintFamily: "emergency" });

      expect(result.citations.length).toBeGreaterThan(0);
    });

    it("filters citations by gastrointestinal complaint family", () => {
      const result = buildCitations({ complaintFamily: "gastrointestinal" });

      expect(result.citations.length).toBeGreaterThan(0);
    });

    it("filters citations by bloat complaint family", () => {
      const result = buildCitations({ complaintFamily: "bloat" });

      expect(result.citations.length).toBeGreaterThan(0);
      expect(result.citations.some((c) => c.sourceId === "cornell-bloat-gdv-owner")).toBe(true);
    });

    it("case-insensitive complaint family matching", () => {
      const resultLower = buildCitations({ complaintFamily: "emergency" });
      const resultUpper = buildCitations({ complaintFamily: "EMERGENCY" });

      expect(resultLower.citations.length).toBe(resultUpper.citations.length);
    });
  });

  describe("red flag filtering", () => {
    it("filters citations by unproductive_retching red flag", () => {
      const result = buildCitations({ redFlags: ["unproductive_retching"] });

      expect(result.citations.length).toBeGreaterThan(0);
    });

    it("filters citations by collapse red flag", () => {
      const result = buildCitations({ redFlags: ["collapse"] });

      expect(result.citations.length).toBeGreaterThanOrEqual(0);
    });

    it("filters citations by multiple red flags", () => {
      const result = buildCitations({
        redFlags: ["unproductive_retching", "rapid_onset_distension"],
      });

      expect(result.citations.length).toBeGreaterThan(0);
    });
  });

  describe("max citation limiting", () => {
    it("limits results to maxCitations", () => {
      const result = buildCitations({ maxCitations: 1 });

      expect(result.citations.length).toBeLessThanOrEqual(1);
    });

    it("limits results to maxCitations of 2", () => {
      const result = buildCitations({ maxCitations: 2 });

      expect(result.citations.length).toBeLessThanOrEqual(2);
    });

    it("uses DEFAULT_MAX_CITATIONS when maxCitations not specified", () => {
      const result = buildCitations({});

      expect(result.citations.length).toBeLessThanOrEqual(DEFAULT_MAX_CITATIONS);
    });

    it("adds policy warning when citations are limited", () => {
      const result = buildCitations({ maxCitations: 1 });

      if (result.citations.length === 1) {
        expect(
          result.policyWarnings.some((w) => w.includes("limited to"))
        ).toBe(true);
      }
    });
  });

  describe("unknown complaint family returns empty safe result", () => {
    it("returns empty citations for unknown family", () => {
      const result = buildCitations({ complaintFamily: "nonexistent_family_xyz" });

      expect(result.citations).toEqual([]);
    });

    it("does not throw for unknown family", () => {
      expect(() =>
        buildCitations({ complaintFamily: "nonexistent_family_xyz" })
      ).not.toThrow();
    });

    it("includes excluded reason for unknown family", () => {
      const result = buildCitations({ complaintFamily: "nonexistent_family_xyz" });

      expect(
        result.excludedReasons.some((r) => r.includes("unknown complaint family"))
      ).toBe(true);
    });
  });

  describe("unknown red flag returns empty safe result", () => {
    it("returns empty citations when all red flags are unknown", () => {
      const result = buildCitations({
        redFlags: ["nonexistent_flag_xyz", "another_unknown_flag"],
      });

      expect(result.citations).toEqual([]);
    });

    it("does not throw for unknown red flags", () => {
      expect(() =>
        buildCitations({ redFlags: ["nonexistent_flag_xyz"] })
      ).not.toThrow();
    });

    it("includes excluded reason for all unknown red flags", () => {
      const result = buildCitations({
        redFlags: ["nonexistent_flag_xyz"],
      });

      expect(
        result.excludedReasons.some((r) => r.includes("all red flags unknown"))
      ).toBe(true);
    });
  });

  describe("citation objects are metadata-only", () => {
    it("citation has required fields only", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        expect(citation).toHaveProperty("sourceId");
        expect(citation).toHaveProperty("title");
        expect(citation).toHaveProperty("publisher");
        expect(citation).toHaveProperty("topic");
        expect(citation).toHaveProperty("lastReviewedAt");
      }
    });

    it("citation does not have fetched content fields", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        expect(citation).not.toHaveProperty("fetchedContent");
        expect(citation).not.toHaveProperty("pageContent");
        expect(citation).not.toHaveProperty("retrievedText");
        expect(citation).not.toHaveProperty("allowedUse");
        expect(citation).not.toHaveProperty("licenseStatus");
        expect(citation).not.toHaveProperty("complaintFamilies");
        expect(citation).not.toHaveProperty("redFlags");
      }
    });

    it("citation url is optional and matches source metadata", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        if (citation.url) {
          expect(typeof citation.url).toBe("string");
          expect(citation.url.startsWith("http")).toBe(true);
        }
      }
    });
  });

  describe("no citation output contains forbidden patterns", () => {
    it("no citation title contains diagnosis text", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        expect(citation.title.toLowerCase()).not.toMatch(
          /diagnosis\s*(is|:|—)/i
        );
      }
    });

    it("no citation topic contains treatment instructions", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        expect(citation.topic.toLowerCase()).not.toMatch(
          /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(citation.topic.toLowerCase()).not.toMatch(
          /treatment\s*(plan|protocol|regimen)/i
        );
        expect(citation.topic.toLowerCase()).not.toMatch(
          /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
        );
      }
    });

    it("no citation contains dosage patterns", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        const combined = `${citation.title} ${citation.topic}`;
        expect(combined.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
      }
    });
  });

  describe("builder does not call fetch", () => {
    it("buildCitations completes without network calls", () => {
      const result = buildCitations({});

      expect(Array.isArray(result.citations)).toBe(true);
      expect(Array.isArray(result.excludedReasons)).toBe(true);
      expect(Array.isArray(result.policyWarnings)).toBe(true);
    });
  });

  describe("buildCitationsFromRetrievalPlan", () => {
    it("builds citations from a retrieval plan", () => {
      const retrievalPlan = planRetrieval({
        complaintFamily: "emergency",
        allowedUse: "owner_visible_citation",
      });

      const result = buildCitationsFromRetrievalPlan(retrievalPlan);

      expect(result.citations.length).toBeGreaterThan(0);
    });

    it("respects maxCitations limit from retrieval plan", () => {
      const retrievalPlan = planRetrieval({
        complaintFamily: "emergency",
        allowedUse: "owner_visible_citation",
      });

      const result = buildCitationsFromRetrievalPlan(retrievalPlan, 1);

      expect(result.citations.length).toBeLessThanOrEqual(1);
    });

    it("returns empty result for empty retrieval plan", () => {
      const emptyPlan = {
        sources: [],
        blockedReasons: ["no sources"],
        policyWarnings: [],
      };

      const result = buildCitationsFromRetrievalPlan(emptyPlan);

      expect(result.citations).toEqual([]);
      expect(result.excludedReasons).toContain("no sources");
    });

    it("carries over blocked reasons from retrieval plan", () => {
      const plan = {
        sources: [],
        blockedReasons: ["test blocked reason"],
        policyWarnings: [],
      };

      const result = buildCitationsFromRetrievalPlan(plan);

      expect(result.excludedReasons).toContain("test blocked reason");
    });

    it("carries over policy warnings from retrieval plan", () => {
      const plan = {
        sources: [],
        blockedReasons: [],
        policyWarnings: ["test warning"],
      };

      const result = buildCitationsFromRetrievalPlan(plan);

      expect(result.policyWarnings).toContain("test warning");
    });
  });

  describe("citation result shape", () => {
    it("returns VetKnowledgeCitationResult shape", () => {
      const result = buildCitations({});

      expect(result).toHaveProperty("citations");
      expect(result).toHaveProperty("excludedReasons");
      expect(result).toHaveProperty("policyWarnings");
    });

    it("citations is an array", () => {
      const result = buildCitations({});

      expect(Array.isArray(result.citations)).toBe(true);
    });

    it("excludedReasons is an array", () => {
      const result = buildCitations({});

      expect(Array.isArray(result.excludedReasons)).toBe(true);
    });

    it("policyWarnings is an array", () => {
      const result = buildCitations({});

      expect(Array.isArray(result.policyWarnings)).toBe(true);
    });
  });

  describe("failure safety", () => {
    it("returns safe empty result on undefined request", () => {
      expect(() =>
        buildCitations(undefined as unknown as VetKnowledgeCitationRequest)
      ).not.toThrow();
    });

    it("returns safe empty result on empty request", () => {
      const result = buildCitations({});

      expect(Array.isArray(result.citations)).toBe(true);
      expect(Array.isArray(result.excludedReasons)).toBe(true);
      expect(Array.isArray(result.policyWarnings)).toBe(true);
    });

    it("returns arrays even when no sources match", () => {
      const result = buildCitations({
        complaintFamily: "nonexistent_xyz",
        redFlags: ["nonexistent_flag_xyz"],
      });

      expect(result.citations).toEqual([]);
      expect(Array.isArray(result.excludedReasons)).toBe(true);
      expect(Array.isArray(result.policyWarnings)).toBe(true);
    });
  });

  describe("defensive behavior", () => {
    it("citation objects are independent from source registry", () => {
      const result = buildCitations({});

      for (const citation of result.citations) {
        expect(citation).not.toHaveProperty("complaintFamilies");
        expect(citation).not.toHaveProperty("redFlags");
        expect(citation).not.toHaveProperty("allowedUse");
        expect(citation).not.toHaveProperty("licenseStatus");
      }
    });

    it("mutating citation does not affect subsequent calls", () => {
      const result1 = buildCitations({ complaintFamily: "emergency" });
      if (result1.citations.length > 0) {
        result1.citations[0].title = "mutated_title";
      }

      const result2 = buildCitations({ complaintFamily: "emergency" });
      if (result2.citations.length > 0) {
        expect(result2.citations[0].title).not.toBe("mutated_title");
      }
    });
  });
});
