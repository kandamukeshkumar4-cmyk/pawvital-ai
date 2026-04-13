import { createHash } from "node:crypto";
import {
  getQuestionText,
  recordAnswer,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import {
  evaluateImageGate,
  type ImageGateWarning,
  type ImageMeta,
} from "@/lib/image-gate";
import type { SidecarObservation } from "@/lib/clinical-evidence";
import { isInternalTelemetry } from "@/lib/sidecar-observability";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import {
  coerceAnswerForQuestion,
  questionAllowsCanonicalUnknown,
} from "@/lib/symptom-chat/answer-coercion";
import { extractSymptomsFromKeywords } from "@/lib/symptom-chat/extraction-helpers";

export function buildCompactImageSignalContext(
  session: TriageSession,
  visionSymptoms: string[] = [],
  visionRedFlags: string[] = [],
  visionSeverity?: "normal" | "needs_review" | "urgent"
): string {
  const parts: string[] = [];
  const hasImageSignals =
    Boolean(session.image_inferred_breed) ||
    Boolean(session.roboflow_skin_labels?.length) ||
    visionSymptoms.length > 0 ||
    visionRedFlags.length > 0 ||
    Boolean(session.vision_analysis);

  if (session.image_inferred_breed) {
    const confidence = session.image_inferred_breed_confidence
      ? ` (${Math.round(session.image_inferred_breed_confidence * 100)}% confidence)`
      : "";
    parts.push(`Breed hint: ${session.image_inferred_breed}${confidence}`);
  }

  if (session.roboflow_skin_labels?.length) {
    parts.push(
      `Skin labels: ${session.roboflow_skin_labels.slice(0, 3).join(", ")}`
    );
  }

  if (session.latest_image_domain && session.latest_image_domain !== "unsupported") {
    parts.push(`Image domain: ${session.latest_image_domain}`);
  }

  if (session.latest_image_body_region) {
    parts.push(`Image body region: ${session.latest_image_body_region}`);
  }

  if (visionSymptoms.length > 0) {
    parts.push(`Vision symptoms: ${visionSymptoms.join(", ")}`);
  }

  if (visionRedFlags.length > 0) {
    parts.push(`Vision red flags: ${visionRedFlags.join(", ")}`);
  }

  if (hasImageSignals && visionSeverity && visionSeverity !== "normal") {
    parts.push(`Vision severity: ${visionSeverity}`);
  }

  return parts.join("\n");
}

export function buildQuestionPhrasingContext(
  session: TriageSession,
  visionSeverity?: "normal" | "needs_review" | "urgent"
): string {
  const parts: string[] = [];

  if (session.vision_analysis) {
    const visionSummary = session.vision_analysis
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .substring(0, 300);
    parts.push(`PHOTO FINDINGS: ${visionSummary}`);
  } else if (session.roboflow_skin_labels?.length) {
    parts.push(
      `Photo likely shows: ${session.roboflow_skin_labels.slice(0, 2).join(", ")}`
    );
  }

  if (visionSeverity && visionSeverity !== "normal") {
    parts.push(`Visual severity: ${visionSeverity}`);
  }

  if (session.vision_symptoms?.length) {
    parts.push(`Visual symptoms detected: ${session.vision_symptoms.join(", ")}`);
  }

  if (session.latest_visual_evidence) {
    parts.push(
      `Structured visual evidence: domain=${session.latest_visual_evidence.domain}, body_region=${session.latest_visual_evidence.bodyRegion || "unknown"}, findings=${session.latest_visual_evidence.findings.join(", ") || "none"}, contradictions=${session.latest_visual_evidence.contradictions.join(", ") || "none"}`
    );
  }

  if (session.latest_consult_opinion) {
    parts.push(
      `Specialist consult: ${session.latest_consult_opinion.summary}. Uncertainties: ${
        session.latest_consult_opinion.uncertainties.join(", ") || "none"
      }`
    );
  }

  if (
    session.last_question_asked &&
    session.answered_questions.includes(session.last_question_asked)
  ) {
    const prevQ = getQuestionText(session.last_question_asked);
    parts.push(`The owner's last message (including photo) answered: "${prevQ}"`);
  }

  return parts.join(". ");
}

export function shouldIncludeImageContextInQuestion(
  questionId: string,
  session: TriageSession,
  preferredSymptoms: string[]
): boolean {
  if (questionId.startsWith("wound_")) {
    return true;
  }

  return (
    preferredSymptoms.some((symptom) =>
      SYMPTOM_MAP[symptom]?.follow_up_questions.includes(questionId)
    ) &&
    (Boolean(session.roboflow_skin_labels?.length) ||
      Boolean(session.vision_analysis))
  );
}

export function buildTurnFocusSymptoms(
  knownSymptomsBeforeTurn: Set<string>,
  session: TriageSession,
  visionSymptoms: string[] = [],
  extractedSymptoms: string[] = []
): string[] {
  const focus = new Set<string>();

  for (const symptom of session.known_symptoms) {
    if (!knownSymptomsBeforeTurn.has(symptom)) {
      focus.add(symptom);
    }
  }

  for (const symptom of [...visionSymptoms, ...extractedSymptoms]) {
    if (session.known_symptoms.includes(symptom)) {
      focus.add(symptom);
    }
  }

  return [...focus];
}

export function propagateSharedLocationAnswers(
  session: TriageSession
): TriageSession {
  const locationQuestionGroups = [["which_leg", "wound_location"]];
  let updated = session;

  for (const group of locationQuestionGroups) {
    const sourceQuestionId = group.find(
      (questionId) =>
        Object.prototype.hasOwnProperty.call(
          updated.extracted_answers,
          questionId
        ) && updated.extracted_answers[questionId] !== ""
    );

    if (!sourceQuestionId) {
      continue;
    }

    const sourceValue = updated.extracted_answers[sourceQuestionId];

    for (const targetQuestionId of group) {
      if (targetQuestionId === sourceQuestionId) {
        continue;
      }

      if (
        updated.answered_questions.includes(targetQuestionId) ||
        !canPropagateLocationAnswer(
          updated,
          sourceQuestionId,
          targetQuestionId,
          sourceValue
        ) ||
        !isQuestionRelevantForCurrentSymptoms(updated, targetQuestionId)
      ) {
        continue;
      }

      updated = recordAnswer(updated, targetQuestionId, sourceValue);
    }
  }

  return updated;
}

function canPropagateLocationAnswer(
  session: TriageSession,
  sourceQuestionId: string,
  targetQuestionId: string,
  sourceValue: string | boolean | number
): boolean {
  const normalizedLocation = normalizeExplicitLegLocationAnswer(sourceValue);
  if (!normalizedLocation) {
    return false;
  }

  if (
    sourceQuestionId === "which_leg" &&
    targetQuestionId === "wound_location"
  ) {
    return (
      session.known_symptoms.includes("wound_skin_issue") &&
      (Boolean(session.vision_analysis) ||
        Boolean(session.roboflow_skin_labels?.length) ||
        Boolean(session.vision_symptoms?.includes("wound_skin_issue")))
    );
  }

  if (
    sourceQuestionId === "wound_location" &&
    targetQuestionId === "which_leg"
  ) {
    return session.known_symptoms.includes("limping");
  }

  return false;
}

function normalizeExplicitLegLocationAnswer(
  value: string | boolean | number
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  const hasExplicitSide = /\bleft\b|\bright\b/.test(normalized);
  const mentionsLeg = /\bleg\b/.test(normalized);

  return hasExplicitSide && mentionsLeg ? normalized : null;
}

function isQuestionRelevantForCurrentSymptoms(
  session: TriageSession,
  questionId: string
): boolean {
  return session.known_symptoms.some((symptom) =>
    SYMPTOM_MAP[symptom]?.follow_up_questions.includes(questionId)
  );
}

export function getDeterministicFastPathExtraction(
  session: TriageSession,
  rawMessage: string
): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
} | null {
  const pendingQuestionId = session.last_question_asked;
  if (
    !pendingQuestionId ||
    session.answered_questions.includes(pendingQuestionId)
  ) {
    return null;
  }

  const trimmed = rawMessage.trim();
  if (!trimmed) return null;

  const question = FOLLOW_UP_QUESTIONS[pendingQuestionId];
  if (!question) return null;

  const words = trimmed.split(/\s+/).filter(Boolean);
  const looksShortAnswer =
    trimmed.length <= 80 &&
    words.length <= 12 &&
    !/[\n\r]/.test(trimmed) &&
    (question.data_type !== "string" || !/[.!?].+[.!?]/.test(trimmed));

  if (!looksShortAnswer) return null;

  if (questionAllowsCanonicalUnknown(question)) {
    const unknownCoercion = coerceAmbiguousReplyToUnknown(trimmed);
    if (unknownCoercion !== null) {
      return {
        symptoms: [],
        answers: {
          [pendingQuestionId]: unknownCoercion,
        },
      };
    }
  }

  const newKeywordSymptoms = extractSymptomsFromKeywords(trimmed).filter(
    (symptom) => !session.known_symptoms.includes(symptom)
  );
  if (newKeywordSymptoms.length > 0) {
    return null;
  }

  const coercedAnswer = coerceAnswerForQuestion(pendingQuestionId, trimmed);
  if (coercedAnswer === null) return null;

  return {
    symptoms: [],
    answers: {
      [pendingQuestionId]: coercedAnswer,
    },
  };
}

