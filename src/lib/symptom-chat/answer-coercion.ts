import {
  getMissingQuestions,
  getNextQuestion,
  getSymptomPriorityScore,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import { isEmergencyGradeCriticalQuestionId } from "@/lib/clinical/emergency-grade-critical-questions";
import type { BrainSymptomEvidence } from "@/lib/dog-brain/question-priority";

/**
 * Explanation-only metadata describing WHY Dog Brain memory surfaced a question.
 * It is computed AFTER selection and NEVER alters question selection, urgency, or
 * any control state. Null whenever the current complaint (or a pending
 * clarification) drove the question, or there is no Brain memory.
 */
export interface BrainQuestionTrace {
  source: "dog_brain";
  signal_type: BrainSymptomEvidence["signal_type"];
  selected_symptom_key: string;
  selected_question_id: string;
  evidence_date_range?: string;
  evidence_summary: string;
  safety_note: string;
}

const BRAIN_TRACE_SAFETY_NOTE =
  "Supportive context only; not a diagnosis.";

/**
 * Which selection branch produced the next question. Lets the Brain trace be
 * attributed from the selector's own decision instead of re-deriving it.
 * Mirrors getNextQuestionWithSource precedence: complaint > brain > fallback.
 */
export type BrainQuestionSource = "complaint" | "brain" | "fallback";

/**
 * Derive a Brain question trace for an already-selected question id. PURE.
 *
 * Emits a trace ONLY when the selector reported that supportive Dog Brain memory
 * (`source === "brain"`) — not the current complaint, the generic fallback, or a
 * pending clarification — drove the selected question, AND a Brain symptom that
 * owns it has owner-friendly evidence in the map. Otherwise returns null (empty
 * memory or an unmapped signal/symptom included) — never throws.
 */
export function deriveBrainQuestionTrace(
  source: BrainQuestionSource | null,
  brainPrioritySymptoms: string[],
  evidenceMap: Record<string, BrainSymptomEvidence>,
  selectedQuestionId: string | null,
): BrainQuestionTrace | null {
  if (source !== "brain") return null;
  if (!selectedQuestionId) return null;
  if (!brainPrioritySymptoms.length) return null;
  if (!evidenceMap || Object.keys(evidenceMap).length === 0) return null;

  // Attribute to the owning symptom using the SAME clinical-priority order the
  // selector uses (getSymptomPriorityScore), so the evidence shown matches the
  // symptom that actually won the question.
  const rankedSymptoms = [...brainPrioritySymptoms].sort(
    (left, right) =>
      getSymptomPriorityScore(right) - getSymptomPriorityScore(left),
  );
  const selectedSymptomKey = rankedSymptoms.find((symptom) => {
    if (!evidenceMap[symptom]) return false;
    const followUps = SYMPTOM_MAP[symptom]?.follow_up_questions;
    return Array.isArray(followUps) && followUps.includes(selectedQuestionId);
  });
  if (!selectedSymptomKey) return null;

  const evidence = evidenceMap[selectedSymptomKey];
  if (!evidence?.evidence_summary) return null;

  return {
    source: "dog_brain",
    signal_type: evidence.signal_type,
    selected_symptom_key: selectedSymptomKey,
    selected_question_id: selectedQuestionId,
    ...(evidence.evidence_date_range
      ? { evidence_date_range: evidence.evidence_date_range }
      : {}),
    evidence_summary: evidence.evidence_summary,
    safety_note: BRAIN_TRACE_SAFETY_NOTE,
  };
}

export function getNextQuestionAvoidingRepeat(
  session: TriageSession,
  preferredSymptoms: string[] = [],
  brainPrioritySymptoms: string[] = []
): string | null {
  return getNextQuestionWithSource(
    session,
    preferredSymptoms,
    brainPrioritySymptoms
  ).questionId;
}

/**
 * Same selection as getNextQuestionAvoidingRepeat, but also reports WHICH branch
 * produced the question: the current-turn complaint, supportive Dog Brain
 * memory, or the generic fallback. The selected question id is identical to
 * getNextQuestionAvoidingRepeat — only the source tag is added (consumed by the
 * explanation-only Brain trace, never by control flow). Empty
 * brainPrioritySymptoms can never yield "brain".
 */
export function getNextQuestionWithSource(
  session: TriageSession,
  preferredSymptoms: string[] = [],
  // SUPPORTIVE Dog Brain memory: symptom keys derived from recurring owner-logged
  // signals. Consulted ONLY as a tiebreak — after the current turn's complaint is
  // exhausted and before the generic fallback — so it can surface an already-legal
  // follow-up the owner's history makes relevant, without changing the candidate
  // set or overriding complaint-driven / red-flag selection. Empty = no-op.
  brainPrioritySymptoms: string[] = []
): { questionId: string | null; source: BrainQuestionSource | null } {
  const complaintQuestionId = getNextQuestionForPreferredSymptoms(
    session,
    preferredSymptoms
  );
  const brainQuestionId = complaintQuestionId
    ? null
    : getNextQuestionForPreferredSymptoms(session, brainPrioritySymptoms);
  const fallbackQuestionId =
    complaintQuestionId || brainQuestionId ? null : getNextQuestion(session);

  let questionId =
    complaintQuestionId || brainQuestionId || fallbackQuestionId;
  let source: BrainQuestionSource | null = complaintQuestionId
    ? "complaint"
    : brainQuestionId
      ? "brain"
      : fallbackQuestionId
        ? "fallback"
        : null;
  if (!questionId) return { questionId: null, source: null };

  // Repeat-avoidance: if the chosen question was just asked and already
  // answered, swap to the next missing question, and RE-attribute the swapped
  // question to its owning branch so the Brain trace stays correct (instead of
  // silently dropping) on these turns. Selection result is unchanged.
  if (
    questionId === session.last_question_asked &&
    session.answered_questions.includes(questionId)
  ) {
    const alternatives = getMissingQuestions(session).filter(
      (qId) => qId !== session.last_question_asked
    );
    const swapped = alternatives[0] || questionId;
    if (swapped !== questionId) {
      questionId = swapped;
      source = classifyQuestionSource(
        swapped,
        preferredSymptoms,
        brainPrioritySymptoms
      );
    }
  }

  return { questionId, source };
}

/** True when any of `symptoms`' follow-up questions includes `questionId`. */
function symptomSetOwnsQuestion(
  symptoms: string[],
  questionId: string
): boolean {
  return symptoms.some((symptom) =>
    SYMPTOM_MAP[symptom]?.follow_up_questions?.includes(questionId)
  );
}

/** Attribute a question to a branch using the same precedence as selection. */
function classifyQuestionSource(
  questionId: string,
  preferredSymptoms: string[],
  brainPrioritySymptoms: string[]
): BrainQuestionSource {
  if (symptomSetOwnsQuestion(preferredSymptoms, questionId)) return "complaint";
  if (symptomSetOwnsQuestion(brainPrioritySymptoms, questionId)) return "brain";
  return "fallback";
}

export function getNextQuestionForPreferredSymptoms(
  session: TriageSession,
  preferredSymptoms: string[]
): string | null {
  if (preferredSymptoms.length === 0) {
    return null;
  }

  const rankedPreferredSymptoms = [...preferredSymptoms].sort(
    (left, right) =>
      getSymptomPriorityScore(right) - getSymptomPriorityScore(left)
  );

  for (const symptom of rankedPreferredSymptoms) {
    const followUps = SYMPTOM_MAP[symptom]?.follow_up_questions;
    if (!followUps?.length) {
      continue;
    }

    const unanswered = followUps.filter(
      (qId) => !session.answered_questions.includes(qId)
    );
    if (unanswered.length === 0) {
      continue;
    }

    const critical = unanswered.filter(
      (qId) => FOLLOW_UP_QUESTIONS[qId]?.critical
    );

    return critical[0] || unanswered[0] || null;
  }

  return null;
}

export function coerceAnswerForQuestion(
  questionId: string,
  rawMessage: string
): string | boolean | number | null {
  const question = FOLLOW_UP_QUESTIONS[questionId];
  const message = rawMessage.trim();
  const normalized = normalizeIntentText(message);
  const lower = message.toLowerCase();

  if (!question || !message) return null;
  if (shouldLeaveAmbiguousReplyUnanswered(questionId, rawMessage)) return null;

  if (question.data_type === "boolean") {
    if (isReproductiveStatusQuestion(questionId)) {
      if (
        /\b(not spayed|not neutered|unspayed|unneutered|unfixed|intact)\b/.test(
          lower
        )
      ) {
        return false;
      }

      if (/\b(spayed|neutered|fixed)\b/.test(lower)) {
        return true;
      }
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    if (
      hasLeadingAffirmativeCue(normalized) ||
      (words.length <= 3 &&
        /^(it is|he is|she is|there is|does|has|is)$/.test(normalized))
    ) {
      return true;
    }
    if (
      hasLeadingNegativeCue(normalized) ||
      isShortNegativeResponse(normalized) ||
      (words.length <= 4 &&
        /^(doesn't|doesnt|isn't|isnt|hasn't|hasnt|not)$/.test(normalized))
    ) {
      return false;
    }
    return null;
  }

  if (question.data_type === "choice") {
    const intentChoice = coerceChoiceAnswerFromIntent(questionId, message);
    if (intentChoice !== null) {
      return intentChoice;
    }

    if (questionId === "wound_discharge") {
      if (/(^|\b)(no|none|nothing|dry)\b/.test(lower)) return "none";
      if (lower.includes("clear")) return "clear_fluid";
      if (
        lower.includes("pus") ||
        lower.includes("yellow") ||
        lower.includes("green") ||
        lower.includes("infect")
      ) {
        return "pus";
      }
      if (
        lower.includes("blood") ||
        lower.includes("bloody") ||
        lower.includes("bleed")
      ) {
        return "blood";
      }
      if (lower.includes("mixed")) return "mixed";
    }

    if (Array.isArray(question.choices)) {
      const matchedChoice = [...question.choices]
        .sort((a, b) => String(b).length - String(a).length)
        .find((choice) => {
          const normalizedChoice = String(choice).toLowerCase();
          const spacedChoice = normalizedChoice.replace(/[_-]/g, " ");
          return (
            lower === normalizedChoice ||
            lower === spacedChoice ||
            lower.includes(spacedChoice) ||
            lower.includes(normalizedChoice)
          );
        });
      if (matchedChoice) return matchedChoice;
    }

    return null;
  }

  if (question.data_type === "number") {
    const match = lower.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  return message;
}

export function normalizeChoiceLabel(choice: string): string {
  return String(choice)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIntentText(rawMessage: string): string {
  return rawMessage
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[,:;]+/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function shouldEscalateForUnknown(questionId: string): boolean {
  return isEmergencyGradeCriticalQuestionId(questionId);
}

export function questionAllowsCanonicalUnknown(question: {
  data_type: "boolean" | "string" | "number" | "choice";
  choices?: readonly string[];
}): boolean {
  if (question.data_type === "string") {
    return true;
  }

  if (question.data_type !== "choice" || !Array.isArray(question.choices)) {
    return false;
  }

  return question.choices.some(
    (choice) => normalizeChoiceLabel(String(choice)) === "unknown"
  );
}

function pickChoiceByPriority(
  choices: readonly string[] | undefined,
  keywordGroups: string[][]
): string | null {
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const normalizedChoices = choices.map((choice) => ({
    choice,
    normalized: normalizeChoiceLabel(choice),
  }));

  for (const keywordGroup of keywordGroups) {
    const matchedChoice = normalizedChoices.find(({ normalized }) =>
      keywordGroup.every((keyword) => normalized.includes(keyword))
    );
    if (matchedChoice) {
      return matchedChoice.choice;
    }
  }

  return null;
}

function isShortAffirmativeResponse(lower: string): boolean {
  const normalized = normalizeIntentText(lower);
  return /^(yes|yeah|yep|yup|sure|correct|right|true|indeed|exactly|absolutely|definitely)(?:\s+(it|he|she|they|that|there))?(?:\s+(is|are|was|were|does|do|has|have))?$/.test(
    normalized
  );
}

function isShortNegativeResponse(lower: string): boolean {
  const normalized = normalizeIntentText(lower);
  return /^(no|nope|nah|not really|not at all|no way|no thanks|no it's not|no isnt it|no its not|it's not|its not|not)(?:\s+(it|he|she|they|that|there))?(?:\s+(is|are|was|were|does|do|has|have))?$/.test(
    normalized
  );
}

function hasLeadingAffirmativeCue(normalized: string): boolean {
  return /^(yes|yeah|yep|yup|sure|correct|right|true|indeed|exactly|absolutely|definitely)\b/.test(
    normalized
  );
}

function hasLeadingNegativeCue(normalized: string): boolean {
  return /^(no|nope|nah|false)\b/.test(normalized);
}

export function coerceCanonicalUnknownReply(
  rawMessage: string
): "unknown" | null {
  const normalized = normalizeIntentText(rawMessage);
  if (!normalized) {
    return null;
  }

  if (/^(skip|pass|prefer not to say|rather not say)$/.test(normalized)) {
    return "unknown";
  }

  return coerceAmbiguousReplyToUnknown(rawMessage);
}

function isShortUnknownResponse(lower: string): boolean {
  const normalized = normalizeIntentText(lower);
  return /^(i don't know|i dont know|dont know|do not know|not sure|unsure|unknown|can't tell|cant tell|cannot tell|maybe)$/.test(
    normalized
  );
}

function isStrongWaterNegativeResponse(lower: string): boolean {
  return /\b(not drinking|won't drink|wont drink|refusing water|no water|nothing to drink|won't touch water|wont touch water)\b/.test(
    normalizeIntentText(lower)
  );
}

function isNormalityQuestion(question: {
  question_text?: string;
  choices?: readonly string[];
}): boolean {
  const questionText = String(question.question_text ?? "").toLowerCase();
  return (
    /\bnormal(?:ly)?|usual\b/.test(questionText) ||
    (Array.isArray(question.choices) &&
      question.choices.some(
        (choice) => normalizeChoiceLabel(choice) === "normal"
      ))
  );
}

function isReproductiveStatusQuestion(questionId: string): boolean {
  return questionId === "spay_status" || questionId === "neuter_status";
}

const AMBIGUOUS_REPLY_CLARIFICATION_QUESTION_IDS = new Set([
  "appetite_change",
]);

export function shouldClarifyAmbiguousReplyForQuestion(
  questionId: string
): boolean {
  return AMBIGUOUS_REPLY_CLARIFICATION_QUESTION_IDS.has(questionId);
}

function isAmbiguousFollowUpReply(rawMessage: string): boolean {
  const normalized = normalizeIntentText(rawMessage);
  return (
    coerceCanonicalUnknownReply(rawMessage) !== null ||
    /\bi (?:do not|don't|dont) (?:really )?know\b/.test(normalized) ||
    /\bi(?: am|'m)? not sure\b/.test(normalized) ||
    /\b(?:can(?:not|'t)|cant) (?:really )?tell\b/.test(normalized) ||
    /\bno idea\b/.test(normalized)
  );
}

export function shouldLeaveAmbiguousReplyUnanswered(
  questionId: string,
  rawMessage: string
): boolean {
  return (
    shouldClarifyAmbiguousReplyForQuestion(questionId) &&
    isAmbiguousFollowUpReply(rawMessage)
  );
}

export function coerceChoiceAnswerFromIntent(
  questionId: string,
  rawMessage: string
): string | null {
  const question = FOLLOW_UP_QUESTIONS[questionId];
  if (!question || question.data_type !== "choice") {
    return null;
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length === 0) {
    return null;
  }

  const lower = normalizeIntentText(rawMessage);
  if (!lower) {
    return null;
  }

  if (shouldLeaveAmbiguousReplyUnanswered(questionId, rawMessage)) {
    return null;
  }

  if (
    questionAllowsCanonicalUnknown(question) &&
    !shouldClarifyAmbiguousReplyForQuestion(questionId)
  ) {
    const unknownCoercion = coerceCanonicalUnknownReply(rawMessage);
    if (unknownCoercion !== null) {
      return unknownCoercion;
    }
  }

  if (questionId === "appetite_change") {
    if (
      /\b(decreased|decrease|less|eating less|reduced|lower|down)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["decreas"], ["less"]]);
    }

    if (
      /\b(increased|increase|more|eating more|hungrier|up)\b/.test(lower)
    ) {
      return pickChoiceByPriority(choices, [["increas"], ["more"]]);
    }

    if (
      /\b(same|normal|unchanged|stayed normal|no change|about the same)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["normal"], ["same"]]);
    }
  }

  if (questionId === "appetite_status") {
    if (
      /\b(not eating at all|not eating anything|not eating|won't eat|wont eat|refusing food|won't touch food|wont touch food|no appetite|has no appetite|isn't eating|isnt eating)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["none"], ["absent"]]);
    }

    if (
      /\b(eating less|less appetite|reduced appetite|not eating much|hardly eating|barely eating|picking at food|eating a little less)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["decreas"], ["less"]]);
    }

    if (
      /\b(eating normally|appetite is normal|normal appetite|eating fine|eating okay|eating ok)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["normal"]]);
    }
  }

  if (questionId === "stool_consistency") {
    if (
      /\bwatery\b/.test(lower) ||
      /\b(mostly|all|just|pretty much)\s+water\b/.test(lower) ||
      /\b(came|comes|coming|looked|looks|is|was)\s+out\s+like\s+water\b/.test(
        lower
      ) ||
      /\blike\s+water\b/.test(lower)
    ) {
      return pickChoiceByPriority(choices, [["watery"]]);
    }

    if (/\bmucus|mucousy|slimy\b/.test(lower)) {
      return pickChoiceByPriority(choices, [["mucus"]]);
    }

    if (/\bsoft|loose|mushy\b/.test(lower)) {
      return pickChoiceByPriority(choices, [["soft"]]);
    }

    if (/\bformed|solid|normal stool\b/.test(lower)) {
      return pickChoiceByPriority(choices, [["formed"]]);
    }
  }

  if (questionId === "water_intake") {
    if (
      /\b(drinking more|drinking a lot|very thirsty|constantly drinking|more water|drinking way more|water intake is up)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [
        ["more", "usual"],
        ["more"],
        ["drinking", "more"],
        ["thirsty"],
      ]);
    }

    if (
      /\b(drinking less|hardly drinking|less water|not much water|drinking a bit less|water intake is down|drinking a little less|barely drinking|barely water)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [
        ["less", "than", "usual"],
        ["less"],
        ["reduc"],
        ["decreas"],
      ]);
    }

    if (
      /\b(drinking normally|water is normal|normal drinking|drinking okay|drinking ok|water seems fine|intake is normal)\b/.test(
        lower
      ) ||
      /yes[^a-z]*[a-z]*[^a-z]*normal/.test(lower) ||
      ((lower.includes("normal") ||
        lower.includes("fine") ||
        lower.includes("okay") ||
        lower.includes("ok")) &&
        (lower.includes("drink") ||
          lower.includes("water") ||
          lower.includes("yes")))
    ) {
      return pickChoiceByPriority(choices, [["normal"], ["usual"]]);
    }

    if (
      /\b(not really|not at all|nothing much)\b/.test(lower) &&
      (lower.includes("drink") ||
        lower.includes("water") ||
        lower.includes("thirsty"))
    ) {
      return pickChoiceByPriority(choices, [
        ["less", "than", "usual"],
        ["less"],
        ["reduc"],
      ]);
    }

    if (/^no\s+not\s+really$/.test(lower) || /^not\s+really$/.test(lower)) {
      return pickChoiceByPriority(choices, [
        ["less", "than", "usual"],
        ["less"],
        ["reduc"],
      ]);
    }

    if (isStrongWaterNegativeResponse(lower)) {
      return pickChoiceByPriority(choices, [
        ["not", "drink"],
        ["not"],
        ["none"],
        ["absent"],
      ]);
    }
  }

  if (questionId === "trauma_mobility") {
    if (
      /\b(can't walk|cant walk|cannot walk|unable to walk|won't walk|wont walk|can't stand|cant stand|cannot stand|unable to stand|won't stand|wont stand|dragging)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["inability", "stand"]]);
    }

    if (
      /\b(can still walk|can walk|still walking|walking slowly|walking carefully|walks but limps)\b/.test(
        lower
      )
    ) {
      return pickChoiceByPriority(choices, [["walking"]]);
    }

    if (/\b(limping|hobbling|favoring it)\b/.test(lower)) {
      return pickChoiceByPriority(choices, [["limping"]]);
    }
  }

  if (isShortAffirmativeResponse(lower)) {
    const affirmativeChoice = pickChoiceByPriority(choices, [
      ["normal"],
      ["yes"],
      ["true"],
      ["present"],
    ]);
    if (affirmativeChoice !== null) {
      return affirmativeChoice;
    }
  }

  if (isShortNegativeResponse(lower)) {
    const negativePriority = isNormalityQuestion(question)
      ? [
          ["less"],
          ["reduc"],
          ["decreas"],
          ["not", "drink"],
          ["not"],
          ["none"],
          ["absent"],
          ["no"],
          ["false"],
        ]
      : [
          ["not", "drink"],
          ["none"],
          ["absent"],
          ["less"],
          ["reduc"],
          ["decreas"],
          ["not"],
          ["no"],
          ["false"],
        ];
    return pickChoiceByPriority(choices, negativePriority);
  }

  return null;
}

