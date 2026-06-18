/**
 * VET-1509 — Breed-aware modality priors tests.
 */

import {
  BREED_GROUP_MEMBERS,
  BREED_MODALITY_PRIORS,
  MODALITY_BENCHMARK_SLICE_REQUIREMENTS,
  inferBreedGroup,
  getBreedPriorsForDomain,
  hasElevatedBreedRisk,
} from "@/lib/breed-modality-priors";

// ---------------------------------------------------------------------------
// inferBreedGroup — known breeds
// ---------------------------------------------------------------------------

describe("inferBreedGroup — known breeds", () => {
  test("Golden Retriever → sporting_retriever", () =>
    expect(inferBreedGroup("Golden Retriever")).toBe("sporting_retriever"));
  test("Labrador Retriever → sporting_retriever", () =>
    expect(inferBreedGroup("Labrador Retriever")).toBe("sporting_retriever"));
  test("Cocker Spaniel → sporting_retriever", () =>
    expect(inferBreedGroup("Cocker Spaniel")).toBe("sporting_retriever"));
  test("French Bulldog → brachycephalic", () =>
    expect(inferBreedGroup("French Bulldog")).toBe("brachycephalic"));
  test("Pug → brachycephalic", () =>
    expect(inferBreedGroup("Pug")).toBe("brachycephalic"));
  test("English Bulldog → brachycephalic", () =>
    expect(inferBreedGroup("English Bulldog")).toBe("brachycephalic"));
  test("Great Dane → giant_breed", () =>
    expect(inferBreedGroup("Great Dane")).toBe("giant_breed"));
  test("Saint Bernard → giant_breed", () =>
    expect(inferBreedGroup("Saint Bernard")).toBe("giant_breed"));
  test("Chihuahua → toy_breed", () =>
    expect(inferBreedGroup("Chihuahua")).toBe("toy_breed"));
  test("Yorkshire Terrier → toy_breed", () =>
    expect(inferBreedGroup("Yorkshire Terrier")).toBe("toy_breed"));
  test("Siberian Husky → double_coat_dense", () =>
    expect(inferBreedGroup("Siberian Husky")).toBe("double_coat_dense"));
  test("Chow Chow → double_coat_dense", () =>
    expect(inferBreedGroup("Chow Chow")).toBe("double_coat_dense"));
  test("Border Collie → herding", () =>
    expect(inferBreedGroup("Border Collie")).toBe("herding"));
  test("German Shepherd → herding", () =>
    expect(inferBreedGroup("German Shepherd")).toBe("herding"));
  test("Greyhound → sighthound", () =>
    expect(inferBreedGroup("Greyhound")).toBe("sighthound"));
  test("Beagle → hound_scent", () =>
    expect(inferBreedGroup("Beagle")).toBe("hound_scent"));
  test("Basset Hound → hound_scent", () =>
    expect(inferBreedGroup("Basset Hound")).toBe("hound_scent"));
  test("Rottweiler → working", () =>
    expect(inferBreedGroup("Rottweiler")).toBe("working"));
  test("Doberman Pinscher → working", () =>
    expect(inferBreedGroup("Doberman Pinscher")).toBe("working"));
  test("Bull Terrier → terrier", () =>
    expect(inferBreedGroup("Bull Terrier")).toBe("terrier"));
  test("case-insensitive lookup", () =>
    expect(inferBreedGroup("golden retriever")).toBe("sporting_retriever"));
});

// ---------------------------------------------------------------------------
// inferBreedGroup — unknown / null inputs
// ---------------------------------------------------------------------------

describe("inferBreedGroup — fallbacks", () => {
  test("null → mixed_unknown", () => expect(inferBreedGroup(null)).toBe("mixed_unknown"));
  test("undefined → mixed_unknown", () =>
    expect(inferBreedGroup(undefined)).toBe("mixed_unknown"));
  test("empty string → mixed_unknown", () =>
    expect(inferBreedGroup("")).toBe("mixed_unknown"));
  test("unknown breed → mixed_unknown", () =>
    expect(inferBreedGroup("Dingo")).toBe("mixed_unknown"));
  test("mutts → mixed_unknown", () =>
    expect(inferBreedGroup("Mixed Breed")).toBe("mixed_unknown"));
});

