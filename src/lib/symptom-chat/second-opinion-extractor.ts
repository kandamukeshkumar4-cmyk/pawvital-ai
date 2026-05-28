import {
  FOLLOW_UP_QUESTIONS,
  type FollowUpQuestion,
} from "@/lib/clinical-matrix";
import {
  createModelBudgetState,
  getModelBudgetCallCount,
  getModelBudgetPolicy,
  reserveModelBudgetCall,
  type ModelBudgetState,
} from "@/lib/model-budget";
import {
  getSecondOpinionExtractorMode as getRouterSecondOpinionExtractorMode,
  type ModelFallbackReason,
  type ModelFeatureMode,
} from "@/lib/model-router";
import { complete } from "@/lib/nvidia-models";
import {
  coerceAnswerForQuestion,
  normalizeChoiceLabel,
  normalizeIntentText,
  shouldEscalateForUnknown,
} from "@/lib/symptom-chat/answer-coercion";
import { sanitizeAnswerForQuestion } from "@/lib/symptom-chat/answer-extraction";
import { extractSymptomsFromKeywords } from "@/lib/symptom-chat/extraction-helpers";

export type SecondOpinionExtractorMode = ModelFeatureMode;

export type SecondOpinionReason =
  | "no_pending_question"
  | "deterministic_resolved"
  | "not_first_clarification"
  | "malformed_json"
  | "low_confidence"
  | "unsafe_inference"
  | "timeout"
  | "provider_error"
  | Extract<
      ModelFallbackReason,
      "budget_exceeded" | "feature_disabled" | "circuit_open"
    >;

export const SECOND_OPINION_ELIGIBILITY_REASON_CODES = [
  "eligible",
  "feature_disabled",
  "empty_owner_message",
  "no_active_pending_question",
  "primary_extraction_succeeded",
  "deterministic_coercion_succeeded",
  "not_first_clarification_attempt",
  "repeat_guard_fired",
  "budget_exhausted",
  "circuit_open",
  "shadow_primary_success_sampling",
] as const;

export type SecondOpinionEligibilityReasonCode =
  (typeof SECOND_OPINION_ELIGIBILITY_REASON_CODES)[number];

export type SecondOpinionRequestOutcome =
  | "requested"
  | "not_requested"
  | "budget_exhausted";

export interface SecondOpinionEligibilityTrace {
  active_pending_question: boolean;
  primary_extraction_failed: boolean;
  deterministic_coercion_failed: boolean;
  first_clarification_attempt: boolean;
  repeat_guard_not_fired: boolean;
  budget_available: boolean;
  eligibility_reason: SecondOpinionEligibilityReasonCode;
  request_outcome: SecondOpinionRequestOutcome;
}

export interface SecondOpinionAcceptedAnswer {
  answered: true;
  questionId: string;
  answerValue: string | boolean | number;
  confidence: number;
  ownerPhrase: string;
  needsClarification: false;
}

export type SecondOpinionParseResult =
  | {
      status: "accepted";
      answer: SecondOpinionAcceptedAnswer;
      budgetState?: ModelBudgetState;
    }
  | {
      status: "rejected";
      reason: SecondOpinionReason;
      budgetState?: ModelBudgetState;
    };

export type SecondOpinionExtractionResult =
  | SecondOpinionParseResult
  | {
      status: "skipped" | "failed";
      reason?: SecondOpinionReason;
      budgetState?: ModelBudgetState;
    };

type ModelCaller = (prompt: string) => Promise<string>;

const CONFIDENCE_THRESHOLD = 0.82;
const STRING_ANSWER_MAX_LENGTH = 160;

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
};

export function getSecondOpinionExtractorMode(
  rawValue = process.env.SECOND_OPINION_EXTRACTOR
): SecondOpinionExtractorMode {
  return getRouterSecondOpinionExtractorMode(rawValue);
}

export function getPrimarySuccessShadowSamplingAttemptCount({
  previousClarificationAttempts,
  questionAskedCount,
}: {
  previousClarificationAttempts: number;
  questionAskedCount?: number;
}): number {
  if (questionAskedCount !== undefined && questionAskedCount > 1) {
    return Math.max(previousClarificationAttempts, 1);
  }

  if (previousClarificationAttempts === 0) {
    return 0;
  }

  // Production first-answer turns can arrive after the clarification counter has
  // already been incremented. Use asked-count as the stable first-answer signal.
  return questionAskedCount === 1 ? 0 : previousClarificationAttempts;
}

