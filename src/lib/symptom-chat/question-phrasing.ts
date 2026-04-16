import {
  isNvidiaConfigured,
  phraseWithLlama,
  reviewQuestionPlanWithNemotron,
  verifyQuestionWithNemotron,
} from "@/lib/nvidia-models";
import {
  stripMarkdownCodeFences,
  stripThinkingBlocks,
} from "@/lib/llm-output";
import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical-matrix";
import { buildCaseMemorySnapshot } from "@/lib/symptom-memory";
import { type PetProfile, type TriageSession } from "@/lib/triage-engine";
import {
  buildConfirmedQASummary,
  buildDeterministicQuestionFallback,
  parseLooseJsonRecord,
} from "@/lib/symptom-chat/extraction-helpers";

const useNvidia = isNvidiaConfigured();

export interface SymptomChatTurnMessage {
  role: "user" | "assistant";
  content: string;
}

export interface QuestionGateDecision {
  includeImageContext: boolean;
  useDeterministicFallback: boolean;
  reason: string;
}

export function sanitizeQuestionDraft(
  rawDraft: string,
  fallbackMessage: string,
  allowPhotoMention: boolean
): string {
  const cleaned = stripMarkdownCodeFences(stripThinkingBlocks(rawDraft))
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallbackMessage;

  const mentionsSpeciesConfusion =
    /confusion about (what type of )?animal|species confusion|breed confusion/i.test(
      cleaned
    );
  const usesVisualLanguage =
    /\b(i can see|i notice|from the photo|from the image|looking at the photo|looking at the image|the photo|the image|this photo|this image)\b/i.test(
      cleaned
    );

  if (mentionsSpeciesConfusion || (!allowPhotoMention && usesVisualLanguage)) {
    return fallbackMessage;
  }

  if (!cleaned.includes("?")) {
    return fallbackMessage;
  }

  return cleaned;
}

export async function gateQuestionBeforePhrasing(
  questionId: string,
  questionText: string,
  session: TriageSession,
  pet: PetProfile,
  messages: SymptomChatTurnMessage[],
  latestUserMessage: string,
  phrasingContext?: string | null,
  photoAnalyzedThisTurn?: boolean
): Promise<QuestionGateDecision> {
  const defaultDecision: QuestionGateDecision = {
    includeImageContext: Boolean(photoAnalyzedThisTurn && phrasingContext),
    useDeterministicFallback: false,
    reason: "default",
  };

  if (!useNvidia) {
    return defaultDecision;
  }

  const prompt = `Review this next-question plan for a veterinary triage assistant.

CASE MEMORY:
${buildCaseMemorySnapshot(session, messages, latestUserMessage)}
${phrasingContext ? `\nIMAGE CONTEXT:\n${phrasingContext}\n` : ""}
PHOTO ANALYZED THIS TURN: ${photoAnalyzedThisTurn ? "YES" : "NO"}

REQUIRED QUESTION:
- ID: ${questionId}
- Text: ${questionText}

Return ONLY valid JSON:
{
  "include_image_context": true,
  "use_deterministic_fallback": false,
  "reason": "short explanation"
}

RULES:
- include_image_context should stay true when the photo materially informs the reasoning for this exact question's wording.
- Set include_image_context to false only when the photo is clearly irrelevant to the wording of this exact question.
- use_deterministic_fallback should be true if the turn is contradictory, ambiguous, or likely to trigger hallucinated wording.
- Never change the question.
- Be precise, not overly cautious.`;

  try {
    const rawDecision = await reviewQuestionPlanWithNemotron(prompt);
    const parsed = parseLooseJsonRecord(rawDecision);
    const includeImageContext =
      Boolean(parsed.include_image_context) &&
      Boolean(photoAnalyzedThisTurn) &&
      Boolean(phrasingContext);
    return {
      includeImageContext,
      useDeterministicFallback: Boolean(parsed.use_deterministic_fallback),
      reason:
        typeof parsed.reason === "string" ? parsed.reason : "nemotron-gate",
    };
  } catch (error) {
    console.error("Question preflight gate failed:", error);
    return defaultDecision;
  }
}

function buildQuestionPhrasingPrompt(
  questionText: string,
  questionId: string,
  pet: PetProfile,
  memorySnapshot: string,
  confirmedQA: string,
  phrasingContext: string | null | undefined,
  hasPhoto: boolean,
  allowPhotoMentionInWording: boolean,
  answerType: string
): string {
  return `You are PawVital, a precise veterinary triage wording assistant.

The clinical matrix already chose the next question. Do not invent clinical logic.

PET:
- Name: ${pet.name}
- Breed: ${pet.breed}
- Age: ${pet.age_years}
- Weight: ${pet.weight}

FULL SESSION MEMORY:
${memorySnapshot}
${confirmedQA ? `\nCONFIRMED ANSWERS SO FAR:\n${confirmedQA}\n` : ""}${phrasingContext ? `\nIMAGE REASONING CONTEXT:\n${phrasingContext}\n` : ""}
PHOTO SENT THIS TURN: ${hasPhoto ? "YES" : "NO"}
EXPLICITLY REFERENCE PHOTO IN WORDING: ${allowPhotoMentionInWording ? "YES" : "NO"}

REQUIRED QUESTION:
- Exact question text: "${questionText}"
- Internal ID: ${questionId}
- Answer type: ${answerType}

WRITE EXACTLY 2 SENTENCES:
1. One brief acknowledgment that SPECIFICALLY references 1-2 of the confirmed answers above (e.g. "Since ${pet.name} has been drinking less than usual and this has been going on for 3 days..."). Do NOT write a generic "I'm keeping track" phrase.
2. Ask the exact required question in caring, simple language.

HARD RULES:
- Treat the latest owner answer and any attached photo as one combined turn about the same dog.
- Never act like this turn exists in isolation — always connect to what was already confirmed.
- Never ask a different question than the required one.
- Never mention species confusion, breed confusion, or made-up visual details.
- Use image reasoning context when it exists so the question stays grounded in what is already known.
- If EXPLICITLY REFERENCE PHOTO IN WORDING = NO, never mention the photo, image, or use visual language like "I can see" or "from the photo".
- If EXPLICITLY REFERENCE PHOTO IN WORDING = YES, only mention the image briefly and only if it supports the required question.
- Never mention scores, probabilities, clinical IDs, or internal logic.
- Never list diagnoses or differentials.
- Use correct canine anatomy.

Respond with only the final 2-sentence message.`;
}

