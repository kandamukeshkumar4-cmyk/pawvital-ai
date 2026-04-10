/**
 * VET-921: Priors Tests
 *
 * Tests demographic, breed, seasonal, reproductive, and toxin priors.
 * Critical: capPriorAdjustment() must prevent red-flag suppression.
 */

import {
  applyDemographicPrior,
  applyBreedPrior,
  applySeasonalPrior,
  applyReproductivePrior,
  applyToxinPrior,
  capPriorAdjustment,
  PriorContext,
} from '../src/lib/clinical/priors';

describe('Clinical Priors', () => {
  describe('capPriorAdjustment', () => {
    it('should prevent red-flag-triggered emergencies from being downgraded', () => {
      const baseUrgency = 1; // Emergency
      const priorMultiplier = 0.5; // Would normally downgrade
      const hasRedFlags = true;

      const result = capPriorAdjustment(baseUrgency, priorMultiplier, hasRedFlags);
      // Red flags present: should NOT allow downgrade
      expect(result).toBeLessThanOrEqual(baseUrgency);
    });

    it('should allow prior adjustment when no red flags present', () => {
      const baseUrgency = 3;
      const priorMultiplier = 0.8;
      const hasRedFlags = false;

      const result = capPriorAdjustment(baseUrgency, priorMultiplier, hasRedFlags);
      expect(result).toBeDefined();
    });

    it('should cap adjustment to prevent extreme changes', () => {
      const baseUrgency = 2;
      const priorMultiplier = 0.1; // Extreme multiplier
      const hasRedFlags = false;

      const result = capPriorAdjustment(baseUrgency, priorMultiplier, hasRedFlags);
      // Should be capped to reasonable range
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(4);
    });
  });

  describe('Demographic Prior', () => {
    it('should apply age-based adjustments', () => {
      const context: PriorContext = {
        ageYears: 12,
        species: 'dog',
      };
      const result = applyDemographicPrior(context);
      expect(result).toBeDefined();
      expect(result.multiplier).toBeDefined();
    });

    it('should apply juvenile risk adjustments', () => {
      const context: PriorContext = {
        ageYears: 0.5,
        species: 'dog',
      };
      const result = applyDemographicPrior(context);
      expect(result.multiplier).toBeDefined();
    });
  });

  describe('Breed Prior', () => {
    it('should apply breed-specific risk adjustments', () => {
      const context: PriorContext = {
        breed: 'German Shepherd',
        species: 'dog',
      };
      const result = applyBreedPrior(context);
      expect(result).toBeDefined();
    });

    it('should handle unknown breed gracefully', () => {
      const context: PriorContext = {
        breed: 'Unknown',
        species: 'dog',
      };
      const result = applyBreedPrior(context);
      expect(result.multiplier).toBe(1.0); // Neutral for unknown
    });
  });

  describe('Seasonal Prior', () => {
    it('should apply seasonal adjustments', () => {
      const context: PriorContext = {
        month: 7, // July
        species: 'dog',
      };
      const result = applySeasonalPrior(context);
      expect(result).toBeDefined();
    });

    it('should handle all months', () => {
      for (let month = 1; month <= 12; month++) {
        const context: PriorContext = { month, species: 'dog' };
        const result = applySeasonalPrior(context);
        expect(result).toBeDefined();
      }
    });
  });

  describe('Reproductive Prior', () => {
    it('should apply reproductive status adjustments', () => {
      const context: PriorContext = {
        neutered: false,
        sex: 'female',
        species: 'dog',
      };
      const result = applyReproductivePrior(context);
      expect(result).toBeDefined();
    });

    it('should have neutral effect for neutered pets', () => {
      const context: PriorContext = {
        neutered: true,
        sex: 'female',
        species: 'dog',
      };
      const result = applyReproductivePrior(context);
      expect(result.multiplier).toBe(1.0);
    });
  });

  describe('Toxin Prior', () => {
    it('should apply toxin exposure adjustments', () => {
      const context: PriorContext = {
        suspectedToxinExposure: true,
        species: 'dog',
      };
      const result = applyToxinPrior(context);
      expect(result.multiplier).toBeGreaterThan(1.0);
    });

    it('should have neutral effect when no toxin exposure', () => {
      const context: PriorContext = {
        suspectedToxinExposure: false,
        species: 'dog',
      };
      const result = applyToxinPrior(context);
      expect(result.multiplier).toBe(1.0);
    });
  });

  describe('Prior Composition', () => {
    it('should not allow composed priors to override red flags', () => {
      const baseUrgency = 1;
      const demographic = applyDemographicPrior({ ageYears: 5, species: 'dog' });
      const breed = applyBreedPrior({ breed: 'Labrador', species: 'dog' });

      const composedMultiplier = demographic.multiplier * breed.multiplier;
      const result = capPriorAdjustment(baseUrgency, composedMultiplier, true);

      // Red flags must win: emergency stays emergency
      expect(result).toBe(1);
    });
  });
});
