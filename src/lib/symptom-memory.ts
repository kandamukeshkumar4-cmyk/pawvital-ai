import { FOLLOW_UP_QUESTIONS } from "./clinical-matrix";
import type { NormalizedContradictionRecord } from "./clinical/contradiction-detector";
import type {
  ConsultOpinion,
  RetrievalImageEvidence,
  RetrievalTextEvidence,
  ServiceTimeoutRecord,
  ShadowComparisonRecord,
  SidecarObservation,
  VisionClinicalEvidence,
} from "./clinical-evidence";
import type {
  PetProfile,
  StructuredCaseMemory,
  TriageSession,
} from "./triage-engine";

type ScalarFact = string | boolean | number;

// =============================================================================
// VET-704: Lossless Conversation-State Preservation
// Protected fields that must remain authoritative across compression boundaries.
// MiniMax may summarize narrative/context data, but it MUST NOT own or mutate
// conversation control state. These fields are the source of truth for:
// - What questions have been answered
// - What answers were extracted
// - What questions remain unresolved
// - What was the last question asked
// - Any pending-question state
// =============================================================================

/**
 * Protected conversation control state fields.
 * These fields must NOT be sent to MiniMax for summarization,
 * and must NOT be modified by compression output.
 */
export const PROTECTED_CONTROL_STATE_KEYS = [
  "answered_questions",
  "extracted_answers",
  "unresolved_question_ids",
  "clarification_reasons",
  "last_question_asked",
] as const;

export type ProtectedControlStateKey =
  (typeof PROTECTED_CONTROL_STATE_KEYS)[number];

/**
 * Structured representation of protected conversation control state.
 * This state is preserved losslessly across compression boundaries.
 */
export interface ProtectedConversationState {
  answered_questions: string[];
  extracted_answers: Record<string, string | boolean | number>;
  unresolved_question_ids: string[];
  clarification_reasons: Record<string, string>;
  last_question_asked?: string;
}

/**
 * Extract protected conversation control state from a TriageSession.
 * This is the authoritative source of truth for question-answer state.
 */
export function getProtectedConversationState(
  session: TriageSession
): ProtectedConversationState {
  return {
    answered_questions: session.answered_questions ?? [],
    extracted_answers: session.extracted_answers ?? {},
    unresolved_question_ids:
      session.case_memory?.unresolved_question_ids ?? [],
    clarification_reasons:
      session.case_memory?.clarification_reasons ?? {},
    last_question_asked: session.last_question_asked,
  };
}

/**
 * Narrative/compressible subset of case memory suitable for MiniMax summarization.
 * This excludes all protected control state fields.
 */
export interface NarrativeCaseMemory {
  turn_count: number;
  chief_complaints: string[];
  active_focus_symptoms: string[];
  confirmed_facts: Record<string, ScalarFact>;
  image_findings: string[];
  red_flag_notes: string[];
  timeline_notes: string[];
  visual_evidence: VisionClinicalEvidence[];
  retrieval_evidence: Array<RetrievalTextEvidence | RetrievalImageEvidence>;
  consult_opinions: ConsultOpinion[];
  evidence_chain: string[];
  service_timeouts: ServiceTimeoutRecord[];
  service_observations: SidecarObservation[];
  shadow_comparisons: ShadowComparisonRecord[];
  ambiguity_flags: string[];
  latest_owner_turn?: string;
  compressed_summary?: string;
  compression_model?: string;
  last_compressed_turn?: number;
}

/**
 * Extract narrative (compressible) state from case memory.
 * Protected control state fields are excluded.
 */
export function extractNarrativeFromCaseMemory(
  caseMemory: StructuredCaseMemory
): NarrativeCaseMemory {
  return {
    turn_count: caseMemory.turn_count,
    chief_complaints: caseMemory.chief_complaints,
    active_focus_symptoms: caseMemory.active_focus_symptoms,
    confirmed_facts: caseMemory.confirmed_facts,
    image_findings: caseMemory.image_findings,
    red_flag_notes: caseMemory.red_flag_notes,
    timeline_notes: caseMemory.timeline_notes,
    visual_evidence: caseMemory.visual_evidence,
    retrieval_evidence: caseMemory.retrieval_evidence,
    consult_opinions: caseMemory.consult_opinions,
    evidence_chain: caseMemory.evidence_chain,
    service_timeouts: caseMemory.service_timeouts,
    service_observations: caseMemory.service_observations,
    shadow_comparisons: caseMemory.shadow_comparisons,
    ambiguity_flags: caseMemory.ambiguity_flags,
    latest_owner_turn: caseMemory.latest_owner_turn,
    compressed_summary: caseMemory.compressed_summary,
    compression_model: caseMemory.compression_model,
    last_compressed_turn: caseMemory.last_compressed_turn,
  };
}

