import {
  getICD10CodesForDisease,
  getAllICD10Categories,
  searchICD10ByCode,
  searchICD10ByDescription,
  generateICD10Summary,
  getICD10Stats,
} from "../src/lib/icd-10-mapper";

const PRE_WAVE2_MAPPED_DISEASES = 46;
const PRE_WAVE2_TOTAL_CODES = 52;
const WAVE2_BENCHMARK_GAPS_ADDED = 20;

describe("VET-900 Phase 6: ICD-10 Mapper", () => {
  describe("getICD10CodesForDisease", () => {
    it("returns codes for wound_infection", () => {
      const result = getICD10CodesForDisease("wound_infection");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("L03.90");
      expect(result!.alternative_codes.length).toBeGreaterThan(0);
    });

    it("returns codes for hot_spots", () => {
      const result = getICD10CodesForDisease("hot_spots");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("L30.9");
      expect(result!.primary_code.urgency).toBe("low");
    });

    it("returns codes for cruciate_ligament_rupture", () => {
      const result = getICD10CodesForDisease("cruciate_ligament_rupture");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("S83.51");
    });

    it("returns codes for gastroenteritis", () => {
      const result = getICD10CodesForDisease("gastroenteritis");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("K52.9");
    });

    it("returns codes for gdv (emergency)", () => {
      const result = getICD10CodesForDisease("gdv");
      expect(result).not.toBeNull();
      expect(result!.primary_code.urgency).toBe("emergency");
    });

    it("returns null for unmapped diseases", () => {
      const result = getICD10CodesForDisease("unknown_condition_xyz");
      expect(result).toBeNull();
    });

    it("handles disease names with spaces", () => {
      const result = getICD10CodesForDisease("hip dysplasia");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("M24.85");
    });

    it("handles mixed case disease names", () => {
      const result = getICD10CodesForDisease("Pneumonia");
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe("J18.9");
    });

    it.each([
      ["pain_general", "R52"],
      ["allergic_dermatitis", "L23.9"],
      ["heart_failure", "I50.9"],
      ["ccl_rupture", "S83.51"],
      ["pyometra", "N71.9"],
      ["seizure_disorder", "G40.9"],
      ["ivdd", "M51.9"],
      ["skin_mass", "R22.9"],
      ["cognitive_dysfunction", "F03.90"],
      ["pleural_effusion", "J90"],
      ["bloat", "K56.69"],
      ["oral_tumor", "D49.0"],
      ["dystocia", "O66.9"],
      ["hypoglycemia", "E16.2"],
      ["urinary_infection", "N39.0"],
      ["sudden_acquired_retinal_degeneration", "H53.9"],
      ["heat_stroke", "T67.0"],
      ["ear_infection_bacterial", "H60.9"],
      ["urinary_stones", "N21.9"],
      ["megaesophagus", "K22.89"],
    ])("covers wave-2 benchmark gap %s", (disease, expectedCode) => {
      const result = getICD10CodesForDisease(disease);
      expect(result).not.toBeNull();
      expect(result!.primary_code.code).toBe(expectedCode);
      expect(result!.primary_code.notes).toContain("Reference-only");
    });

    it("preserves emergency urgency for heart failure and hypoglycemia", () => {
      const heartFailure = getICD10CodesForDisease("heart_failure");
      const hypoglycemia = getICD10CodesForDisease("hypoglycemia");

      expect(heartFailure).not.toBeNull();
      expect(heartFailure!.primary_code.urgency).toBe("emergency");
      expect(hypoglycemia).not.toBeNull();
      expect(hypoglycemia!.primary_code.urgency).toBe("emergency");
    });
  });

  describe("getAllICD10Categories", () => {
    it("returns non-empty categories array", () => {
      const categories = getAllICD10Categories();
      expect(categories.length).toBeGreaterThan(5);
    });

    it("includes skin-related category", () => {
      const categories = getAllICD10Categories();
      expect(categories.some((c) => c.toLowerCase().includes("skin"))).toBe(true);
    });

    it("includes digestive system category", () => {
      const categories = getAllICD10Categories();
      expect(categories.some((c) => c.toLowerCase().includes("digestive"))).toBe(true);
    });

    it("categories are sorted alphabetically", () => {
      const categories = getAllICD10Categories();
      const sorted = [...categories].sort();
      expect(categories).toEqual(sorted);
    });
  });

  describe("searchICD10ByCode", () => {
    it("finds exact code match", () => {
      const results = searchICD10ByCode("L03.90");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].code).toBe("L03.90");
    });

    it("finds partial code prefix matches", () => {
      const results = searchICD10ByCode("L03");
      expect(results.length).toBeGreaterThan(0);
      results.forEach((r) => {
        expect(r.code.startsWith("L03")).toBe(true);
      });
    });

    it("returns empty array for non-existent code", () => {
      const results = searchICD10ByCode("ZZZ.99");
      expect(results).toEqual([]);
    });
  });

  describe("searchICD10ByDescription", () => {
    it("finds matches by description text", () => {
      const results = searchICD10ByDescription("dermatitis");
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds matches by category", () => {
      const results = searchICD10ByDescription("respiratory");
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds matches by notes", () => {
      const results = searchICD10ByDescription("bloat");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.code === "K56.69")).toBe(true);
    });

    it("is case-insensitive", () => {
      const resultsLower = searchICD10ByDescription("pneumonia");
      const resultsUpper = searchICD10ByDescription("PNEUMONIA");
      expect(resultsLower).toEqual(resultsUpper);
    });
  });

  describe("generateICD10Summary", () => {
    it("returns sorted results by probability", () => {
      const diseases = [
        { name: "wound_infection", probability: 0.3 },
        { name: "hot_spots", probability: 0.7 },
        { name: "dermatitis", probability: 0.5 },
      ];
      const summary = generateICD10Summary(diseases);
      expect(summary.length).toBe(3);
      expect(summary[0].probability).toBe(0.7);
      expect(summary[1].probability).toBe(0.5);
      expect(summary[2].probability).toBe(0.3);
    });

    it("filters out unmapped diseases", () => {
      const diseases = [
        { name: "wound_infection", probability: 0.5 },
        { name: "unknown_xyz", probability: 0.3 },
      ];
      const summary = generateICD10Summary(diseases);
      expect(summary.length).toBe(1);
      expect(summary[0].disease).toBe("wound_infection");
    });

    it("includes ICD-10 codes in results", () => {
      const diseases = [{ name: "parvovirus", probability: 0.8 }];
      const summary = generateICD10Summary(diseases);
      expect(summary[0].primary_code.code).toBe("B08.8");
    });
  });

  describe("getICD10Stats", () => {
    it("reflects the documented wave-2 coverage expansion", () => {
      const stats = getICD10Stats();
      expect(stats.total_diseases_mapped).toBe(
        PRE_WAVE2_MAPPED_DISEASES + WAVE2_BENCHMARK_GAPS_ADDED,
      );
      expect(stats.total_codes).toBe(
        PRE_WAVE2_TOTAL_CODES + WAVE2_BENCHMARK_GAPS_ADDED,
      );
      expect(stats.categories).toBeGreaterThan(5);
      expect(stats.emergency_codes).toBeGreaterThan(0);
    });

    it("emergency codes count is reasonable", () => {
      const stats = getICD10Stats();
      expect(stats.emergency_codes).toBeLessThan(stats.total_codes);
      expect(stats.emergency_codes).toBeGreaterThan(3); // gdv, parvovirus, toxin, etc.
    });
  });
});
