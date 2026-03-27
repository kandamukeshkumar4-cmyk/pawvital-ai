import type { SupportedImageDomain } from "./clinical-evidence";

export type LiveCorpusStatus = "live" | "benchmark_only";

export interface LiveCorpusSourcePolicy {
  slug: string;
  status: LiveCorpusStatus;
  speciesScope: "dog" | "mixed";
  supportedDomains: SupportedImageDomain[];
  note?: string;
}

interface MatchLike {
  sourceSlug?: string | null;
  conditionLabel?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown> | null;
}

const LIVE_CORPUS_SOURCE_POLICIES: Record<string, LiveCorpusSourcePolicy> = {
  "roboflow-dog-skin-disease-detection": {
    slug: "roboflow-dog-skin-disease-detection",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "mendeley-dog-skin-disease-multispectral": {
    slug: "mendeley-dog-skin-disease-multispectral",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "kaggle-dog-skin-diseases-5class": {
    slug: "kaggle-dog-skin-diseases-5class",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "kaggle-pet-disease-images-dog": {
    slug: "kaggle-pet-disease-images-dog",
    status: "live",
    speciesScope: "mixed",
    supportedDomains: ["skin_wound", "eye"],
    note: "Only the curated dog-only subset is eligible for live retrieval.",
  },
  "roboflow-dog-skin-detection-4class": {
    slug: "roboflow-dog-skin-detection-4class",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "kaggle-yashmotiani-dog-skin": {
    slug: "kaggle-yashmotiani-dog-skin",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "roboflow-tick-detection": {
    slug: "roboflow-tick-detection",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["skin_wound"],
  },
  "roboflow-dog-eye-disease": {
    slug: "roboflow-dog-eye-disease",
    status: "live",
    speciesScope: "dog",
    supportedDomains: ["eye"],
  },
};

const CONDITION_DOMAIN_HINTS: Array<{
  domain: SupportedImageDomain;
  hints: string[];
}> = [
  {
    domain: "eye",
    hints: ["eye", "ocular", "conjunct", "cornea", "eyelid"],
  },
  {
    domain: "ear",
    hints: ["ear", "otitis", "ear_mites", "ear mites", "ear flap"],
  },
  {
    domain: "stool_vomit",
    hints: ["vomit", "vomiting", "stool", "poop", "diarrhea", "diarrhoea"],
  },
  {
    domain: "skin_wound",
    hints: [
      "skin",
      "wound",
      "lesion",
      "hot_spot",
      "hot spot",
      "ringworm",
      "fungal",
      "mange",
      "tick",
      "allergy",
      "dermat",
      "rash",
      "abscess",
      "mass",
      "cut",
      "abrasion",
    ],
  },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function normalizeSlug(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function getMetadataStringArray(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
}

export function getLiveCorpusSourcePolicy(
  sourceSlug: string | null | undefined
): LiveCorpusSourcePolicy | null {
  const normalized = normalizeSlug(sourceSlug);
  return LIVE_CORPUS_SOURCE_POLICIES[normalized] || null;
}

export function inferLiveCorpusDomain(input: MatchLike): SupportedImageDomain | null {
  const metadataDomain = normalizeText(getMetadataString(input.metadata, "live_domain"));
  if (
    metadataDomain === "skin wound" ||
    metadataDomain === "eye" ||
    metadataDomain === "ear" ||
    metadataDomain === "stool vomit"
  ) {
    return metadataDomain.replace(/\s+/g, "_") as SupportedImageDomain;
  }

  const metadataDomains = getMetadataStringArray(input.metadata, "live_domains")
    .map((value) => normalizeText(value).replace(/\s+/g, "_"))
    .filter(Boolean) as SupportedImageDomain[];
  if (metadataDomains.length > 0) {
    return metadataDomains[0];
  }

  const joined = [
    input.conditionLabel || "",
    input.caption || "",
    getMetadataString(input.metadata, "raw_label"),
  ]
    .join(" ")
    .toLowerCase();

  for (const entry of CONDITION_DOMAIN_HINTS) {
    if (entry.hints.some((hint) => joined.includes(hint))) {
      return entry.domain;
    }
  }

  return null;
}

export function isLiveCorpusEligibleMatch(input: MatchLike): boolean {
  const policy = getLiveCorpusSourcePolicy(input.sourceSlug);
  if (policy && policy.status !== "live") {
    return false;
  }

  const liveStatus = normalizeText(
    getMetadataString(input.metadata, "live_retrieval_status")
  );
  if (liveStatus && liveStatus !== "live") {
    return false;
  }

  const speciesScope = normalizeText(
    getMetadataString(input.metadata, "species_scope")
  );
  if (speciesScope && speciesScope !== "dog") {
    return false;
  }

  const domain = inferLiveCorpusDomain(input);
  if (!domain || domain === "unsupported") {
    return false;
  }

  if (policy && policy.supportedDomains.length > 0) {
    return policy.supportedDomains.includes(domain);
  }

  return true;
}

export function matchesRequestedLiveDomain(
  input: MatchLike,
  requestedDomain: SupportedImageDomain | null | undefined
): boolean {
  if (!requestedDomain || requestedDomain === "unsupported") {
    return true;
  }

  const inferred = inferLiveCorpusDomain(input);
  return !inferred || inferred === requestedDomain;
}