export function shouldAttemptSecondOpinionExtraction({
  mode,
  pendingQuestionId,
  ownerMessage,
  primaryExtractionFailed,
  deterministicResolved,
  clarificationAttempts,
  isShadowSampling = false,
}: {
  mode: SecondOpinionExtractorMode;
  pendingQuestionId?: string;
  ownerMessage: string;
  primaryExtractionFailed: boolean;
  deterministicResolved: boolean;
  clarificationAttempts: number;
  isShadowSampling?: boolean;
}): { shouldRun: true } | { shouldRun: false; reason?: SecondOpinionReason } {
  if (mode === "off" || ownerMessage.trim().length === 0) {
    return { shouldRun: false };
  }

  if (!pendingQuestionId) {
    return { shouldRun: false, reason: "no_pending_question" };
  }

  if (isShadowSampling) {
    if (clarificationAttempts !== 0) {
      return { shouldRun: false, reason: "not_first_clarification" };
    }
    return { shouldRun: true };
  }

  if (!primaryExtractionFailed || deterministicResolved) {
    return { shouldRun: false, reason: "deterministic_resolved" };
  }

  if (clarificationAttempts !== 1) {
    return { shouldRun: false, reason: "not_first_clarification" };
  }

  return { shouldRun: true };
}

export function buildSecondOpinionEligibilityTrace({
  mode,
  pendingQuestionId,
  ownerMessage,
  primaryExtractionFailed,
  deterministicResolved,
  clarificationAttempts,
  repeatGuardAlreadyFired = false,
  budgetState,
  isShadowSampling = false,
}: {
  mode: SecondOpinionExtractorMode;
  pendingQuestionId?: string;
  ownerMessage: string;
  primaryExtractionFailed: boolean;
  deterministicResolved: boolean;
  clarificationAttempts: number;
  repeatGuardAlreadyFired?: boolean;
  budgetState?: ModelBudgetState;
  isShadowSampling?: boolean;
}): SecondOpinionEligibilityTrace {
  const normalizedBudgetState = createModelBudgetState(budgetState);
  const activePendingQuestion = Boolean(pendingQuestionId);
  const deterministicCoercionFailed = !deterministicResolved;
  const firstClarificationAttempt = isShadowSampling
    ? clarificationAttempts === 0
    : clarificationAttempts === 1;
  const repeatGuardNotFired = !repeatGuardAlreadyFired;
  const budgetAvailable = isSecondOpinionBudgetAvailable(
    mode,
    normalizedBudgetState
  );
  const eligibilityReason = resolveSecondOpinionEligibilityReason({
    mode,
    ownerMessage,
    activePendingQuestion,
    primaryExtractionFailed,
    deterministicCoercionFailed,
    firstClarificationAttempt,
    repeatGuardNotFired,
    budgetState: normalizedBudgetState,
    budgetAvailable,
    isShadowSampling,
  });

  return {
    active_pending_question: activePendingQuestion,
    primary_extraction_failed: primaryExtractionFailed,
    deterministic_coercion_failed: deterministicCoercionFailed,
    first_clarification_attempt: firstClarificationAttempt,
    repeat_guard_not_fired: repeatGuardNotFired,
    budget_available: budgetAvailable,
    eligibility_reason: eligibilityReason,
    request_outcome:
      eligibilityReason === "eligible" ||
      eligibilityReason === "shadow_primary_success_sampling"
        ? "requested"
        : eligibilityReason === "budget_exhausted"
          ? "budget_exhausted"
          : "not_requested",
  };
}

export function parseSecondOpinionExtractorResponse(
  rawResponse: string,
  {
    pendingQuestionId,
    ownerMessage,
    knownSymptomsBeforeTurn = [],
    confidenceThreshold = CONFIDENCE_THRESHOLD,
  }: {
    pendingQuestionId: string;
    ownerMessage: string;
    knownSymptomsBeforeTurn?: string[];
    confidenceThreshold?: number;
  }
): SecondOpinionParseResult {
  const parsed = parseStrictJsonObject(rawResponse);
  if (!parsed) {
    return { status: "rejected", reason: "malformed_json" };
  }

  const question = FOLLOW_UP_QUESTIONS[pendingQuestionId];
  if (!question) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  if (
    parsed.answered !== true ||
    parsed.questionId !== pendingQuestionId ||
    parsed.needsClarification !== false
  ) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  const confidence =
    typeof parsed.confidence === "number" ? parsed.confidence : Number.NaN;
  if (!Number.isFinite(confidence) || confidence < confidenceThreshold) {
    return { status: "rejected", reason: "low_confidence" };
  }

  const ownerPhrase =
    typeof parsed.ownerPhrase === "string" ? parsed.ownerPhrase.trim() : "";
  if (!ownerPhrase || !containsOwnerPhrase(ownerMessage, ownerPhrase)) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  if (
    introducesNewSymptomOutsidePendingAnswer(
      ownerMessage,
      knownSymptomsBeforeTurn
    )
  ) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  const answerValue = normalizeAnswerValue(
    pendingQuestionId,
    question,
    parsed.answerValue,
    ownerPhrase
  );
  if (answerValue === null) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  if (
    !isAnswerAnchoredToOwnerPhrase(question, answerValue, ownerPhrase) ||
    isUnsafeEmergencyInference(pendingQuestionId, question, answerValue, ownerPhrase)
  ) {
    return { status: "rejected", reason: "unsafe_inference" };
  }

  return {
    status: "accepted",
    answer: {
      answered: true,
      questionId: pendingQuestionId,
      answerValue,
      confidence,
      ownerPhrase,
      needsClarification: false,
    },
  };
}