export function hashImage(image: string): string {
  const payload = image.includes(",") ? image.split(",")[1] : image;
  return createHash("sha1").update(payload).digest("hex").slice(0, 16);
}

export function buildGateCacheKey(
  imageHash: string,
  imageMeta?: ImageMeta
): string {
  if (!imageMeta) return imageHash;

  return [
    imageHash,
    imageMeta.width || 0,
    imageMeta.height || 0,
    imageMeta.blurScore || 0,
    imageMeta.estimatedKb || 0,
  ].join(":");
}

export function buildVisionCacheKey(
  imageHash: string,
  message: string,
  pet: PetProfile
): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        imageHash,
        message: message.trim().toLowerCase(),
        breed: pet.breed,
        age_years: pet.age_years,
        weight: pet.weight,
      })
    )
    .digest("hex")
    .slice(0, 16);
}

export async function evaluateAndCacheGate(
  session: TriageSession,
  gateCacheKey: string,
  image: string,
  imageMeta?: ImageMeta
): Promise<ImageGateWarning | null> {
  const gateWarning = await evaluateImageGate(image, imageMeta);
  session.gate_cache_key = gateCacheKey;
  session.gate_warning_reason = gateWarning?.reason;
  session.gate_warning_label = gateWarning?.topLabel;
  session.gate_warning_score = gateWarning?.topScore;
  return gateWarning;
}

