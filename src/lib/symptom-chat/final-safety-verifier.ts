import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical-matrix";
import {
  createModelBudgetState,
  getModelBudgetPolicy,
  reserveModelBudgetCall,
  type ModelBudgetState,
} from "@/lib/model-budget";
import {
  getGrokFinalSafetyMode as getRouterGrokFinalSafetyMode,
  type ModelFallbackReason,
  type ModelFeatureMode,
} from "@/lib/model-router";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import { completeWithGrok } from "@/lib/xai-grok";

type UrgencyBucket = "low" | "moderate" | "high" | "emergency";

export type FinalSafetyVerifierMode = ModelFeatureMode;

export type FinalSafetyVerifierReason =
  | "malformed_json"
  | "missing_required_keys"
  | "unsafe_downgrade"
  | "diagnosis_wording"
  | "treatment_wording"
  | "invented_unsupported_fact"
  | "timeout"
  | "provider_error"
  | Extract<
      ModelFallbackReason,
      "budget_exceeded" | "feature_disabled" | "circuit_open"
    >;

export interface FinalSafetyVerifierInput {
  deterministicUrgency: string;
  deterministicRedFlags: string[];
  explicitOwnerAnswers: Record<string, string | boolean | number>;
  unresolvedCriticalUnknowns: string[];
  ownerFacingSummaryDraft: string;
  vetHandoffDraft: string;
}

export interface FinalSafetyVerifierOutput {
  unsafeDowngradeDetected: false;
  missedRedFlags: string[];
  diagnosisOrTreatmentClaims: string[];
  recommendedUrgencyLanguage: "monitor" | "vet_48h" | "same_day" | "emergency";
  vetHandoffNotes: string[];
  safeToShow: boolean;
}

export type FinalSafetyVerifierParseResult =
  | {
      status: "accepted";
      output: FinalSafetyVerifierOutput;
    }
  | {
      status: "rejected";
      reason: Exclude<
        FinalSafetyVerifierReason,
        "timeout" | "provider_error" | "budget_exceeded" | "feature_disabled" | "circuit_open"
      >;
    };

export interface FinalSafetyVerificationResult {
  status: "accepted" | "shadow" | "skipped" | "rejected" | "failed";
  reason?: FinalSafetyVerifierReason;
  severity: "low" | "medium" | "high" | "emergency";
  recommendation: "monitor" | "vet_48h" | "vet_24h" | "emergency_vet";
  vetHandoffSummary: string;
  budgetState?: ModelBudgetState;
  verifierOutput?: FinalSafetyVerifierOutput;
}

type ModelCaller = (prompt: string) => Promise<string>;

const URGENCY_RANK: Record<UrgencyBucket, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  emergency: 3,
};

const TREATMENT_WORDING_PATTERN =
  /\b(administer|apply|dose|dosing|dose\d*|give|medication|medicine|ointment|pill|prescri(?:be|ption)|start|tablet|treatment)\b/i;
const DIAGNOSIS_WORDING_PATTERN =
  /\b(caused by|condition|diagnos(?:e|ed|is)|gastroenteritis|infection|likely|obstruction|pancreatitis|points to|suggests)\b/i;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeUrgencyBucket(
  value: string | null | undefined
): UrgencyBucket | null {
  const normalized = normalizeText(value ?? "");
  if (!normalized) {
    return null;
  }

  if (
    normalized === "emergency" ||
    normalized === "emergency vet" ||
    normalized === "emergency_vet"
  ) {
    return "emergency";
  }

  if (
    normalized === "high" ||
    normalized === "same day" ||
    normalized === "same_day" ||
    normalized === "vet 24h" ||
    normalized === "vet_24h"
  ) {
    return "high";
  }

  if (
    normalized === "moderate" ||
    normalized === "vet 48h" ||
    normalized === "vet_48h"
  ) {
    return "moderate";
  }

  if (normalized === "low" || normalized === "monitor") {
    return "low";
  }

  return null;
}

function normalizeVerifierUrgencyLanguage(
  urgency: UrgencyBucket
): FinalSafetyVerifierOutput["recommendedUrgencyLanguage"] {
  if (urgency === "emergency") {
    return "emergency";
  }
  if (urgency === "high") {
    return "same_day";
  }
  if (urgency === "moderate") {
    return "vet_48h";
  }
  return "monitor";
}