function sameReasonMap(
  before: Record<string, string>,
  after: Record<string, string>
): boolean {
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after).sort();

  if (
    beforeKeys.length !== afterKeys.length ||
    beforeKeys.some((key, index) => key !== afterKeys[index])
  ) {
    return false;
  }

  return beforeKeys.every((key) => before[key] === after[key]);
}

/**
 * VET-900: Detect whether protected control state has been mutated.
 * Compares a pre-operation snapshot against the current session state.
 * Returns true if ANY protected field has changed.
 */
export function hasControlStateChanged(
  before: ProtectedConversationState,
  after: ProtectedConversationState
): boolean {
  // answered_questions — order-sensitive array comparison
  if (
    before.answered_questions.length !== after.answered_questions.length ||
    before.answered_questions.some((q, i) => q !== after.answered_questions[i])
  ) {
    return true;
  }

  // extracted_answers — deep shallow comparison (values are scalars)
  const beforeKeys = Object.keys(before.extracted_answers).sort();
  const afterKeys = Object.keys(after.extracted_answers).sort();
  if (
    beforeKeys.length !== afterKeys.length ||
    beforeKeys.some((k, i) => k !== afterKeys[i]) ||
    beforeKeys.some((k) => before.extracted_answers[k] !== after.extracted_answers[k])
  ) {
    return true;
  }

  // unresolved_question_ids — order-sensitive
  if (
    before.unresolved_question_ids.length !== after.unresolved_question_ids.length ||
    before.unresolved_question_ids.some((q, i) => q !== after.unresolved_question_ids[i])
  ) {
    return true;
  }

  if (
    !sameReasonMap(
      before.clarification_reasons,
      after.clarification_reasons
    )
  ) {
    return true;
  }

  // last_question_asked
  if (before.last_question_asked !== after.last_question_asked) {
    return true;
  }

  return false;
}

/**
 * Validate that a compression result does not attempt to rewrite protected fields.
 * Returns the result unchanged if valid, or throws if it detects control state mutation.
 *
 * NOTE: Currently MiniMax returns only { summary, model }, so this is a defensive
 * guard against future API changes. If the compression result contains any
 * protected keys, we must reject it.
 */
export function validateCompressionOutput(
  result: Record<string, unknown>
): void {
  for (const key of PROTECTED_CONTROL_STATE_KEYS) {
    if (key in result) {
      // Defensive: if MiniMax ever tries to return protected fields, reject the output
      console.error(
        `[VET-704] Compression output attempted to rewrite protected field: ${key}. ` +
          `This indicates a bug or prompt injection. Rejecting compression result.`
      );
      throw new Error(
        `Compression output contains protected field '${key}' which is not allowed. ` +
          `Control state must remain authoritative and immutable across compression.`
      );
    }
  }
}

/**
 * Merge compression result back into session, preserving protected control state.
 * This is the CORRECT way to apply compression - protected state always wins.
 *
 * @param session - Original session with authoritative control state
 * @param compressed - The compression result from MiniMax
 * @param protectedState - Explicit protected state (for defensive validation)
 * @returns Merged session with protected state preserved
 */
export function mergeCompressionResult(
  session: TriageSession,
  compressed: { summary: string; model: string },
  protectedState: ProtectedConversationState
): TriageSession {
  // Defensive validation
  validateCompressionOutput(compressed as unknown as Record<string, unknown>);

  const caseMemory = ensureStructuredCaseMemory(session);

  // Only update compressible narrative fields
  return {
    ...session,
    // Preserve ALL protected control state - never overwritten by compression
    answered_questions: protectedState.answered_questions,
    extracted_answers: protectedState.extracted_answers,
    last_question_asked: protectedState.last_question_asked,
    case_memory: {
      ...caseMemory,
      // Protected: never comes from compression output
      unresolved_question_ids: protectedState.unresolved_question_ids,
      clarification_reasons: protectedState.clarification_reasons,
      // Only these fields come from compression
      compressed_summary: compressed.summary.replace(/\s+/g, " ").trim(),
      compression_model: compressed.model,
      last_compressed_turn: caseMemory.turn_count,
    },
  };
}