export function readCachedGateWarning(
  session: TriageSession
): ImageGateWarning | null {
  if (!session.gate_warning_reason) return null;

  return {
    reason: session.gate_warning_reason,
    topLabel: session.gate_warning_label,
    topScore: session.gate_warning_score,
  };
}

export function resetImageStateForNewUpload(session: TriageSession): void {
  if (
    session.effective_breed &&
    session.image_inferred_breed &&
    session.effective_breed === session.image_inferred_breed
  ) {
    delete session.effective_breed;
  }

  delete session.image_enrichment_hash;
  delete session.image_inferred_breed;
  delete session.image_inferred_breed_confidence;
  delete session.roboflow_skin_summary;
  delete session.roboflow_skin_labels;
  delete session.gate_cache_key;
  delete session.gate_warning_reason;
  delete session.gate_warning_label;
  delete session.gate_warning_score;
  delete session.vision_cache_key;
  delete session.vision_analysis;
  delete session.vision_symptoms;
  delete session.vision_red_flags;
  delete session.vision_severity;
}

export function isGenericImagePrompt(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  if (!normalized) return true;

  const genericPrompts = [
    "what is happening",
    "what's happening",
    "what is happneing",
    "what is this",
    "what's this",
    "what is wrong",
    "what's wrong",
    "help",
    "check this",
    "look at this",
    "uploaded an image for analysis.",
  ];

  return genericPrompts.some((prompt) => normalized.includes(prompt));
}

export function isImageEvidenceQuestion(questionId?: string): boolean {
  if (!questionId) {
    return false;
  }

  return [
    "which_leg",
    "wound_location",
    "pain_on_touch",
    "swelling_present",
    "warmth_present",
    "wound_size",
    "wound_duration",
    "wound_color",
    "wound_discharge",
    "wound_odor",
    "wound_licking",
  ].includes(questionId);
}

export function sanitizeServiceObservationsForClient(
  observations: SidecarObservation[] | undefined
): SidecarObservation[] {
  return (observations ?? []).filter((item) => !isInternalTelemetry(item));
}

export function sanitizeSessionForClient(
  session: TriageSession
): TriageSession {
  if (!session || !session.case_memory) return session;

  const safeMemory = { ...session.case_memory };
  delete safeMemory.clarification_reasons;
  const sanitizedMemory = {
    ...safeMemory,
    service_observations: sanitizeServiceObservationsForClient(
      session.case_memory.service_observations
    ),
    shadow_comparisons: [],
    service_timeouts: [],
  };

  return {
    ...session,
    case_memory: sanitizedMemory,
  };
}
