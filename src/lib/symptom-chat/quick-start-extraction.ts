import type { TriageSession } from "@/lib/triage-engine";
import { getQuickStartSymptomAliases } from "@/lib/symptom-chat/quick-start-symptoms";
import { getPendingQuestionId } from "@/lib/symptom-chat/pending-question-state";

function normalizeQuickStartText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasNegatedQuickStartPrefix(prefix: string): boolean {
  return /\b(?:no|not|never|without|don t|dont|doesn t|doesnt|didn t|didnt|isn t|isnt|wasn t|wasnt|hasn t|hasnt|haven t|havent)\b/.test(
    prefix
  );
}

function deniesQuickStartSuffixSymptom(prefix: string): boolean {
  return /\b(?:don t|dont|do not|doesn t|doesnt|does not|didn t|didnt|did not)\s+(?:think|believe|suspect|feel|know)\b/.test(
    prefix
  );
}

function getNormalizedQuickStartSymptomTexts(symptom: string): string[] {
  return Array.from(
    new Set(
      [symptom.replace(/_/g, " "), ...getQuickStartSymptomAliases(symptom)]
        .map(normalizeQuickStartText)
        .filter(Boolean)
    )
  );
}

function isChipShapedQuickStartPrefix(prefix: string): boolean {
  if (!prefix) {
    return false;
  }

  const words = prefix.split(/\s+/).filter(Boolean);
  if (words.length > 3) {
    return false;
  }

  return !hasNegatedQuickStartPrefix(prefix);
}

function isExactTextOnlyQuickStartMessage(
  rawMessage: string,
  keywordSymptoms: string[]
): boolean {
  if (keywordSymptoms.length !== 1) {
    return false;
  }

  const normalizedRawMessage = normalizeQuickStartText(rawMessage);
  const normalizedSymptomTexts = getNormalizedQuickStartSymptomTexts(
    keywordSymptoms[0]
  );

  if (normalizedSymptomTexts.includes(normalizedRawMessage)) {
    return true;
  }

  // Quick-start chips are rendered as owner text like "Milo has been vomiting".
  // Treat that app-generated sentence as the same deterministic single-symptom
  // start, without broadening richer owner descriptions into this fast path.
  const chipSuffix = normalizedSymptomTexts
    .map((symptomText) => ` has been ${symptomText}`)
    .find((suffix) => normalizedRawMessage.endsWith(suffix));
  if (!chipSuffix) {
    return false;
  }

  return isChipShapedQuickStartPrefix(
    normalizedRawMessage.slice(0, -chipSuffix.length).trim()
  );
}

function findQuickStartChipSuffix(
  normalizedRawMessage: string,
  symptom: string
): string | null {
  return (
    getNormalizedQuickStartSymptomTexts(symptom)
      .map((symptomText) => ` has been ${symptomText}`)
      .find((suffix) => normalizedRawMessage.endsWith(suffix)) ?? null
  );
}

export function shouldSuppressTextOnlyQuickStartKeywordSymptoms(
  rawMessage: string,
  keywordSymptoms: string[]
): boolean {
  if (keywordSymptoms.length !== 1) {
    return false;
  }

  const normalizedRawMessage = normalizeQuickStartText(rawMessage);
  const chipSuffix = findQuickStartChipSuffix(
    normalizedRawMessage,
    keywordSymptoms[0]
  );
  if (!chipSuffix) {
    return false;
  }

  return deniesQuickStartSuffixSymptom(
    normalizedRawMessage.slice(0, -chipSuffix.length).trim()
  );
}

export function buildTextOnlyQuickStartExtraction(
  session: TriageSession,
  rawMessage: string,
  keywordSymptoms: string[],
  hasImage: boolean
): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
} | null {
  const hasPendingQuestion =
    Boolean(session.last_question_asked) || Boolean(getPendingQuestionId(session));
  if (
    hasImage ||
    hasPendingQuestion ||
    session.known_symptoms.length > 0 ||
    session.answered_questions.length > 0 ||
    Object.keys(session.extracted_answers).length > 0 ||
    session.red_flags_triggered.length > 0 ||
    !isExactTextOnlyQuickStartMessage(rawMessage, keywordSymptoms)
  ) {
    return null;
  }

  return {
    symptoms: keywordSymptoms,
    answers: {},
  };
}
