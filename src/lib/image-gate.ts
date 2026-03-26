import type { TriageSession } from "@/lib/triage-engine";

export interface ImageMeta {
  width: number;
  height: number;
  blurScore: number;
  estimatedKb: number;
}

export type ImageGateReason =
  | "blurry"
  | "low_resolution"
  | "not_close_up";

export interface ImageGateWarning {
  reason: ImageGateReason;
  topLabel?: string;
  topScore?: number;
}

interface HfClassificationResult {
  label: string;
  score: number;
}

const HF_IMAGE_MODEL = "google/vit-base-patch16-224";
const HF_IMAGE_ENDPOINT = `https://router.huggingface.co/hf-inference/models/${HF_IMAGE_MODEL}`;
const HF_NOT_CLOSE_UP_SCORE = 0.45;

const WOUND_KEYWORDS = [
  "wound",
  "cut",
  "laceration",
  "gash",
  "scrape",
  "abrasion",
  "abscess",
  "hot spot",
  "hotspot",
  "lesion",
  "skin issue",
  "skin problem",
  "skin infection",
  "rash",
  "bite",
  "puncture",
  "lump",
  "bump",
  "mass",
  "pus",
  "infected",
  "ulcer",
  "blister",
  "scab",
  "hair loss",
  "bald spot",
  "sore",
  "skin",
];

const NON_CLOSE_UP_LABEL_TERMS = [
  "dog",
  "retriever",
  "setter",
  "spaniel",
  "collie",
  "shepherd",
  "terrier",
  "cat",
  "tiger cat",
  "tabby",
  "egyptian cat",
  "laptop",
  "notebook",
  "keyboard",
  "space bar",
  "monitor",
  "alp",
  "valley",
  "lakeside",
  "seashore",
  "car",
  "person",
  "chair",
  "couch",
];

export function shouldAnalyzeWoundImage(
  message: string,
  session?: TriageSession | null
): boolean {
  if (session?.known_symptoms.includes("wound_skin_issue")) {
    return true;
  }

  const lower = message.toLowerCase();
  return WOUND_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export async function evaluateImageGate(
  image: string,
  imageMeta?: Partial<ImageMeta> | null
): Promise<ImageGateWarning | null> {
  const normalizedMeta = normalizeImageMeta(imageMeta);

  if (normalizedMeta && normalizedMeta.blurScore < 15) {
    return { reason: "blurry" };
  }

  if (normalizedMeta) {
    const longestSide = Math.max(normalizedMeta.width, normalizedMeta.height);
    if (longestSide < 512 || normalizedMeta.estimatedKb < 60) {
      return { reason: "low_resolution" };
    }
  }

  const hfResult = await classifyWithHuggingFace(image);
  if (
    hfResult &&
    hfResult.score >= HF_NOT_CLOSE_UP_SCORE &&
    isNonCloseUpLabel(hfResult.label)
  ) {
    return {
      reason: "not_close_up",
      topLabel: hfResult.label,
      topScore: hfResult.score,
    };
  }

  return null;
}

function normalizeImageMeta(
  imageMeta?: Partial<ImageMeta> | null
): ImageMeta | null {
  if (!imageMeta) return null;

  const width = Number(imageMeta.width);
  const height = Number(imageMeta.height);
  const blurScore = Number(imageMeta.blurScore);
  const estimatedKb = Number(imageMeta.estimatedKb);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(blurScore) ||
    !Number.isFinite(estimatedKb)
  ) {
    return null;
  }

  return {
    width,
    height,
    blurScore,
    estimatedKb,
  };
}

async function classifyWithHuggingFace(
  image: string
): Promise<HfClassificationResult | null> {
  const token = process.env.HF_TOKEN?.trim();
  if (!token) return null;

  try {
    const contentType = getImageContentType(image);
    const binaryImage = new Blob([decodeBase64Image(image)], {
      type: contentType,
    });

    const response = await fetch(HF_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: binaryImage,
    });

    if (!response.ok) {
      throw new Error(`HF gate request failed with ${response.status}`);
    }

    const data = (await response.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const topResult = data[0] as {
      label?: unknown;
      score?: unknown;
    };

    if (
      typeof topResult.label !== "string" ||
      typeof topResult.score !== "number"
    ) {
      return null;
    }

    return {
      label: topResult.label,
      score: topResult.score,
    };
  } catch (error) {
    console.error("[Image Gate] Hugging Face classification failed:", error);
    return null;
  }
}

function getImageContentType(image: string): string {
  const match = image.match(/^data:(image\/[A-Za-z0-9.+-]+);base64,/);
  return match?.[1] ?? "image/jpeg";
}

function decodeBase64Image(image: string): ArrayBuffer {
  const base64 = image.includes(",") ? image.split(",")[1] : image;
  const bytes = Buffer.from(base64, "base64");
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function isNonCloseUpLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return NON_CLOSE_UP_LABEL_TERMS.some((term) => normalized.includes(term));
}