export async function extractSecondOpinionPendingAnswer({
  mode,
  pendingQuestionId,
  ownerMessage,
  primaryExtractionFailed,
  deterministicResolved,
  clarificationAttempts,
  knownSymptomsBeforeTurn = [],
  timeoutMs = getModelBudgetPolicy("second_opinion").timeoutMs,
  budgetState,
  modelCaller = callSecondOpinionModel,
  isShadowSampling = false,
}: {
  mode: SecondOpinionExtractorMode;
  pendingQuestionId?: string;
  ownerMessage: string;
  primaryExtractionFailed: boolean;
  deterministicResolved: boolean;
  clarificationAttempts: number;
  knownSymptomsBeforeTurn?: string[];
  timeoutMs?: number;
  budgetState?: ModelBudgetState;
  modelCaller?: ModelCaller;
  isShadowSampling?: boolean;
}): Promise<SecondOpinionExtractionResult> {
  const shouldExposeBudgetState = budgetState !== undefined;
  const decision = shouldAttemptSecondOpinionExtraction({
    mode,
    pendingQuestionId,
    ownerMessage,
    primaryExtractionFailed,
    deterministicResolved,
    clarificationAttempts,
    isShadowSampling,
  });

  if (!decision.shouldRun) {
    return decision.reason
      ? attachBudgetState(
          { status: "skipped", reason: decision.reason },
          shouldExposeBudgetState ? budgetState : undefined
        )
      : attachBudgetState(
          { status: "skipped" },
          shouldExposeBudgetState ? budgetState : undefined
        );
  }

  if (!pendingQuestionId) {
    return attachBudgetState(
      { status: "skipped", reason: "no_pending_question" },
      shouldExposeBudgetState ? budgetState : undefined
    );
  }

  const activePendingQuestionId = pendingQuestionId;
  const question = FOLLOW_UP_QUESTIONS[activePendingQuestionId];
  if (!question) {
    return attachBudgetState(
      { status: "rejected", reason: "unsafe_inference" },
      shouldExposeBudgetState ? budgetState : undefined
    );
  }

  const reservedBudget = reserveModelBudgetCall({
    feature: "second_opinion",
    mode,
    state: budgetState,
  });
  if (!reservedBudget.allowed) {
    return {
      status: "skipped",
      reason: reservedBudget.reason,
      budgetState: reservedBudget.state,
    };
  }

  try {
    const rawResponse = await withTimeout(
      modelCaller(
        buildSecondOpinionPrompt({
          pendingQuestionId: activePendingQuestionId,
          question,
          ownerMessage,
        })
      ),
      timeoutMs
    );

    return attachBudgetState(
      parseSecondOpinionExtractorResponse(rawResponse, {
        pendingQuestionId: activePendingQuestionId,
        ownerMessage,
        knownSymptomsBeforeTurn,
      }),
      shouldExposeBudgetState ? reservedBudget.state : undefined
    );
  } catch (error) {
    return attachBudgetState(
      {
        status: "failed",
        reason: isTimeoutError(error) ? "timeout" : "provider_error",
      },
      shouldExposeBudgetState ? reservedBudget.state : undefined
    );
  }
}

function isSecondOpinionBudgetAvailable(
  mode: SecondOpinionExtractorMode,
  budgetState: ModelBudgetState
): boolean {
  if (mode === "off") {
    return false;
  }

  if (budgetState.circuitOpen.second_opinion) {
    return false;
  }

  const policy = getModelBudgetPolicy("second_opinion");
  return (
    getModelBudgetCallCount(budgetState, "second_opinion") <
    policy.maxCallsPerSession
  );
}

