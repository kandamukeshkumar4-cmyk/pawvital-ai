import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import {
  isNvidiaConfigured,
  extractWithQwen,
  phraseWithKimi,
  diagnoseWithDeepSeek,
  verifyWithGLM,
  runVisionPipeline,
  parseVisionForMatrix,
  imageGuardrail,
} from "@/lib/nvidia-models";
import {
  createSession,
  addSymptoms,
  recordAnswer,
  getNextQuestion,
  getMissingQuestions,
  getQuestionText,
  getExtractionSchema,
  isReadyForDiagnosis,
  buildDiagnosisContext,
  type TriageSession,
  type PetProfile,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS } from "@/lib/clinical-matrix";
import {
  evaluateImageGate,
  shouldAnalyzeWoundImage,
  type ImageGateWarning,
  type ImageMeta,
} from "@/lib/image-gate";
import {
  detectBreedWithNyckel,
  fetchBreedProfile,
  getEffectivePetProfile,
  isLikelyDogContext,
  runRoboflowSkinWorkflow,
  shouldUseImageInferredBreed,
} from "@/lib/pet-enrichment";
import {
  buildReferenceImageQuery,
  buildKnowledgeSearchQuery,
  formatReferenceImageContext,
  formatKnowledgeContext,
  searchReferenceImages,
  searchKnowledgeChunks,
} from "@/lib/knowledge-retrieval";
import {
  symptomChatLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";

// =============================================================================
// HYBRID STATE MACHINE API — 4-Model NVIDIA NIM Pipeline
//
// Pipeline:
//   Qwen 3.5 122B    → Data extraction (structured JSON from user text)
//   Clinical Matrix   → All medical logic (pure code, deterministic)
//   Kimi K2.5         → Question phrasing (warm, empathetic)
//   Nemotron Ultra    → Diagnosis report (deep clinical reasoning)
//   GLM-5             → Safety verification (catch missed emergencies)
//
// Claude serves as fallback if any NVIDIA model fails.
// =============================================================================

// Detect which engine to use
const useNvidia = isNvidiaConfigured();

interface RequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  pet: PetProfile;
  action: "chat" | "generate_report";
  session?: TriageSession;
  image?: string; // base64 image data (with or without data URL prefix)
  imageMeta?: ImageMeta;
  gateOverride?: boolean;
}

interface PersistablePetProfile extends PetProfile {
  id?: string;
}