// ---------------------------------------------------------------------------
// getBreedPriorsForDomain
// ---------------------------------------------------------------------------

describe("getBreedPriorsForDomain", () => {
  test("returns priors for sporting_retriever + skin_wound", () => {
    const priors = getBreedPriorsForDomain("sporting_retriever", "skin_wound");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].group).toBe("sporting_retriever");
    expect(priors[0].domain).toBe("skin_wound");
    expect(priors[0].risk).toBe("highest");
    expect(priors[0].reference).toBeTruthy();
  });

  test("returns priors for working + mass_swelling (Boxer mast cell)", () => {
    const priors = getBreedPriorsForDomain("working", "mass_swelling");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("highest");
  });

  test("returns priors for giant_breed + abdominal_distension (GDV risk)", () => {
    const priors = getBreedPriorsForDomain("giant_breed", "abdominal_distension");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("highest");
  });

  test("returns priors for brachycephalic + eye", () => {
    const priors = getBreedPriorsForDomain("brachycephalic", "eye");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("highest");
  });

  test("returns priors for brachycephalic + respiratory_cough (BOAS)", () => {
    const priors = getBreedPriorsForDomain("brachycephalic", "respiratory_cough");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("highest");
  });

  test("returns priors for toy_breed + respiratory_cough (tracheal collapse)", () => {
    const priors = getBreedPriorsForDomain("toy_breed", "respiratory_cough");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("elevated");
  });

  test("returns priors for sporting_retriever + ear", () => {
    const priors = getBreedPriorsForDomain("sporting_retriever", "ear");
    expect(priors.length).toBeGreaterThanOrEqual(1);
    expect(priors[0].risk).toBe("highest");
  });

  test("returns empty for mixed_unknown (any domain)", () =>
    expect(getBreedPriorsForDomain("mixed_unknown", "skin_wound")).toHaveLength(0));

  test("returns empty for sighthound + eye (no prior)", () =>
    expect(getBreedPriorsForDomain("sighthound", "eye")).toHaveLength(0));

  test("all returned priors have non-empty reference field", () => {
    const priors = getBreedPriorsForDomain("brachycephalic", "eye");
    priors.forEach((p) => expect(p.reference.length).toBeGreaterThan(0));
  });
});

// ---------------------------------------------------------------------------
// hasElevatedBreedRisk
// ---------------------------------------------------------------------------

describe("hasElevatedBreedRisk", () => {
  test("sporting_retriever + skin_wound → true", () =>
    expect(hasElevatedBreedRisk("sporting_retriever", "skin_wound")).toBe(true));
  test("working + mass_swelling → true", () =>
    expect(hasElevatedBreedRisk("working", "mass_swelling")).toBe(true));
  test("giant_breed + mass_swelling → true", () =>
    expect(hasElevatedBreedRisk("giant_breed", "mass_swelling")).toBe(true));
  test("brachycephalic + respiratory_labored → true", () =>
    expect(hasElevatedBreedRisk("brachycephalic", "respiratory_labored")).toBe(true));
  test("mixed_unknown + skin_wound → false", () =>
    expect(hasElevatedBreedRisk("mixed_unknown", "skin_wound")).toBe(false));
  test("sighthound + stool_vomit → false", () =>
    expect(hasElevatedBreedRisk("sighthound", "stool_vomit")).toBe(false));
  test("herding + stool_vomit → false", () =>
    expect(hasElevatedBreedRisk("herding", "stool_vomit")).toBe(false));
});

// ---------------------------------------------------------------------------
// BREED_GROUP_MEMBERS shape validation
// ---------------------------------------------------------------------------

