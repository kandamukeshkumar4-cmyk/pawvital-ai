import {
  getExtractionSchema,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
import {
  safeParseJson,
  stripMarkdownCodeFences,
  stripThinkingBlocks,
} from "@/lib/llm-output";
import { extractWithQwen } from "@/lib/nvidia-models";
import { CLINICAL_ARCHITECTURE_FOOTER } from "@/lib/clinical/llm-narrative-contract";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";

export async function extractDataFromMessage(
  message: string,
  session: TriageSession,
  pet: PetProfile,
  schema: ReturnType<typeof getExtractionSchema>,
  compactImageSignals?: string
): Promise<{
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
}> {
  const symptomChoices = Object.keys(SYMPTOM_MAP).sort().join(", ");
  const schemaDescription = Object.entries(schema)
    .map(([key, hint]) => `  "${key}": ${hint}`)
    .join("\n");

  const prompt = `You are a data extraction engine. Extract structured medical data from a pet owner's message.

Pet: ${pet.name}, ${pet.breed}, ${pet.age_years} years old, ${pet.weight} lbs

Already known symptoms: ${session.known_symptoms.join(", ") || "none yet"}
Already answered: ${session.answered_questions.join(", ") || "none yet"}
Pending question: ${session.last_question_asked || "none"}

OWNER'S MESSAGE: "${message}"
${compactImageSignals ? `\nIMAGE SIGNALS:\n${compactImageSignals}` : ""}

EXTRACT the following data. For each field, extract ONLY if the owner clearly mentioned it. Use null if not mentioned.

Fields to extract:
  "symptoms": Array of canonical symptom keywords from this list: ${symptomChoices}. Use "wound_skin_issue" for wounds, lacerations, bite injuries, skin lesions, masses, bleeding, redness, or infected skin findings. Include ONLY symptoms the owner actually described or that are visible in attached visual analysis.
${schemaDescription}

Output ONLY valid JSON:
{
  "symptoms": ["string"],
  "answers": {
    "question_id": "extracted_value_or_null"
  }
}

Rules:
- For boolean fields: use true/false based on what the owner said, or null if not mentioned
- For string fields: extract the relevant detail, or null if not mentioned
- For choice fields: pick the closest matching option, or null if not mentioned
- Do NOT infer or guess. Only extract what was explicitly stated.
- Do NOT include question IDs that weren't answered in the message.

Examples:
- If the pending question is "water_intake" and the owner says "Yes, he's drinking normally", return "water_intake": "normal"
- If the pending question is "water_intake" and the owner says "No, not really", return "water_intake": "less_than_usual"
- If the pending question is "trauma_history" and the owner says "I don't know", return "trauma_history": "I don't know"

Output ONLY the JSON object. No explanation, no thinking, no markdown.

${CLINICAL_ARCHITECTURE_FOOTER}`;

  try {
    const rawText = await extractWithQwen(prompt);
    console.log("[Engine] Extraction: Qwen 3.5 122B");

    const parsed = parseExtractionResponse(rawText);
    console.log(
      `[Engine] Extraction parsed ${parsed.symptoms.length} symptoms and ${Object.keys(parsed.answers).length} answers` +
        (session.last_question_asked
          ? ` (pending: ${session.last_question_asked})`
          : "")
    );
    return parsed;
  } catch (error) {
    console.error("Primary extraction failed:", error);
    console.log("[Engine] Extraction fallback: keyword-only recovery");
    return { symptoms: extractSymptomsFromKeywords(message), answers: {} };
  }
}

function parseExtractionResponse(rawText: string): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
} {
  const parsed = safeParseJson<{
    symptoms?: string[];
    answers?: Record<string, string | boolean | number | null>;
  }>(rawText, "symptom chat extraction");

  const cleanAnswers: Record<string, string | boolean | number> = {};
  for (const [key, val] of Object.entries(parsed.answers || {})) {
    if (val !== null && val !== undefined && val !== "" && val !== "null") {
      cleanAnswers[key] = val as string | boolean | number;
    }
  }

  return {
    symptoms: parsed.symptoms || [],
    answers: cleanAnswers,
  };
}

