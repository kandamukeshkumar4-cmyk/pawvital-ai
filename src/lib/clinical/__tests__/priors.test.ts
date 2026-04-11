/**
 * VET-921: Priors Tests
 *
 * Tests demographic, breed, seasonal, reproductive, and toxin priors.
 * Critical: capPriorAdjustment() must prevent red-flag suppression.
 */

import {
  capPriorAdjustment,
  computeBreedPriors,
  computeDemographicPriors,
  computeReproPriors,
  computeSeasonalPriors,
  computeToxinPriors,
  type PetProfile,
} from "../priors";

const baseProfile: PetProfile = {
  age_years: 5,
  breed: "mixed breed",
  sex: "female",
  neutered: true,
  weight_kg: 20,
  species: "dog",
};

describe("Clinical Priors", () => {
  describe("capPriorAdjustment", () => {
    it("should prevent red-flag-triggered emergencies from being downgraded", () => {
      const result = capPriorAdjustment(2, [0.5], true);

      expect(result).toBe(2);
    });

    it("should apply prior multipliers when no red flags are present", () => {
      const result = capPriorAdjustment(2, [1.5, 1.2], false);

      expect(result).toBeCloseTo(3.6);
    });

    it("should cap extreme multipliers", () => {
      const result = capPriorAdjustment(4, [10], false, 10);

      expect(result).toBe(10);
    });
  });

  describe("demographic priors", () => {
    it("should apply puppy and senior adjustments", () => {
      expect(computeDemographicPriors({ ...baseProfile, age_years: 0.5 })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "puppy_concern", reason: "puppy_age" }),
        ]),
      );

      expect(computeDemographicPriors({ ...baseProfile, age_years: 12 })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "senior_decline", reason: "senior_age" }),
        ]),
      );
    });

    it("should apply size adjustments", () => {
      expect(computeDemographicPriors({ ...baseProfile, weight_kg: 45 })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "joint_issues", reason: "large_breed" }),
        ]),
      );
    });
  });

  describe("breed priors", () => {
    it("should apply breed-specific risk adjustments", () => {
      const result = computeBreedPriors("German Shepherd Dog");

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "hip_dysplasia", reason: "breed_german shepherd" }),
        ]),
      );
    });

    it("should return no adjustments for unknown breeds", () => {
      expect(computeBreedPriors("Unknown")).toEqual([]);
    });
  });

  describe("seasonal priors", () => {
    it("should apply seasonal adjustments when month and symptom match", () => {
      const result = computeSeasonalPriors(7, ["lethargy"]);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "lethargy", reason: "seasonal_tick_season" }),
        ]),
      );
    });

    it("should be neutral when the symptom does not match", () => {
      expect(computeSeasonalPriors(7, ["vomiting"])).toEqual([]);
    });
  });

  describe("reproductive and toxin priors", () => {
    it("should apply pyometra risk for intact females", () => {
      const result = computeReproPriors({ ...baseProfile, neutered: false, sex: "female" });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "pyometra", reason: "intact_female" }),
        ]),
      );
    });

    it("should apply toxin exposure adjustments", () => {
      const result = computeToxinPriors({ exposure_type: "xylitol" });

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ disease: "toxicity", reason: "toxin_xylitol" }),
        ]),
      );
    });
  });
});