/**
 * Build a snapshot of case memory that is SAFE to send to MiniMax for summarization.
 * This version EXCLUDES protected control state fields to prevent MiniMax from
 * inadvertently mutating or hallucinating about question-answer state.
 *
 * The narrative snapshot includes facts, symptoms, findings, and other
 * compressible context, but NOT the authoritative question-answer state.
 */
export function buildNarrativeSnapshot(
  session: TriageSession,
  messages: { role: "user" | "assistant"; content: string }[],
  latestUserMessage: string
): string {
  const memory = ensureStructuredCaseMemory(session);
  const factLines = summarizeFacts(memory.confirmed_facts, 14);
  const recentTranscript = messages
    .slice(-8)
    .map((message, index) => {
      const role = message.role === "user" ? "Owner" : "Assistant";
      const compact = message.content.replace(/\s+/g, " ").trim().slice(0, 180);
      return `${index + 1}. ${role}: ${compact}`;
    });

  // NOTE: We intentionally DO NOT include unresolved_question_ids here.
  // The protected control state (answered_questions, unresolved_question_ids, etc.)
  // is the authoritative source of truth for question state.
  // MiniMax should summarize the narrative context, not the control state.
  // We also avoid feeding the previous compressed summary back into the next
  // compression pass. Re-summarizing summaries compounds drift over time, so
  // each prompt is rebuilt from current deterministic/raw-ish state instead.

  return [
    `Stable case baseline:\n${buildStableCompressionBaseline(memory)}`,
    `Chief complaints: ${memory.chief_complaints.join(", ") || "none"}`,
    `Active focus symptoms: ${memory.active_focus_symptoms.join(", ") || "none"}`,
    factLines.length > 0
      ? `Structured facts:\n- ${factLines.join("\n- ")}`
      : "Structured facts: none yet",
    memory.image_findings.length > 0
      ? `Image findings:\n- ${memory.image_findings.slice(0, 5).join("\n- ")}`
      : "Image findings: none",
    memory.visual_evidence.length > 0
      ? `Structured visual evidence:\n- ${memory.visual_evidence
          .slice(-4)
          .map(
            (entry) =>
              `${entry.domain} | ${entry.bodyRegion || "unknown region"} | ${entry.findings.join(", ") || "no findings"} | severity=${entry.severity} | confidence=${entry.confidence.toFixed(2)}`
          )
          .join("\n- ")}`
      : "Structured visual evidence: none",
    memory.consult_opinions.length > 0
      ? `Consult opinions:\n- ${memory.consult_opinions
          .slice(-3)
          .map(
            (entry) =>
              `${entry.model} (${entry.mode}) confidence=${entry.confidence.toFixed(2)} | ${entry.summary}`
          )
          .join("\n- ")}`
      : "Consult opinions: none",
    memory.retrieval_evidence.length > 0
      ? `Retrieved evidence:\n- ${memory.retrieval_evidence
          .slice(-6)
          .map((entry) => `${entry.title} | score=${entry.score.toFixed(2)} | ${entry.summary}`)
          .join("\n- ")}`
      : "Retrieved evidence: none",
    memory.evidence_chain.length > 0
      ? `Evidence chain:\n- ${memory.evidence_chain.slice(-6).join("\n- ")}`
      : "Evidence chain: none",
    memory.service_timeouts.length > 0
      ? `Service timeouts:\n- ${memory.service_timeouts
          .slice(-4)
          .map((entry) => `${entry.service}:${entry.stage} (${entry.reason})`)
          .join("\n- ")}`
      : "Service timeouts: none",
    // VET-706 / VET-718: Filter out internal telemetry entries from compression prompt.
    // Telemetry entries (extraction, pending_recovery, compression, repeat_suppression, state_transition)
    // are internal observability data and should not influence the compression prompt.
    (() => {
      const telemetryEventTypes = [
        "compression",
        "contradiction_detection",
        "extraction",
        "pending_recovery",
        "repeat_suppression",
        "state_transition",
      ];
      const realServiceObservations = memory.service_observations.filter(
        (entry) => !(entry.service === "async-review-service" && telemetryEventTypes.includes(entry.stage))
      );
      return realServiceObservations.length > 0
        ? `Recent service telemetry:\n- ${realServiceObservations
            .slice(-6)
            .map(
              (entry) =>
                `${entry.service}:${entry.stage} ${entry.outcome} in ${entry.latencyMs}ms${entry.shadowMode ? " [shadow]" : ""}${entry.fallbackUsed ? " [fallback]" : ""}`
            )
            .join("\n- ")}`
        : "Recent service telemetry: none";
    })(),
    memory.shadow_comparisons.length > 0
      ? `Shadow comparisons:\n- ${memory.shadow_comparisons
          .slice(-4)
          .map(
            (entry) =>
              `${entry.service} used=${entry.usedStrategy} shadow=${entry.shadowStrategy} disagreements=${entry.disagreementCount} | ${entry.summary}`
          )
          .join("\n- ")}`
      : "Shadow comparisons: none",
    memory.ambiguity_flags.length > 0
      ? `Ambiguity flags:\n- ${memory.ambiguity_flags.join("\n- ")}`
      : "Ambiguity flags: none",
    memory.timeline_notes.length > 0
      ? `Timeline notes:\n- ${memory.timeline_notes.slice(-6).join("\n- ")}`
      : "Timeline notes: none",
    recentTranscript.length > 0
      ? `Recent transcript:\n${recentTranscript.join("\n")}`
      : "Recent transcript: none",
    `Latest owner turn: ${latestUserMessage}`,
  ].join("\n");
}