export async function POST(request: Request) {
  try {
    // ── Rate limiting ─────────────────────────────────────────────────────
    const rlResult = await checkRateLimit(
      symptomChatLimiter,
      getRateLimitId(request)
    );
    if (!rlResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rlResult.reset - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    const body: RequestBody = await request.json();
    const {
      messages,
      pet,
      action,
      session: clientSession,
      image,
      imageMeta,
      gateOverride,
    } = body;

    // Demo mode fallback
    if (!isAnthropicConfigured && !useNvidia) {
      return demoResponse(action, pet);
    }

    let session = clientSession || createSession();
    let effectivePet = getEffectivePetProfile(pet, session);
    const imageHash = image ? hashImage(image) : null;

    if (imageHash && session.last_uploaded_image_hash !== imageHash) {
      resetImageStateForNewUpload(session);
      session.last_uploaded_image_hash = imageHash;
      effectivePet = getEffectivePetProfile(pet, session);
    }

    if (action === "generate_report") {
      return await generateReport(session, effectivePet, messages);
    }

    const lastUserMessage = messages.filter((m) => m.role === "user").pop();
    if (!lastUserMessage) {
      return NextResponse.json({
        type: "question",
        message: "Tell me what's going on with your pet.",
        session,
        ready_for_report: false,
      });
    }

    const fastPathExtraction = getDeterministicFastPathExtraction(
      session,
      lastUserMessage.content
    );
    const deferImageDrivenWoundAnalysis = shouldDeferImageDrivenWoundAnalysis(
      session,
      Boolean(image),
      fastPathExtraction
    );

    // ═══════════════════════════════════════════════════════════════════
    // STEP 0 (optional): VISION — Llama 4 Maverick image analysis
    // Enhanced: breed-aware prompting + auto-extract symptoms/red flags
    // ═══════════════════════════════════════════════════════════════════
    let visionAnalysis: string | null = null;
    let visionSymptoms: string[] = [];
    let visionRedFlags: string[] = [];
    let visionSeverity: "normal" | "needs_review" | "urgent" = "needs_review";
    let roboflowSkinSuggested = false;

    if (image && isLikelyDogContext(effectivePet)) {
      if (session.image_enrichment_hash !== imageHash) {
        const [breedDetection, skinFlag] = await Promise.all([
          detectBreedWithNyckel(image, effectivePet),
          runRoboflowSkinWorkflow(image, effectivePet),
        ]);

        if (breedDetection) {
          session.image_inferred_breed = breedDetection.breed;
          session.image_inferred_breed_confidence = Number(
            breedDetection.confidence.toFixed(3)
          );
          if (shouldUseImageInferredBreed(effectivePet, breedDetection)) {
            session.effective_breed = breedDetection.breed;
          }
        }

        if (skinFlag) {
          session.roboflow_skin_summary = skinFlag.summary;
          session.roboflow_skin_labels = skinFlag.labels;
          roboflowSkinSuggested = skinFlag.positive;
        }

        session.image_enrichment_hash = imageHash || undefined;
      } else {
        roboflowSkinSuggested = Boolean(session.roboflow_skin_labels?.length);
        console.log("[Image Enrichment] Cache hit for Nyckel/Roboflow signals");
      }

      effectivePet = getEffectivePetProfile(pet, session);
    }

    const shouldRunWoundVision = image
      ? shouldAnalyzeWoundImage(lastUserMessage.content, session) ||
        (!deferImageDrivenWoundAnalysis &&
          (roboflowSkinSuggested || isGenericImagePrompt(lastUserMessage.content)))
      : false;

    if (image && shouldRunWoundVision && gateOverride !== true) {
      const gateCacheKey = buildGateCacheKey(imageHash || "", imageMeta);
      const gateWarning =
        session.gate_cache_key === gateCacheKey
          ? readCachedGateWarning(session)
          : await evaluateAndCacheGate(session, gateCacheKey, image, imageMeta);
      if (gateWarning) {
        console.log(
          `[Image Gate] warning=${gateWarning.reason}, label=${gateWarning.topLabel || "n/a"}`
        );
        return NextResponse.json({
          type: "image_gate",
          message: buildImageGateMessage(pet.name, gateWarning),
          session,
          gate: gateWarning,
          ready_for_report: false,
        });
      }
    }

    if (image && shouldRunWoundVision) {
      if (gateOverride === true) {
        console.log("[Image Gate] Override accepted, continuing to vision pipeline");
      }
      try {
        const visionCacheKey = buildVisionCacheKey(
          imageHash || "",
          lastUserMessage.content,
          effectivePet
        );

        if (session.vision_cache_key === visionCacheKey && session.vision_analysis) {
          visionAnalysis = session.vision_analysis;
          visionSeverity = session.vision_severity || "needs_review";
          visionSymptoms = [...(session.vision_symptoms || [])];
          visionRedFlags = [...(session.vision_red_flags || [])];
          console.log("[Vision Pipeline] Cache hit for repeated image/context");
        } else {
        // Run 3-tier vision pipeline (auto-routes through tiers based on severity)
        const visionResult = await runVisionPipeline(
          image,
          lastUserMessage.content,
          {
            breed: effectivePet.breed,
            age_years: effectivePet.age_years,
            weight: effectivePet.weight,
          }
        );
        visionAnalysis = visionResult.combined;
        visionSeverity = visionResult.severity;

        console.log(`[Engine] Vision Pipeline: tiers=${visionResult.tiersUsed.join("→")}, wound=${visionResult.woundDetected}, severity=${visionSeverity}`);
        console.log("[Engine] Vision output:", visionResult.tier1_fast.substring(0, 400));

        // Parse vision results into clinical matrix data
        const visionData = parseVisionForMatrix(visionResult.tier1_fast);
        visionSymptoms = visionData.symptoms;
        visionRedFlags = visionData.redFlags;

        // If Tier 2/3 detected additional red flags, merge them
        if (visionResult.tier2_detailed) {
          const tier2Data = parseVisionForMatrix(visionResult.tier2_detailed);
          for (const s of tier2Data.symptoms) {
            if (!visionSymptoms.includes(s)) visionSymptoms.push(s);
          }
          for (const f of tier2Data.redFlags) {
            if (!visionRedFlags.includes(f)) visionRedFlags.push(f);
          }
          // Tier 2 severity can escalate
          if (tier2Data.severityClass === "urgent") visionSeverity = "urgent";
        }

        console.log(`[Engine] Vision → Matrix: symptoms=${visionSymptoms.join(",")}, redFlags=${visionRedFlags.join(",")}, severity=${visionSeverity}`);

        // ── Stage 5: Hardcoded Visual Red Flag Guardrails ──
        // Override everything if critical wound signs detected
        try {
          let tier1Json = visionResult.tier1_fast;
          const match = tier1Json.match(/\{[\s\S]*\}/);
          if (match) tier1Json = match[0];
          const tier1Data = JSON.parse(tier1Json);
          const guardrail = imageGuardrail(tier1Data);

          if (guardrail.triggered) {
            console.log(`[Engine] GUARDRAIL TRIGGERED: ${guardrail.flags.join("; ")}`);

            // Inject guardrail red flags into session
            for (const flag of guardrail.flags) {
              const shortFlag = flag.split("→")[0].trim().toLowerCase().replace(/\s+/g, "_");
              if (!visionRedFlags.includes(shortFlag)) {
                visionRedFlags.push(shortFlag);
              }
            }

            // If ER_NOW, immediately return emergency response
            if (guardrail.blockFurtherAnalysis) {
              // Still inject symptoms/flags into session for report generation
              session.vision_cache_key = visionCacheKey;
              if (visionSymptoms.length > 0) session = addSymptoms(session, visionSymptoms);
              for (const flag of visionRedFlags) {
                if (!session.red_flags_triggered.includes(flag)) {
                  session.red_flags_triggered.push(flag);
                }
              }
              if (visionAnalysis) {
                session.vision_analysis = visionAnalysis;
              }
              session.vision_severity = visionSeverity;
              session.vision_symptoms = [...visionSymptoms];
              session.vision_red_flags = [...visionRedFlags];

              return NextResponse.json({
                type: "emergency",
                message: `Based on my analysis of ${pet.name}'s photo, I've detected signs that require IMMEDIATE veterinary attention:\n\n${guardrail.flags.map(f => `• ${f}`).join("\n")}\n\nPlease take ${pet.name} to the nearest emergency veterinary hospital NOW. Do not wait. Call ahead so they can prepare. I can generate a full report for the vet while you're on the way.`,
                session,
                ready_for_report: true,
              });
            }
          }
        } catch (guardrailErr) {
          console.error("[Engine] Guardrail parsing failed (non-blocking):", guardrailErr);
        }
          session.vision_cache_key = visionCacheKey;
          session.vision_analysis = visionAnalysis;
          session.vision_severity = visionSeverity;
          session.vision_symptoms = [...visionSymptoms];
          session.vision_red_flags = [...visionRedFlags];
        }
      } catch (visionError) {
        console.error("Vision pipeline failed (non-blocking):", visionError);
      }
    } else if (image) {
      console.log("[Image Gate] Skipping wound-only image analysis for non-wound flow");
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: EXTRACT structured data — Qwen 3.5 122B (Claude fallback)
    // ═══════════════════════════════════════════════════════════════════
    const extractionSchema = getExtractionSchema(session);
    const compactImageSignals = buildCompactImageSignalContext(
      session,
      visionSymptoms,
      visionRedFlags,
      visionSeverity
    );
    const extracted =
      fastPathExtraction ||
      (await extractDataFromMessage(
        lastUserMessage.content,
        session,
        effectivePet,
        extractionSchema,
        compactImageSignals
      ));

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Update Internal State (pure code, NO LLM)
    // ═══════════════════════════════════════════════════════════════════

    // 2a: Inject vision-detected symptoms FIRST (image is ground truth)
    if (visionSymptoms.length > 0) {
      session = addSymptoms(session, visionSymptoms);
      console.log(`[Engine] Vision injected symptoms: ${visionSymptoms.join(", ")}`);
    }

    // 2b: Inject vision-detected red flags
    if (visionRedFlags.length > 0) {
      for (const flag of visionRedFlags) {
        if (!session.red_flags_triggered.includes(flag)) {
          session.red_flags_triggered.push(flag);
        }
      }
      console.log(`[Engine] Vision injected red flags: ${visionRedFlags.join(", ")}`);
    }

    // 2c: Store vision severity classification
    if (image && visionSeverity === "urgent") {
      session.vision_severity = "urgent";
    }

    // 2d: LLM-extracted symptoms
    if (extracted.symptoms && extracted.symptoms.length > 0) {
      session = addSymptoms(session, extracted.symptoms);
    }

    for (const [key, value] of Object.entries(extracted.answers || {})) {
      if (value !== null && value !== undefined && value !== "") {
        session = recordAnswer(session, key, value);
      }
    }

    // ── Fix: Handle negative/null answers so questions don't loop ──
    // If the session had a pending question and extraction didn't capture
    // the answer (e.g. user said "no", "nothing", "I don't know"), force-
    // record the user's raw text so the question is marked answered.
    const pendingQ = session.last_question_asked;
    if (
      pendingQ &&
      !session.answered_questions.includes(pendingQ)
    ) {
      // The user responded but extraction returned null — record raw text
      const coercedAnswer = coerceAnswerForQuestion(
        pendingQ,
        lastUserMessage.content
      );
      if (coercedAnswer !== null) {
        session = recordAnswer(session, pendingQ, coercedAnswer);
        console.log(
          `[Engine] Force-recorded answer for "${pendingQ}" (extraction missed direct answer)`
        );
      }
    }

    // Store vision analysis in session so it's available for report generation
    if (visionAnalysis) {
      session.vision_analysis = visionAnalysis;
    }

    if (image && shouldRunWoundVision && session.known_symptoms.length === 0) {
      session = addSymptoms(session, ["wound_skin_issue"]);
      console.log(
        "[Engine] Seeded wound_skin_issue from image-led wound flow fallback"
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Check red flags — EMERGENCY OVERRIDE (pure code)
    // ═══════════════════════════════════════════════════════════════════
    if (session.red_flags_triggered.length > 0) {
      const flags = session.red_flags_triggered.join(", ");
      return NextResponse.json({
        type: "emergency",
        message: `I've detected potential emergency signs (${flags}). This could be life-threatening. Please take ${pet.name} to the nearest emergency veterinary hospital IMMEDIATELY. Do not wait. Call ahead so they can prepare. I can still generate a full analysis while you're on the way.`,
        session,
        ready_for_report: true,
      });
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Query Clinical Matrix (pure deterministic code)
    // ═══════════════════════════════════════════════════════════════════
    const ready = isReadyForDiagnosis(session);

    if (ready) {
      return NextResponse.json({
        type: "ready",
        message:
          "I have enough clinical information to generate a comprehensive analysis. Preparing your veterinary report now.",
        session,
        ready_for_report: true,
      });
    }

    const nextQuestionId = getNextQuestionAvoidingRepeat(session);

    if (!nextQuestionId) {
      if (session.known_symptoms.length === 0) {
        return NextResponse.json({
          type: "question",
          message: image
            ? `I can see the photo, but I still need a little more context to triage ${pet.name} safely. What worries you most about this area, and when did you first notice it?`
            : `I need a little more detail before I can triage ${pet.name} safely. What symptom or change worries you most right now, and when did it start?`,
          session,
          ready_for_report: false,
        });
      }

      return NextResponse.json({
        type: "ready",
        message:
          "I have enough information. Let me generate your full veterinary report.",
        session,
        ready_for_report: true,
      });
    }

    // Track which question we're asking so we can detect unanswered loops
    session.last_question_asked = nextQuestionId;

    // ═══════════════════════════════════════════════════════════════════
    // STEP 5: PHRASE question — Kimi K2.5 (Claude fallback)
    // ═══════════════════════════════════════════════════════════════════
    const questionText = getQuestionText(nextQuestionId);
    const phrasingContext = shouldIncludeImageContextInQuestion(
      nextQuestionId,
      session,
      deferImageDrivenWoundAnalysis
    )
      ? buildQuestionPhrasingContext(session, visionSeverity)
      : null;
    const phrasedQuestion = await phraseQuestion(
      questionText,
      nextQuestionId,
      session,
      effectivePet,
      phrasingContext
    );

    return NextResponse.json({
      type: "question",
      message: phrasedQuestion,
      session,
      ready_for_report: session.answered_questions.length >= 3,
    });
  } catch (error) {
    console.error("Symptom chat error:", error);
    return NextResponse.json(
      {
        type: "error",
        message:
          "I encountered an issue. Please try again, or contact your veterinarian directly if this is urgent.",
      },
      { status: 200 }
    );
  }
}

// =============================================================================
// STEP 1: Data Extraction — Qwen 3.5 122B → Claude fallback
// =============================================================================

async function extractDataFromMessage(
  message: string,
  session: TriageSession,
  pet: PetProfile,
  schema: Record<string, string>,
  compactImageSignals?: string
): Promise<{
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
}> {
  const schemaDescription = Object.entries(schema)
    .map(([key, hint]) => `  "${key}": ${hint}`)
    .join("\n");

  const prompt = `You are a data extraction engine. Extract structured medical data from a pet owner's message.

Pet: ${pet.name}, ${pet.breed}, ${pet.age_years} years old, ${pet.weight} lbs

Already known symptoms: ${session.known_symptoms.join(", ") || "none yet"}
Already answered: ${session.answered_questions.join(", ") || "none yet"}

OWNER'S MESSAGE: "${message}"
${compactImageSignals ? `\nIMAGE SIGNALS:\n${compactImageSignals}` : ""}

EXTRACT the following data. For each field, extract ONLY if the owner clearly mentioned it. Use null if not mentioned.

Fields to extract:
  "symptoms": Array of symptom keywords from this list: limping, vomiting, not_eating, diarrhea, lethargy, coughing, difficulty_breathing, excessive_scratching, drinking_more, trembling, swollen_abdomen, blood_in_stool, eye_discharge, ear_scratching, weight_loss, wound_skin_issue. Use "wound_skin_issue" for ANY wound, cut, laceration, bite, abscess, hot spot, skin lesion, lump, bump, mass, rash, bleeding, swelling, redness, or infection. Include ONLY symptoms the owner actually described or that are visible in attached visual analysis.
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

Output ONLY the JSON object. No explanation, no thinking, no markdown.`;

  try {
    let rawText: string;

    if (useNvidia) {
      // PRIMARY: Qwen 3.5 122B — fast, accurate structured extraction
      rawText = await extractWithQwen(prompt);
      console.log("[Engine] Extraction: Qwen 3.5 122B");
    } else if (isAnthropicConfigured) {
      // FALLBACK: Claude Sonnet
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const content = response.content[0];
      if (content.type !== "text") throw new Error("Unexpected response type");
      rawText = content.text;
      console.log("[Engine] Extraction: Claude Sonnet (fallback)");
    } else {
      throw new Error("No extraction model configured");
    }

    return parseExtractionResponse(rawText);
  } catch (error) {
    console.error("Primary extraction failed:", error);

    // If Qwen failed, try Claude as fallback
    if (isAnthropicConfigured) {
      try {
        console.log("[Engine] Extraction fallback: Claude Sonnet");
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });
        const content = response.content[0];
        if (content.type !== "text") throw new Error("Unexpected response type");
        return parseExtractionResponse(content.text);
      } catch (fallbackError) {
        console.error("Claude fallback also failed:", fallbackError);
      }
    }

    // Last resort: keyword extraction
    return { symptoms: extractSymptomsFromKeywords(message), answers: {} };
  }
}

function parseExtractionResponse(rawText: string): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
} {
  let jsonText = rawText.trim();

  // Strip thinking tags (Qwen/Kimi wrap reasoning in <think>...</think>)
  jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip markdown code blocks
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  // Find the JSON object if there's extra text
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  const parsed = JSON.parse(jsonText);

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

function extractSymptomsFromKeywords(message: string): string[] {
  const lower = message.toLowerCase();
  const symptoms: string[] = [];
  const keywords: Record<string, string> = {
    limp: "limping",
    vomit: "vomiting",
    "not eating": "not_eating",
    "won't eat": "not_eating",
    diarrhea: "diarrhea",
    letharg: "lethargy",
    cough: "coughing",
    "can't breathe": "difficulty_breathing",
    scratch: "excessive_scratching",
    itch: "excessive_scratching",
    "drinking more": "drinking_more",
    trembl: "trembling",
    shak: "trembling",
    bloat: "swollen_abdomen",
    "blood in stool": "blood_in_stool",
    "eye discharge": "eye_discharge",
    "ear scratch": "ear_scratching",
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

// =============================================================================
// STEP 5: Question Phrasing — Kimi K2.5 → Claude fallback
// =============================================================================

async function phraseQuestion(
  questionText: string,
  questionId: string,
  session: TriageSession,
  pet: PetProfile,
  phrasingContext?: string | null
): Promise<string> {
  const qDef = FOLLOW_UP_QUESTIONS[questionId];

  const prompt = `You are PawVital, a warm and empathetic AI veterinary triage assistant.

Pet: ${pet.name}, a ${pet.age_years}-year-old ${pet.breed} (${pet.weight} lbs)
Symptoms so far: ${session.known_symptoms.join(", ")}
Questions already asked: ${session.answered_questions.length}
${phrasingContext ? `IMAGE CONTEXT: ${phrasingContext}\n` : ""}
The clinical system has determined that the next piece of information needed is:
"${questionText}"
(Internal ID: ${questionId}, Type: ${qDef?.data_type || "string"})

Your job: Ask this ONE question in a natural, caring way. Rules:
- Start with a brief 1-sentence acknowledgment of what the owner just shared (empathetic but professional)${phrasingContext ? "\n- If helpful, briefly reference the photo context in plain language" : ""}
- Then ask EXACTLY ONE focused question to get the needed information
- Keep total response under 3 sentences
- Use the pet's name (${pet.name})
- If relevant, mention breed-specific context (e.g., "Given that ${pet.name} is a ${pet.breed}...")
- Ignore photo details unless they directly help you ask this exact next question
- NEVER mention scores, probabilities, clinical IDs, or that you're an AI
- NEVER list multiple possible conditions
- NEVER say there is confusion about the animal type, species, or breed in the photo
- NEVER speculate about whether the image shows a dog, cat, or another animal unless the owner directly asked that question
- Sound like a concerned vet taking history, not a chatbot
- ALWAYS use correct canine anatomy terms: "front leg" not "arm/forearm", "hind leg" not "leg", "paw" not "hand/foot", "muzzle" not "face", "stifle" not "knee", "carpus" not "wrist", "hock" not "ankle". Dogs do NOT have arms, forearms, hands, feet, fingers, or toes.

Respond with ONLY your message. No JSON, no formatting, no thinking tags.`;

  try {
    let response: string;

    if (useNvidia) {
      // PRIMARY: Kimi K2.5 — warm, empathetic language
      response = await phraseWithKimi(prompt);
      console.log("[Engine] Phrasing: Kimi K2.5");
    } else {
      // FALLBACK: Claude
      const claudeRes = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });
      const content = claudeRes.content[0];
      if (content.type !== "text") throw new Error("Unexpected response type");
      response = content.text;
      console.log("[Engine] Phrasing: Claude (fallback)");
    }

    // Strip thinking tags from response
    response = response.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return response;
  } catch (error) {
    console.error("Phrasing failed:", error);

    // Try Claude fallback if NVIDIA failed
    if (useNvidia && isAnthropicConfigured) {
      try {
        console.log("[Engine] Phrasing fallback: Claude");
        const claudeRes = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        });
        const content = claudeRes.content[0];
        if (content.type !== "text")
          throw new Error("Unexpected response type");
        return content.text.trim();
      } catch {
        // Final fallback
      }
    }

    return `I appreciate you sharing that about ${pet.name}. ${questionText}`;
  }
}

// =============================================================================
// STEP 6: Diagnosis Report — Nemotron Ultra 253B (reasoning) + GLM-5 (safety)
// =============================================================================

// ── Server-side Supabase save (uses service role to bypass RLS) ──
async function saveReportToDB(
  session: TriageSession,
  pet: PetProfile,
  report: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your_supabase")) return;

  const supabase = createSupabaseClient(url, serviceKey);

  const urgency = (report.urgency_level as string) || "low";
  const severityMap: Record<string, string> = {
    emergency: "emergency", high: "high", moderate: "medium", low: "low",
  };
  const recMap: Record<string, string> = {
    emergency: "emergency_vet", high: "vet_24h", moderate: "vet_48h", low: "monitor",
  };

  const symptoms = session.known_symptoms.join(", ") || "unknown";
  const aiResponse = JSON.stringify(report);

  // If pet has a real DB id (uuid format), save to symptom_checks
  const petId = (pet as PersistablePetProfile).id;
  if (!petId || petId === "demo") return;

  await supabase.from("symptom_checks").insert({
    pet_id: petId,
    symptoms,
    ai_response: aiResponse,
    severity: severityMap[urgency] || "low",
    recommendation: recMap[urgency] || "monitor",
  });
  console.log("[DB] Triage session saved to symptom_checks");
}

async function generateReport(
  session: TriageSession,
  pet: PetProfile,
  messages: { role: string; content: string }[]
) {
  if (
    isLikelyDogContext(pet) &&
    pet.breed &&
    (!session.breed_profile_summary || session.breed_profile_name !== pet.breed)
  ) {
    try {
      const breedProfile = await fetchBreedProfile(pet.breed, pet);
      if (breedProfile) {
        session.breed_profile_name = breedProfile.breed;
        session.breed_profile_summary = breedProfile.summary;
      }
    } catch (error) {
      console.error("[Report] Deferred breed profile fetch failed:", error);
    }
  }

  const context = buildDiagnosisContext(session, pet);
  const knowledgeQuery = buildKnowledgeSearchQuery(
    session,
    pet,
    context.top5.map((d) => d.medical_term)
  );
  const referenceImageQuery = buildReferenceImageQuery(
    session,
    pet,
    context.top5.map((d) => d.medical_term)
  );
  const knowledgeChunks = await searchKnowledgeChunks(knowledgeQuery, 3);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);
  const referenceImageMatches = await searchReferenceImages(
    referenceImageQuery,
    4
  );
  const referenceImageContext = formatReferenceImageContext(referenceImageMatches);

  const top5Formatted = context.top5
    .map(
      (d, i) =>
        `${i + 1}. ${d.medical_term} (score: ${d.final_score.toFixed(3)}, breed×${d.breed_multiplier}, age×${d.age_multiplier}, urgency: ${d.urgency})\n   Key differentiators: ${d.key_differentiators.join("; ")}\n   Typical tests: ${d.typical_tests.join("; ")}`
    )
    .join("\n\n");

  const conversationSummary = messages
    .slice(-10)
    .map(
      (m) => `${m.role === "user" ? "Owner" : "Triage AI"}: ${m.content}`
    )
    .join("\n");

  const urgencyToSeverity: Record<string, string> = {
    emergency: "emergency",
    high: "high",
    moderate: "medium",
    low: "low",
  };
  const urgencyToRecommendation: Record<string, string> = {
    emergency: "emergency_vet",
    high: "vet_24h",
    moderate: "vet_48h",
    low: "monitor",
  };

  const reportPrompt = `You are a board-certified veterinary internist (DACVIM) with 15+ years of clinical experience writing a detailed clinical report.

IMPORTANT — USE CORRECT CANINE ANATOMY: "front leg/forelimb" (NOT arm/forearm), "hind leg" (NOT leg), "paw" (NOT hand/foot), "digits" (NOT fingers/toes), "carpus" (NOT wrist), "hock/tarsus" (NOT ankle), "stifle" (NOT knee), "muzzle" (NOT face). Dogs do not have human body parts.

PATIENT: ${pet.name}, ${pet.age_years}yr ${pet.breed}, ${pet.weight} lbs
Known conditions: ${pet.existing_conditions?.join(", ") || "None"}
Current medications: ${pet.medications?.join(", ") || "None"}

TRIAGE CONVERSATION:
${conversationSummary}

CLINICAL MATRIX CALCULATIONS (pre-calculated disease probabilities — use as your ranking):
${top5Formatted}

BREED RISK PROFILE: ${context.breed_risk_summary}
BODY SYSTEMS INVOLVED: ${context.body_systems.join(", ")}
RED FLAGS: ${context.red_flags.length > 0 ? context.red_flags.join(", ") : "None"}
MATRIX-DETERMINED URGENCY: ${context.highest_urgency}
${session.image_inferred_breed ? `IMAGE-INFERRED BREED SIGNAL: ${session.image_inferred_breed} (${Math.round((session.image_inferred_breed_confidence || 0) * 100)}% confidence)\n` : ""}${session.breed_profile_summary ? `EXTERNAL BREED PROFILE: ${session.breed_profile_summary}\n` : ""}${session.roboflow_skin_summary ? `ROBOFLOW SKIN FLAG: ${session.roboflow_skin_summary}\n` : ""}${knowledgeContext ? `EXTERNAL KNOWLEDGE RETRIEVAL (trusted public corpus; use to support, not replace, the matrix ranking):\n${knowledgeContext}\n` : ""}
${referenceImageContext ? `REFERENCE IMAGE RETRIEVAL (similar corpus cases; use as supportive visual context, not a diagnosis by itself):\n${referenceImageContext}\n` : ""}

${session.vision_analysis ? `VISUAL ANALYSIS FROM PET PHOTO (analyzed by the NVIDIA 11B/90B vision stack):\n${session.vision_analysis}\n\nIMPORTANT: Incorporate the visual findings above into your differential diagnoses and clinical notes. Reference what was observed in the image (e.g., wound characteristics, skin condition, eye appearance). The visual analysis should heavily influence your report.\n` : ""}
EXTRACTED CLINICAL DATA:
${context.answer_summary}

YOUR TASK: Write the clinical report using the matrix's disease ranking as your primary guide. Do NOT reorder the differentials unless you have strong clinical reasoning to do so. The matrix has already applied breed multipliers, age factors, and symptom-specific modifiers.

For each differential diagnosis, provide:
- Specific breed prevalence data (e.g., "Golden Retrievers have 2.2x higher incidence of hip dysplasia")
- Age-specific risk context
- How the owner-reported symptoms specifically map to this condition
- Expected disease progression if untreated

For recommended tests, be SPECIFIC:
- Name exact diagnostic procedures (e.g., "Orthogonal radiographs of the stifle — lateral and craniocaudal views" not just "X-ray")
- Explain what each test confirms or rules out

Output ONLY valid JSON (no markdown, no code blocks, no thinking):
{
  "severity": "${urgencyToSeverity[context.highest_urgency] || "medium"}",
  "recommendation": "${urgencyToRecommendation[context.highest_urgency] || "vet_48h"}",
  "title": "Specific clinical title based on top differential",
  "explanation": "4-6 sentences for pet parent. Reference breed-specific data from the matrix. Use medical terms with plain-English parenthetical explanations.",
  "differential_diagnoses": [
    {
      "condition": "Use the medical_term from the matrix calculation",
      "likelihood": "high" | "moderate" | "low",
      "description": "2-3 sentences: clinical reasoning using the matrix's breed multiplier and key differentiators. Mention specific prevalence data."
    }
  ],
  "clinical_notes": "Technical paragraph for veterinary colleague. Reference the matrix's probability scores, breed multipliers, and body systems.",
  "recommended_tests": [
    {
      "test": "Use the typical_tests from the matrix data",
      "reason": "What it confirms/rules out for which differential",
      "urgency": "stat" | "urgent" | "routine"
    }
  ],
  "home_care": [
    {
      "instruction": "Specific measurable instruction",
      "duration": "Timeframe",
      "details": "Include normal vs abnormal values"
    }
  ],
  "actions": ["5-7 specific steps"],
  "warning_signs": ["4-6 escalation signs with thresholds"],
  "vet_questions": ["3-5 questions tailored to top differentials"]
}`;

  try {
    let rawReport: string;

    if (useNvidia) {
      // PRIMARY: Nemotron Ultra 253B — NVIDIA's most powerful for clinical reasoning
      rawReport = await diagnoseWithDeepSeek(reportPrompt);
      console.log("[Engine] Diagnosis: Nemotron Ultra 253B");
    } else {
      // FALLBACK: Claude
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: reportPrompt }],
      });
      const content = response.content[0];
      if (content.type !== "text") throw new Error("Unexpected response type");
      rawReport = content.text;
      console.log("[Engine] Diagnosis: Claude (fallback)");
    }

    const report = parseReportJSON(rawReport);

    // ═══════════════════════════════════════════════════════════════════
    // SAFETY LAYER: GLM-5 reviews the report for missed emergencies
    // ═══════════════════════════════════════════════════════════════════
    let finalReport = report;
    if (useNvidia) {
      try {
        finalReport = await safetyVerify(report, pet, context);
        console.log("[Engine] Safety: GLM-5 verified");
      } catch (safetyError) {
        console.error("Safety verification failed (non-blocking):", safetyError);
      }
    }

    // ── Save to Supabase (non-blocking) ──
    saveReportToDB(session, pet, finalReport).catch((e) =>
      console.error("[DB] Failed to save triage session:", e)
    );

    return NextResponse.json({ type: "report", report: finalReport });
  } catch (error) {
    console.error("Report generation failed:", error);

    // Try Claude as fallback if DeepSeek failed
    if (useNvidia && isAnthropicConfigured) {
      try {
        console.log("[Engine] Diagnosis fallback: Claude");
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: reportPrompt }],
        });
        const content = response.content[0];
        if (content.type !== "text")
          throw new Error("Unexpected response type");
        const report = parseReportJSON(content.text);
        return NextResponse.json({ type: "report", report });
      } catch (fallbackError) {
        console.error("Claude fallback also failed:", fallbackError);
      }
    }

    throw error;
  }
}