function severityFromUrgencyBucket(
  urgency: UrgencyBucket
): FinalSafetyVerificationResult["severity"] {
  if (urgency === "moderate") {
    return "medium";
  }
  return urgency;
}

function recommendationFromUrgencyBucket(
  urgency: UrgencyBucket
): FinalSafetyVerificationResult["recommendation"] {
  if (urgency === "emergency") {
    return "emergency_vet";
  }
  if (urgency === "high") {
    return "vet_24h";
  }
  if (urgency === "moderate") {
    return "vet_48h";
  }
  return "monitor";
}

function getHigherUrgency(
  left: UrgencyBucket,
  right: UrgencyBucket
): UrgencyBucket {
  return URGENCY_RANK[left] >= URGENCY_RANK[right] ? left : right;
}

function formatAnswerValue(value: string | boolean | number): string {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value).trim();
}

function takeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);

  return normalized.length === value.length ? normalized : null;
}

function parseStrictJsonObject(rawResponse: string): Record<string, unknown> | null {
  const trimmed = rawResponse.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildSupportedFactPool(input: FinalSafetyVerifierInput): string[] {
  const sources = [
    input.ownerFacingSummaryDraft,
    input.vetHandoffDraft,
    ...input.deterministicRedFlags,
    ...input.deterministicRedFlags.map(humanizeToken),
    ...input.unresolvedCriticalUnknowns,
    ...Object.entries(input.explicitOwnerAnswers).flatMap(([key, value]) => [
      key,
      humanizeToken(key),
      `${humanizeToken(key)} ${formatAnswerValue(value)}`,
      formatAnswerValue(value),
    ]),
  ];

  return Array.from(
    new Set(sources.map((value) => normalizeText(value)).filter(Boolean))
  );
}

function isSupportedNote(
  note: string,
  supportedFacts: string[]
): boolean {
  const normalizedNote = normalizeText(note);
  if (!normalizedNote) {
    return false;
  }

  return supportedFacts.some(
    (fact) => fact.includes(normalizedNote) || normalizedNote.includes(fact)
  );
}

function collectUnresolvedCriticalUnknowns(session: TriageSession): string[] {
  const memory = session.case_memory;
  if (!memory) {
    return [];
  }

  const criticalQuestionIds = new Set<string>();
  for (const questionId of memory.unresolved_question_ids ?? []) {
    if (FOLLOW_UP_QUESTIONS[questionId]?.critical) {
      criticalQuestionIds.add(questionId);
    }
  }

  if (
    memory.pending_question_id &&
    FOLLOW_UP_QUESTIONS[memory.pending_question_id]?.critical &&
    !session.answered_questions.includes(memory.pending_question_id)
  ) {
    criticalQuestionIds.add(memory.pending_question_id);
  }

  for (const [questionId, value] of Object.entries(session.extracted_answers)) {
    if (
      FOLLOW_UP_QUESTIONS[questionId]?.critical &&
      typeof value === "string" &&
      normalizeText(value) === "unknown"
    ) {
      criticalQuestionIds.add(questionId);
    }
  }

  return Array.from(criticalQuestionIds)
    .map((questionId) => FOLLOW_UP_QUESTIONS[questionId]?.question_text)
    .filter((question): question is string => Boolean(question));
}

function buildOwnerFacingSummaryDraft(report: Record<string, unknown>): string {
  const warningSigns = Array.isArray(report.warning_signs)
    ? report.warning_signs
        .slice(0, 4)
        .map((entry) => String(entry).trim())
        .filter(Boolean)
    : [];
  const actions = Array.isArray(report.actions)
    ? report.actions
        .slice(0, 3)
        .map((entry) => String(entry).trim())
        .filter(Boolean)
    : [];

  return [
    `Title: ${String(report.title || "").trim()}`,
    `Urgency: ${String(report.recommendation || report.severity || "monitor").trim()}`,
    `Summary: ${String(report.explanation || "").trim()}`,
    warningSigns.length > 0
      ? `Warning signs: ${warningSigns.join("; ")}`
      : "",
    actions.length > 0 ? `Actions: ${actions.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join(". ");
}

function buildFinalSafetyPrompt(input: FinalSafetyVerifierInput): string {
  return `You are a veterinary final-stage safety verifier.

You may ONLY verify these final summary surfaces:
1. owner-facing urgency summary
2. vet handoff draft

Hard rules:
- Do not invent facts.
- Do not lower deterministic urgency.
- Do not remove deterministic red flags.
- Do not add diagnosis claims.
- Do not add treatment or prescription advice.
- Only use facts present in the deterministic inputs below.

Deterministic urgency: ${input.deterministicUrgency}
Deterministic red flags: ${
    input.deterministicRedFlags.length > 0
      ? input.deterministicRedFlags.join(", ")
      : "none"
  }
Explicit owner answers: ${JSON.stringify(input.explicitOwnerAnswers)}
Unresolved critical unknowns: ${
    input.unresolvedCriticalUnknowns.length > 0
      ? input.unresolvedCriticalUnknowns.join(" | ")
      : "none"
  }

Owner-facing summary draft:
${input.ownerFacingSummaryDraft}

Vet handoff draft:
${input.vetHandoffDraft}

Return ONLY valid JSON with this exact schema:
{
  "unsafeDowngradeDetected": false,
  "missedRedFlags": [],
  "diagnosisOrTreatmentClaims": [],
  "recommendedUrgencyLanguage": "monitor|vet_48h|same_day|emergency",
  "vetHandoffNotes": [],
  "safeToShow": true
}`;
}

function classifyClaimReason(
  claims: string[]
): "diagnosis_wording" | "treatment_wording" {
  return claims.some((claim) => TREATMENT_WORDING_PATTERN.test(claim))
    ? "treatment_wording"
    : "diagnosis_wording";
}

function appendVerifierNotes(
  summary: string,
  output: FinalSafetyVerifierOutput
): string {
  const additions = Array.from(
    new Set(
      [...output.missedRedFlags.map(humanizeToken), ...output.vetHandoffNotes]
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );

  if (additions.length === 0) {
    return summary;
  }

  const noteBlock = `Priority handoff notes: ${additions.join("; ")}.`;
  if (normalizeText(summary).includes(normalizeText(noteBlock))) {
    return summary;
  }

  return `${summary} ${noteBlock}`.trim();
}

function normalizeReportUrgency(report: Record<string, unknown>): UrgencyBucket {
  const fromRecommendation = normalizeUrgencyBucket(
    typeof report.recommendation === "string" ? report.recommendation : null
  );
  if (fromRecommendation) {
    return fromRecommendation;
  }

  const fromSeverity = normalizeUrgencyBucket(
    typeof report.severity === "string" ? report.severity : null
  );
  return fromSeverity ?? "low";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && /timeout/i.test(error.message);
}

async function callFinalSafetyVerifierModel(
  prompt: string
): Promise<string> {
  return completeWithGrok({
    feature: "grok_final_safety",
    prompt,
    systemPrompt: "Return strict JSON only. No markdown. No chain-of-thought.",
    maxTokens: 500,
    temperature: 0,
  });
}

export function getFinalSafetyVerifierMode(
  rawValue = process.env.GROK_FINAL_SAFETY
): FinalSafetyVerifierMode {
  return getRouterGrokFinalSafetyMode(rawValue);
}

export function buildDeterministicVetHandoffSummary({
  session,
  pet,
  recommendation,
  deterministicRedFlags,
}: {
  session: TriageSession;
  pet: PetProfile;
  recommendation: FinalSafetyVerificationResult["recommendation"];
  deterministicRedFlags: string[];
}): string {
  const ownerFacts = Object.entries(session.extracted_answers)
    .slice(0, 8)
    .map(([key, value]) => `${humanizeToken(key)}: ${formatAnswerValue(value)}`);
  const unresolvedCriticalUnknowns = collectUnresolvedCriticalUnknowns(session);

  return [
    `Patient: ${pet.name}, ${pet.age_years}y ${pet.breed}, ${pet.weight} lbs.`,
    `Urgency: ${recommendation}.`,
    `Main concerns: ${session.known_symptoms.join(", ") || "not fully established"}.`,
    deterministicRedFlags.length > 0
      ? `Deterministic red flags: ${deterministicRedFlags
          .map(humanizeToken)
          .join("; ")}.`
      : "",
    ownerFacts.length > 0 ? `Owner-reported facts: ${ownerFacts.join("; ")}.` : "",
    unresolvedCriticalUnknowns.length > 0
      ? `Critical unknowns still unresolved: ${unresolvedCriticalUnknowns.join(
          "; "
        )}.`
      : "",
    session.vision_analysis
      ? `Visual findings: ${session.vision_analysis
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 220)}`
      : "",
    pet.existing_conditions?.length
      ? `Existing conditions: ${pet.existing_conditions.join("; ")}.`
      : "",
    pet.medications?.length
      ? `Current medications: ${pet.medications.join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildFinalSafetyVerifierInput({
  session,
  report,
  deterministicUrgency,
  deterministicRedFlags,
  generatedVetHandoffDraft,
}: {
  session: TriageSession;
  report: Record<string, unknown>;
  deterministicUrgency: string;
  deterministicRedFlags: string[];
  generatedVetHandoffDraft: string;
}): FinalSafetyVerifierInput {
  const latestOwnerTurn = session.case_memory?.latest_owner_turn?.trim();

  return {
    deterministicUrgency,
    deterministicRedFlags,
    explicitOwnerAnswers: { ...session.extracted_answers },
    unresolvedCriticalUnknowns: collectUnresolvedCriticalUnknowns(session),
    ownerFacingSummaryDraft: [
      buildOwnerFacingSummaryDraft(report),
      latestOwnerTurn ? `Latest owner wording: ${latestOwnerTurn}` : "",
    ]
      .filter(Boolean)
      .join(". "),
    vetHandoffDraft: generatedVetHandoffDraft,
  };
}

export function parseFinalSafetyVerifierResponse(
  rawResponse: string,
  input: FinalSafetyVerifierInput
): FinalSafetyVerifierParseResult {
  const parsed = parseStrictJsonObject(rawResponse);
  if (!parsed) {
    return { status: "rejected", reason: "malformed_json" };
  }

  if (parsed.unsafeDowngradeDetected !== false || typeof parsed.safeToShow !== "boolean") {
    return { status: "rejected", reason: "unsafe_downgrade" };
  }

  const missedRedFlags = takeStringArray(parsed.missedRedFlags);
  const diagnosisOrTreatmentClaims = takeStringArray(
    parsed.diagnosisOrTreatmentClaims
  );
  const vetHandoffNotes = takeStringArray(parsed.vetHandoffNotes);
  const recommendedUrgencyRaw =
    typeof parsed.recommendedUrgencyLanguage === "string"
      ? parsed.recommendedUrgencyLanguage
      : null;

  if (
    missedRedFlags === null ||
    diagnosisOrTreatmentClaims === null ||
    vetHandoffNotes === null ||
    !recommendedUrgencyRaw
  ) {
    return { status: "rejected", reason: "missing_required_keys" };
  }

  if (diagnosisOrTreatmentClaims.length > 0) {
    return {
      status: "rejected",
      reason: classifyClaimReason(diagnosisOrTreatmentClaims),
    };
  }

  const recommendedUrgency = normalizeUrgencyBucket(recommendedUrgencyRaw);
  const deterministicUrgency = normalizeUrgencyBucket(input.deterministicUrgency);
  if (!recommendedUrgency || !deterministicUrgency) {
    return { status: "rejected", reason: "missing_required_keys" };
  }

  if (URGENCY_RANK[recommendedUrgency] < URGENCY_RANK[deterministicUrgency]) {
    return { status: "rejected", reason: "unsafe_downgrade" };
  }

  const supportedRedFlags = new Set(
    input.deterministicRedFlags.flatMap((flag) => [
      normalizeText(flag),
      normalizeText(humanizeToken(flag)),
    ])
  );
  if (
    missedRedFlags.some(
      (flag) =>
        !supportedRedFlags.has(normalizeText(flag)) &&
        !supportedRedFlags.has(normalizeText(humanizeToken(flag)))
    )
  ) {
    return { status: "rejected", reason: "invented_unsupported_fact" };
  }

  const supportedFacts = buildSupportedFactPool(input);
  if (vetHandoffNotes.some((note) => !isSupportedNote(note, supportedFacts))) {
    return { status: "rejected", reason: "invented_unsupported_fact" };
  }

  return {
    status: "accepted",
    output: {
      unsafeDowngradeDetected: false,
      missedRedFlags,
      diagnosisOrTreatmentClaims: [],
      recommendedUrgencyLanguage:
        normalizeVerifierUrgencyLanguage(recommendedUrgency),
      vetHandoffNotes,
      safeToShow: parsed.safeToShow,
    },
  };
}

export async function verifyFinalUrgencyAndHandoffSafety({
  mode,
  session,
  pet,
  report,
  deterministicUrgency,
  deterministicRedFlags,
  generatedVetHandoffDraft,
  timeoutMs = getModelBudgetPolicy("grok_final_safety").timeoutMs,
  budgetState,
  modelCaller = callFinalSafetyVerifierModel,
}: {
  mode: FinalSafetyVerifierMode;
  session: TriageSession;
  pet: PetProfile;
  report: Record<string, unknown>;
  deterministicUrgency: string;
  deterministicRedFlags: string[];
  generatedVetHandoffDraft: string;
  timeoutMs?: number;
  budgetState?: ModelBudgetState;
  modelCaller?: ModelCaller;
}): Promise<FinalSafetyVerificationResult> {
  const shouldExposeBudgetState = budgetState !== undefined;
  const deterministicUrgencyBucket =
    normalizeUrgencyBucket(deterministicUrgency) ?? "low";
  const currentUrgency = getHigherUrgency(
    normalizeReportUrgency(report),
    deterministicUrgencyBucket
  );
  const fallbackRecommendation = recommendationFromUrgencyBucket(currentUrgency);
  const fallbackSeverity = severityFromUrgencyBucket(currentUrgency);
  const fallbackSummary = buildDeterministicVetHandoffSummary({
    session,
    pet,
    recommendation: fallbackRecommendation,
    deterministicRedFlags,
  });

  const initialBudgetState = shouldExposeBudgetState
    ? createModelBudgetState(budgetState)
    : undefined;

  const finalize = (
    result: Omit<FinalSafetyVerificationResult, "budgetState">
  ): FinalSafetyVerificationResult => ({
    ...result,
    budgetState: shouldExposeBudgetState ? initialBudgetState : undefined,
  });

  if (mode === "off") {
    return finalize({
      status: "skipped",
      reason: "feature_disabled",
      recommendation: fallbackRecommendation,
      severity: fallbackSeverity,
      vetHandoffSummary: fallbackSummary,
    });
  }

  const reservedBudget = reserveModelBudgetCall({
    feature: "grok_final_safety",
    mode,
    state: budgetState,
  });

  if (!reservedBudget.allowed) {
    return {
      status: "skipped",
      reason: reservedBudget.reason,
      recommendation: fallbackRecommendation,
      severity: fallbackSeverity,
      vetHandoffSummary: fallbackSummary,
      budgetState: reservedBudget.state,
    };
  }

  const input = buildFinalSafetyVerifierInput({
    session,
    report,
    deterministicUrgency,
    deterministicRedFlags,
    generatedVetHandoffDraft,
  });

  try {
    const rawResponse = await withTimeout(
      modelCaller(buildFinalSafetyPrompt(input)),
      timeoutMs
    );
    const parsed = parseFinalSafetyVerifierResponse(rawResponse, input);

    if (parsed.status === "rejected") {
      return {
        status: "rejected",
        reason: parsed.reason,
        recommendation: fallbackRecommendation,
        severity: fallbackSeverity,
        vetHandoffSummary: fallbackSummary,
        budgetState: reservedBudget.state,
      };
    }

    if (mode === "shadow") {
      return {
        status: "shadow",
        recommendation: fallbackRecommendation,
        severity: fallbackSeverity,
        vetHandoffSummary: fallbackSummary,
        budgetState: reservedBudget.state,
        verifierOutput: parsed.output,
      };
    }

    const verifierUrgency =
      normalizeUrgencyBucket(parsed.output.recommendedUrgencyLanguage) ??
      deterministicUrgencyBucket;
    const finalUrgency = getHigherUrgency(currentUrgency, verifierUrgency);
    const finalRecommendation = recommendationFromUrgencyBucket(finalUrgency);
    const finalSeverity = severityFromUrgencyBucket(finalUrgency);
    const finalSummary = appendVerifierNotes(
      buildDeterministicVetHandoffSummary({
        session,
        pet,
        recommendation: finalRecommendation,
        deterministicRedFlags,
      }),
      parsed.output
    );

    return {
      status: "accepted",
      recommendation: finalRecommendation,
      severity: finalSeverity,
      vetHandoffSummary: finalSummary,
      budgetState: reservedBudget.state,
      verifierOutput: parsed.output,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: isTimeoutError(error) ? "timeout" : "provider_error",
      recommendation: fallbackRecommendation,
      severity: fallbackSeverity,
      vetHandoffSummary: fallbackSummary,
      budgetState: reservedBudget.state,
    };
  }
}