interface TurnMemoryUpdate {
  latestUserMessage: string;
  imageAnalyzed: boolean;
  imageSummary?: string | null;
  imageSymptoms?: string[];
  imageRedFlags?: string[];
  turnFocusSymptoms?: string[];
  // Compatibility-only inputs. Narrative updates should not own question control
  // state, but the route still passes these while that flow remains split across
  // legacy helpers.
  nextQuestionId?: string | null;
  missingQuestionIds?: string[];
  visualEvidence?: VisionClinicalEvidence | null;
  retrievalEvidence?: Array<RetrievalTextEvidence | RetrievalImageEvidence>;
  consultOpinion?: ConsultOpinion | null;
  serviceTimeouts?: ServiceTimeoutRecord[];
  ambiguityFlags?: string[];
  evidenceNotes?: string[];
  imageInfluencedQuestionSelection?: boolean;
}

function trimLines(lines: string[], limit: number): string[] {
  return lines.slice(Math.max(0, lines.length - limit));
}

function dedupeStrings(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped.slice(0, limit);
}

function summarizeFacts(
  facts: Record<string, ScalarFact>,
  limit = 14
): string[] {
  return Object.entries(facts)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, limit)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function buildStableCompressionBaseline(
  memory: StructuredCaseMemory
): string {
  const factLines = summarizeFacts(memory.confirmed_facts, 10);
  const sections = [
    `Chief complaints: ${memory.chief_complaints.join(", ") || "none"}.`,
    `Focus symptoms: ${memory.active_focus_symptoms.join(", ") || "none"}.`,
    factLines.length > 0
      ? `Confirmed facts: ${factLines.join("; ")}.`
      : "Confirmed facts: none yet.",
    memory.image_findings.length > 0
      ? `Image findings: ${memory.image_findings.slice(0, 3).join("; ")}.`
      : "",
    memory.red_flag_notes.length > 0
      ? `Red flag watch: ${memory.red_flag_notes.slice(0, 3).join("; ")}.`
      : "",
    memory.ambiguity_flags.length > 0
      ? `Open ambiguities: ${memory.ambiguity_flags.slice(0, 4).join("; ")}.`
      : "",
    memory.timeline_notes.length > 0
      ? `Recent timeline: ${memory.timeline_notes.slice(-2).join(" || ")}.`
      : "",
  ].filter(Boolean);

  return sections.join(" ");
}

function buildTimelineLine(
  pet: PetProfile,
  message: string,
  focusSymptoms: string[],
  imageSummary?: string | null
): string {
  const parts = [
    `Owner update about ${pet.name}: ${message.replace(/\s+/g, " ").trim().slice(0, 180)}`,
  ];

  if (focusSymptoms.length > 0) {
    parts.push(`focus=${focusSymptoms.join(", ")}`);
  }

  if (imageSummary) {
    parts.push(`image=${imageSummary.replace(/\s+/g, " ").trim().slice(0, 160)}`);
  }

  return parts.join(" | ");
}

