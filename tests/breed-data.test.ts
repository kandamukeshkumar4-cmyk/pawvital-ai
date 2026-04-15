import {
  breedCorpusExpansionFallbackReason,
  breedCorpusExpansionProfiles,
  getBreedCorpusExpansionProfile,
} from "@/lib/breed-data";

describe("breed corpus expansion profiles", () => {
  it("ships a top-10 breed expansion set with three dedicated conditions each", () => {
    expect(breedCorpusExpansionProfiles).toHaveLength(10);

    for (const profile of breedCorpusExpansionProfiles) {
      expect(profile.topConditions).toHaveLength(3);
      expect(profile.topConditions.every((condition) => condition.trustLevel >= 70)).toBe(
        true
      );
    }
  });

  it("resolves breed profiles by canonical name alias and breed id", () => {
    expect(getBreedCorpusExpansionProfile("Golden Retriever")?.breedId).toBe(
      "golden_retriever"
    );
    expect(getBreedCorpusExpansionProfile("GSD")?.breedId).toBe(
      "german_shepherd"
    );
    expect(getBreedCorpusExpansionProfile("dachshund")?.breedId).toBe(
      "dachshund"
    );
  });

  it("documents the fallback reason when live symptom_checks usage is unavailable", () => {
    expect(breedCorpusExpansionFallbackReason).toContain("Supabase host");
  });
});
