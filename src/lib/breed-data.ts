// src/lib/breed-data.ts

import breedExpansionProfilesJson from "../../data/corpus/breed-expansion-profiles.json";

export interface BreedData {
  id: string;
  name: string;
  temperament?: string;
  life_span?: string;
  aliases?: string[];
  corpusKey?: string;
}

export interface BreedCorpusCondition {
  conditionLabel: string;
  conditionName: string;
  domain: string;
  trustLevel: number;
  reason: string;
}

export interface BreedCorpusExpansionProfile {
  rank: number;
  breedId: string;
  breedDataId: string;
  name: string;
  aliases: string[];
  selectionSource: string;
  smokeQuery: string;
  topConditions: BreedCorpusCondition[];
}

interface BreedCorpusExpansionManifest {
  generatedAt: string;
  selectionStrategy: string;
  selectionFallbackReason?: string;
  defaultTrustLevel: number;
  breeds: BreedCorpusExpansionProfile[];
}

export const fallbackDogBreeds: BreedData[] = [
  { id: "dog_1", name: "Labrador Retriever", temperament: "Kind, Outgoing, Agile", life_span: "10 - 12 years", aliases: ["Labrador", "Lab"], corpusKey: "labrador_retriever" },
  { id: "dog_2", name: "German Shepherd", temperament: "Confident, Courageous, Smart", life_span: "10 - 13 years", aliases: ["German Shepherd Dog", "GSD"], corpusKey: "german_shepherd" },
  { id: "dog_3", name: "Golden Retriever", temperament: "Intelligent, Friendly, Devoted", life_span: "10 - 12 years", aliases: ["Golden"], corpusKey: "golden_retriever" },
  { id: "dog_4", name: "French Bulldog", temperament: "Playful, Affectionate, Smart", life_span: "10 - 12 years", aliases: ["Frenchie"], corpusKey: "french_bulldog" },
  { id: "dog_5", name: "Bulldog", temperament: "Friendly, Courageous, Calm", life_span: "8 - 10 years", aliases: ["English Bulldog"], corpusKey: "bulldog" },
  { id: "dog_6", name: "Poodle", temperament: "Active, Proud, Very Smart", life_span: "10 - 18 years", aliases: ["Standard Poodle", "Miniature Poodle", "Toy Poodle"], corpusKey: "poodle" },
  { id: "dog_7", name: "Beagle", temperament: "Amiable, Even-tempered, Excitable", life_span: "10 - 15 years", corpusKey: "beagle" },
  { id: "dog_8", name: "Rottweiler", temperament: "Loyal, Loving, Confident", life_span: "9 - 10 years", corpusKey: "rottweiler" },
  { id: "dog_9", name: "German Shorthaired Pointer", temperament: "Friendly, Smart, Willing to Please", life_span: "10 - 12 years", aliases: ["GSP"], corpusKey: "german_shorthaired_pointer" },
  { id: "dog_10", name: "Dachshund", temperament: "Clever, Stubborn, Devoted", life_span: "12 - 16 years", aliases: ["Doxie"], corpusKey: "dachshund" },
  { id: "dog_11", name: "Pembroke Welsh Corgi", temperament: "Tenacious, Outgoing, Friendly", life_span: "12 - 15 years" },
  { id: "dog_12", name: "Australian Shepherd", temperament: "Smart, Work-Oriented, Exuberant", life_span: "12 - 15 years" },
  { id: "dog_13", name: "Yorkshire Terrier", temperament: "Affectionate, Sprightly, Tomboyish", life_span: "11 - 15 years" },
  { id: "dog_14", name: "Boxer", temperament: "Fun-Loving, Bright, Active", life_span: "10 - 12 years" },
  { id: "dog_15", name: "Great Dane", temperament: "Friendly, Patient, Dependable", life_span: "7 - 10 years" },
  { id: "dog_16", name: "Siberian Husky", temperament: "Outgoing, Mischievous, Loyal", life_span: "12 - 14 years" },
  { id: "dog_17", name: "Cavalier King Charles Spaniel", temperament: "Affectionate, Gentle, Graceful", life_span: "12 - 15 years" },
  { id: "dog_18", name: "Doberman Pinscher", temperament: "Loyal, Fearless, Alert", life_span: "10 - 12 years" },
  { id: "dog_19", name: "Miniature Schnauzer", temperament: "Friendly, Smart, Obedient", life_span: "12 - 15 years" },
  { id: "dog_20", name: "Shih Tzu", temperament: "Affectionate, Playful, Outgoing", life_span: "10 - 18 years" },
  { id: "dog_21", name: "Boston Terrier", temperament: "Friendly, Bright, Amusing", life_span: "11 - 13 years" },
  { id: "dog_22", name: "Bernese Mountain Dog", temperament: "Good-Natured, Calm, Strong", life_span: "7 - 10 years" },
  { id: "dog_23", name: "Pomeranian", temperament: "Inquisitive, Bold, Lively", life_span: "12 - 16 years" },
  { id: "dog_24", name: "Havanese", temperament: "Intelligent, Outgoing, Funny", life_span: "14 - 16 years" },
  { id: "dog_25", name: "English Springer Spaniel", temperament: "Friendly, Playful, Obedient", life_span: "12 - 14 years" }
];