export function ensureStructuredCaseMemory(
  session: TriageSession
): StructuredCaseMemory {
  const existing = session.case_memory;
  return {
    turn_count: existing?.turn_count || 0,
    chief_complaints: existing?.chief_complaints || [],
    active_focus_symptoms: existing?.active_focus_symptoms || [],
    confirmed_facts: existing?.confirmed_facts || {},
    image_findings: existing?.image_findings || [],
    red_flag_notes: existing?.red_flag_notes || [],
    unresolved_question_ids: existing?.unresolved_question_ids || [],
    clarification_reasons: existing?.clarification_reasons || {},
    timeline_notes: existing?.timeline_notes || [],
    visual_evidence: existing?.visual_evidence || [],
    retrieval_evidence: existing?.retrieval_evidence || [],
    consult_opinions: existing?.consult_opinions || [],
    evidence_chain: existing?.evidence_chain || [],
    service_timeouts: existing?.service_timeouts || [],
    service_observations: existing?.service_observations || [],
    shadow_comparisons: existing?.shadow_comparisons || [],
    ambiguity_flags: existing?.ambiguity_flags || [],
    latest_owner_turn: existing?.latest_owner_turn,
    compressed_summary: existing?.compressed_summary,
    compression_model: existing?.compression_model,
    last_compressed_turn: existing?.last_compressed_turn,
  };
}

export function updateStructuredCaseMemory(
  session: TriageSession,
  pet: PetProfile,
  update: TurnMemoryUpdate
): TriageSession {
  const existing = ensureStructuredCaseMemory(session);
  const confirmedFacts: Record<string, ScalarFact> = {
    ...existing.confirmed_facts,
    ...session.extracted_answers,
  };

  const focusSymptoms = dedupeStrings([
    ...(update.turnFocusSymptoms || []),
    ...session.known_symptoms,
  ], 10);

  const chiefComplaints = dedupeStrings(
    [...existing.chief_complaints, ...session.known_symptoms],
    10
  );

  const imageFindings = dedupeStrings(
    [
      ...existing.image_findings,
      ...(update.imageAnalyzed && update.imageSummary ? [update.imageSummary] : []),
      ...((update.imageSymptoms || []).map((symptom) =>
        `image symptom: ${symptom.replace(/_/g, " ")}`
      )),
    ],
    10
  );

  const redFlagNotes = dedupeStrings(
    [
      ...existing.red_flag_notes,
      ...session.red_flags_triggered.map((flag) =>
        flag.replace(/_/g, " ")
      ),
      ...((update.imageRedFlags || []).map((flag) =>
        `image red flag: ${flag.replace(/_/g, " ")}`
      )),
    ],
    10
  );

  const timelineNotes = trimLines(
    [
      ...existing.timeline_notes,
      buildTimelineLine(
        pet,
        update.latestUserMessage,
        focusSymptoms,
        update.imageAnalyzed ? update.imageSummary : null
      ),
    ],
    14
  );

  const visualEvidence = update.visualEvidence
    ? [
        ...existing.visual_evidence.filter(
          (entry) =>
            !(
              entry.domain === update.visualEvidence?.domain &&
              entry.bodyRegion === update.visualEvidence?.bodyRegion &&
              entry.severity === update.visualEvidence?.severity
            )
        ),
        {
          ...update.visualEvidence,
          influencedQuestionSelection:
            update.imageInfluencedQuestionSelection ??
            update.visualEvidence.influencedQuestionSelection,
        },
      ].slice(-8)
    : existing.visual_evidence;

  const retrievalEvidence = [
    ...existing.retrieval_evidence,
    ...(
      update.retrievalEvidence?.map((entry) => ({
        ...entry,
        summary: entry.summary.replace(/\s+/g, " ").trim().slice(0, 240),
      })) || []
    ),
  ].slice(-12);

  const consultOpinions = update.consultOpinion
    ? [...existing.consult_opinions, update.consultOpinion].slice(-6)
    : existing.consult_opinions;

  const serviceTimeouts = [
    ...existing.service_timeouts,
    ...(update.serviceTimeouts || []),
  ].slice(-10);

  const ambiguityFlags = dedupeStrings(
    [...existing.ambiguity_flags, ...(update.ambiguityFlags || [])],
    10
  );

  const evidenceChain = trimLines(
    [...existing.evidence_chain, ...((update.evidenceNotes || []).slice(0, 4))],
    16
  );

  return {
    ...session,
    case_memory: {
      ...existing,
      turn_count: existing.turn_count + 1,
      chief_complaints: chiefComplaints,
      active_focus_symptoms: focusSymptoms,
      confirmed_facts: confirmedFacts,
      image_findings: imageFindings,
      red_flag_notes: redFlagNotes,
      latest_owner_turn: update.latestUserMessage.trim().slice(0, 400),
      unresolved_question_ids: dedupeStrings(
        [
          ...(update.nextQuestionId ? [update.nextQuestionId] : []),
          ...(update.missingQuestionIds || []),
        ],
        12
      ),
      timeline_notes: timelineNotes,
      visual_evidence: visualEvidence,
      retrieval_evidence: retrievalEvidence,
      consult_opinions: consultOpinions,
      evidence_chain: evidenceChain,
      service_timeouts: serviceTimeouts,
      service_observations: existing.service_observations || [],
      shadow_comparisons: existing.shadow_comparisons || [],
      ambiguity_flags: ambiguityFlags,
    },
  };
}