export function extractSymptomsFromKeywords(message: string): string[] {
  const lower = message.toLowerCase();
  const symptoms: string[] = [];
  const keywords: Record<string, string> = {
    limp: "limping",
    vomit: "vomiting",
    "not eating": "not_eating",
    "won't eat": "not_eating",
    "refusing food": "not_eating",
    "not interested in food": "not_eating",
    diarrhea: "diarrhea",
    "bloody diarrhea": "blood_in_stool",
    "blood in poop": "blood_in_stool",
    "blood in poo": "blood_in_stool",
    "bloody stool": "blood_in_stool",
    letharg: "lethargy",
    cough: "coughing",
    "can't breathe": "difficulty_breathing",
    "trouble breathing": "difficulty_breathing",
    "breathing hard": "difficulty_breathing",
    "breathing heavy": "difficulty_breathing",
    "breathing fast": "difficulty_breathing",
    "hard to breathe": "difficulty_breathing",
    "short of breath": "difficulty_breathing",
    panting: "difficulty_breathing",
    scratch: "excessive_scratching",
    itch: "excessive_scratching",
    "drinking more": "drinking_more",
    "drinking a lot": "drinking_more",
    thirsty: "drinking_more",
    trembl: "trembling",
    shak: "trembling",
    collapse: "seizure_collapse",
    collapsed: "seizure_collapse",
    "passed out": "seizure_collapse",
    "pass out": "seizure_collapse",
    fainted: "seizure_collapse",
    "went limp": "seizure_collapse",
    bloat: "swollen_abdomen",
    bloated: "swollen_abdomen",
    "swollen belly": "swollen_abdomen",
    "big belly": "swollen_abdomen",
    "hard belly": "swollen_abdomen",
    "distended belly": "swollen_abdomen",
    "blood in stool": "blood_in_stool",
    "eye discharge": "eye_discharge",
    "goopy eye": "eye_discharge",
    "goopy eyes": "eye_discharge",
    "runny eye": "eye_discharge",
    "ear scratch": "ear_scratching",
    "shaking head": "ear_scratching",
    "head shaking": "ear_scratching",
    "ear smell": "ear_scratching",
    "scratching ears": "ear_scratching",
    "weight loss": "weight_loss",
    wound: "wound_skin_issue",
    cut: "wound_skin_issue",
    lacerat: "wound_skin_issue",
    abscess: "wound_skin_issue",
    "hot spot": "wound_skin_issue",
    sore: "wound_skin_issue",
    lesion: "wound_skin_issue",
    lump: "wound_skin_issue",
    bump: "wound_skin_issue",
    mass: "wound_skin_issue",
    rash: "wound_skin_issue",
    bite: "wound_skin_issue",
    bleed: "wound_skin_issue",
    redness: "wound_skin_issue",
    inflam: "wound_skin_issue",
    infect: "wound_skin_issue",
    pus: "wound_skin_issue",
    swollen: "wound_skin_issue",
    ulcer: "wound_skin_issue",
  };

  for (const [keyword, symptom] of Object.entries(keywords)) {
    if (lower.includes(keyword) && !symptoms.includes(symptom)) {
      symptoms.push(symptom);
    }
  }
  return symptoms;
}

export function parseLooseJsonRecord(rawText: string): Record<string, unknown> {
  return safeParseJson<Record<string, unknown>>(rawText, "symptom chat JSON");
}

function humanizeAnswerValue(value: string | boolean | number): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  return String(value).replace(/[_-]+/g, " ");
}

function getRecentAnsweredQuestionIds(
  session: TriageSession,
  limit = 5
): string[] {
  const recent: string[] = [];
  const seen = new Set<string>();

  for (let index = session.answered_questions.length - 1; index >= 0; index -= 1) {
    const questionId = session.answered_questions[index];
    if (seen.has(questionId)) {
      continue;
    }

    seen.add(questionId);
    recent.push(questionId);

    if (recent.length >= limit) {
      break;
    }
  }

  return recent.reverse();
}

export function buildConfirmedQASummary(
  session: TriageSession,
  limit = 5
): string {
  const answered = getRecentAnsweredQuestionIds(session, limit);
  if (answered.length === 0) return "";
  const lines = answered
    .map((qId) => {
      const q = FOLLOW_UP_QUESTIONS[qId];
      const rawVal = session.extracted_answers[qId];
      if (!q || rawVal === undefined || rawVal === null || rawVal === "") {
        return null;
      }
      const readable = humanizeAnswerValue(rawVal);
      return `- ${q.question_text} -> ${readable}`;
    })
    .filter(Boolean);
  return lines.join("\n");
}

export function buildDeterministicQuestionFallback(
  petName: string,
  questionText: string,
  session: TriageSession,
  hasPhoto: boolean,
  allowPhotoMention: boolean
): string {
  const memory = ensureStructuredCaseMemory(session);
  const chiefComplaint = memory.chief_complaints[0]?.replace(/_/g, " ") || null;

  let acknowledgment: string;
  if (hasPhoto && allowPhotoMention) {
    acknowledgment = `Thanks for sharing that about ${petName}; I'm combining your answer with the photo and the rest of the history.`;
  } else if (chiefComplaint) {
    acknowledgment = `I'm keeping track of what you've shared so far about ${petName}'s ${chiefComplaint}.`;
  } else {
    acknowledgment = `Thanks for sharing that about ${petName}.`;
  }
  return `${acknowledgment} ${questionText}`;
}

export function cleanQuestionDraft(rawDraft: string): string {
  return stripThinkingBlocks(stripMarkdownCodeFences(rawDraft)).trim();
}
