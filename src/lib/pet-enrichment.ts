import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import { searchReferenceImages, type ReferenceImageMatch } from "@/lib/knowledge-retrieval";

const NYCKEL_TOKEN_URL = "https://www.nyckel.com/connect/token";
const NYCKEL_DOG_BREED_FUNCTION = "dog-breed-identifier";
const NYCKEL_MIN_CONFIDENCE = 0.8;

const API_NINJAS_DOGS_URL = "https://api.api-ninjas.com/v1/dogs";

const ROBOFLOW_BASE_URL = "https://serverless.roboflow.com";

const PLACEHOLDER_BREED_TERMS = [
  "unknown",
  "mixed",
  "mix",
  "mixed breed",
  "not sure",
  "unsure",
  "dog",
  "canine",
  "rescue",
  "stray",
];

const CAT_TERMS = [
  "cat",
  "kitten",
  "tabby",
  "siamese",
  "persian",
  "maine coon",
  "ragdoll",
  "sphynx",
  "bengal",
];

const BREED_CANONICAL_MAP: Array<[string, string]> = [
  ["golden retriever", "Golden Retriever"],
  ["labrador retriever", "Labrador Retriever"],
  ["labrador", "Labrador Retriever"],
  ["german shepherd dog", "German Shepherd"],
  ["german shepherd", "German Shepherd"],
  ["french bulldog", "French Bulldog"],
  ["bulldog", "Bulldog"],
  ["boxer", "Boxer"],
  ["beagle", "Beagle"],
  ["poodle", "Poodle"],
  ["great dane", "Great Dane"],
  ["dachshund", "Dachshund"],
  ["husky", "Husky"],
  ["pit bull", "Pitbull"],
  ["pitbull", "Pitbull"],
  ["american pit bull terrier", "Pitbull"],
  ["rottweiler", "Rottweiler"],
];

const SKIN_FLAG_TERMS = [
  "abscess",
  "alopecia",
  "allergy",
  "bald",
  "blister",
  "dermatitis",
  "hair loss",
  "hot spot",
  "hotspot",
  "infection",
  "itch",
  "lesion",
  "lump",
  "mass",
  "rash",
  "scab",
  "skin",
  "sore",
  "swelling",
  "tumor",
  "ulcer",
  "wound",
];

let nyckelTokenCache:
  | {
      token: string;
      expiresAt: number;
    }
  | null = null;

export interface BreedDetectionResult {
  breed: string;
  confidence: number;
  source: "nyckel";
  rawLabel: string;
}

export interface BreedProfileResult {
  breed: string;
  summary: string;
  source: "api_ninjas";
}

export interface SkinFlagResult {
  positive: boolean;
  summary: string;
  labels: string[];
  topConfidence?: number;
  source: "roboflow";
  reference_images?: ReferenceImageMatch[];
}

export function isLikelyDogContext(pet: PetProfile): boolean {
  const species = pet.species?.toLowerCase().trim();
  if (species) {
    if (species.includes("cat") || species.includes("feline")) return false;
    if (species.includes("dog") || species.includes("canine")) return true;
  }

  const breed = pet.breed.toLowerCase();
  return !CAT_TERMS.some((term) => breed.includes(term));
}

