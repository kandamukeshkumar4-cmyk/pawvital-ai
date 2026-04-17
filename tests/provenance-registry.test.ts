import {
  getBreedModifierProvenance,
  getExpiredHighStakesTierABEntries,
  getMissingHighStakesRuleIds,
  getProvenanceForRedFlag,
} from "@/lib/provenance-registry";

describe("provenance registry", () => {
  it("returns a reviewed entry for critical red flags", () => {
    const entry = getProvenanceForRedFlag("blue_gums");

    expect(entry?.rule_id).toBe("red_flag.blue_gums");
    expect(entry?.evidence_tier).toBe("A");
  });

  it("matches breed provenance for conservative mix handling and exact breeds", () => {
    const labMixEntries = getBreedModifierProvenance("Labrador Mix");
    const corgiEntries = getBreedModifierProvenance("Pembroke Welsh Corgi");

    expect(labMixEntries.some((entry) => entry.rule_id.includes("labrador"))).toBe(false);
    expect(
      corgiEntries.some(
        (entry) => entry.rule_id === "modifier.breed_pembroke_welsh_corgi_ivdd"
      )
    ).toBe(true);
  });

  it("does not report missing required high-stakes rules in the seeded Wave 3 registry", () => {
    expect(getMissingHighStakesRuleIds()).toEqual([]);
  });

  it("reports no expired Tier A/B high-stakes entries before the next review window", () => {
    const expired = getExpiredHighStakesTierABEntries(
      new Date("2026-06-01T00:00:00Z")
    );

    expect(expired).toEqual([]);
  });
});