function buildQuestionVerificationPrompt(
  questionText: string,
  questionId: string,
  memorySnapshot: string,
  phrasingContext: string | null | undefined,
  hasPhoto: boolean,
  allowPhotoMentionInWording: boolean,
  sanitizedDraft: string
): string {
  return `Review and, if needed, repair this drafted veterinary follow-up message.

FULL SESSION MEMORY:
${memorySnapshot}
${phrasingContext ? `\nIMAGE REASONING CONTEXT:\n${phrasingContext}\n` : ""}
PHOTO SENT THIS TURN: ${hasPhoto ? "YES" : "NO"}
EXPLICITLY REFERENCE PHOTO IN WORDING: ${allowPhotoMentionInWording ? "YES" : "NO"}

REQUIRED QUESTION:
- Exact question text: "${questionText}"
- Internal ID: ${questionId}

DRAFT MESSAGE:
${sanitizedDraft}

Return ONLY valid JSON:
{
  "message": "final corrected 2-sentence message"
}

RULES:
- Preserve the required question intent exactly.
- Keep it to 2 sentences.
- Keep it grounded in the full session memory.
- If EXPLICITLY REFERENCE PHOTO IN WORDING = NO, remove all direct photo/image/visual language.
- Never mention species confusion, breed confusion, or made-up visual details.
- Never ask a different question.
- Never mention diagnoses, scores, IDs, or probabilities.`;
}

async function verifyQuestionDraft(
  questionText: string,
  questionId: string,
  memorySnapshot: string,
  phrasingContext: string | null | undefined,
  hasPhoto: boolean,
  allowPhotoMentionInWording: boolean,
  sanitizedDraft: string,
  fallbackMessage: string
): Promise<string> {
  if (!useNvidia) {
    return sanitizedDraft;
  }

  try {
    const verificationPrompt = buildQuestionVerificationPrompt(
      questionText,
      questionId,
      memorySnapshot,
      phrasingContext,
      hasPhoto,
      allowPhotoMentionInWording,
      sanitizedDraft
    );
    const verified = await verifyQuestionWithNemotron(verificationPrompt);
    const parsed = parseLooseJsonRecord(verified);
    const verifiedMessage = typeof parsed.message === "string" ? parsed.message : "";

    return sanitizeQuestionDraft(
      verifiedMessage,
      fallbackMessage,
      allowPhotoMentionInWording
    );
  } catch (verificationError) {
    console.error("Question verification failed:", verificationError);
    return sanitizedDraft;
  }
}

async function phraseQuestionV2(
  questionText: string,
  questionId: string,
  session: TriageSession,
  pet: PetProfile,
  messages: SymptomChatTurnMessage[],
  latestUserMessage: string,
  phrasingContext?: string | null,
  photoAnalyzedThisTurn?: boolean,
  allowPhotoMentionInWording = false,
  forceDeterministicFallback = false
): Promise<string> {
  const answerType = FOLLOW_UP_QUESTIONS[questionId]?.data_type || "string";
  const hasPhoto = Boolean(photoAnalyzedThisTurn);
  const memorySnapshot = buildCaseMemorySnapshot(
    session,
    messages,
    latestUserMessage
  );
  const fallbackMessage = buildDeterministicQuestionFallback(
    pet.name,
    questionText,
    session,
    hasPhoto,
    allowPhotoMentionInWording
  );
  if (forceDeterministicFallback) {
    return fallbackMessage;
  }

  const confirmedQA = buildConfirmedQASummary(session);
  const prompt = buildQuestionPhrasingPrompt(
    questionText,
    questionId,
    pet,
    memorySnapshot,
    confirmedQA,
    phrasingContext,
    hasPhoto,
    allowPhotoMentionInWording,
    answerType
  );

  try {
    const draft = await phraseWithLlama(prompt);
    console.log("[Engine] Phrasing primary: Llama 3.3 70B Instruct");

    const sanitizedDraft = sanitizeQuestionDraft(
      draft,
      fallbackMessage,
      allowPhotoMentionInWording
    );

    return verifyQuestionDraft(
      questionText,
      questionId,
      memorySnapshot,
      phrasingContext,
      hasPhoto,
      allowPhotoMentionInWording,
      sanitizedDraft,
      fallbackMessage
    );
  } catch (error) {
    console.error("Phrasing failed:", error);
    return fallbackMessage;
  }
}

export async function phraseQuestion(
  questionText: string,
  questionId: string,
  session: TriageSession,
  pet: PetProfile,
  messages: SymptomChatTurnMessage[],
  latestUserMessage: string,
  phrasingContext?: string | null,
  photoAnalyzedThisTurn?: boolean,
  allowPhotoMentionInWording = false,
  forceDeterministicFallback = false
): Promise<string> {
  return phraseQuestionV2(
    questionText,
    questionId,
    session,
    pet,
    messages,
    latestUserMessage,
    phrasingContext,
    photoAnalyzedThisTurn,
    allowPhotoMentionInWording,
    forceDeterministicFallback
  );
}