export function normalizeBreedName(rawBreed: string): string {
  const normalized = rawBreed.trim().toLowerCase();
  if (!normalized) return rawBreed;

  for (const [needle, canonical] of BREED_CANONICAL_MAP) {
    if (normalized.includes(needle) || needle.includes(normalized)) {
      return canonical;
    }
  }

  return normalized
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function shouldUseImageInferredBreed(
  pet: PetProfile,
  detection: BreedDetectionResult | null
): boolean {
  if (!detection || detection.confidence < NYCKEL_MIN_CONFIDENCE) return false;

  const breed = pet.breed.trim().toLowerCase();
  if (!breed) return true;
  return PLACEHOLDER_BREED_TERMS.some((term) => breed === term || breed.includes(term));
}

export function getEffectivePetProfile(
  pet: PetProfile,
  session?: TriageSession | null
): PetProfile {
  const effectiveBreed = session?.effective_breed?.trim();
  if (!effectiveBreed) return pet;
  return {
    ...pet,
    breed: effectiveBreed,
  };
}

export async function detectBreedWithNyckel(
  image: string,
  pet: PetProfile
): Promise<BreedDetectionResult | null> {
  if (!isLikelyDogContext(pet)) return null;

  const clientId = process.env.NYCKEL_CLIENT_ID?.trim();
  const clientSecret = process.env.NYCKEL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  try {
    const accessToken = await getNyckelAccessToken(clientId, clientSecret);
    const response = await fetch(
      `https://www.nyckel.com/v1/functions/${NYCKEL_DOG_BREED_FUNCTION}/invoke?labelCount=3&capture=false`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: ensureDataUri(image),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Nyckel breed detection failed with ${response.status}`);
    }

    const data = (await response.json()) as NyckelInvokeResponse;
    if (!data.labelName || typeof data.confidence !== "number") {
      return null;
    }

    return {
      breed: normalizeBreedName(data.labelName),
      confidence: data.confidence,
      rawLabel: data.labelName,
      source: "nyckel",
    };
  } catch (error) {
    console.error("[Enrichment] Nyckel breed detection failed:", error);
    return null;
  }
}

export async function fetchBreedProfile(
  breed: string,
  pet: PetProfile
): Promise<BreedProfileResult | null> {
  if (!breed.trim() || !isLikelyDogContext(pet)) return null;

  const apiKey = process.env.API_NINJAS_KEY?.trim();
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${API_NINJAS_DOGS_URL}?name=${encodeURIComponent(breed)}`,
      {
        headers: {
          "X-Api-Key": apiKey,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`API Ninjas breed lookup failed with ${response.status}`);
    }

    const data = (await response.json()) as ApiNinjasDogRecord[];
    const bestMatch = pickBestBreedMatch(breed, data);
    if (!bestMatch) return null;

    return {
      breed: bestMatch.name,
      summary: summarizeBreedProfile(bestMatch),
      source: "api_ninjas",
    };
  } catch (error) {
    console.error("[Enrichment] API Ninjas breed lookup failed:", error);
    return null;
  }
}

/**
 * Given Roboflow skin detection labels, find matching reference images
 * from the indexed corpus. Returns up to `limit` reference images.
 */
export async function findReferenceImagesForSkinLabels(
  roboflowLabels: string[],
  limit: number = 5
): Promise<ReferenceImageMatch[]> {
  if (!roboflowLabels.length) return [];

  const conditionFilters = roboflowLabels.map((label) =>
    label.toLowerCase().replace(/[\s-]+/g, "_")
  );

  const searchText = roboflowLabels.join(" ");
  const matches = await searchReferenceImages(
    searchText,
    limit,
    conditionFilters
  );

  return matches;
}

export async function runRoboflowSkinWorkflow(
  image: string,
  pet: PetProfile
): Promise<SkinFlagResult | null> {
  if (!isLikelyDogContext(pet)) return null;

  const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
  const workspaceName = process.env.ROBOFLOW_WORKSPACE_NAME?.trim();
  const workflowId = process.env.ROBOFLOW_WORKFLOW_ID?.trim();
  if (!apiKey || !workspaceName || !workflowId) return null;

  try {
    const response = await fetch(
      `${ROBOFLOW_BASE_URL}/${workspaceName}/workflows/${workflowId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          inputs: {
            image: {
              type: "base64",
              value: stripDataUri(image),
            },
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Roboflow workflow failed with ${response.status}`);
    }

    const data = (await response.json()) as RoboflowWorkflowResponse;
    const labels = Array.from(extractLabels(data));
    const matchedLabels = labels.filter((label) => isSkinFocusedLabel(label));

    if (matchedLabels.length === 0) {
      return null;
    }

    const topConfidence = findTopConfidence(data);
    const summary = `Roboflow flagged possible skin-focused findings: ${matchedLabels
      .slice(0, 3)
      .join(", ")}${typeof topConfidence === "number" ? ` (top confidence ${(topConfidence * 100).toFixed(0)}%)` : ""}.`;

    const result: SkinFlagResult = {
      positive: true,
      summary,
      labels: matchedLabels,
      topConfidence,
      source: "roboflow",
    };

    // Cross-reference with reference image corpus (non-fatal)
    try {
      result.reference_images = await findReferenceImagesForSkinLabels(matchedLabels, 5);
    } catch (err) {
      console.warn('[pet-enrichment] Reference image lookup failed:', err instanceof Error ? err.message : err);
    }

    return result;
  } catch (error) {
    console.error("[Enrichment] Roboflow workflow failed:", error);
    return null;
  }
}

function ensureDataUri(image: string): string {
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}

function stripDataUri(image: string): string {
  return image.includes(",") ? image.split(",")[1] : image;
}

async function getNyckelAccessToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (nyckelTokenCache && nyckelTokenCache.expiresAt > Date.now() + 60_000) {
    return nyckelTokenCache.token;
  }

  const response = await fetch(NYCKEL_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Nyckel token request failed with ${response.status}`);
  }

  const data = (await response.json()) as NyckelTokenResponse;
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Error("Nyckel token response was missing access token fields");
  }

  nyckelTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

function pickBestBreedMatch(
  breed: string,
  candidates: ApiNinjasDogRecord[]
): ApiNinjasDogRecord | null {
  if (candidates.length === 0) return null;

  const normalized = normalizeBreedName(breed).toLowerCase();
  const exact = candidates.find(
    (candidate) => normalizeBreedName(candidate.name).toLowerCase() === normalized
  );
  return exact || candidates[0] || null;
}

function summarizeBreedProfile(record: ApiNinjasDogRecord): string {
  const facts: string[] = [];

  if (
    typeof record.min_life_expectancy === "number" &&
    typeof record.max_life_expectancy === "number"
  ) {
    facts.push(
      `life expectancy ${record.min_life_expectancy}-${record.max_life_expectancy} years`
    );
  }

  const minWeight =
    typeof record.min_weight_female === "number"
      ? record.min_weight_female
      : record.min_weight_male;
  const maxWeight =
    typeof record.max_weight_male === "number"
      ? record.max_weight_male
      : record.max_weight_female;
  if (typeof minWeight === "number" && typeof maxWeight === "number") {
    facts.push(`typical weight ${minWeight}-${maxWeight} lbs`);
  }

  if (typeof record.energy === "number") {
    facts.push(`energy ${record.energy}/5`);
  }
  if (typeof record.trainability === "number") {
    facts.push(`trainability ${record.trainability}/5`);
  }
  if (typeof record.shedding === "number") {
    facts.push(`shedding ${record.shedding}/5`);
  }
  if (typeof record.protectiveness === "number") {
    facts.push(`protectiveness ${record.protectiveness}/5`);
  }

  return `${record.name} profile: ${facts.join("; ")}.`;
}

function extractLabels(value: unknown, labels: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      extractLabels(item, labels);
    }
    return labels;
  }

  if (!value || typeof value !== "object") {
    return labels;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();

    if (
      typeof nested === "string" &&
      (lowerKey === "class" ||
        lowerKey === "label" ||
        lowerKey === "top" ||
        lowerKey.endsWith("_class") ||
        lowerKey.endsWith("_label"))
    ) {
      labels.add(nested);
    }

    if (
      Array.isArray(nested) &&
      (lowerKey.includes("class") || lowerKey.includes("label"))
    ) {
      for (const item of nested) {
        if (typeof item === "string") labels.add(item);
      }
    }

    extractLabels(nested, labels);
  }

  return labels;
}

function findTopConfidence(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    const confidences = value
      .map((item) => findTopConfidence(item))
      .filter((item): item is number => typeof item === "number");
    return confidences.length > 0 ? Math.max(...confidences) : undefined;
  }

  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  let highest: number | undefined;
  for (const [key, nested] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (
      typeof nested === "number" &&
      (lowerKey === "confidence" || lowerKey === "score" || lowerKey.endsWith("_confidence"))
    ) {
      highest = highest === undefined ? nested : Math.max(highest, nested);
    }

    const nestedHighest = findTopConfidence(nested);
    if (typeof nestedHighest === "number") {
      highest = highest === undefined ? nestedHighest : Math.max(highest, nestedHighest);
    }
  }

  return highest;
}

function isSkinFocusedLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return SKIN_FLAG_TERMS.some((term) => normalized.includes(term));
}

interface NyckelTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface NyckelInvokeResponse {
  labelName?: string;
  confidence?: number;
}

interface ApiNinjasDogRecord {
  name: string;
  energy?: number;
  trainability?: number;
  shedding?: number;
  protectiveness?: number;
  min_life_expectancy?: number;
  max_life_expectancy?: number;
  min_weight_male?: number;
  max_weight_male?: number;
  min_weight_female?: number;
  max_weight_female?: number;
}

interface RoboflowWorkflowResponse {
  outputs?: unknown[];
}