export function buildDeterministicCaseSummary(
  session: TriageSession,
  pet: PetProfile
): string {
  const memory = ensureStructuredCaseMemory(session);
  const factLines = summarizeFacts(memory.confirmed_facts, 12);
  const nextQuestions = memory.unresolved_question_ids
    .slice(0, 4)
    .map((questionId) => FOLLOW_UP_QUESTIONS[questionId]?.question_text || questionId);

  const sections = [
    `${pet.name} is a ${pet.age_years}-year-old ${pet.breed || pet.species || "pet"} in an active veterinary triage session.`,
    memory.chief_complaints.length > 0
      ? `Main concerns: ${memory.chief_complaints
          .map((symptom) => symptom.replace(/_/g, " "))
          .join(", ")}.`
      : "Main concerns: still being established.",
    factLines.length > 0
      ? `Confirmed facts: ${factLines.join("; ")}.`
      : "Confirmed facts: none recorded yet.",
    memory.image_findings.length > 0
      ? `Image findings: ${memory.image_findings.slice(0, 3).join("; ")}.`
      : "",
    memory.visual_evidence.length > 0
      ? `Structured visual evidence: ${memory.visual_evidence
          .slice(-2)
          .map(
            (entry) =>
              `${entry.domain} ${entry.bodyRegion || "location unknown"} (${entry.severity}, confidence ${entry.confidence.toFixed(2)})`
          )
          .join("; ")}.`
      : "",
    memory.consult_opinions.length > 0
      ? `Consult opinions: ${memory.consult_opinions
          .slice(-2)
          .map((entry) => `${entry.model}: ${entry.summary}`)
          .join("; ")}.`
      : "",
    memory.red_flag_notes.length > 0
      ? `Red flag watch: ${memory.red_flag_notes.slice(0, 3).join("; ")}.`
      : "",
    memory.ambiguity_flags.length > 0
      ? `Open ambiguities: ${memory.ambiguity_flags.slice(0, 4).join("; ")}.`
      : "",
    nextQuestions.length > 0
      ? `Open questions: ${nextQuestions.join(" | ")}.`
      : "",
  ].filter(Boolean);

  return sections.join(" ");
}

export function syncStructuredCaseMemoryQuestions(
  session: TriageSession,
  nextQuestionId: string | null,
  missingQuestionIds: string[]
): TriageSession {
  const memory = ensureStructuredCaseMemory(session);

  // VET-900: Merge — not overwrite — unresolved_question_ids.
  // Previous implementation discarded existing unresolved IDs, destroying
  // needs_clarification tracking across turns.
  const mergedUnresolved = dedupeStrings(
    [
      ...(memory.unresolved_question_ids ?? []),
      ...(nextQuestionId ? [nextQuestionId] : []),
      ...missingQuestionIds,
    ],
    12
  );

  // VET-900: Protect ALL control state fields from clobber.
  // answered_questions, extracted_answers, last_question_asked live on session;
  // unresolved_question_ids lives inside case_memory.
  // Guard: if the field already has values on session, preserve them.
  return {
    ...session,
    answered_questions: session.answered_questions ?? [],
    extracted_answers: session.extracted_answers ?? {},
    last_question_asked: session.last_question_asked,
    case_memory: {
      ...memory,
      unresolved_question_ids: mergedUnresolved,
    },
  };
}

export function buildCaseMemorySnapshot(
  session: TriageSession,
  messages: { role: "user" | "assistant"; content: string }[],
  latestUserMessage: string
): string {
  // Legacy alias retained for compatibility. Keep it narrative-only so future
  // callers cannot accidentally inject protected question-control state.
  return buildNarrativeSnapshot(session, messages, latestUserMessage);
}

