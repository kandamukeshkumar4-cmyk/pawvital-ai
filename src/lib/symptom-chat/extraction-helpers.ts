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
  const pushSymptom = (symptom: string) => {
    if (!symptoms.includes(symptom)) {
      symptoms.push(symptom);
    }
  };
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
    "struggling to breathe": "difficulty_breathing",
    "breathing hard": "difficulty_breathing",
    "breathing heavy": "difficulty_breathing",
    "breathing fast": "difficulty_breathing",
    "labored breathing": "difficulty_breathing",
    "laboured breathing": "difficulty_breathing",
    "open mouth breathing": "difficulty_breathing",
    "open-mouth breathing": "difficulty_breathing",
    gasping: "difficulty_breathing",
    choking: "difficulty_breathing",
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
    seizure: "seizure_collapse",
    seizures: "seizure_collapse",
    seizing: "seizure_collapse",
    convulsion: "seizure_collapse",
    convulsions: "seizure_collapse",
    convulsing: "seizure_collapse",
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
    "in labor": "pregnancy_birth",
    "in labour": "pregnancy_birth",
    "gave birth": "pregnancy_birth",
    "giving birth": "pregnancy_birth",
    "after giving birth": "pregnancy_birth",
    "recently gave birth": "pregnancy_birth",
    "after whelping": "pregnancy_birth",
    "having puppies": "pregnancy_birth",
    "had puppies": "pregnancy_birth",
    "nursing puppies": "pregnancy_birth",
    postpartum: "pregnancy_birth",
    "green discharge": "pregnancy_birth",
    "stuck puppy": "pregnancy_birth",
    contractions: "pregnancy_birth",
    "hit by car": "trauma",
    "struck by car": "trauma",
    "dog bite": "trauma",
    "bite wound": "trauma",
    electrocuted: "trauma",
    "electrical shock": "trauma",
    "chemical burn": "trauma",
    "can't pee": "urination_problem",
    "cannot pee": "urination_problem",
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

  if (
    /\b(breathing with (great |real )?effort|working hard to breathe|using (his|her|their) belly muscles|using (his|her|their) abdomen to breathe|belly heaving|abdomen (is )?heaving|labou?red breathing)\b/.test(
      lower
    )
  ) {
    pushSymptom("difficulty_breathing");
  }

  if (
    /\b(gagging|choking)\b/.test(lower) &&
    /\b(pawing at (his|her|their) mouth|pawing at the mouth|something (is )?stuck|object (is )?stuck|stuck in (his|her|their) (mouth|throat))\b/.test(
      lower
    )
  ) {
    pushSymptom("difficulty_breathing");
  }

  if (
    (/\b(blood|bleeding)\b[^.?!]*\b(mouth|gum|gums)\b/.test(lower) ||
      /\b(mouth|gum|gums)\b[^.?!]*\b(blood|bleeding)\b/.test(lower)) &&
    /\b(cannot|can't|can not|unable to|won't|wont|hard to)\b[^.?!]*\b(swallow|eat|drink)\b/.test(
      lower
    )
  ) {
    pushSymptom("dental_problem");
  }

  const mentionsVomiting =
    /\b(vomit|vomiting|throwing up|threw up|retching|heaving)\b/.test(lower);
  if (mentionsVomiting) {
    pushSymptom("vomiting");
  }
  const mentionsDiarrhea =
    /\b(diarrhea|diarrhoea|bloody diarrhea|the runs)\b/.test(lower);
  if (mentionsVomiting && mentionsDiarrhea) {
    pushSymptom("vomiting_diarrhea_combined");
  }

  if (
    /\b(cough|coughing)\b/.test(lower) &&
    /\b(struggling to breathe|trouble breathing|labou?red breathing|open mouth breathing|gasping|choking|short of breath)\b/.test(
      lower
    )
  ) {
    pushSymptom("coughing_breathing_combined");
  }

  const mentionsSwollenAbdomen =
    /\b(belly|abdomen|stomach)\b/.test(lower) &&
    /\b(swollen|bloated|distended|tight|hard)\b/.test(lower);
  if (mentionsSwollenAbdomen) {
    pushSymptom("swollen_abdomen");
  }

  if (
    /\b(restless|restlessness|pacing|can'?t settle|unable to settle)\b/.test(
      lower
    )
  ) {
    pushSymptom("pacing_restlessness");
  }

  if (
    /\b(hives?|welts?|rash|bee sting|bug bite|stung)\b/.test(lower) ||
    /\b(face|muzzle|eyelids?)\b.*\b(swollen|swelling|puffy|puffing up|swelled up)\b/.test(
      lower
    )
  ) {
    pushSymptom("excessive_scratching");
  }

  const hasNegatedReactionCue =
    /\b(no|not|without)\b[^.?!]{0,24}\b(swelling|swollen|hives?|welts?|rash)\b/.test(
      lower
    ) ||
    /\b(swelling|swollen|hives?|welts?|rash)\b[^.?!]{0,24}\b(no|not|without)\b/.test(
      lower
    );

  if (
    /\b(vaccines?|vaccination|shots?|booster)\b/.test(lower) &&
    !hasNegatedReactionCue &&
    (/\b(hives?|welts?|rash)\b/.test(lower) ||
      /\b(face|muzzle|eyelids?)\b.*\b(swollen|swelling|puffy|puff(?:ed|ing) up|swelled up)\b/.test(
        lower
      ))
  ) {
    pushSymptom("post_vaccination_reaction");
  }

  if (
    /\b(can'?t use (his|her|their)? ?back legs|cannot use (his|her|their)? ?back legs|dragging (himself|herself|themself)|dragging (his|her|their) back legs|paraly[sz]ed|can'?t stand|unable to stand)\b/.test(
      lower
    )
  ) {
    pushSymptom("abnormal_gait");
  }

  if (
    /\b(excited|exercise|running|playing|after playing|after exercise|after a walk)\b/.test(
      lower
    ) &&
    /\b(collapse|collapsed|passed out|fainted)\b/.test(lower)
  ) {
    pushSymptom("exercise_induced_lameness");
  }

  if (
    /\b(in labor|in labour|giving birth|having puppies|whelping)\b/.test(
      lower
    ) ||
    (/\b(puppy|puppies)\b/.test(lower) &&
      /\b(stuck|straining|contractions|green discharge)\b/.test(lower))
  ) {
    pushSymptom("pregnancy_birth");
  }

  if (
    /\b(hit by (a )?car|struck by (a )?car|ran over|dog bite|bite wound|electrical shock|electrocuted|chemical burn|open fracture)\b/.test(
      lower
    )
  ) {
    pushSymptom("trauma");
  }

  if (
    !/\b(no|not|without)\b[^.?!]{0,24}\b(vaginal discharge|vulvar discharge|discharge from (?:her|the) (?:vulva|vagina))\b/.test(
      lower
    ) &&
    /\b(vaginal discharge|vulvar discharge|discharge from (?:her|the) (?:vulva|vagina))\b/.test(
      lower
    )
  ) {
    pushSymptom("vaginal_discharge");
  }

  if (
    /\b(collapse|collapsed|passed out|fainted|weak|weakness|wobbly|stumbling)\b/.test(
      lower
    ) &&
    (/\b(pale|white) gums?\b/.test(lower) ||
      /\bgums? (?:look(?:ing|s|ed)?|are(?: looking)?|turned?) (?:very |extremely )?(pale|white)\b/.test(
        lower
      ))
  ) {
    pushSymptom("lethargy");
  }

  if (
    !/\b(no rat poison|no rodenticide|did not get into rat poison|didn't get into rat poison|did not eat rat poison|didn't eat rat poison)\b/.test(
      lower
    ) &&
    /\b(rat poison|rodenticide|mouse bait|bait station|warfarin|brodifacoum|bromadiolone)\b/.test(
      lower
    )
  ) {
    pushSymptom("medication_reaction");
  }

  if (
    (/\b(drain cleaner|caustic cleaner|bleach|chemical burn|chemical cleaner)\b/.test(
      lower
    ) ||
      /\bstep(?:ped)? in\b[^.?!]{0,40}\b(cleaner|chemical)\b/.test(lower)) &&
    (/\b(blister|blistered|peeling|burned|burnt|raw)\b/.test(lower) ||
      (/\bred\b/.test(lower) && /\b(paw|paw pads?|skin)\b/.test(lower)))
  ) {
    pushSymptom("wound_skin_issue");
  }

  if (
    /\b(flap of skin|skin hanging off|skin torn open|gaping wound|flesh visible|tissue exposed|avulsion)\b/.test(
      lower
    )
  ) {
    pushSymptom("wound_skin_issue");
  }

  if (
    /\b(heat|hot|overheat|overheated|heatstroke)\b/.test(lower) &&
    /\b(panting hard|panting heavily|bright red gums|collapse|collapsed|weak)\b/.test(
      lower
    )
  ) {
    pushSymptom("heat_intolerance");
  }

  if (
    /\b(weak|weakness|wobbly|stumbling|lethargic)\b/.test(lower) &&
    (/\b(pale|white) gums?\b/.test(lower) ||
      /\bgums? (?:look(?:ing|s|ed)?|are(?: looking)?|turned?) (pale|white)\b/.test(
        lower
      )) &&
    /\b(dark (?:brown|red|tea-colored) urine|urine is dark|dark urine|brown urine|red urine)\b/.test(
      lower
    )
  ) {
    pushSymptom("lethargy");
  }

  const hasUrinaryContext = /\b(pee|peeing|urinat|urine|squatt)\b/.test(lower);
  const hasBlockageAttemptCue =
    /\b(straining|trying to pee|trying to urinate|crying while trying to pee|crying when he tries to pee|repeated trips outside|keeps going outside)\b/.test(
      lower
    ) &&
    !/\b(not|without|was not|wasn't)\b[^.?!]{0,24}\b(straining|crying|trying to pee|trying to urinate)\b/.test(
      lower
    );
  const hasLowOutputCue =
    /\b(almost no urine|nothing comes out|nothing has come out|no urine|only dribbles|only a few drops|few drops|barely anything)\b/.test(
      lower
    );

  if (hasUrinaryContext && hasBlockageAttemptCue && hasLowOutputCue) {
    pushSymptom("urination_problem");
  }

  if (
    /\b(flap of skin|skin hanging off|skin torn open|gaping wound|flesh visible|tissue exposed|avulsion)\b/.test(
      lower
    )
  ) {
    pushSymptom("wound_skin_issue");
  }

  return symptoms;
}

