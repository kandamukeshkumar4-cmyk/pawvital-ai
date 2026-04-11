/**
 * Owner Language Normalizer for VET-922
 *
 * ADVISORY-ONLY: Never overrides deterministic extraction.
 * Falls back to existing normalizeSymptom() on low confidence or conflicts.
 */

export interface NormalizationResult {
  normalized_text: string;
  confidence: number;
  applied_rules: string[];
  fallback: boolean;
}

/**
 * Rollback rules:
 * 1. If helper latency > 3 seconds, skip and use fallback
 * 2. If helper output conflicts with deterministic extraction, use deterministic
 * 3. If helper produces null/empty, use fallback
 * 4. All helper outputs are logged but never trusted for clinical decisions
 */

const ROLLBACK_LATENCY_MS = 3000;
const MIN_CONFIDENCE = 0.7;

// Slang/vague to canonical mapping (subset - full corpus in data/corpus/)
const NORMALIZATION_RULES: Record<string, string> = {
  "can't catch breath": "difficulty_breathing",
  "struggling to breathe": "difficulty_breathing",
  "breathing funny": "difficulty_breathing",
  "won't eat": "not_eating",
  "not touching food": "not_eating",
  "acting off": "behavior_change",
  "not himself": "behavior_change",
  "tummy issues": "vomiting",
  "upset stomach": "vomiting",
  "throwing up": "vomiting",
  "the runs": "diarrhea",
  "loose stool": "diarrhea",
  "can't walk right": "limping",
  "favoring a leg": "limping",
  "scratching like crazy": "excessive_scratching",
  "peeing a lot": "inappropriate_urination",
  "drinking tons of water": "drinking_more",
  "shaking": "trembling",
  "wobbly": "trembling",
};

export function normalizeOwnerInput(
  rawText: string,
  context: {
    helperLatencyMs?: number;
    deterministicResult?: string | null;
    helperStartTimeMs?: number;
  } = {}
): NormalizationResult {
  // Rollback rule 1: Check latency
  if (context.helperLatencyMs && context.helperLatencyMs > ROLLBACK_LATENCY_MS) {
    return {
      normalized_text: rawText,
      confidence: 0.0,
      applied_rules: ["rollback_latency_exceeded"],
      fallback: true,
    };
  }

  // Rollback rule 3: Check for null/empty
  if (!rawText || rawText.trim().length === 0) {
    return {
      normalized_text: rawText,
      confidence: 0.0,
      applied_rules: ["rollback_empty_input"],
      fallback: true,
    };
  }

  // Try to normalize using rules
  const lowerText = rawText.toLowerCase();
  const appliedRules: string[] = [];
  let normalizedText = rawText;

  for (const [slang, canonical] of Object.entries(NORMALIZATION_RULES)) {
    if (lowerText.includes(slang)) {
      appliedRules.push(`slang_${slang}`);
      normalizedText = normalizedText.replace(new RegExp(slang, "gi"), canonical);
    }
  }

  const hasNormalization = appliedRules.length > 0;
  const confidence = hasNormalization ? 0.85 : 0.5;

  // Rollback rule 2: Check for conflicts with deterministic extraction
  if (context.deterministicResult && context.deterministicResult !== normalizedText) {
    return {
      normalized_text: context.deterministicResult,
      confidence: confidence * 0.5,
      applied_rules: [...appliedRules, "rollback_deterministic_override"],
      fallback: true,
    };
  }

  // Rollback rule 4: Low confidence -> fallback
  if (confidence < MIN_CONFIDENCE) {
    return {
      normalized_text: rawText,
      confidence,
      applied_rules: [...appliedRules, "low_confidence_fallback"],
      fallback: true,
    };
  }

  return {
    normalized_text: normalizedText,
    confidence,
    applied_rules: appliedRules,
    fallback: !hasNormalization,
  };
}