function parseReportJSON(rawText: string): Record<string, unknown> {
  let jsonText = rawText.trim();

  // Strip thinking tags
  jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip markdown code blocks
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  // Find JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  return JSON.parse(jsonText);
}

// =============================================================================
// SAFETY VERIFICATION: GLM-5 reviews the final report
// =============================================================================

async function safetyVerify(
  report: Record<string, unknown>,
  pet: PetProfile,
  context: ReturnType<typeof buildDiagnosisContext>
): Promise<Record<string, unknown>> {
  const safetyPrompt = `You are a veterinary safety review system. Your ONLY job is to check a diagnosis report for dangerous oversights.

PATIENT: ${pet.name}, ${pet.age_years}yr ${pet.breed}, ${pet.weight} lbs
MATRIX URGENCY: ${context.highest_urgency}
RED FLAGS DETECTED: ${context.red_flags.length > 0 ? context.red_flags.join(", ") : "None"}

REPORT TO REVIEW:
${JSON.stringify(report, null, 2)}

CHECK FOR:
1. MISSED EMERGENCIES: Could any symptom combination indicate a life-threatening condition (GDV, toxin ingestion, internal bleeding, respiratory failure) that wasn't listed?
2. SEVERITY UNDERESTIMATION: Should the severity be higher given the symptoms + breed + age?
3. DANGEROUS HOME CARE: Any home care advice that could be harmful (e.g., suggesting NSAID use without vet supervision)?
4. MISSING CRITICAL WARNINGS: Warning signs that should be listed but aren't?

Output ONLY valid JSON (no thinking, no markdown):
{
  "safe": true/false,
  "corrections": {
    "severity": null or "emergency"/"high"/"medium"/"low" if it should be changed,
    "recommendation": null or corrected value,
    "add_warning_signs": ["any additional warning signs to add"],
    "add_to_explanation": null or "additional text to append to the explanation",
    "safety_note": null or "critical safety note to add to clinical_notes"
  },
  "reasoning": "Brief explanation of why changes were needed, or 'Report is clinically sound' if no changes"
}`;

  const rawResponse = await verifyWithGLM(safetyPrompt);

  let jsonText = rawResponse.trim();
  jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonText = jsonMatch[0];
  }

  const safety = JSON.parse(jsonText);

  // Apply corrections if needed
  if (!safety.safe && safety.corrections) {
    const c = safety.corrections;

    if (c.severity) {
      report.severity = c.severity;
    }
    if (c.recommendation) {
      report.recommendation = c.recommendation;
    }
    if (c.add_warning_signs && Array.isArray(c.add_warning_signs) && c.add_warning_signs.length > 0) {
      const existing = (report.warning_signs as string[]) || [];
      report.warning_signs = [...existing, ...c.add_warning_signs];
    }
    if (c.add_to_explanation && typeof report.explanation === "string") {
      report.explanation = report.explanation + " " + c.add_to_explanation;
    }
    if (c.safety_note && typeof report.clinical_notes === "string") {
      report.clinical_notes =
        report.clinical_notes +
        "\n\nSAFETY REVIEW: " +
        c.safety_note;
    }

    console.log("[Safety] GLM-5 applied corrections:", safety.reasoning);
  } else {
    console.log("[Safety] GLM-5: Report is clinically sound");
  }

  return report;
}