function resolveSecondOpinionEligibilityReason({
  mode,
  ownerMessage,
  activePendingQuestion,
  primaryExtractionFailed,
  deterministicCoercionFailed,
  firstClarificationAttempt,
  repeatGuardNotFired,
  budgetState,
  budgetAvailable,
  isShadowSampling = false,
}: {
  mode: SecondOpinionExtractorMode;
  ownerMessage: string;
  activePendingQuestion: boolean;
  primaryExtractionFailed: boolean;
  deterministicCoercionFailed: boolean;
  firstClarificationAttempt: boolean;
  repeatGuardNotFired: boolean;
  budgetState: ModelBudgetState;
  budgetAvailable: boolean;
  isShadowSampling?: boolean;
}): SecondOpinionEligibilityReasonCode {
  if (mode === "off") {
    return "feature_disabled";
  }

  if (ownerMessage.trim().length === 0) {
    return "empty_owner_message";
  }

  if (!activePendingQuestion) {
    return "no_active_pending_question";
  }

  if (!isShadowSampling) {
    if (!primaryExtractionFailed) {
      return "primary_extraction_succeeded";
    }

    if (!deterministicCoercionFailed) {
      return "deterministic_coercion_succeeded";
    }
  }

  if (!firstClarificationAttempt) {
    return "not_first_clarification_attempt";
  }

  if (!repeatGuardNotFired) {
    return "repeat_guard_fired";
  }

  if (budgetState.circuitOpen.second_opinion) {
    return "circuit_open";
  }

  if (!budgetAvailable) {
    return "budget_exhausted";
  }

  return isShadowSampling ? "shadow_primary_success_sampling" : "eligible";
}

function parseStrictJsonObject(rawResponse: string): Record<string, unknown> | null {
  const trimmed = rawResponse.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function containsOwnerPhrase(ownerMessage: string, ownerPhrase: string): boolean {
  return normalizeForPhraseMatch(ownerMessage).includes(
    normalizeForPhraseMatch(ownerPhrase)
  );
}

function normalizeForPhraseMatch(value: string): string {
  return normalizeNumberWords(normalizeIntentText(value))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumberWords(value: string): string {
  return value.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,
    (word) => NUMBER_WORDS[word] ?? word
  );
}

function introducesNewSymptomOutsidePendingAnswer(
  ownerMessage: string,
  knownSymptomsBeforeTurn: string[]
): boolean {
  const known = new Set(knownSymptomsBeforeTurn);
  return extractSymptomsFromKeywords(ownerMessage).some(
    (symptom) => !known.has(symptom)
  );
}

function normalizeAnswerValue(
  questionId: string,
  question: FollowUpQuestion,
  rawValue: unknown,
  ownerPhrase: string
): string | boolean | number | null {
  if (
    typeof rawValue !== "string" &&
    typeof rawValue !== "boolean" &&
    typeof rawValue !== "number"
  ) {
    return null;
  }

  if (question.data_type === "boolean") {
    if (typeof rawValue === "boolean") {
      return rawValue;
    }
    return coerceAnswerForQuestion(questionId, String(rawValue));
  }

  if (question.data_type === "number") {
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return rawValue;
    }
    return coerceAnswerForQuestion(questionId, String(rawValue));
  }

  if (question.data_type === "choice") {
    const answerFromValue = sanitizeAnswerForQuestion(
      questionId,
      String(rawValue)
    );
    const normalizedChoices = new Set(
      (question.choices ?? []).map((choice) => String(choice))
    );

    return typeof answerFromValue === "string" &&
      normalizedChoices.has(answerFromValue)
      ? answerFromValue
      : null;
  }

  const value = String(rawValue).trim().replace(/\s+/g, " ");
  if (!value || value.length > STRING_ANSWER_MAX_LENGTH) {
    return null;
  }

  return value;
}

function isAnswerAnchoredToOwnerPhrase(
  question: FollowUpQuestion,
  answerValue: string | boolean | number,
  ownerPhrase: string
): boolean {
  if (typeof answerValue === "boolean") {
    return answerValue ? hasAffirmativeSignal(ownerPhrase) : hasDenialSignal(ownerPhrase);
  }

  if (question.data_type === "choice") {
    return isChoiceAnchored(question, answerValue, ownerPhrase);
  }

  if (question.data_type === "number") {
    return normalizeForPhraseMatch(ownerPhrase).includes(String(answerValue));
  }

  return hasStringValueOverlap(String(answerValue), ownerPhrase);
}

