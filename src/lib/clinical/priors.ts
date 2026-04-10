/**
 * Deterministic Priors Engine for VET-921
 *
 * Computes probability adjustments for age, breed, sex, seasonality, etc.
 * Capped to never suppress true red-flag escalation.
 */

export interface PetProfile {
  age_years: number;
  breed: string;
  sex: "male" | "female";
  neutered: boolean;
  weight_kg: number;
  species: string;
}

export interface PriorAdjustment {
  disease: string;
  multiplier: number;
  reason: string;
}

// Breed predispositions (derived from BREED_MODIFIERS)
const BREED_PRIORS: Record<string, { disease: string; multiplier: number }[]> = {
  "great dane": [{ disease: "gdv", multiplier: 3.0 }],
  "french bulldog": [
    { disease: "breathing_difficulty", multiplier: 2.5 },
    { disease: "heat_stroke", multiplier: 2.0 },
  ],
  dachshund: [{ disease: "ivdd", multiplier: 3.5 }],
  "german shepherd": [
    { disease: "hip_dysplasia", multiplier: 2.0 },
    { disease: "dm", multiplier: 2.5 },
  ],
  "golden retriever": [
    { disease: "cancer", multiplier: 1.8 },
    { disease: "hip_dysplasia", multiplier: 1.5 },
  ],
  labrador: [
    { disease: "ccl_rupture", multiplier: 1.8 },
    { disease: "obesity", multiplier: 1.5 },
  ],
};

// Seasonal adjustments
const SEASONAL_PRIORS: Record<string, { monthRange: [number, number]; symptom: string; multiplier: number }[]> = {
  "tick_season": [
    { monthRange: [4, 9], symptom: "lethargy", multiplier: 1.3 },
    { monthRange: [4, 9], symptom: "limping", multiplier: 1.2 },
  ],
  "allergy_season": [
    { monthRange: [3, 8], symptom: "excessive_scratching", multiplier: 1.4 },
    { monthRange: [3, 8], symptom: "skin_odor_greasy", multiplier: 1.2 },
  ],
};

// Reproductive context
const REPRO_PRIORS: Record<string, { condition: string; multiplier: number }[]> = {
  "pyometra_risk": [
    { condition: "intact_female", multiplier: 4.0 },
  ],
  "eclampsia_risk": [
    { condition: "pregnant_or_nursing", multiplier: 5.0 },
  ],
};

/**
 * Compute demographic priors based on age, sex, neuter status, size
 */
export function computeDemographicPriors(profile: PetProfile): PriorAdjustment[] {
  const priors: PriorAdjustment[] = [];

  // Age-based priors
  if (profile.age_years < 1) {
    priors.push({ disease: "puppy_concern", multiplier: 2.0, reason: "puppy_age" });
  } else if (profile.age_years > 8) {
    priors.push({ disease: "senior_decline", multiplier: 1.5, reason: "senior_age" });
    priors.push({ disease: "cancer", multiplier: 1.3, reason: "senior_age" });
  }

  // Size-based priors
  if (profile.weight_kg > 40) {
    priors.push({ disease: "joint_issues", multiplier: 1.3, reason: "large_breed" });
  } else if (profile.weight_kg < 10) {
    priors.push({ disease: "hypoglycemia", multiplier: 1.5, reason: "small_breed" });
  }

  return priors;
}

/**
 * Compute breed-specific priors
 */
export function computeBreedPriors(breed: string): PriorAdjustment[] {
  const breedLower = breed.toLowerCase();
  const priors: PriorAdjustment[] = [];

  for (const [knownBreed, adjustments] of Object.entries(BREED_PRIORS)) {
    if (breedLower.includes(knownBreed)) {
      adjustments.forEach(({ disease, multiplier }) => {
        priors.push({ disease, multiplier, reason: `breed_${knownBreed}` });
      });
    }
  }

  return priors;
}

/**
 * Compute seasonal priors
 */
export function computeSeasonalPriors(month: number, symptoms: string[]): PriorAdjustment[] {
  const priors: PriorAdjustment[] = [];

  for (const [seasonName, adjustments] of Object.entries(SEASONAL_PRIORS)) {
    for (const adj of adjustments) {
      const [startMonth, endMonth] = adj.monthRange;
      if (month >= startMonth && month <= endMonth && symptoms.includes(adj.symptom)) {
        priors.push({
          disease: adj.symptom,
          multiplier: adj.multiplier,
          reason: `seasonal_${seasonName}`,
        });
      }
    }
  }

  return priors;
}

/**
 * Compute reproductive context priors
 */
export function computeReproPriors(profile: PetProfile): PriorAdjustment[] {
  const priors: PriorAdjustment[] = [];

  if (profile.sex === "female" && !profile.neutered) {
    priors.push({
      disease: "pyometra",
      multiplier: REPRO_PRIORS["pyometra_risk"][0].multiplier,
      reason: "intact_female",
    });
  }

  return priors;
}

/**
 * Compute toxin/exposure context priors
 */
export function computeToxinPriors(context: { exposure_type?: string }): PriorAdjustment[] {
  const priors: PriorAdjustment[] = [];

  if (context.exposure_type === "xylitol" || context.exposure_type === "chocolate") {
    priors.push({ disease: "toxicity", multiplier: 5.0, reason: `toxin_${context.exposure_type}` });
  }

  return priors;
}

/**
 * Cap prior adjustments to ensure red-flag escalation is never suppressed
 *
 * CRITICAL: If any red flag is triggered, priors cannot reduce urgency below emergency
 */
export function capPriorAdjustment(
  baseScore: number,
  priorMultipliers: number[],
  redFlagsTriggered: boolean,
  maxCap: number = 10.0
): number {
  // Apply priors multiplicatively
  let adjustedScore = baseScore;
  for (const multiplier of priorMultipliers) {
    adjustedScore *= multiplier;
  }

  // Cap the adjustment
  adjustedScore = Math.min(adjustedScore, maxCap);

  // CRITICAL: If red flags are triggered, never reduce below emergency threshold
  if (redFlagsTriggered && adjustedScore < baseScore) {
    adjustedScore = baseScore; // Keep original emergency-level score
  }

  return adjustedScore;
}