function getNextQuestionAvoidingRepeat(session: TriageSession): string | null {
  const nextQuestionId = getNextQuestion(session);
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

function coerceAnswerForQuestion(
  questionId: string,
  rawMessage: string
): string | boolean | number | null {
  const question = FOLLOW_UP_QUESTIONS[questionId];
  const message = rawMessage.trim();
  const lower = message.toLowerCase();

  if (!question || !message) return null;

  if (question.data_type === "boolean") {
    if (/(^|\b)(yes|yeah|yep|does|is|has|there is|it is|he is|she is|true)\b/.test(lower)) {
      return true;
    }
    if (/(^|\b)(no|nope|none|not really|doesn't|doesnt|isn't|isnt|hasn't|hasnt|false)\b/.test(lower)) {
      return false;
    }
    return null;
  }

  if (question.data_type === "choice") {
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
      if (lower.includes("blood") || lower.includes("bloody") || lower.includes("bleed")) {
        return "blood";
      }
      if (lower.includes("mixed")) return "mixed";
    }

    if (Array.isArray(question.choices)) {
      const matchedChoice = question.choices.find((choice) =>
        lower.includes(String(choice).toLowerCase()) ||
        lower.includes(String(choice).toLowerCase().replace(/[_-]/g, " "))
      );
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

function buildCompactImageSignalContext(
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
    parts.push(`Skin labels: ${session.roboflow_skin_labels.slice(0, 3).join(", ")}`);
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

function buildQuestionPhrasingContext(
  session: TriageSession,
  visionSeverity?: "normal" | "needs_review" | "urgent"
): string {
  const parts: string[] = [];
  const hasImageSignals =
    Boolean(session.image_inferred_breed) ||
    Boolean(session.roboflow_skin_labels?.length) ||
    Boolean(session.vision_analysis);

  if (session.image_inferred_breed) {
    parts.push(`Breed hint from image: ${session.image_inferred_breed}`);
  }

  if (session.roboflow_skin_labels?.length) {
    parts.push(
      `Photo likely shows a skin-focused issue: ${session.roboflow_skin_labels
        .slice(0, 2)
        .join(", ")}`
    );
  }

  if (hasImageSignals && visionSeverity && visionSeverity !== "normal") {
    parts.push(`Photo triage severity is currently ${visionSeverity}`);
  }

  return parts.join(". ");
}

function shouldDeferImageDrivenWoundAnalysis(
  session: TriageSession,
  hasImage: boolean,
  fastPathExtraction: {
    symptoms: string[];
    answers: Record<string, string | boolean | number>;
  } | null
): boolean {
  if (!hasImage || !fastPathExtraction) {
    return false;
  }

  const pendingQuestionId = session.last_question_asked;
  if (!pendingQuestionId || session.answered_questions.includes(pendingQuestionId)) {
    return false;
  }

  if (pendingQuestionId.startsWith("wound_")) {
    return false;
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      fastPathExtraction.answers,
      pendingQuestionId
    )
  ) {
    return false;
  }

  return !(
    session.known_symptoms.length === 1 &&
    session.known_symptoms[0] === "wound_skin_issue"
  );
}

function shouldIncludeImageContextInQuestion(
  questionId: string,
  session: TriageSession,
  imageTurnWasDeferred: boolean
): boolean {
  if (imageTurnWasDeferred) {
    return false;
  }

  if (questionId.startsWith("wound_")) {
    return true;
  }

  return (
    session.known_symptoms.length === 1 &&
    session.known_symptoms[0] === "wound_skin_issue"
  );
}

function getDeterministicFastPathExtraction(
  session: TriageSession,
  rawMessage: string
): {
  symptoms: string[];
  answers: Record<string, string | boolean | number>;
} | null {
  const pendingQuestionId = session.last_question_asked;
  if (!pendingQuestionId || session.answered_questions.includes(pendingQuestionId)) {
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

function hashImage(image: string): string {
  const payload = image.includes(",") ? image.split(",")[1] : image;
  return createHash("sha1").update(payload).digest("hex").slice(0, 16);
}

function buildGateCacheKey(
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

function buildVisionCacheKey(
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

async function evaluateAndCacheGate(
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

function readCachedGateWarning(
  session: TriageSession
): ImageGateWarning | null {
  if (!session.gate_warning_reason) return null;

  return {
    reason: session.gate_warning_reason,
    topLabel: session.gate_warning_label,
    topScore: session.gate_warning_score,
  };
}

function resetImageStateForNewUpload(session: TriageSession): void {
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

function isGenericImagePrompt(message: string): boolean {
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

// =============================================================================
// DEMO MODE
// =============================================================================

function demoResponse(action: string, pet: PetProfile) {
  if (action === "generate_report") {
    return NextResponse.json({
      type: "report",
      report: {
        severity: "high",
        recommendation: "vet_48h",
        title: "Demo Mode — Configure API Keys",
        explanation: `This is demo mode. Add your NVIDIA NIM API keys or ANTHROPIC_API_KEY to enable the 4-model clinical diagnosis engine for ${pet.name}.`,
        differential_diagnoses: [
          {
            condition: "Demo Mode",
            likelihood: "high",
            description:
              "Configure API keys to unlock: Qwen 3.5 (extraction) → DeepSeek R1 (diagnosis) → GLM-5 (safety verification).",
          },
        ],
        clinical_notes: "Demo mode active.",
        recommended_tests: [
          { test: "CBC", reason: "Baseline", urgency: "routine" },
        ],
        home_care: [
          {
            instruction: "Monitor",
            duration: "24h",
            details: "Track symptoms",
          },
        ],
        actions: ["Configure API keys"],
        warning_signs: ["Any worsening"],
        vet_questions: ["Ask about breed risks"],
      },
    });
  }
  return NextResponse.json({
    type: "question",
    message: `Demo mode. Add API keys for full triage. What's going on with ${pet.name}?`,
    session: createSession(),
    ready_for_report: false,
  });
}

function buildImageGateMessage(
  petName: string,
  gate: ImageGateWarning
): string {
  if (gate.reason === "blurry") {
    return `This photo is a little too blurry for me to reliably analyze ${petName}'s wound or skin issue. Please retake a clear, well-lit close-up of the affected area, or use Analyze Anyway if this is the best photo you have.`;
  }

  if (gate.reason === "low_resolution") {
    return `This photo looks too small or compressed for reliable wound analysis. Please retake a closer, sharper photo that fills most of the frame with the affected area, or use Analyze Anyway if needed.`;
  }

  const labelDetail = gate.topLabel
    ? ` The quick framing check matched "${gate.topLabel}".`
    : "";

  return `This looks more like a full-pet or unrelated photo than a close-up of the affected area.${labelDetail} Please upload a close, well-lit photo of the wound or skin issue, or use Analyze Anyway if this is the only image available.`;
}