function isChoiceAnchored(
  question: FollowUpQuestion,
  answerValue: string | number,
  ownerPhrase: string
): boolean {
  if (!Array.isArray(question.choices)) {
    return false;
  }

  const normalizedPhrase = normalizeForPhraseMatch(ownerPhrase);
  const normalizedAnswer = normalizeChoiceLabel(String(answerValue));
  if (normalizedPhrase.includes(normalizedAnswer)) {
    return true;
  }

  const matchedChoice = question.choices.find(
    (choice) => normalizeChoiceLabel(String(choice)) === normalizedAnswer
  );
  if (!matchedChoice) {
    return false;
  }

  return normalizeChoiceLabel(String(matchedChoice))
    .split(" ")
    .filter(Boolean)
    .some((token) => normalizedPhrase.includes(token));
}

function hasStringValueOverlap(answerValue: string, ownerPhrase: string): boolean {
  const phrase = normalizeForPhraseMatch(ownerPhrase);
  const answerTokens = normalizeForPhraseMatch(answerValue)
    .split(/\s+/)
    .filter((token) => token.length > 1 && !["for", "about", "around"].includes(token));

  return answerTokens.length > 0 && answerTokens.every((token) => phrase.includes(token));
}

function isUnsafeEmergencyInference(
  questionId: string,
  question: FollowUpQuestion,
  answerValue: string | boolean | number,
  ownerPhrase: string
): boolean {
  if (
    shouldEscalateForUnknown(questionId) &&
    typeof answerValue === "string" &&
    normalizeChoiceLabel(answerValue) === "unknown"
  ) {
    return true;
  }

  if (question.critical && answerValue === false && !hasDenialSignal(ownerPhrase)) {
    return true;
  }

  return false;
}

function hasAffirmativeSignal(ownerPhrase: string): boolean {
  return /^(yes|yeah|yep|yup|true|correct|right)\b/.test(
    normalizeIntentText(ownerPhrase)
  );
}

function hasDenialSignal(ownerPhrase: string): boolean {
  const normalized = normalizeIntentText(ownerPhrase);
  if (
    /\b(not (?:really )?sure|can(?:not|'t|t) tell|do(?: not|n't|nt) know|no idea)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  return (
    /^(no|nope|nah|false)\b/.test(normalized) ||
    /\b(no|without)\s+(?:any\s+)?[a-z]/.test(normalized) ||
    /\b(doesn't|doesnt|didn't|didnt|isn't|isnt|hasn't|hasnt)\s+[a-z]/.test(
      normalized
    ) ||
    /\bnot\s+(bloody|present|there|warm|hot|swollen|painful|eating|drinking|vomiting|retching|walking|using|bearing|able)\b/.test(
      normalized
    )
  );
}

function buildSecondOpinionPrompt({
  pendingQuestionId,
  question,
  ownerMessage,
}: {
  pendingQuestionId: string;
  question: FollowUpQuestion;
  ownerMessage: string;
}): string {
  const choices = Array.isArray(question.choices)
    ? question.choices.join(", ")
    : "none";

  return `You extract one answer to the currently pending veterinary triage follow-up question.

Pending question:
- id: ${pendingQuestionId}
- text: ${question.question_text}
- data_type: ${question.data_type}
- choices: ${choices}
- extraction_hint: ${question.extraction_hint}
- critical: ${question.critical}

Owner reply:
${JSON.stringify(ownerMessage)}

Rules:
- Use only the pending question as the anchor.
- Accept only facts directly stated in the owner reply.
- Do not resolve a different question.
- Do not infer missing facts.
- Do not mark a critical red-flag question false unless the owner explicitly denies it.
- If the reply is unrelated, ambiguous, unsafe, or needs clarification, set answered=false.
- Include ownerPhrase as the exact source span from the owner reply.
- Return only strict JSON. No markdown, comments, or reasoning.

Schema:
{"answered":true,"questionId":"${pendingQuestionId}","answerValue":"owner-stated value","confidence":0.0,"ownerPhrase":"exact source phrase","needsClarification":false}

If unresolved:
{"answered":false,"questionId":"${pendingQuestionId}","answerValue":null,"confidence":0,"ownerPhrase":"","needsClarification":true}`;
}

async function callSecondOpinionModel(prompt: string): Promise<string> {
  return complete({
    role: "extraction",
    prompt,
    systemPrompt: "Return strict JSON only. Do not include reasoning.",
    maxTokens: 180,
    temperature: 0,
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("second-opinion-timeout"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === "second-opinion-timeout";
}

function attachBudgetState<T extends SecondOpinionExtractionResult>(
  result: T,
  budgetState?: ModelBudgetState
): T {
  if (!budgetState) {
    return result;
  }

  return {
    ...result,
    budgetState: createModelBudgetState(budgetState),
  };
}