const PENDING_QUESTION_STOP_WORDS = new Set([
  "your",
  "dog",
  "cat",
  "pet",
  "what",
  "when",
  "where",
  "which",
  "does",
  "have",
  "with",
  "that",
  "this",
  "there",
  "specific",
  "status",
  "about",
  "going",
]);

function getPendingQuestionContextTokens(question: {
  question_text?: string;
  extraction_hint?: string;
  choices?: readonly string[];
}): string[] {
  const rawTokens = [
    question.question_text || "",
    question.extraction_hint || "",
    ...(Array.isArray(question.choices) ? question.choices : []),
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .match(/[a-z']{3,}/g);

  if (!rawTokens) {
    return [];
  }

  return [...new Set(rawTokens)].filter(
    (token) => token.length >= 4 && !PENDING_QUESTION_STOP_WORDS.has(token)
  );
}

function messageMentionsQuestionContext(
  question: {
    question_text?: string;
    extraction_hint?: string;
    choices?: readonly string[];
  },
  normalizedMessage: string
): boolean {
  return getPendingQuestionContextTokens(question).some((token) =>
    normalizedMessage.includes(token)
  );
}

function questionLooksDurationLike(question: {
  question_text?: string;
  extraction_hint?: string;
}): boolean {
  const combinedText =
    `${question.question_text || ""} ${question.extraction_hint || ""}`.toLowerCase();
  return /\b(duration|how long|when did|when does|onset|started|going on|timing|frequency)\b/.test(
    combinedText
  );
}

function hasDurationLikeSignal(normalizedMessage: string): boolean {
  return /\b(\d+\s*(hour|day|week|month|year)s?|(a\s+)?few\s*(hour|day|week|month|year)s?|couple of\s*(hour|day|week|month|year)s?|today|yesterday|tonight|this morning|last night|since|for\s+\w+|sudden|suddenly|gradual|gradually)\b/.test(
    normalizedMessage
  );
}

export function shouldPersistRawPendingAnswer(
  questionId: string,
  rawMessage: string,
  turnAnswers: Record<string, string | boolean | number>,
  turnSymptoms: string[]
): boolean {
  const question = FOLLOW_UP_QUESTIONS[questionId];
  if (!question) {
    return false;
  }

  const normalizedMessage = normalizeIntentText(rawMessage);
  if (!normalizedMessage) {
    return false;
  }

  // Preserve the legacy raw-unknown contract for existing typed follow-ups that
  // still rely on it, but keep questions with explicit clarification policy
  // unresolved so the checker can clarify instead of silently accepting "not sure".
  if (shouldLeaveAmbiguousReplyUnanswered(questionId, rawMessage)) {
    return false;
  }

  if (
    shouldEscalateForUnknown(questionId) &&
    coerceCanonicalUnknownReply(rawMessage) !== null
  ) {
    return false;
  }

  if (isShortUnknownResponse(normalizedMessage)) {
    return (
      !isReproductiveStatusQuestion(questionId) &&
      !shouldClarifyAmbiguousReplyForQuestion(questionId)
    );
  }

  // Raw fallback is only safe for free-text prompts. For choice/boolean/number
  // questions, persisting arbitrary owner text closes the question with an
  // invalid typed answer and can skip required clarification.
  if (question.data_type !== "string") {
    return false;
  }
  const hasOtherTurnAnswers = Object.keys(turnAnswers).some(
    (key) => key !== questionId
  );
  const hasOtherTurnSymptoms = turnSymptoms.length > 0;
  if (
    questionLooksDurationLike(question) &&
    hasDurationLikeSignal(normalizedMessage)
  ) {
    return true;
  }

  if (hasOtherTurnAnswers || hasOtherTurnSymptoms) {
    return false;
  }

  if (messageMentionsQuestionContext(question, normalizedMessage)) {
    return true;
  }

  return normalizedMessage.split(/\s+/).length <= 5;
}

export function sanitizePendingRawAnswer(rawMessage: string): string | null {
  const cleaned = rawMessage.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 160) : null;
}
