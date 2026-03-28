import type {
  AsyncReviewSubmission,
  ConsultOpinion,
  DetectedRegion,
  RetrievalBundle,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
  SupportedImageDomain,
  VisionPreprocessResult,
  VisionSeverityClass,
} from "./clinical-evidence";
import {
  validateOrLog,
  VisionPreprocessResultSchema,
  RetrievalBundleSchema,
  ConsultOpinionSchema,
  AsyncReviewSubmissionSchema,
} from "./api-schemas";

const VISION_PREPROCESS_URL = process.env.HF_VISION_PREPROCESS_URL?.trim() || "";
const TEXT_RETRIEVAL_SERVICE_URL =
  process.env.HF_TEXT_RETRIEVAL_URL?.trim() ||
  process.env.TEXT_RETRIEVAL_URL?.trim() ||
  process.env.HF_RETRIEVAL_SERVICE_URL?.trim() ||
  "";
const IMAGE_RETRIEVAL_SERVICE_URL =
  process.env.HF_IMAGE_RETRIEVAL_URL?.trim() ||
  process.env.IMAGE_RETRIEVAL_URL?.trim() ||
  process.env.HF_RETRIEVAL_SERVICE_URL?.trim() ||
  "";
const MULTIMODAL_CONSULT_URL =
  process.env.HF_MULTIMODAL_CONSULT_URL?.trim() || "";
const ASYNC_REVIEW_SERVICE_URL =
  process.env.HF_ASYNC_REVIEW_URL?.trim() ||
  process.env.ASYNC_REVIEW_SERVICE_URL?.trim() ||
  process.env.HF_MULTIMODAL_CONSULT_ASYNC_URL?.trim() ||
  "";
const SIDECAR_API_KEY = process.env.HF_SIDECAR_API_KEY?.trim() || "";

const VISION_PREPROCESS_TIMEOUT_MS =
  Number(process.env.HF_VISION_PREPROCESS_TIMEOUT_MS) || 4500;
const TEXT_RETRIEVAL_SERVICE_TIMEOUT_MS =
  Number(process.env.HF_TEXT_RETRIEVAL_TIMEOUT_MS) ||
  Number(process.env.HF_RETRIEVAL_SERVICE_TIMEOUT_MS) ||
  5000;
const IMAGE_RETRIEVAL_SERVICE_TIMEOUT_MS =
  Number(process.env.HF_IMAGE_RETRIEVAL_TIMEOUT_MS) ||
  Number(process.env.HF_RETRIEVAL_SERVICE_TIMEOUT_MS) ||
  5000;
const MULTIMODAL_CONSULT_TIMEOUT_MS =
  Number(process.env.HF_MULTIMODAL_CONSULT_TIMEOUT_MS) || 9000;
const ASYNC_REVIEW_SERVICE_TIMEOUT_MS =
  Number(process.env.HF_ASYNC_REVIEW_TIMEOUT_MS) || 15000;

function buildHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(SIDECAR_API_KEY ? { Authorization: `Bearer ${SIDECAR_API_KEY}` } : {}),
  };
}

interface FetchJsonOptions {
  timeoutMs: number;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

interface FetchJsonError extends Error {
  retriesAttempted: number;
  statusCode?: number;
}

async function fetchJson<T>(
  url: string,
  payload: Record<string, unknown>,
  options: FetchJsonOptions
): Promise<T> {
  const {
    timeoutMs,
    retries = 2,
    baseDelayMs = 500,
    maxDelayMs = 4000,
  } = options;

  let lastError: FetchJsonError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as T) : ({} as T);

      if (!response.ok) {
        const error = new Error(
          `Sidecar request failed (${response.status}): ${text.slice(0, 240)}`
        ) as FetchJsonError;
        error.statusCode = response.status;
        error.retriesAttempted = attempt;
        throw error;
      }