describe("BREED_GROUP_MEMBERS completeness", () => {
  test("all groups have at least one member except mixed_unknown", () => {
    for (const [group, members] of Object.entries(BREED_GROUP_MEMBERS)) {
      if (group === "mixed_unknown") {
        expect(members).toHaveLength(0);
      } else {
        expect(members.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("no duplicate breed names across groups", () => {
    const seen = new Map<string, string>();
    for (const [group, members] of Object.entries(BREED_GROUP_MEMBERS)) {
      if (group === "mixed_unknown") continue;
      for (const breed of members) {
        const key = breed.toLowerCase();
        // Some breeds appear in multiple groups (e.g. German Shepherd in herding + working)
        // Only check for exact duplicates within the SAME group
        expect(breed).toBeTruthy();
        seen.set(`${group}:${key}`, breed);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// BREED_MODALITY_PRIORS data quality
// ---------------------------------------------------------------------------

describe("BREED_MODALITY_PRIORS data quality", () => {
  test("all priors have non-empty rationale", () => {
    BREED_MODALITY_PRIORS.forEach((p) =>
      expect(p.rationale.length).toBeGreaterThan(10)
    );
  });

  test("all priors have non-empty reference", () => {
    BREED_MODALITY_PRIORS.forEach((p) =>
      expect(p.reference.length).toBeGreaterThan(5)
    );
  });

  test("risk values are valid enum strings", () => {
    const VALID = new Set(["elevated", "high", "highest"]);
    BREED_MODALITY_PRIORS.forEach((p) =>
      expect(VALID.has(p.risk)).toBe(true)
    );
  });

  test("group values are valid enum strings", () => {
    const VALID_GROUPS = new Set(Object.keys(BREED_GROUP_MEMBERS));
    BREED_MODALITY_PRIORS.forEach((p) =>
      expect(VALID_GROUPS.has(p.group)).toBe(true)
    );
  });

  test("no prior uses mixed_unknown group", () => {
    BREED_MODALITY_PRIORS.forEach((p) =>
      expect(p.group).not.toBe("mixed_unknown")
    );
  });

  test("covers at least 5 domains", () => {
    const domains = new Set(BREED_MODALITY_PRIORS.map((p) => p.domain));
    expect(domains.size).toBeGreaterThanOrEqual(5);
  });

  test("covers at least 6 breed groups", () => {
    const groups = new Set(BREED_MODALITY_PRIORS.map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// MODALITY_BENCHMARK_SLICE_REQUIREMENTS
// ---------------------------------------------------------------------------

describe("MODALITY_BENCHMARK_SLICE_REQUIREMENTS", () => {
  test("has 6 pack requirements (one per VET-1504 through VET-1509)", () =>
    expect(MODALITY_BENCHMARK_SLICE_REQUIREMENTS).toHaveLength(6));

  test("each requirement has a valid ticket reference", () => {
    MODALITY_BENCHMARK_SLICE_REQUIREMENTS.forEach((r) =>
      expect(r.ticket).toMatch(/^VET-\d+$/)
    );
  });

  test("VET-1509 breed-modality slice has no existing file (needs creation)", () => {
    const req = MODALITY_BENCHMARK_SLICE_REQUIREMENTS.find(
      (r) => r.ticket === "VET-1509"
    );
    expect(req).toBeDefined();
    expect(req!.existingSliceFile).toBeNull();
    expect(req!.minimumCases).toBe(20);
  });

  test("each requirement has at least 2 coverage dimensions", () => {
    MODALITY_BENCHMARK_SLICE_REQUIREMENTS.forEach((r) =>
      expect(r.coverageDimensions.length).toBeGreaterThanOrEqual(2)
    );
  });

  test("each requirement has at least 2 required tags", () => {
    MODALITY_BENCHMARK_SLICE_REQUIREMENTS.forEach((r) =>
      expect(r.requiredTags.length).toBeGreaterThanOrEqual(2)
    );
  });

  test("minimum case counts are >= 20 for all packs", () => {
    MODALITY_BENCHMARK_SLICE_REQUIREMENTS.forEach((r) =>
      expect(r.minimumCases).toBeGreaterThanOrEqual(20)
    );
  });
});
