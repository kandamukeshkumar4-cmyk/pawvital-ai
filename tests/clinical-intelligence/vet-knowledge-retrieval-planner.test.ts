import {
  planRetrieval,
  getOwnerVisibleSources,
  type VetKnowledgeRetrievalRequest,
  type VetKnowledgeRetrievalPlan,
} from "@/lib/clinical-intelligence/vet-knowledge/retrieval-planner";
import {
  DEFAULT_MAX_SOURCES,
  CURATED_ONLY,
  OPEN_WEB_SEARCH_ALLOWED,
  RUNTIME_SOURCE_FETCH_ALLOWED,
  DIAGNOSIS_GENERATION_ALLOWED,
  TREATMENT_GENERATION_ALLOWED,
  MEDICATION_GENERATION_ALLOWED,
  DOSAGE_GENERATION_ALLOWED,
  HOME_CARE_GENERATION_ALLOWED,
  OWNER_VISIBLE_ALLOWED_USE,
  containsForbiddenContent,
  getPolicyConstraints,
  isOwnerVisibleAllowed,
} from "@/lib/clinical-intelligence/vet-knowledge/retrieval-policy";
import { VET_KNOWLEDGE_SOURCES } from "@/lib/clinical-intelligence/vet-knowledge/source-summaries";

describe("vet knowledge retrieval policy", () => {
  describe("policy constants", () => {
    it("enforces curated-only sources", () => {
      expect(CURATED_ONLY).toBe(true);
    });

    it("disallows open-web search", () => {
      expect(OPEN_WEB_SEARCH_ALLOWED).toBe(false);
    });

    it("disallows runtime source fetch", () => {
      expect(RUNTIME_SOURCE_FETCH_ALLOWED).toBe(false);
    });

    it("disallows diagnosis generation", () => {
      expect(DIAGNOSIS_GENERATION_ALLOWED).toBe(false);
    });

    it("disallows treatment generation", () => {
      expect(TREATMENT_GENERATION_ALLOWED).toBe(false);
    });

    it("disallows medication generation", () => {
      expect(MEDICATION_GENERATION_ALLOWED).toBe(false);
    });

    it("disallows dosage generation", () => {
      expect(DOSAGE_GENERATION_ALLOWED).toBe(false);
    });

    it("disallows home-care generation", () => {
      expect(HOME_CARE_GENERATION_ALLOWED).toBe(false);
    });

    it("defines owner-visible allowed use constant", () => {
      expect(OWNER_VISIBLE_ALLOWED_USE).toBe("owner_visible_citation");
    });

    it("defines a positive default max sources", () => {
      expect(DEFAULT_MAX_SOURCES).toBeGreaterThan(0);
    });
  });

  describe("isOwnerVisibleAllowed", () => {
    it("returns true for owner_visible_citation", () => {
      expect(isOwnerVisibleAllowed("owner_visible_citation")).toBe(true);
    });

    it("returns false for retrieval_summary_only", () => {
      expect(isOwnerVisibleAllowed("retrieval_summary_only")).toBe(false);
    });

    it("returns false for internal_reasoning", () => {
      expect(isOwnerVisibleAllowed("internal_reasoning")).toBe(false);
    });
  });

  describe("containsForbiddenContent", () => {
    it("detects dosage patterns", () => {
      expect(containsForbiddenContent("Dosage: 5ml per kg")).toBe(true);
    });

    it("detects treatment plan patterns", () => {
      expect(containsForbiddenContent("Treatment plan for dogs")).toBe(true);
    });

    it("detects home care instruction patterns", () => {
      expect(containsForbiddenContent("Home care instructions")).toBe(true);
    });

    it("detects diagnosis patterns", () => {
      expect(containsForbiddenContent("Diagnosis: acute gastroenteritis")).toBe(true);
    });

    it("returns false for safe metadata text", () => {
      expect(
        containsForbiddenContent("Emergency triage framework for rapid assessment")
      ).toBe(false);
    });
  });

  describe("getPolicyConstraints", () => {
    it("returns all constraint keys", () => {
      const constraints = getPolicyConstraints();

      expect(constraints).toHaveProperty("curatedOnly");
      expect(constraints).toHaveProperty("openWebSearchAllowed");
      expect(constraints).toHaveProperty("runtimeSourceFetchAllowed");
      expect(constraints).toHaveProperty("diagnosisGenerationAllowed");
      expect(constraints).toHaveProperty("treatmentGenerationAllowed");
      expect(constraints).toHaveProperty("medicationGenerationAllowed");
      expect(constraints).toHaveProperty("dosageGenerationAllowed");
      expect(constraints).toHaveProperty("homeCareGenerationAllowed");
      expect(constraints).toHaveProperty("defaultMaxSources");
      expect(constraints).toHaveProperty("ownerVisibleAllowedUse");
    });

    it("reflects scaffold restrictions", () => {
      const constraints = getPolicyConstraints();

      expect(constraints.curatedOnly).toBe(true);
      expect(constraints.openWebSearchAllowed).toBe(false);
      expect(constraints.runtimeSourceFetchAllowed).toBe(false);
      expect(constraints.diagnosisGenerationAllowed).toBe(false);
      expect(constraints.treatmentGenerationAllowed).toBe(false);
    });
  });
});