      return parsed;
    } catch (error) {
      if (error instanceof Error) {
        const fetchError = error as FetchJsonError;
        fetchError.retriesAttempted = attempt;
        lastError = fetchError;

        // Don't wait after last attempt
        if (attempt < retries) {
          const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
          console.warn(
            `[HF Sidecar] Request failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms: ${error.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } else {
        lastError = new Error(String(error)) as FetchJsonError;
        lastError.retriesAttempted = attempt;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError;
}

function requireValidated<T>(
  schema: Parameters<typeof validateOrLog<T>>[0],
  data: unknown,
  context: string,
  fallbackMessage: string
): T {
  const validated = validateOrLog(schema, data, context);
  if (!validated) {
    throw new Error(fallbackMessage);
  }
  return validated;
}

export function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return false;
}

export function isVisionPreprocessConfigured(): boolean {
  return Boolean(VISION_PREPROCESS_URL);
}

export function isRetrievalSidecarConfigured(): boolean {
  // Check new split services first, then fall back to legacy single URL
  return Boolean(
    TEXT_RETRIEVAL_SERVICE_URL ||
    IMAGE_RETRIEVAL_SERVICE_URL ||
    process.env.HF_RETRIEVAL_SERVICE_URL?.trim()
  );
}

export function isTextRetrievalConfigured(): boolean {
  return Boolean(TEXT_RETRIEVAL_SERVICE_URL);
}

export function isImageRetrievalConfigured(): boolean {
  return Boolean(IMAGE_RETRIEVAL_SERVICE_URL);
}

export function isMultimodalConsultConfigured(): boolean {
  return Boolean(MULTIMODAL_CONSULT_URL);
}

export function isAsyncReviewServiceConfigured(): boolean {
  return Boolean(ASYNC_REVIEW_SERVICE_URL);
}

function normalizeDomain(value: unknown): SupportedImageDomain {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    normalized === "skin_wound" ||
    normalized === "eye" ||
    normalized === "ear" ||
    normalized === "stool_vomit"
  ) {
    return normalized;
  }
  return "unsupported";
}

function normalizeDetectedRegions(value: unknown): DetectedRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return { label: entry.trim(), confidence: 0.5 } as DetectedRegion;
      }

      if (!entry || typeof entry !== "object") return null;

      const row = entry as Record<string, unknown>;
      const label = String(row.label || row.name || row.region || "").trim();
      if (!label) return null;

      const confidence = Number(
        row.confidence ?? row.score ?? row.probability ?? 0.5
      );
      const notes = String(row.notes || row.summary || "").trim() || undefined;
      return {
        label,
        confidence: Number.isFinite(confidence) ? confidence : 0.5,
        notes,
      } satisfies DetectedRegion;
    })
    .filter((entry): entry is DetectedRegion => Boolean(entry));
}

export async function preprocessVeterinaryImage(input: {
  image: string;
  ownerText: string;
  knownSymptoms: string[];
  breed?: string;
  ageYears?: number;
  weight?: number;
}): Promise<VisionPreprocessResult> {
  if (!VISION_PREPROCESS_URL) {
    throw new Error("Vision preprocess sidecar is not configured");
  }

  const response = await fetchJson<Record<string, unknown>>(
    VISION_PREPROCESS_URL,
    {
      image: input.image,
      owner_text: input.ownerText,
      known_symptoms: input.knownSymptoms,
      breed: input.breed,
      age_years: input.ageYears,
      weight: input.weight,
    },
    { timeoutMs: VISION_PREPROCESS_TIMEOUT_MS, retries: 2, baseDelayMs: 500, maxDelayMs: 4000 }
  );

  const normalized = {
    domain: normalizeDomain(response.domain ?? response.image_domain),
    bodyRegion:
      String(response.bodyRegion ?? response.body_region ?? "").trim() || null,
    detectedRegions: normalizeDetectedRegions(
      response.detectedRegions ?? response.detected_regions
    ),
    bestCrop:
      String(response.bestCrop ?? response.best_crop ?? "").trim() || null,
    imageQuality: (String(
      response.imageQuality ?? response.image_quality ?? "borderline"
    ).trim() || "borderline") as VisionPreprocessResult["imageQuality"],
    confidence: Number(
      response.confidence ?? response.preprocess_confidence ?? 0.5
    ),
    limitations: Array.isArray(response.limitations)
      ? response.limitations.map((item) => String(item)).filter(Boolean)
      : Array.isArray(response.image_limitations)
        ? response.image_limitations
            .map((item) => String(item))
            .filter(Boolean)
        : [],
  };

  return requireValidated(
    VisionPreprocessResultSchema,
    normalized,
    "vision-preprocess-service response",
    "Vision preprocess sidecar returned an invalid payload"
  );
}

function normalizeTextEvidence(value: unknown): RetrievalTextEvidence[] {
  if (!Array.isArray(value)) return [];
  const normalized: Array<RetrievalTextEvidence | null> = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const title = String(row.title || row.source_title || "").trim();
      const summary = String(
        row.summary || row.excerpt || row.text_content || ""
      ).trim();
      if (!title && !summary) return null;
      return {
        title: title || "Veterinary Reference",
        citation:
          String(row.citation || row.source || row.source_url || "").trim() ||
          null,
        score: Number(row.score ?? row.rerank_score ?? 0),
        summary,
        sourceUrl:
          String(row.sourceUrl || row.source_url || "").trim() || null,
        } satisfies RetrievalTextEvidence;
    });
  return normalized.filter(
    (entry): entry is RetrievalTextEvidence => entry !== null
  );
}

function normalizeImageEvidence(value: unknown): RetrievalImageEvidence[] {
  if (!Array.isArray(value)) return [];
  const normalized: Array<RetrievalImageEvidence | null> = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const title = String(row.title || row.source_title || "").trim();
      const summary = String(row.summary || row.caption || "").trim();
      const citation =
        String(row.citation || row.dataset_url || row.source || "").trim() ||
        null;
      return {
        title: title || "Reference Image",
        citation,
        score: Number(row.score ?? row.similarity ?? 0),
        summary,
        assetUrl: String(row.assetUrl || row.asset_url || "").trim() || null,
        domain: normalizeDomain(row.domain ?? row.image_domain),
        conditionLabel:
          String(row.conditionLabel || row.condition_label || "").trim() || null,
        dogOnly:
          row.dogOnly === true ||
          row.dog_only === true ||
          row.species === "dog" ||
          row.species_scope === "dog",
        } satisfies RetrievalImageEvidence;
    });
  return normalized.filter(
    (entry): entry is RetrievalImageEvidence => entry !== null
  );
}

export async function retrieveVeterinaryTextEvidenceFromSidecar(input: {
  query: string;
  domain: SupportedImageDomain | null;
  breed?: string;
  conditionHints?: string[];
  dogOnly?: boolean;
  textLimit?: number;
}): Promise<{
  textChunks: RetrievalTextEvidence[];
  rerankScores: number[];
  sourceCitations: string[];
}> {
  if (!TEXT_RETRIEVAL_SERVICE_URL) {
    throw new Error("Text retrieval sidecar is not configured");
  }

  const response = await fetchJson<Record<string, unknown>>(
    TEXT_RETRIEVAL_SERVICE_URL,
    {
      query: input.query,
      domain: input.domain,
      breed: input.breed,
      condition_hints: input.conditionHints || [],
      dog_only: input.dogOnly ?? true,
      text_limit: input.textLimit ?? 4,
    },
    { timeoutMs: TEXT_RETRIEVAL_SERVICE_TIMEOUT_MS, retries: 2, baseDelayMs: 500, maxDelayMs: 4000 }
  );

  const textChunks = normalizeTextEvidence(
    response.textChunks ?? response.text_chunks
  );

  return {
    textChunks,
    rerankScores: Array.isArray(response.rerankScores)
      ? response.rerankScores.map((value) => Number(value)).filter(Number.isFinite)
      : Array.isArray(response.rerank_scores)
        ? response.rerank_scores
            .map((value) => Number(value))
            .filter(Number.isFinite)
        : [],
    sourceCitations: Array.isArray(response.sourceCitations)
      ? response.sourceCitations.map((value) => String(value)).filter(Boolean)
      : Array.isArray(response.source_citations)
        ? response.source_citations
            .map((value) => String(value))
            .filter(Boolean)
        : [],
  };
}

export async function retrieveVeterinaryImageEvidenceFromSidecar(input: {
  query: string;
  domain: SupportedImageDomain | null;
  breed?: string;
  conditionHints?: string[];
  dogOnly?: boolean;
  imageLimit?: number;
}): Promise<{
  imageMatches: RetrievalImageEvidence[];
  sourceCitations: string[];
}> {
  if (!IMAGE_RETRIEVAL_SERVICE_URL) {
    throw new Error("Image retrieval sidecar is not configured");
  }

  const response = await fetchJson<Record<string, unknown>>(
    IMAGE_RETRIEVAL_SERVICE_URL,
    {
      query: input.query,
      domain: input.domain,
      breed: input.breed,
      condition_hints: input.conditionHints || [],
      dog_only: input.dogOnly ?? true,
      image_limit: input.imageLimit ?? 4,
    },
    { timeoutMs: IMAGE_RETRIEVAL_SERVICE_TIMEOUT_MS, retries: 2, baseDelayMs: 500, maxDelayMs: 4000 }
  );

  return {
    imageMatches: normalizeImageEvidence(
      response.imageMatches ?? response.image_matches
    ),
    sourceCitations: Array.isArray(response.sourceCitations)
      ? response.sourceCitations.map((value) => String(value)).filter(Boolean)
      : Array.isArray(response.source_citations)
        ? response.source_citations
            .map((value) => String(value))
            .filter(Boolean)
        : [],
  };
}

export async function retrieveVeterinaryEvidenceFromSidecar(input: {
  query: string;
  domain: SupportedImageDomain | null;
  breed?: string;
  conditionHints?: string[];
  dogOnly?: boolean;
  textLimit?: number;
  imageLimit?: number;
}): Promise<RetrievalBundle> {
  const results = await Promise.allSettled([
    isTextRetrievalConfigured()
      ? retrieveVeterinaryTextEvidenceFromSidecar(input)
      : Promise.resolve({
          textChunks: [] as RetrievalTextEvidence[],
          rerankScores: [] as number[],
          sourceCitations: [] as string[],
        }),
    isImageRetrievalConfigured()
      ? retrieveVeterinaryImageEvidenceFromSidecar(input)
      : Promise.resolve({
          imageMatches: [] as RetrievalImageEvidence[],
          sourceCitations: [] as string[],
        }),
  ]);

  const textResult = results[0];
  const imageResult = results[1];

  const textChunks: RetrievalTextEvidence[] =
    textResult.status === "fulfilled" ? textResult.value.textChunks : [];
  const rerankScores: number[] =
    textResult.status === "fulfilled" ? textResult.value.rerankScores : [];
  const textCitations: string[] =
    textResult.status === "fulfilled" ? textResult.value.sourceCitations : [];
  const imageMatches: RetrievalImageEvidence[] =
    imageResult.status === "fulfilled" ? imageResult.value.imageMatches : [];
  const imageCitations: string[] =
    imageResult.status === "fulfilled" ? imageResult.value.sourceCitations : [];

  // Log any failures for debugging
  if (textResult.status === "rejected") {
    console.error("[HF Retrieval] text retrieval failed:", textResult.reason);
  }
  if (imageResult.status === "rejected") {
    console.error("[HF Retrieval] image retrieval failed:", imageResult.reason);
  }

  const bundle = {
    textChunks,
    imageMatches,
    rerankScores,
    sourceCitations: [...textCitations, ...imageCitations].slice(0, 10),
  };

  return requireValidated(
    RetrievalBundleSchema,
    bundle,
    "retrieval sidecar response",
    "Retrieval sidecar returned an invalid payload"
  );
}

export async function consultWithMultimodalSidecar(input: {
  image: string;
  ownerText: string;
  preprocess: VisionPreprocessResult;
  visionSummary: string;
  severity: VisionSeverityClass;
  contradictions: string[];
  deterministicFacts: Record<string, string | boolean | number>;
  mode?: "sync" | "async";
}): Promise<ConsultOpinion> {
  if (!MULTIMODAL_CONSULT_URL) {
    throw new Error("Multimodal consult sidecar is not configured");
  }

  const response = await fetchJson<Record<string, unknown>>(
    MULTIMODAL_CONSULT_URL,
    {
      image: input.image,
      owner_text: input.ownerText,
      mode: "sync",
      preprocess: input.preprocess,
      vision_summary: input.visionSummary,
      severity: input.severity,
      contradictions: input.contradictions,
      deterministic_facts: input.deterministicFacts,
    },
    {
      timeoutMs: MULTIMODAL_CONSULT_TIMEOUT_MS,
      retries: 2,
      baseDelayMs: 500,
      maxDelayMs: 4000
    }
  );

  const normalized = {
    model:
      String(
        response.model ||
          (input.mode === "async"
            ? "Qwen2.5-VL-32B-Instruct"
            : "Qwen2.5-VL-7B-Instruct")
      ).trim() || "Qwen2.5-VL-7B-Instruct",
    summary: String(response.summary || response.assessment || "").trim(),
    agreements: Array.isArray(response.agreements)
      ? response.agreements.map((value) => String(value)).filter(Boolean)
      : [],
    disagreements: Array.isArray(response.disagreements)
      ? response.disagreements.map((value) => String(value)).filter(Boolean)
      : [],
    uncertainties: Array.isArray(response.uncertainties)
      ? response.uncertainties.map((value) => String(value)).filter(Boolean)
      : [],
    confidence: Number(response.confidence ?? 0.6),
    mode: "sync",
  };

  return requireValidated(
    ConsultOpinionSchema,
    normalized,
    "multimodal consult response",
    "Multimodal consult sidecar returned an invalid payload"
  );
}

export async function submitAsyncReviewToSidecar(input: {
  image: string;
  ownerText: string;
  preprocess: VisionPreprocessResult;
  visionSummary: string;
  severity: VisionSeverityClass;
  contradictions: string[];
  deterministicFacts: Record<string, string | boolean | number>;
  caseId?: string;
  callbackUrl?: string;
}): Promise<AsyncReviewSubmission> {
  if (!ASYNC_REVIEW_SERVICE_URL) {
    throw new Error("Async review sidecar is not configured");
  }

  const response = await fetchJson<Record<string, unknown>>(
    ASYNC_REVIEW_SERVICE_URL,
    {
      image: input.image,
      owner_text: input.ownerText,
      mode: "async",
      preprocess: input.preprocess,
      vision_summary: input.visionSummary,
      severity: input.severity,
      contradictions: input.contradictions,
      deterministic_facts: input.deterministicFacts,
      case_id: input.caseId,
      callback_url: input.callbackUrl,
    },
    {
      timeoutMs: ASYNC_REVIEW_SERVICE_TIMEOUT_MS,
      retries: 2,
      baseDelayMs: 500,
      maxDelayMs: 4000,
    }
  );

  const normalized = {
    ok:
      response.ok === true ||
      response.ok === "true" ||
      String(response.status || "").trim().toLowerCase() === "queued",
    caseId: String(response.caseId || response.case_id || "").trim(),
    status: (String(response.status || "queued").trim().toLowerCase() ||
      "queued") as AsyncReviewSubmission["status"],
    message: String(response.message || "").trim() || null,
  };

  return requireValidated(
    AsyncReviewSubmissionSchema,
    normalized,
    "async review sidecar response",
    "Async review sidecar returned an invalid payload"
  );
}