export const fallbackCatBreeds: BreedData[] = [
  { id: "cat_1", name: "Ragdoll", temperament: "Affectionate, Friendly, Gentle", life_span: "12 - 15 years" },
  { id: "cat_2", name: "Maine Coon", temperament: "Adaptable, Intelligent, Loving", life_span: "12 - 15 years" },
  { id: "cat_3", name: "Exotic", temperament: "Affectionate, Sweet, Loyal", life_span: "12 - 15 years" },
  { id: "cat_4", name: "Persian", temperament: "Affectionate, Loyal, Quiet", life_span: "14 - 15 years" },
  { id: "cat_5", name: "Devon Rex", temperament: "Highly interactive, Mischievous, Playful", life_span: "9 - 15 years" },
  { id: "cat_6", name: "British Shorthair", temperament: "Affectionate, Easy Going, Independent", life_span: "12 - 17 years" },
  { id: "cat_7", name: "Abyssinian", temperament: "Active, Energetic, Independent", life_span: "14 - 15 years" },
  { id: "cat_8", name: "American Shorthair", temperament: "Active, Curious, Easy Going", life_span: "15 - 17 years" },
  { id: "cat_9", name: "Scottish Fold", temperament: "Affectionate, Intelligent, Loyal", life_span: "11 - 14 years" },
  { id: "cat_10", name: "Sphynx", temperament: "Loyal, Inquisitive, Friendly", life_span: "12 - 14 years" },
  { id: "cat_11", name: "Siamese", temperament: "Active, Agile, Clever", life_span: "12 - 15 years" },
  { id: "cat_12", name: "Bengal", temperament: "Alert, Agile, Energetic", life_span: "12 - 15 years" },
  { id: "cat_13", name: "Russian Blue", temperament: "Gentle, Intelligent, Loyal", life_span: "15 - 20 years" },
  { id: "cat_14", name: "Siberian", temperament: "Affectionate, Playful, Agile", life_span: "11 - 18 years" },
  { id: "cat_15", name: "Norwegian Forest Cat", temperament: "Sweet, Active, Intelligent", life_span: "12 - 16 years" }
];

const breedCorpusExpansionManifest =
  breedExpansionProfilesJson as BreedCorpusExpansionManifest;

function cloneBreedCorpusProfile(
  profile: BreedCorpusExpansionProfile
): BreedCorpusExpansionProfile {
  return {
    ...profile,
    aliases: [...profile.aliases],
    topConditions: profile.topConditions.map((condition) => ({ ...condition })),
  };
}

export const breedCorpusExpansionProfiles: BreedCorpusExpansionProfile[] =
  breedCorpusExpansionManifest.breeds.map(cloneBreedCorpusProfile);

export const breedCorpusExpansionSelectionStrategy =
  breedCorpusExpansionManifest.selectionStrategy;

export const breedCorpusExpansionFallbackReason =
  breedCorpusExpansionManifest.selectionFallbackReason || "";

export function normalizeBreedCorpusKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getBreedCorpusExpansionProfile(
  breedOrId: string
): BreedCorpusExpansionProfile | null {
  const normalized = normalizeBreedCorpusKey(breedOrId);
  if (!normalized) return null;

  for (const profile of breedCorpusExpansionProfiles) {
    const candidates = [profile.breedId, profile.name, ...profile.aliases];
    if (
      candidates.some(
        (candidate) => normalizeBreedCorpusKey(candidate) === normalized
      )
    ) {
      return cloneBreedCorpusProfile(profile);
    }
  }

  return null;
}
