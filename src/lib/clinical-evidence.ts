export type SupportedImageDomain =
  | "skin_wound"
  | "eye"
  | "ear"
  | "stool_vomit"
  | "unsupported";

export type VisionSeverityClass = "normal" | "needs_review" | "urgent";

export interface DetectedRegion {
  label: string;
  confidence: number;
  notes?: string;
}

export interface VisionPreprocessResult {
  domain: SupportedImageDomain;
  bodyRegion: string | null;
  detectedRegions: DetectedRegion[];
  bestCrop: string | null;
  imageQuality: "poor" | "borderline" | "good" | "excellent";
  confidence: number;
  limitations: string[];
}

export interface VisionClinicalEvidence {
  domain: SupportedImageDomain;
  bodyRegion: string | null;
  findings: string[];
  severity: VisionSeverityClass;
  confidence: number;
  supportedSymptoms: string[];
  contradictions: string[];
  requiresConsult: boolean;
  limitations: string[];
  influencedQuestionSelection: boolean;
}

export interface RetrievalTextEvidence {
  title: string;
  citation: string | null;
  score: number;
  summary: string;
  sourceUrl: string | null;
}

export interface RetrievalImageEvidence {
  title: string;
  citation: string | null;
  score: number;
  summary: string;
  assetUrl: string | null;
  domain: SupportedImageDomain | null;
  conditionLabel: string | null;
  dogOnly: boolean;
}

export interface RetrievalBundle {
  textChunks: RetrievalTextEvidence[];
  imageMatches: RetrievalImageEvidence[];
  rerankScores: number[];
  sourceCitations: string[];
}

export interface ConsultOpinion {
  model: string;
  summary: string;
  agreements: string[];
  disagreements: string[];
  uncertainties: string[];
  confidence: number;
  mode: "sync" | "async";
}

export interface ServiceTimeoutRecord {
  service: string;
  stage: string;
  reason: string;
}

export type SidecarServiceName =
  | "vision-preprocess-service"
  | "text-retrieval-service"
  | "image-retrieval-service"
  | "multimodal-consult-service"
  | "async-review-service";

export interface SidecarObservation {
  service: SidecarServiceName;
  stage: string;
  latencyMs: number;
  outcome: "success" | "timeout" | "error" | "fallback" | "shadow";
  shadowMode: boolean;
  fallbackUsed: boolean;
  note?: string;
  recordedAt: string;
}

export interface ShadowComparisonRecord {
  service: SidecarServiceName;
  usedStrategy: string;
  shadowStrategy: string;
  summary: string;
  disagreementCount: number;
  recordedAt: string;
}

const IMAGE_DOMAIN_KEYWORDS: Array<{
  domain: SupportedImageDomain;
  keywords: string[];
}> = [
  {
    domain: "eye",
    keywords: [
      "eye",
      "eyes",
      "eyelid",
      "eyelids",
      "cornea",
      "conjunctiva",
      "discharge from eye",
      "red eye",
      "goopy eye",
      "goopy eyes",
    ],
  },
  {
    domain: "ear",
    keywords: [
      "ear",
      "ears",
      "ear flap",
      "ear canal",
      "head shake",
      "head shaking",
      "smelly ear",
      "smelly ears",
      "otitis",
    ],
  },
  {
    domain: "stool_vomit",
    keywords: [
      "vomit",
      "vomiting",
      "threw up",
      "throw up",
      "stool",
      "poop",
      "diarrhea",
      "diarrhoea",
      "feces",
      "faeces",
      "bile",
    ],
  },
  {
    domain: "skin_wound",
    keywords: [
      "wound",
      "cut",
      "scrape",
      "rash",
      "skin",
      "hot spot",
      "hotspot",
      "lesion",
      "lump",
      "bump",
      "mass",
      "bleeding",
      "swelling",
      "paw",
      "leg",
      "limp",
      "limping",
    ],
  },
];

const NON_DOG_MARKERS = [
  "cat",
  "cats",
  "kitten",
  "feline",
  "horse",
  "equine",
  "cow",
  "bovine",
  "goat",
  "sheep",
];

const IMAGE_DOMAIN_LABEL_HINTS: Record<SupportedImageDomain, string[]> = {
  skin_wound: [
    "wound",
    "skin",
    "rash",
    "hot_spot",
    "hot spot",
    "ringworm",
    "fungal",
    "mange",
    "pyoderma",
    "dermatitis",
    "abscess",
    "mass",
    "laceration",
  ],
  eye: ["eye", "conjunctivitis", "cornea", "eyelid", "ocular", "tear"],
  ear: ["ear", "otitis", "ear_flap", "ear flap", "canal"],
  stool_vomit: ["vomit", "stool", "poop", "diarrhea", "faeces", "feces"],
  unsupported: [],
};

export function inferSupportedImageDomain(
  text: string,
  knownSymptoms: string[] = []
): SupportedImageDomain {
  const lower = `${text} ${knownSymptoms.join(" ")}`.toLowerCase();

  for (const entry of IMAGE_DOMAIN_KEYWORDS) {
    if (entry.keywords.some((keyword) => lower.includes(keyword))) {
      return entry.domain;
    }
  }

  return "unsupported";
}

export function isDogOnlyText(text: string): boolean {
  const lower = text.toLowerCase();
  return !NON_DOG_MARKERS.some((marker) => lower.includes(marker));
}

export function inferImageEvidenceDomain(
  text: string | null | undefined
): SupportedImageDomain | null {
  const lower = text?.toLowerCase() || "";
  if (!lower) return null;

  for (const [domain, hints] of Object.entries(IMAGE_DOMAIN_LABEL_HINTS) as Array<
    [SupportedImageDomain, string[]]
  >) {
    if (hints.some((hint) => lower.includes(hint))) {
      return domain;
    }
  }

  return null;
}

export function supportsDomainText(
  text: string | null | undefined,
  domain: SupportedImageDomain | null | undefined
): boolean {
  if (!domain || domain === "unsupported") return true;
  const inferred = inferImageEvidenceDomain(text);
  return inferred === null || inferred === domain;
}

export function capDiagnosticConfidence(input: {
  baseConfidence?: number | null;
  hasModelDisagreement?: boolean;
  lowQualityImage?: boolean;
  weakRetrievalSupport?: boolean;
  ambiguityFlags?: string[];
}): number {
  let confidence =
    typeof input.baseConfidence === "number" && Number.isFinite(input.baseConfidence)
      ? input.baseConfidence
      : 0.82;

  if (input.hasModelDisagreement) confidence -= 0.12;
  if (input.lowQualityImage) confidence -= 0.08;
  if (input.weakRetrievalSupport) confidence -= 0.06;
  if (input.ambiguityFlags?.length) {
    confidence -= Math.min(0.12, input.ambiguityFlags.length * 0.03);
  }

  return Number(Math.max(0.35, Math.min(0.98, confidence)).toFixed(2));
}