export function shouldCompressCaseMemory(
  session: TriageSession,
  messages: { role: "user" | "assistant"; content: string }[],
  options: {
    imageAnalyzed: boolean;
    changedSymptoms: string[];
    changedAnswers: string[];
  }
): boolean {
  const memory = ensureStructuredCaseMemory(session);
  const turnsSinceCompression = memory.last_compressed_turn
    ? memory.turn_count - memory.last_compressed_turn
    : Number.POSITIVE_INFINITY;

  return (
    !memory.compressed_summary ||
    turnsSinceCompression >= 4 ||
    options.imageAnalyzed ||
    options.changedAnswers.length > 0 ||
    options.changedSymptoms.length > 0 ||
    messages.length >= 8
  );
}

// =============================================================================
// VET-705: Internal Conversation Telemetry
// Internal-only observability for debugging conversation flow issues.
// This telemetry is NEVER exposed in user-facing responses or headers.
// =============================================================================

/**
 * Telemetry event types for internal observability.
 */
export type ConversationTelemetryEventType =
  | "extraction"
  | "pending_recovery"
  | "compression"
  | "repeat_suppression"
  | "contradiction_detection"
  | "terminal_outcome";

export interface NormalizedTerminalOutcomeMetric {
  terminal_state: "cannot_assess" | "out_of_scope";
  reason_code: string;
  conversation_state: string;
  recommended_next_step: string;
  turn_number: number;
  question_id?: string;
}

/**
 * Recovery source for pending question resolution.
 */
export type RecoverySource =
  | "structured"
  | "deterministic"
  | "combined_signal"
  | "raw_fallback"
  | "unresolved"
  | "fast_path";

/**
 * Internal telemetry event shape for conversation observability.
 * Captures key decision points without leaking into user-facing output.
 */
export interface ConversationTelemetryEvent {
  /** Event type for filtering/aggregation */
  event: ConversationTelemetryEventType;
  /** Current turn count in the conversation */
  turn_count: number;
  /** Question ID if applicable */
  question_id?: string;
  /** Outcome of the event (success, failure, skipped, etc.) */
  outcome: string;
  /** Source of the data/recovery (e.g., structured, deterministic, fallback) */
  source?: RecoverySource;
  /** Reason or additional context */
  reason?: string;
  /** Model used for extraction/compression */
  model?: string;
  /** Whether a pending question existed before processing */
  pending_before?: boolean;
  /** Whether a pending question existed after processing */
  pending_after?: boolean;
  /** Whether compression was triggered */
  compression_used?: boolean;
  /** Compression model used */
  compression_model?: string;
  /** Whether the snapshot was narrative-only */
  narrative_only?: boolean;
  /** Whether repeat suppression was triggered */
  repeat_prevented?: boolean;
  /** Whether extraction returned valid JSON */
  extraction_valid_json?: boolean;
  /** Whether fallback extraction was used */
  fallback_used?: boolean;
  /** Number of symptoms extracted */
  symptoms_extracted?: number;
  /** Number of answers extracted */
  answers_extracted?: number;
  /** Whether protected control state was preserved */
  control_state_preserved?: boolean;
  /** Detected contradiction ids for this turn */
  contradiction_ids?: string[];
  /** Number of contradictions detected this turn */
  contradiction_count?: number;
  /** Normalized contradiction records for durable internal telemetry */
  contradiction_records?: NormalizedContradictionRecord[];
  /** Normalized terminal outcome metric for durable internal telemetry */
  terminal_outcome_metric?: NormalizedTerminalOutcomeMetric;
  /** Timestamp for the event */
  timestamp?: number;
}

/**
 * Append a telemetry event to the session's service_observations.
 * Telemetry is stored internally in case_memory.service_observations
 * and emitted via console.log for server-side traceability.
 *
 * @param session - Current triage session
 * @param event - Telemetry event to record
 * @returns Updated session with telemetry event appended
 */
export function recordConversationTelemetry(
  session: TriageSession,
  event: ConversationTelemetryEvent
): TriageSession {
  const caseMemory = ensureStructuredCaseMemory(session);

  // Map telemetry outcome to SidecarObservation outcome
  const mappedOutcome: "success" | "timeout" | "error" | "fallback" | "shadow" =
    event.outcome === "error" || event.outcome === "failure"
      ? "error"
      : event.outcome === "timeout"
        ? "timeout"
        : event.outcome === "fallback"
          ? "fallback"
          : event.outcome === "shadow"
            ? "shadow"
            : "success";

  const telemetryEvent: SidecarObservation = {
    // Using async-review-service as a compatible service name for internal telemetry
    // since conversation-telemetry is not an external sidecar
    service: "async-review-service",
    stage: event.event,
    latencyMs: 0,
    outcome: mappedOutcome,
    shadowMode: false,
    fallbackUsed: event.fallback_used ?? false,
    note: formatTelemetryNote(event),
    recordedAt: new Date().toISOString(),
  };

  // Emit to server logs for real-time traceability
  emitTelemetryLog(event);

  // Store in service_observations for structured internal history
  return {
    ...session,
    case_memory: {
      ...caseMemory,
      service_observations: [...caseMemory.service_observations, telemetryEvent].slice(-50),
    },
  };
}

