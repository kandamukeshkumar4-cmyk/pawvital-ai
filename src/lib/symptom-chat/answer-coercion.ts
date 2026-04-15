import {
  getMissingQuestions,
  getNextQuestion,
  getSymptomPriorityScore,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";

export function getNextQuestionAvoidingRepeat(
  session: TriageSession,
  preferredSymptoms: string[] = []
): string | null {
  const nextQuestionId =
    getNextQuestionForPreferredSymptoms(session, preferredSymptoms) ||
    getNextQuestion(session);
  if (!nextQuestionId) return null;

  if (
    nextQuestionId !== session.last_question_asked ||
    !session.answered_questions.includes(nextQuestionId)
  ) {
    return nextQuestionId;
  }

  const alternatives = getMissingQuestions(session).filter(
    (qId) => qId !== session.last_question_asked
  );
  return alternatives[0] || nextQuestionId;
}

function getNextQuestionForPreferredSymptoms(
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
  const lower = message.toLowerCase();

  if (!question || !message) return null;

  if (question.data_type === "boolean") {
    const words = lower.split(/\s+/).filter(Boolean);
    if (
      /(^|\b)(yes|yeah|yep|true)\b/.test(lower) ||
      (words.length <= 3 &&
        /^(it is|he is|she is|there is|does|has|is)$/.test(lower))
    ) {
      return true;
    }
    if (
      /(^|\b)(no|nope|none|not really|false)\b/.test(lower) ||
      (words.length <= 4 &&
        /^(doesn't|doesnt|isn't|isnt|hasn't|hasnt|not)$/.test(lower))
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

const UNSAFE_EMERGENCY_QUESTIONS = new Set([
  "breathing_onset",
  "gum_color",
  "consciousness_level",
]);

export function shouldEscalateForUnknown(questionId: string): boolean {
  return UNSAFE_EMERGENCY_QUESTIONS.has(questionId);
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

  if (questionAllowsCanonicalUnknown(question)) {
    const unknownCoercion = coerceAmbiguousReplyToUnknown(rawMessage);
    if (unknownCoercion !== null) {
      return unknownCoercion;
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
  return /\b(\d+\s*(hour|day|week|month|year)s?|today|yesterday|tonight|this morning|last night|since|for\s+\w+|sudden|suddenly|gradual|gradually)\b/.test(
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

  // Critical "I don't know" style replies must remain recoverable even for
  // typed follow-ups so the owner response is preserved for clarification.
  if (isShortUnknownResponse(normalizedMessage)) {
    return true;
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