export function extractDeterministicEmergencyRedFlags(
  rawMessage: string,
  knownSymptoms: string[]
): string[] {
  const lower = rawMessage.toLowerCase();
  const flags = new Set<string>();
  const hasUrinaryBlockageAttemptCue =
    /\b(straining|trying to pee|trying to urinate|crying while trying to pee|crying when he tries to pee|repeated trips outside|keeps going outside)\b/.test(
      lower
    ) &&
    !/\b(not|without|was not|wasn't)\b[^.?!]{0,24}\b(straining|crying|trying to pee|trying to urinate)\b/.test(
      lower
    );
  const hasUrinaryLowOutputCue =
    /\b(almost no urine|nothing comes out|nothing has come out|no urine|only dribbles|only a few drops|few drops|barely anything)\b/.test(
      lower
    );
  const hasCyanoticGumLanguage =
    /\b(bluish?|gray|grey|purple) gums?\b/.test(lower) ||
    /\bgums? (?:look(?:ing|s|ed)?|are(?: looking)?|turned?) (bluish?|gray|grey|purple)\b/.test(
      lower
    );
  const hasPaleGumLanguage =
    /\b(pale|white) gums?\b/.test(lower) ||
    /\bgums? (?:look(?:ing|s|ed)?|are(?: looking)?|turned?) (pale|white)\b/.test(
      lower
    );

  if (
    knownSymptoms.includes("difficulty_breathing") &&
    /\b(breathing hard|breathing heavy|breathing fast|trouble breathing|short of breath|open[-\s]?mouth breathing)\b/.test(
      lower
    ) &&
    /\b(while lying still|while resting|at rest|even at rest|lying still|resting)\b/.test(
      lower
    )
  ) {
    flags.add("breathing_distress_at_rest");
  }

  if (knownSymptoms.includes("difficulty_breathing")) {
    if (hasCyanoticGumLanguage) {
      flags.add("blue_gums");
    }

    if (hasPaleGumLanguage) {
      flags.add("pale_gums");
    }

    if (
      /\b(breathing with (great |real )?effort|working hard to breathe|using (his|her|their) belly muscles|using (his|her|their) abdomen to breathe|belly heaving|abdomen (is )?heaving|labou?red breathing)\b/.test(
        lower
      ) ||
      (/\b(gagging|choking)\b/.test(lower) &&
        /\b(pawing at (his|her|their) mouth|pawing at the mouth|something (is )?stuck|object (is )?stuck|stuck in (his|her|their) (mouth|throat))\b/.test(
          lower
        ))
    ) {
      flags.add("breathing_difficulty");
    }
  }

  if (
    knownSymptoms.includes("excessive_scratching") &&
    /\b(hives?|welts?|rash)\b/.test(lower)
  ) {
    flags.add("hives_widespread");
  }

  if (
    (knownSymptoms.includes("seizure_collapse") ||
      knownSymptoms.includes("trembling")) &&
    /\b(seizure|seizures|seizing|convulsion|convulsions|convulsing)\b/.test(
      lower
    )
  ) {
    flags.add("seizure_activity");
  }

  if (knownSymptoms.includes("pregnancy_birth")) {
    if (
      /\bgreen discharge\b/.test(lower) &&
      /\b(no puppy|no pup|has not come out|hasn't come out|before any puppy|yet)\b/.test(
        lower
      )
    ) {
      flags.add("green_discharge_no_puppy");
    }

    if (
      /\b(stuck puppy|puppy seems stuck|hard straining|straining hard)\b/.test(
        lower
      )
    ) {
      flags.add("dystocia_active");
    }

    if (
      /\b(postpartum|after giving birth|after whelping|nursing)\b/.test(lower) &&
      /\b(trembling|tremors?|shaking|seizures?)\b/.test(lower)
    ) {
      flags.add("eclampsia_signs");
    }
  }

  if (knownSymptoms.includes("trauma")) {
    if (
      /\bblue gums?\b/.test(lower) ||
      /\bgums? (look|looks|looked|are|turned?) blue\b/.test(lower)
    ) {
      flags.add("blue_gums");
    }

    if (
      /\b(pale|white) gums?\b/.test(lower) ||
      /\bgums? (look|looks|looked|are|turned?) (pale|white)\b/.test(lower)
    ) {
      flags.add("pale_gums");
    }

    if (
      /\b(bleeding heavily|bleeding a lot|gushing blood|won'?t stop bleeding|not stopping with pressure|soaking through towels?)\b/.test(
        lower
      )
    ) {
      flags.add("active_bleeding_trauma");
    }

    if (
      /\b(open fracture|bone sticking out|bone visible|obviously broken)\b/.test(
        lower
      )
    ) {
      flags.add("visible_fracture");
    }
  }

  if (knownSymptoms.includes("wound_skin_issue")) {
    if (
      /\b(bleeding heavily|bleeding a lot|gushing blood|won'?t stop bleeding|not stopping with pressure|deep avulsion)\b/.test(
        lower
      )
    ) {
      flags.add("wound_deep_bleeding");
    }

    if (/\b(bone sticking out|bone visible)\b/.test(lower)) {
      flags.add("wound_bone_visible");
    }

    if (
      /\b(flap of skin|skin hanging off|skin torn open|gaping wound|flesh visible|tissue exposed|avulsion)\b/.test(
        lower
      )
    ) {
      flags.add("wound_tissue_exposed");
    }
  }

  if (knownSymptoms.includes("dental_problem")) {
    if (
      /\b(blood|bleeding)\b[^.?!]*\b(mouth|gum|gums)\b/.test(lower) ||
      /\b(mouth|gum|gums)\b[^.?!]*\b(blood|bleeding)\b/.test(lower)
    ) {
      flags.add("blood_from_mouth");
    }

    if (
      /\b(cannot|can't|can not|unable to|won't|wont|hard to)\b[^.?!]*\b(swallow|drink)\b/.test(
        lower
      ) ||
      /\b(cannot|can't|can not|unable to|won't|wont|hard to)\b[^.?!]*\beat\b[^.?!]*\bdrink\b/.test(
        lower
      )
    ) {
      flags.add("inability_to_drink");
    }
  }

  if (
    knownSymptoms.includes("urination_problem") &&
    ((/\b(can'?t pee|cannot pee)\b/.test(lower) ||
      ((/\b(trying to pee|straining to pee)\b/.test(lower) &&
        !/\b(not|without|was not|wasn't)\b[^.?!]{0,24}\b(trying to pee|straining to pee)\b/.test(
          lower
        )) &&
        hasUrinaryLowOutputCue) ||
      /\b(only dribbles|no urine)\b/.test(lower)) ||
      (hasUrinaryBlockageAttemptCue &&
        /\b(almost no urine|nothing has come out|nothing comes out|no urine|only a few drops|few drops|barely anything)\b/.test(
          lower
        )))
  ) {
    flags.add("urinary_blockage");
  }

  return [...flags];
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
