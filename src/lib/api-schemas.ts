import { z } from "zod";

// =============================================================================
// Supported Image Domain Schema
// =============================================================================
export const SupportedImageDomainSchema = z.enum([
  "skin_wound",
  "eye",
  "ear",
  "stool_vomit",
  "unsupported",
]);

export type SupportedImageDomain = z.infer<typeof SupportedImageDomainSchema>;

// =============================================================================
// Vision Severity Class Schema
// =============================================================================
export const VisionSeverityClassSchema = z.enum(["normal", "needs_review", "urgent"]);

// =============================================================================
// Detected Region Schema
// =============================================================================
export const DetectedRegionSchema = z.object({
  label: z.string().min(1),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

// =============================================================================
// Vision Preprocess Result Schema
// =============================================================================
export const VisionPreprocessResultSchema = z.object({
  domain: SupportedImageDomainSchema,
  bodyRegion: z.string().nullable(),
  detectedRegions: z.array(DetectedRegionSchema),
  bestCrop: z.string().nullable(),
  imageQuality: z.enum(["poor", "borderline", "good", "excellent"]),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string()),
});

// =============================================================================
// Retrieval Text Evidence Schema
// =============================================================================
export const RetrievalTextEvidenceSchema = z.object({
  title: z.string().min(1),
  citation: z.string().nullable(),
  score: z.number().min(0).max(1),
  summary: z.string().min(1),
  sourceUrl: z.string().nullable(),
});

// =============================================================================
// Retrieval Image Evidence Schema
// =============================================================================
export const RetrievalImageEvidenceSchema = z.object({
  title: z.string().min(1),
  citation: z.string().nullable(),
  score: z.number().min(0).max(1),
  summary: z.string().min(1),
  assetUrl: z.string().nullable(),
  domain: SupportedImageDomainSchema.nullable(),
  conditionLabel: z.string().nullable(),
  dogOnly: z.boolean(),
});

// =============================================================================
// Retrieval Bundle Schema
// =============================================================================
export const RetrievalBundleSchema = z.object({
  textChunks: z.array(RetrievalTextEvidenceSchema),
  imageMatches: z.array(RetrievalImageEvidenceSchema),
  rerankScores: z.array(z.number().min(0).max(1)),
  sourceCitations: z.array(z.string()),
});

// =============================================================================
// Consult Opinion Schema
// =============================================================================
export const ConsultOpinionSchema = z.object({
  model: z.string().min(1),
  summary: z.string().min(1),
  agreements: z.array(z.string()),
  disagreements: z.array(z.string()),
  uncertainties: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  mode: z.enum(["sync", "async"]),
});

// =============================================================================
// Service Timeout Record Schema
// =============================================================================
export const ServiceTimeoutRecordSchema = z.object({
  service: z.string().min(1),
  stage: z.string().min(1),
  reason: z.string().min(1),
});

// =============================================================================
// Raw API Response Schemas (for validating incoming sidecar responses)
// =============================================================================

/**
 * Schema for validating raw vision preprocess API response.
 * Allows snake_case and camelCase field names from different service versions.
 */
export const RawVisionPreprocessResponseSchema = z.object({
  domain: z.union([z.string(), z.null()]).optional(),
  image_domain: z.union([z.string(), z.null()]).optional(),
  bodyRegion: z.union([z.string(), z.null()]).optional(),
  body_region: z.union([z.string(), z.null()]).optional(),
  detectedRegions: z.array(z.union([z.string(), z.record(z.unknown())])).optional(),
  detected_regions: z.array(z.union([z.string(), z.record(z.unknown())])).optional(),
  bestCrop: z.union([z.string(), z.null()]).optional(),
  best_crop: z.union([z.string(), z.null()]).optional(),
  imageQuality: z.union([z.string(), z.null()]).optional(),
  image_quality: z.union([z.string(), z.null()]).optional(),
  confidence: z.union([z.number(), z.string(), z.null()]).optional(),
  preprocess_confidence: z.union([z.number(), z.string(), z.null()]).optional(),
  limitations: z.array(z.unknown()).optional(),
  image_limitations: z.array(z.unknown()).optional(),
});

/**
 * Schema for validating raw text retrieval API response.
 */
export const RawTextRetrievalResponseSchema = z.object({
  textChunks: z.array(z.record(z.unknown())).optional(),
  text_chunks: z.array(z.record(z.unknown())).optional(),
  rerankScores: z.array(z.unknown()).optional(),
  rerank_scores: z.array(z.unknown()).optional(),
  sourceCitations: z.array(z.unknown()).optional(),
  source_citations: z.array(z.unknown()).optional(),
});

/**
 * Schema for validating raw image retrieval API response.
 */
export const RawImageRetrievalResponseSchema = z.object({
  imageMatches: z.array(z.record(z.unknown())).optional(),
  image_matches: z.array(z.record(z.unknown())).optional(),
  sourceCitations: z.array(z.unknown()).optional(),
  source_citations: z.array(z.unknown()).optional(),
});

/**
 * Schema for validating raw multimodal consult API response.
 */
export const RawMultimodalConsultResponseSchema = z.object({
  model: z.union([z.string(), z.null()]).optional(),
  summary: z.union([z.string(), z.null()]).optional(),
  assessment: z.union([z.string(), z.null()]).optional(),
  agreements: z.array(z.unknown()).optional(),
  disagreements: z.array(z.unknown()).optional(),
  uncertainties: z.array(z.unknown()).optional(),
  confidence: z.union([z.number(), z.string(), z.null()]).optional(),
});

// =============================================================================
// Validation Helper Functions
// =============================================================================

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationError {
  success: false;
  error: z.ZodError;
}

export type SafeParseResult<T> = ValidationResult<T> | ValidationError;

/**
 * Safely parse a value against a Zod schema.
 * Returns a typed result that can be used without catching exceptions.
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): SafeParseResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate vision preprocess response and return typed result.
 */
export function validateVisionPreprocessResponse(
  raw: unknown
): SafeParseResult<z.infer<typeof VisionPreprocessResultSchema>> {
  return validateSchema(VisionPreprocessResultSchema, raw);
}

/**
 * Validate retrieval bundle response and return typed result.
 */
export function validateRetrievalBundleResponse(
  raw: unknown
): SafeParseResult<z.infer<typeof RetrievalBundleSchema>> {
  return validateSchema(RetrievalBundleSchema, raw);
}

/**
 * Validate consult opinion response and return typed result.
 */
export function validateConsultOpinionResponse(
  raw: unknown
): SafeParseResult<z.infer<typeof ConsultOpinionSchema>> {
  return validateSchema(ConsultOpinionSchema, raw);
}

/**
 * Validate and log any validation errors.
 */
export function validateOrLog<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T | null {
  const result = validateSchema(schema, data);
  if (!result.success) {
    console.error(`[Validation Error] ${context}:`, result.error.format());
    return null;
  }
  return result.data;
}