/**
 * Format a telemetry event into a human-readable note for service_observations.
 */
function formatTelemetryNote(event: ConversationTelemetryEvent): string {
  const parts: string[] = [];

  if (event.question_id) {
    parts.push(`q=${event.question_id}`);
  }
  if (event.source) {
    parts.push(`src=${event.source}`);
  }
  if (event.model) {
    parts.push(`model=${event.model}`);
  }
  if (event.outcome) {
    parts.push(`outcome=${event.outcome}`);
  }
  if (event.reason) {
    parts.push(`reason=${event.reason}`);
  }
  if (event.compression_model) {
    parts.push(`compress=${event.compression_model}`);
  }
  if (event.symptoms_extracted !== undefined) {
    parts.push(`syms=${event.symptoms_extracted}`);
  }
  if (event.answers_extracted !== undefined) {
    parts.push(`ans=${event.answers_extracted}`);
  }
  if (event.pending_before !== undefined) {
    parts.push(`pending_before=${event.pending_before}`);
  }
  if (event.pending_after !== undefined) {
    parts.push(`pending_after=${event.pending_after}`);
  }
  if (event.repeat_prevented !== undefined) {
    parts.push(`repeat_prevented=${event.repeat_prevented}`);
  }
  if (event.compression_used !== undefined) {
    parts.push(`compress_used=${event.compression_used}`);
  }
  if (event.narrative_only !== undefined) {
    parts.push(`narrative_only=${event.narrative_only}`);
  }
  if (event.extraction_valid_json !== undefined) {
    parts.push(`valid_json=${event.extraction_valid_json}`);
  }
  if (event.fallback_used !== undefined) {
    parts.push(`fallback=${event.fallback_used}`);
  }
  if (event.control_state_preserved !== undefined) {
    parts.push(`ctrl_preserved=${event.control_state_preserved}`);
  }
  if (event.contradiction_count !== undefined) {
    parts.push(`contradictions=${event.contradiction_count}`);
  }
  if (event.contradiction_ids?.length) {
    parts.push(`contradiction_ids=${event.contradiction_ids.join(",")}`);
  }
  if (event.contradiction_records?.length) {
    parts.push(
      `contradiction_records=${encodeURIComponent(
        JSON.stringify(event.contradiction_records)
      )}`
    );
  }
  if (event.terminal_outcome_metric) {
    parts.push(
      `terminal_outcome_metric=${encodeURIComponent(
        JSON.stringify(event.terminal_outcome_metric)
      )}`
    );
  }

  return parts.join(" | ");
}

/**
 * Emit a telemetry event to server logs.
 * Uses console.log/console.warn/console.error based on severity.
 */
function emitTelemetryLog(event: ConversationTelemetryEvent): void {
  const prefix = `[VET-705][${event.event}]`;

  const logData = {
    turn: event.turn_count,
    question_id: event.question_id,
    outcome: event.outcome,
    source: event.source,
    reason: event.reason,
    model: event.model,
    pending_before: event.pending_before,
    pending_after: event.pending_after,
    compression_used: event.compression_used,
    compression_model: event.compression_model,
    narrative_only: event.narrative_only,
    repeat_prevented: event.repeat_prevented,
    extraction_valid_json: event.extraction_valid_json,
    fallback_used: event.fallback_used,
    symptoms_extracted: event.symptoms_extracted,
    answers_extracted: event.answers_extracted,
    control_state_preserved: event.control_state_preserved,
    contradiction_count: event.contradiction_count,
    contradiction_ids: event.contradiction_ids,
    contradiction_records: event.contradiction_records,
    terminal_outcome_metric: event.terminal_outcome_metric,
  };

  if (event.outcome === "error" || event.outcome === "failure") {
    console.error(`${prefix} ${JSON.stringify(logData)}`);
  } else if (event.outcome === "warning" || event.outcome === "partial") {
    console.warn(`${prefix} ${JSON.stringify(logData)}`);
  } else {
    console.log(`${prefix} ${JSON.stringify(logData)}`);
  }
}