describe("vet knowledge retrieval planner", () => {
  describe("empty request", () => {
    it("returns a safe plan with all sources when no filters provided", () => {
      const plan = planRetrieval({});

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(plan.blockedReasons).toEqual([]);
      expect(Array.isArray(plan.policyWarnings)).toBe(true);
    });

    it("returns defensive clones", () => {
      const plan = planRetrieval({});
      const first = plan.sources[0];

      if (first) {
        const originalTitle = first.title;
        first.title = "mutated";
        first.complaintFamilies.push("mutated");

        const newPlan = planRetrieval({});
        expect(newPlan.sources[0].title).toBe(originalTitle);
        expect(newPlan.sources[0].complaintFamilies).not.toContain("mutated");
      }
    });
  });

  describe("source selection by complaint family", () => {
    it("filters sources by emergency complaint family", () => {
      const plan = planRetrieval({ complaintFamily: "emergency" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) =>
          s.complaintFamilies.some(
            (f) => f.toLowerCase() === "emergency"
          )
        )
      ).toBe(true);
    });

    it("filters sources by gastrointestinal complaint family", () => {
      const plan = planRetrieval({ complaintFamily: "gastrointestinal" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) =>
          s.complaintFamilies.some(
            (f) => f.toLowerCase() === "gastrointestinal"
          )
        )
      ).toBe(true);
    });

    it("filters sources by bloat complaint family", () => {
      const plan = planRetrieval({ complaintFamily: "bloat" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) =>
          s.complaintFamilies.some((f) => f.toLowerCase() === "bloat")
        )
      ).toBe(true);
    });

    it("case-insensitive complaint family matching", () => {
      const planLower = planRetrieval({ complaintFamily: "emergency" });
      const planUpper = planRetrieval({ complaintFamily: "EMERGENCY" });

      expect(planLower.sources.length).toBe(planUpper.sources.length);
    });
  });

  describe("source selection by red flag", () => {
    it("filters sources by unproductive_retching red flag", () => {
      const plan = planRetrieval({ redFlags: ["unproductive_retching"] });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) =>
          s.redFlags.includes("unproductive_retching")
        )
      ).toBe(true);
    });

    it("filters sources by collapse red flag", () => {
      const plan = planRetrieval({ redFlags: ["collapse"] });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) => s.redFlags.includes("collapse"))
      ).toBe(true);
    });

    it("filters sources by multiple red flags (OR logic)", () => {
      const plan = planRetrieval({
        redFlags: ["unproductive_retching", "blue_gums"],
      });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) =>
            s.redFlags.includes("unproductive_retching") ||
            s.redFlags.includes("blue_gums")
        )
      ).toBe(true);
    });

    it("case-insensitive red flag matching", () => {
      const planLower = planRetrieval({ redFlags: ["collapse"] });
      const planUpper = planRetrieval({ redFlags: ["COLLAPSE"] });

      expect(planLower.sources.length).toBe(planUpper.sources.length);
    });
  });

  describe("source selection by allowed use", () => {
    it("filters sources by retrieval_summary_only", () => {
      const plan = planRetrieval({ allowedUse: "retrieval_summary_only" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) => s.allowedUse === "retrieval_summary_only"
        )
      ).toBe(true);
    });

    it("filters sources by owner_visible_citation", () => {
      const plan = planRetrieval({ allowedUse: "owner_visible_citation" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) => s.allowedUse === "owner_visible_citation"
        )
      ).toBe(true);
    });

    it("filters sources by internal_reasoning", () => {
      const plan = planRetrieval({ allowedUse: "internal_reasoning" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every((s) => s.allowedUse === "internal_reasoning")
      ).toBe(true);
    });
  });

  describe("owner-visible citation filtering", () => {
    it("getOwnerVisibleSources returns only owner_visible_citation sources", () => {
      const plan = getOwnerVisibleSources();

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) => s.allowedUse === "owner_visible_citation"
        )
      ).toBe(true);
    });

    it("getOwnerVisibleSources respects complaint family filter", () => {
      const plan = getOwnerVisibleSources({ complaintFamily: "emergency" });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) =>
            s.allowedUse === "owner_visible_citation" &&
            s.complaintFamilies.some(
              (f) => f.toLowerCase() === "emergency"
            )
        )
      ).toBe(true);
    });

    it("getOwnerVisibleSources respects red flag filter", () => {
      const plan = getOwnerVisibleSources({
        redFlags: ["unproductive_retching"],
      });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) =>
            s.allowedUse === "owner_visible_citation" &&
            s.redFlags.includes("unproductive_retching")
        )
      ).toBe(true);
    });
  });

  describe("maxSources limiting", () => {
    it("limits results to maxSources", () => {
      const plan = planRetrieval({ maxSources: 1 });

      expect(plan.sources.length).toBeLessThanOrEqual(1);
    });

    it("limits results to maxSources of 2", () => {
      const plan = planRetrieval({ maxSources: 2 });

      expect(plan.sources.length).toBeLessThanOrEqual(2);
    });

    it("uses DEFAULT_MAX_SOURCES when maxSources not specified", () => {
      const plan = planRetrieval({});

      expect(plan.sources.length).toBeLessThanOrEqual(DEFAULT_MAX_SOURCES);
    });

    it("adds policy warning when sources are limited", () => {
      const allSourcesPlan = planRetrieval({});
      const limitedPlan = planRetrieval({ maxSources: 1 });

      if (allSourcesPlan.sources.length > 1) {
        expect(
          limitedPlan.policyWarnings.some((w) =>
            w.includes("limited to")
          )
        ).toBe(true);
      }
    });
  });

  describe("unknown complaint family returns empty safe result", () => {
    it("returns empty sources for unknown family", () => {
      const plan = planRetrieval({ complaintFamily: "nonexistent_family_xyz" });

      expect(plan.sources).toEqual([]);
      expect(plan.blockedReasons.length).toBeGreaterThan(0);
    });

    it("does not throw for unknown family", () => {
      expect(() =>
        planRetrieval({ complaintFamily: "nonexistent_family_xyz" })
      ).not.toThrow();
    });

    it("includes blocked reason for unknown family", () => {
      const plan = planRetrieval({ complaintFamily: "nonexistent_family_xyz" });

      expect(
        plan.blockedReasons.some((r) => r.includes("unknown complaint family"))
      ).toBe(true);
    });
  });

  describe("unknown red flag returns empty safe result", () => {
    it("returns empty sources when all red flags are unknown", () => {
      const plan = planRetrieval({
        redFlags: ["nonexistent_flag_xyz", "another_unknown_flag"],
      });

      expect(plan.sources).toEqual([]);
      expect(plan.blockedReasons.length).toBeGreaterThan(0);
    });

    it("does not throw for unknown red flags", () => {
      expect(() =>
        planRetrieval({
          redFlags: ["nonexistent_flag_xyz"],
        })
      ).not.toThrow();
    });

    it("includes blocked reason for all unknown red flags", () => {
      const plan = planRetrieval({
        redFlags: ["nonexistent_flag_xyz"],
      });

      expect(
        plan.blockedReasons.some((r) => r.includes("all red flags unknown"))
      ).toBe(true);
    });
  });

  describe("defensive clone behavior", () => {
    it("returned sources are defensive clones of registry sources", () => {
      const plan = planRetrieval({});
      const first = plan.sources[0];

      if (first) {
        const registrySource = VET_KNOWLEDGE_SOURCES.find(
          (s) => s.id === first.id
        );

        expect(first).not.toBe(registrySource);
        expect(first.complaintFamilies).not.toBe(
          registrySource?.complaintFamilies
        );
        expect(first.redFlags).not.toBe(registrySource?.redFlags);
      }
    });

    it("mutating returned sources does not affect subsequent calls", () => {
      const plan1 = planRetrieval({ complaintFamily: "emergency" });
      if (plan1.sources.length > 0) {
        plan1.sources[0].title = "mutated_title";
        plan1.sources[0].complaintFamilies.push("mutated_family");
      }

      const plan2 = planRetrieval({ complaintFamily: "emergency" });
      if (plan2.sources.length > 0) {
        expect(plan2.sources[0].title).not.toBe("mutated_title");
        expect(plan2.sources[0].complaintFamilies).not.toContain(
          "mutated_family"
        );
      }
    });
  });

  describe("no URL fetching / no external call behavior", () => {
    it("plan result sources do not contain fetched content", () => {
      const plan = planRetrieval({});

      for (const source of plan.sources) {
        expect(source).not.toHaveProperty("fetchedContent");
        expect(source).not.toHaveProperty("pageContent");
        expect(source).not.toHaveProperty("retrievedText");
      }
    });

    it("plan result only contains registry metadata fields", () => {
      const plan = planRetrieval({});

      for (const source of plan.sources) {
        expect(source).toHaveProperty("id");
        expect(source).toHaveProperty("title");
        expect(source).toHaveProperty("publisher");
        expect(source).toHaveProperty("topic");
        expect(source).toHaveProperty("complaintFamilies");
        expect(source).toHaveProperty("redFlags");
        expect(source).toHaveProperty("allowedUse");
        expect(source).toHaveProperty("licenseStatus");
        expect(source).toHaveProperty("lastReviewedAt");
      }
    });
  });

  describe("no diagnosis/treatment/dosage/home-care policy text in planner output", () => {
    it("no source title in plan contains diagnosis text", () => {
      const plan = planRetrieval({});

      for (const source of plan.sources) {
        expect(source.title.toLowerCase()).not.toMatch(
          /diagnosis\s*(is|:|—)/i
        );
      }
    });

    it("no source topic in plan contains treatment instructions", () => {
      const plan = planRetrieval({});

      for (const source of plan.sources) {
        expect(source.topic.toLowerCase()).not.toMatch(
          /give\s+(your\s+)?(pet|dog|cat)\s+\w+\s*(mg|ml|tablet|pill|dose)/i
        );
        expect(source.topic.toLowerCase()).not.toMatch(
          /treatment\s*(plan|protocol|regimen)/i
        );
        expect(source.topic.toLowerCase()).not.toMatch(
          /home\s*[-\s]*care\s*(instructions?|steps?|tips?)/i
        );
      }
    });

    it("no source in plan contains dosage patterns", () => {
      const plan = planRetrieval({});

      for (const source of plan.sources) {
        const combined = `${source.title} ${source.topic}`;
        expect(combined.toLowerCase()).not.toMatch(/dosage\s*(is|of|:)/i);
      }
    });
  });

  describe("retrieval failure policy: empty result is safe and does not throw", () => {
    it("returns safe empty plan on empty request object", () => {
      const plan = planRetrieval();

      expect(Array.isArray(plan.sources)).toBe(true);
      expect(Array.isArray(plan.blockedReasons)).toBe(true);
      expect(Array.isArray(plan.policyWarnings)).toBe(true);
    });

    it("does not throw when request is undefined", () => {
      expect(() => planRetrieval(undefined as unknown as VetKnowledgeRetrievalRequest)).not.toThrow();
    });

    it("returns arrays even when no sources match combined filters", () => {
      const plan = planRetrieval({
        complaintFamily: "nonexistent_xyz",
        redFlags: ["nonexistent_flag_xyz"],
      });

      expect(plan.sources).toEqual([]);
      expect(Array.isArray(plan.blockedReasons)).toBe(true);
      expect(Array.isArray(plan.policyWarnings)).toBe(true);
    });

    it("safe empty plan has no sources", () => {
      const plan = planRetrieval({ complaintFamily: "nonexistent_xyz" });

      expect(plan.sources.length).toBe(0);
    });
  });

  describe("combined filters", () => {
    it("filters by complaint family and red flag together", () => {
      const plan = planRetrieval({
        complaintFamily: "gastrointestinal",
        redFlags: ["unproductive_retching"],
      });

      expect(plan.sources.length).toBeGreaterThan(0);
      expect(
        plan.sources.every(
          (s) =>
            s.complaintFamilies.some(
              (f) => f.toLowerCase() === "gastrointestinal"
            ) && s.redFlags.includes("unproductive_retching")
        )
      ).toBe(true);
    });

    it("filters by complaint family, red flag, and allowed use together", () => {
      const plan = planRetrieval({
        complaintFamily: "emergency",
        redFlags: ["collapse"],
        allowedUse: "retrieval_summary_only",
      });

      expect(plan.sources.length).toBeGreaterThanOrEqual(0);
      if (plan.sources.length > 0) {
        expect(
          plan.sources.every(
            (s) =>
              s.complaintFamilies.some(
                (f) => f.toLowerCase() === "emergency"
              ) &&
              s.redFlags.includes("collapse") &&
              s.allowedUse === "retrieval_summary_only"
          )
        ).toBe(true);
      }
    });

    it("respects maxSources with combined filters", () => {
      const plan = planRetrieval({
        complaintFamily: "emergency",
        maxSources: 1,
      });

      expect(plan.sources.length).toBeLessThanOrEqual(1);
    });
  });

  describe("plan result shape", () => {
    it("returns VetKnowledgeRetrievalPlan shape", () => {
      const plan = planRetrieval({});

      expect(plan).toHaveProperty("sources");
      expect(plan).toHaveProperty("blockedReasons");
      expect(plan).toHaveProperty("policyWarnings");
    });

    it("sources is an array", () => {
      const plan = planRetrieval({});

      expect(Array.isArray(plan.sources)).toBe(true);
    });

    it("blockedReasons is an array", () => {
      const plan = planRetrieval({});

      expect(Array.isArray(plan.blockedReasons)).toBe(true);
    });

    it("policyWarnings is an array", () => {
      const plan = planRetrieval({});

      expect(Array.isArray(plan.policyWarnings)).toBe(true);
    });
  });
});
