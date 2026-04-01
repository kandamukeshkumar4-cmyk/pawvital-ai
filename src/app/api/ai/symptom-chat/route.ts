import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { anthropic, isAnthropicConfigured } from "@/lib/anthropic";
import {
  isNvidiaConfigured,
  extractWithQwen,
  phraseWithLlama,
  reviewQuestionPlanWithNemotron,
  verifyQuestionWithNemotron,
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
  getSymptomPriorityScore,
} from "@/lib/triage-engine";
import { FOLLOW_UP_QUESTIONS, SYMPTOM_MAP } from "@/lib/clinical-matrix";
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
  searchReferenceImages,
  searchKnowledgeChunks,
} from "@/lib/knowledge-retrieval";
import {
  capDiagnosticConfidence,
  inferSupportedImageDomain,
  type ConsultOpinion,
  type RetrievalBundle,
  type ServiceTimeoutRecord,
  type SupportedImageDomain,
  type VisionClinicalEvidence,
  type VisionPreprocessResult,
} from "@/lib/clinical-evidence";
import { buildStructuredEvidenceChain } from "@/lib/evidence-chain";
import { enqueueAsyncReview } from "@/lib/async-review-client";
import {
  isImageRetrievalConfigured,
  retrieveVeterinaryImageEvidence,
} from "@/lib/image-retrieval-service";
import {
  isTextRetrievalConfigured,
  retrieveVeterinaryTextEvidence,
} from "@/lib/text-retrieval-service";
import {
  consultWithMultimodalSidecar,
  isAbortLikeError as isSidecarAbortError,
  isMultimodalConsultConfigured,
  isRetrievalSidecarConfigured,
  isVisionPreprocessConfigured,
  preprocessVeterinaryImage,
  retrieveVeterinaryEvidenceFromSidecar,
} from "@/lib/hf-sidecars";
import {
  symptomChatLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import {
  buildCaseMemorySnapshot,
  buildDeterministicCaseSummary,
  buildNarrativeSnapshot,
  ensureStructuredCaseMemory,
  getProtectedConversationState,
  mergeCompressionResult,
  recordConversationTelemetry,
  shouldCompressCaseMemory,
  syncStructuredCaseMemoryQuestions,
  type ConversationTelemetryEvent,
  type LoopReasonCode,
  type RecoverySource,
  updateStructuredCaseMemory,
} from "@/lib/symptom-memory";
import {
  compressCaseMemoryWithMiniMax,
  isMiniMaxConfigured,
} from "@/lib/minimax";
import {
  appendShadowComparison,
  appendSidecarObservation,
  buildObservabilitySnapshot,
  describeShadowComparison,
  isShadowModeEnabledForService,
} from "@/lib/sidecar-observability";
import { saveSymptomReportToDB } from "@/lib/report-storage";

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
    const knownSymptomsBeforeTurn = new Set(session.known_symptoms);
    const answerKeysBeforeTurn = new Set(Object.keys(session.extracted_answers));
    let imagePreprocess: VisionPreprocessResult | null = null;
    let visualEvidence: VisionClinicalEvidence | null = null;
    let consultOpinion: ConsultOpinion | null = null;
    const serviceTimeouts: ServiceTimeoutRecord[] = [];
    const ambiguityFlags: string[] = [];

    if (imageHash && session.last_uploaded_image_hash !== imageHash) {
      resetImageStateForNewUpload(session);
      session.last_uploaded_image_hash = imageHash;
      effectivePet = getEffectivePetProfile(pet, session);
    }

    if (action === "generate_report") {
      return await generateReport(
        session,
        effectivePet,
        messages,
        image,
        new URL(request.url).origin
      );
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

    const fallbackImageDomain = image
      ? inferSupportedImageDomain(lastUserMessage.content, session.known_symptoms)
      : "unsupported";

    if (image) {
      const visionPreprocessShadowMode = isShadowModeEnabledForService(
        "vision-preprocess-service"
      );
      if (isVisionPreprocessConfigured()) {
        const startedAt = Date.now();
        try {
          const preprocessedImage = await preprocessVeterinaryImage({
            image,
            ownerText: lastUserMessage.content,
            knownSymptoms: session.known_symptoms,
            breed: effectivePet.breed,
            ageYears: effectivePet.age_years,
            weight: effectivePet.weight,
          });
          session = appendSidecarObservation(session, {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: Date.now() - startedAt,
            outcome: visionPreprocessShadowMode ? "shadow" : "success",
            shadowMode: visionPreprocessShadowMode,
            fallbackUsed: visionPreprocessShadowMode,
            note: `domain=${preprocessedImage.domain}; quality=${preprocessedImage.imageQuality}`,
          });

          if (visionPreprocessShadowMode) {
            session = appendShadowComparison(
              session,
              describeShadowComparison(
                "vision-preprocess-service",
                "fallback-domain-inference",
                "hf-vision-preprocess",
                `Fallback domain=${fallbackImageDomain}; shadow domain=${preprocessedImage.domain}; bodyRegion=${preprocessedImage.bodyRegion || "unknown"}`,
                preprocessedImage.domain !== fallbackImageDomain ? 1 : 0
              )
            );
          } else {
            imagePreprocess = preprocessedImage;
          }
        } catch (error) {
          console.error("[HF Vision Preprocess] failed:", error);
          const timedOut = isSidecarAbortError(error);
          session = appendSidecarObservation(session, {
            service: "vision-preprocess-service",
            stage: "preprocess",
            latencyMs: Date.now() - startedAt,
            outcome: timedOut ? "timeout" : "error",
            shadowMode: visionPreprocessShadowMode,
            fallbackUsed: true,
            note: timedOut ? "vision preprocess timeout" : "vision preprocess failed",
          });
          if (isSidecarAbortError(error)) {
            serviceTimeouts.push({
              service: "vision-preprocess-service",
              stage: "preprocess",
              reason: "timeout",
            });
          }
        }
      }

      if (!imagePreprocess) {
        imagePreprocess = buildFallbackPreprocessResult(fallbackImageDomain);
        imagePreprocess.limitations = isVisionPreprocessConfigured()
          ? ["preprocess sidecar unavailable"]
          : ["no preprocess sidecar configured"];
      }

      session.latest_image_domain = imagePreprocess.domain;
      session.latest_image_body_region = imagePreprocess.bodyRegion || undefined;
      session.latest_image_quality = imagePreprocess.imageQuality;
      session.latest_preprocess = imagePreprocess;
    }

    const supportedImageTurn =
      imagePreprocess?.domain &&
      imagePreprocess.domain !== "unsupported";

    // ALWAYS run vision when an image is present and the image is in a supported
    // veterinary domain. The photo is part of the answer, not an isolated artifact.
    const shouldRunWoundVision = image
      ? supportedImageTurn ||
        shouldAnalyzeWoundImage(lastUserMessage.content, session) ||
        roboflowSkinSuggested ||
        isImageEvidenceQuestion(session.last_question_asked) ||
        (isGenericImagePrompt(lastUserMessage.content) &&
          session.known_symptoms.includes("wound_skin_issue"))
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
          },
          {
            preprocess: imagePreprocess || undefined,
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

        for (
          const symptom of deriveSymptomsFromImageEvidence({
            preprocess: imagePreprocess,
            visionAnalysis,
            visionSymptoms,
            visionRedFlags,
            visionSeverity,
          })
        ) {
          if (!visionSymptoms.includes(symptom)) {
            visionSymptoms.push(symptom);
          }
        }

        console.log(`[Engine] Vision → Matrix: symptoms=${visionSymptoms.join(",")}, redFlags=${visionRedFlags.join(",")}, severity=${visionSeverity}`);

        visualEvidence = buildVisionClinicalEvidence({
          preprocess: imagePreprocess,
          session,
          visionAnalysis,
          visionSymptoms,
          visionRedFlags,
          visionSeverity,
          influencedQuestionSelection: false,
        });
        if (visualEvidence) {
          session.latest_visual_evidence = visualEvidence;
        }

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
              if (visualEvidence) {
                session.latest_visual_evidence = {
                  ...visualEvidence,
                  influencedQuestionSelection: true,
                };
              }
              if (serviceTimeouts.length > 0) {
                session.case_memory = {
                  ...ensureStructuredCaseMemory(session),
                  service_timeouts: [
                    ...ensureStructuredCaseMemory(session).service_timeouts,
                    ...serviceTimeouts,
                  ].slice(-10),
                };
              }

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
          if (visualEvidence) {
            session.latest_visual_evidence = visualEvidence;
          }
        }
      } catch (visionError) {
        console.error("Vision pipeline failed (non-blocking):", visionError);
        if (isSidecarAbortError(visionError)) {
          serviceTimeouts.push({
            service: "nvidia-vision",
            stage: "vision",
            reason: "timeout",
          });
        }
      }
    } else if (image) {
      console.log("[Image Gate] Skipping image analysis for unsupported image domain");
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: EXTRACT structured data — Qwen 3.5 122B (Claude fallback)
    // ═══════════════════════════════════════════════════════════════════
    const seededExtractionSymptoms = Array.from(
      new Set([
        ...session.known_symptoms,
        ...extractSymptomsFromKeywords(lastUserMessage.content),
        ...visionSymptoms,
      ])
    );
    const extractionSchema = getExtractionSchema({
      ...session,
      known_symptoms: seededExtractionSymptoms,
    });
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

    // ── VET-705: Record extraction telemetry ──
    const isExtractionValidJson =
      typeof extracted === "object" &&
      extracted !== null &&
      !Array.isArray(extracted);
    const usedFastPath = Boolean(fastPathExtraction);
    session = recordConversationTelemetry(session, {
      event: "extraction",
      turn_count: session.case_memory?.turn_count ?? 0,
      outcome: "success",
      source: usedFastPath ? "fast_path" : "structured",
      model: usedFastPath ? undefined : "Qwen-3.5-122B",
      symptoms_extracted: (extracted.symptoms || []).length,
      answers_extracted: Object.keys(extracted.answers || {}).length,
      fallback_used: false,
      extraction_valid_json: isExtractionValidJson,
    });

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
    const turnTextSymptoms = Array.from(
      new Set([
        ...(extracted.symptoms || []),
        ...extractSymptomsFromKeywords(lastUserMessage.content),
      ])
    );

    if (turnTextSymptoms.length > 0) {
      session = addSymptoms(session, turnTextSymptoms);
    }

    const deterministicSupplementalAnswers = extractDeterministicAnswersForTurn(
      lastUserMessage.content,
      session
    );
    let mergedAnswers = mergeTurnAnswers(
      session,
      deterministicSupplementalAnswers,
      extracted.answers || {}
    );

    for (const [key, value] of Object.entries(mergedAnswers)) {
      if (value !== null && value !== undefined && value !== "") {
        session = recordAnswer(session, key, value);
      }
    }

    // ── Fix: Handle negative/null answers so questions don't loop ──
    // If the session had a pending question and extraction didn't capture
    // the answer (e.g. user said "no", "nothing", "I don't know"), force-
    // record the user's raw text so the question is marked answered.
    const pendingQ = session.last_question_asked;
    if (pendingQ && !session.answered_questions.includes(pendingQ)) {
      // Build a rich combined answer from text + vision analysis
      // e.g. user sent "left leg" + photo → combined = "left leg [vision: wound on left leg, raw area]"
      const combinedUserSignal = [
        lastUserMessage.content,
        visionAnalysis ? `[vision: ${visionAnalysis.substring(0, 200)}]` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const wasExtractionEmpty =
        (!extracted.answers || Object.keys(extracted.answers).length === 0) &&
        !extracted.symptoms?.length;
      const directCoercionAnswer = coerceFallbackAnswerForPendingQuestion(
        pendingQ,
        lastUserMessage.content,
        mergedAnswers
      );
      const combinedCoercionAnswer = coerceFallbackAnswerForPendingQuestion(
        pendingQ,
        combinedUserSignal,
        mergedAnswers
      );

      const pendingAnswer = resolvePendingQuestionAnswer({
        questionId: pendingQ,
        rawMessage: lastUserMessage.content,
        combinedUserSignal,
        turnAnswers: mergedAnswers,
        turnSymptoms: turnTextSymptoms,
      });
      if (pendingAnswer !== null) {
        session = recordAnswer(session, pendingQ, pendingAnswer.value);
        console.log(
          `[Engine] Resolved pending question "${pendingQ}" via ${pendingAnswer.source} (signal: "${lastUserMessage.content.substring(0, 80)}")`
        );
        // ── VET-705: Record pending recovery telemetry ──
        // ── VET-707: Record why recovery succeeded ──
        let loopReason: LoopReasonCode | undefined;
        if (pendingAnswer.source === "raw_fallback") {
          loopReason = "deterministic_miss";
        } else if (pendingAnswer.source === "combined_signal") {
          loopReason = "extraction_miss";
        }
        session = recordConversationTelemetry(session, {
          event: "pending_recovery",
          turn_count: session.case_memory?.turn_count ?? 0,
          question_id: pendingQ,
          outcome: "success",
          source: pendingAnswer.source as RecoverySource,
          pending_before: true,
          pending_after: false,
          loop_reason: loopReason,
        });
      } else {
        // ── VET-707: Diagnose why all recovery stages failed ──
        let loopReason: LoopReasonCode;
        if (wasExtractionEmpty && directCoercionAnswer !== null) {
          loopReason = "direct_coercion_miss";
        } else if (wasExtractionEmpty && combinedCoercionAnswer !== null) {
          loopReason = "combined_signal_miss";
        } else {
          loopReason = "extraction_miss";
        }
        console.log(
          `[Engine] Pending question "${pendingQ}" still unresolved after extraction and deterministic fallback [loop_reason=${loopReason}]`
        );
        // ── VET-705: Record pending recovery failure telemetry ──
        session = recordConversationTelemetry(session, {
          event: "pending_recovery",
          turn_count: session.case_memory?.turn_count ?? 0,
          question_id: pendingQ,
          outcome: "failure",
          source: "unresolved",
          pending_before: true,
          pending_after: true,
          loop_reason: loopReason,
        });
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

    session = propagateSharedLocationAnswers(session);
    if (visualEvidence) {
      const contradictions = deriveVisionContradictions(
        lastUserMessage.content,
        session,
        visualEvidence,
        imagePreprocess
      );
      if (contradictions.length > 0) {
        ambiguityFlags.push(...contradictions);
      }

      visualEvidence = {
        ...visualEvidence,
        contradictions,
        requiresConsult: shouldTriggerSyncConsult({
          visualEvidence,
          preprocess: imagePreprocess,
          ownerText: lastUserMessage.content,
          session,
          contradictions,
        }),
      };
      if (visualEvidence) {
        session.latest_visual_evidence = visualEvidence;
      }

      if (visualEvidence.requiresConsult && image && isMultimodalConsultConfigured()) {
        const consultShadowMode = isShadowModeEnabledForService(
          "multimodal-consult-service"
        );
        const startedAt = Date.now();
        try {
          const nextConsultOpinion = await consultWithMultimodalSidecar({
            image,
            ownerText: lastUserMessage.content,
            preprocess:
              imagePreprocess ||
              buildFallbackPreprocessResult(
                inferSupportedImageDomain(
                  lastUserMessage.content,
                  session.known_symptoms
                )
              ),
            visionSummary: visionAnalysis || session.vision_analysis || "",
            severity: visualEvidence.severity,
            contradictions,
            deterministicFacts: session.extracted_answers,
            mode: "sync",
          });
          session = appendSidecarObservation(session, {
            service: "multimodal-consult-service",
            stage: "sync-consult",
            latencyMs: Date.now() - startedAt,
            outcome: consultShadowMode ? "shadow" : "success",
            shadowMode: consultShadowMode,
            fallbackUsed: consultShadowMode,
            note: `disagreements=${nextConsultOpinion.disagreements.length}`,
          });

          if (consultShadowMode) {
            session = appendShadowComparison(
              session,
              describeShadowComparison(
                "multimodal-consult-service",
                "nvidia-vision-only",
                nextConsultOpinion.model,
                nextConsultOpinion.summary.slice(0, 180),
                nextConsultOpinion.disagreements.length
              )
            );
          } else {
            consultOpinion = nextConsultOpinion;
            session.latest_consult_opinion = consultOpinion;
            ambiguityFlags.push(...consultOpinion.uncertainties);
          }
        } catch (error) {
          console.error("[HF Multimodal Consult] failed:", error);
          const timedOut = isSidecarAbortError(error);
          session = appendSidecarObservation(session, {
            service: "multimodal-consult-service",
            stage: "sync-consult",
            latencyMs: Date.now() - startedAt,
            outcome: timedOut ? "timeout" : "error",
            shadowMode: consultShadowMode,
            fallbackUsed: true,
            note: timedOut ? "multimodal consult timeout" : "multimodal consult failed",
          });
          if (isSidecarAbortError(error)) {
            serviceTimeouts.push({
              service: "multimodal-consult-service",
              stage: "sync-consult",
              reason: "timeout",
            });
          }
        }
      }
    }
    const turnFocusSymptoms = buildTurnFocusSymptoms(
      knownSymptomsBeforeTurn,
      session,
      visionSymptoms,
      turnTextSymptoms
    );
    const changedSymptomsThisTurn = session.known_symptoms.filter(
      (symptom) => !knownSymptomsBeforeTurn.has(symptom)
    );
    const changedAnswerKeys = Object.keys(session.extracted_answers).filter(
      (key) => !answerKeysBeforeTurn.has(key)
    );

    session = updateStructuredCaseMemory(session, effectivePet, {
      latestUserMessage: lastUserMessage.content,
      imageAnalyzed: Boolean(visionAnalysis),
      imageSummary: visionAnalysis,
      imageSymptoms: visionSymptoms,
      imageRedFlags: visionRedFlags,
      turnFocusSymptoms,
      visualEvidence,
      consultOpinion,
      serviceTimeouts,
      ambiguityFlags,
      evidenceNotes: buildEvidenceChainNotes({
        preprocess: imagePreprocess,
        visualEvidence,
        consultOpinion,
      }),
      missingQuestionIds: getMissingQuestions(session),
    });

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

    const nextQuestionId = getNextQuestionAvoidingRepeat(
      session,
      turnFocusSymptoms
    );

    // ── VET-705: Record repeat suppression telemetry ──
    // ── VET-707: Record loop reason for suppression ──
    const wasRepeatSuppressed =
      nextQuestionId !== null &&
      nextQuestionId === session.last_question_asked &&
      session.answered_questions.includes(nextQuestionId);
    if (wasRepeatSuppressed) {
      session = recordConversationTelemetry(session, {
        event: "repeat_suppression",
        turn_count: session.case_memory?.turn_count ?? 0,
        question_id: nextQuestionId,
        outcome: "success",
        reason: "repeat_of_last_asked_question_suppressed",
        repeat_prevented: true,
        loop_reason: "repeat_of_last_asked",
      });
    }

    const visualEvidenceInfluencedQuestion = didVisualEvidenceInfluenceQuestion(
      nextQuestionId,
      visualEvidence,
      turnFocusSymptoms
    );
    if (
      visualEvidence &&
      session.case_memory?.visual_evidence?.length
    ) {
      session.case_memory.visual_evidence = session.case_memory.visual_evidence.map(
        (entry, index, list) =>
          index === list.length - 1
            ? {
                ...entry,
                influencedQuestionSelection: visualEvidenceInfluencedQuestion,
              }
            : entry
      );
      session.latest_visual_evidence = {
        ...visualEvidence,
        influencedQuestionSelection: visualEvidenceInfluencedQuestion,
      };
      if (visualEvidenceInfluencedQuestion) {
        session.case_memory.evidence_chain = [
          ...session.case_memory.evidence_chain,
          `Visual evidence directly influenced next question: ${nextQuestionId || "ready_for_report"}`,
        ].slice(-16);
      }
    }
    session = syncStructuredCaseMemoryQuestions(
      session,
      nextQuestionId,
      getMissingQuestions(session)
    );
    session = await maybeCompressStructuredCaseMemory(
      session,
      effectivePet,
      messages,
      lastUserMessage.content,
      {
        imageAnalyzed: Boolean(visionAnalysis),
        changedSymptoms: changedSymptomsThisTurn,
        changedAnswers: changedAnswerKeys,
      }
    );

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
    // STEP 5: PHRASE question — Llama 3.3 70B + Nemotron verifier
    // ═══════════════════════════════════════════════════════════════════
    const questionText = getQuestionText(nextQuestionId);
    // Include image context when:
    //  a) vision just ran this turn (visionAnalysis is freshly populated), OR
    //  b) the question is wound-related, OR
    //  c) turnFocusSymptoms-based check passes
    const hasLiveVisionThisTurn = Boolean(visionAnalysis);
    const basePhrasingContext = (
      hasLiveVisionThisTurn ||
      shouldIncludeImageContextInQuestion(nextQuestionId, session, turnFocusSymptoms)
    )
      ? buildQuestionPhrasingContext(session, visionSeverity)
      : null;
    const questionGate = await gateQuestionBeforePhrasing(
      nextQuestionId,
      questionText,
      session,
      effectivePet,
      messages,
      lastUserMessage.content,
      basePhrasingContext,
      hasLiveVisionThisTurn
    );
    const phrasingContext = basePhrasingContext;
    const allowPhotoMentionInWording =
      hasLiveVisionThisTurn && questionGate.includeImageContext;
    const phrasedQuestion = await phraseQuestion(
      questionText,
      nextQuestionId,
      session,
      effectivePet,
      messages,
      lastUserMessage.content,
      phrasingContext,
      hasLiveVisionThisTurn,
      allowPhotoMentionInWording,
      questionGate.useDeterministicFallback
    );

    return NextResponse.json({
      type: "question",
      message: phrasedQuestion,
      session,
      ready_for_report: isReadyForDiagnosis(session),
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
Pending question: ${session.last_question_asked || "none"}

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

Examples:
- If the pending question is "water_intake" and the owner says "Yes, he's drinking normally", return "water_intake": "normal"
- If the pending question is "water_intake" and the owner says "No, not really", return "water_intake": "less_than_usual"
- If the pending question is "trauma_history" and the owner says "I don't know", return "trauma_history": "I don't know"

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

    const parsed = parseExtractionResponse(rawText);
    console.log(
      `[Engine] Extraction parsed ${parsed.symptoms.length} symptoms and ${Object.keys(parsed.answers).length} answers` +
        (session.last_question_asked ? ` (pending: ${session.last_question_asked})` : "")
    );
    return parsed;
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
    console.log("[Engine] Extraction fallback: keyword-only recovery");
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

function stripThinkingArtifacts(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseLooseJsonRecord(rawText: string): Record<string, unknown> {
  const cleaned = stripThinkingArtifacts(rawText);
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned) as Record<string, unknown>;
}

function humanizeAnswerValue(value: string | boolean | number): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  // Convert underscore/dash choice values to plain English
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

function buildConfirmedQASummary(session: TriageSession, limit = 5): string {
  const answered = getRecentAnsweredQuestionIds(session, limit);
  if (answered.length === 0) return "";
  const lines = answered
    .map((qId) => {
      const q = FOLLOW_UP_QUESTIONS[qId];
      const rawVal = session.extracted_answers[qId];
      if (!q || rawVal === undefined || rawVal === null || rawVal === "") return null;
      const readable = humanizeAnswerValue(rawVal);
      return `- ${q.question_text} -> ${readable}`;
    })
    .filter(Boolean);
  return lines.join("\n");
}

function buildDeterministicQuestionFallback(
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

function sanitizeQuestionDraft(
  rawDraft: string,
  fallbackMessage: string,
  allowPhotoMention: boolean
): string {
  const cleaned = stripThinkingArtifacts(rawDraft).replace(/\s+/g, " ").trim();
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

interface QuestionGateDecision {
  includeImageContext: boolean;
  useDeterministicFallback: boolean;
  reason: string;
}

async function maybeCompressStructuredCaseMemory(
  session: TriageSession,
  pet: PetProfile,
  messages: { role: "user" | "assistant"; content: string }[],
  latestUserMessage: string,
  options: {
    imageAnalyzed: boolean;
    changedSymptoms: string[];
    changedAnswers: string[];
  }
): Promise<TriageSession> {
  const shouldRefresh = shouldCompressCaseMemory(session, messages, options);
  const caseMemory = ensureStructuredCaseMemory(session);
  const fallbackSummary = buildDeterministicCaseSummary(session, pet);

  if (!shouldRefresh) {
    return {
      ...session,
      case_memory: {
        ...caseMemory,
        compressed_summary: caseMemory.compressed_summary || fallbackSummary,
      },
    };
  }

  if (!isMiniMaxConfigured()) {
    return {
      ...session,
      case_memory: {
        ...caseMemory,
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
      },
    };
  }

  // VET-704: Protect conversation control state before sending to MiniMax
  const protectedState = getProtectedConversationState(session);

  // VET-706: Use narrative-only snapshot (excludes protected control state & telemetry)
  const prompt = `You are compressing an active veterinary triage case into stable memory for downstream reasoning.

Summarize only confirmed or strongly supported facts. Preserve:
- main symptoms
- direct owner answers
- important negative findings
- image findings when present

Do NOT include or reference question IDs, answer tracking, conversation control state, or telemetry entries. Telemetry data is already excluded from this snapshot.

Keep the summary under 180 words and avoid diagnosis language unless already explicit in the case.

CASE SNAPSHOT:
${buildNarrativeSnapshot(session, messages, latestUserMessage)}

Return ONLY the summary text.`;

  try {
    const compressed = await compressCaseMemoryWithMiniMax(prompt);
    // VET-704: Merge compression result while preserving protected control state
    const mergedSession = mergeCompressionResult(session, compressed, protectedState);
    // Record compression telemetry
    const telemetrySession = recordConversationTelemetry(mergedSession, {
      event: "compression",
      turn_count: mergedSession.case_memory?.turn_count ?? 0,
      outcome: "success",
      model: compressed.model,
      compression_used: true,
      compression_model: compressed.model,
      narrative_only: true,
      control_state_preserved: true,
    });
    return telemetrySession;
  } catch (error) {
    console.error("MiniMax memory compression failed:", error);
    // Record compression fallback telemetry
    const telemetrySession = recordConversationTelemetry(session, {
      event: "compression",
      turn_count: session.case_memory?.turn_count ?? 0,
      outcome: "fallback",
      model: "deterministic-summary",
      compression_used: false,
      compression_model: "deterministic-summary",
      reason: error instanceof Error ? error.message : "unknown error",
      narrative_only: true,
      control_state_preserved: true,
      fallback_used: true,
    });
    return {
      ...telemetrySession,
      case_memory: {
        ...ensureStructuredCaseMemory(telemetrySession),
        compressed_summary: fallbackSummary,
        compression_model: "deterministic-summary",
        last_compressed_turn: caseMemory.turn_count,
      },
    };
  }
}

async function gateQuestionBeforePhrasing(
  questionId: string,
  questionText: string,
  session: TriageSession,
  pet: PetProfile,
  messages: { role: "user" | "assistant"; content: string }[],
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

async function phraseQuestionV2(
  questionText: string,
  questionId: string,
  session: TriageSession,
  pet: PetProfile,
  messages: { role: "user" | "assistant"; content: string }[],
  latestUserMessage: string,
  phrasingContext?: string | null,
  photoAnalyzedThisTurn?: boolean,
  allowPhotoMentionInWording = false,
  forceDeterministicFallback = false
): Promise<string> {
  const qDef = FOLLOW_UP_QUESTIONS[questionId];
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

  const prompt = `You are PawVital, a precise veterinary triage wording assistant.

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
- Answer type: ${qDef?.data_type || "string"}

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

  try {
    let draft: string;

    if (useNvidia) {
      draft = await phraseWithLlama(prompt);
      console.log("[Engine] Phrasing primary: Llama 3.3 70B Instruct");
    } else {
      const claudeRes = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });
      const content = claudeRes.content[0];
      if (content.type !== "text") throw new Error("Unexpected response type");
      draft = content.text;
      console.log("[Engine] Phrasing primary: Claude");
    }

    draft = sanitizeQuestionDraft(
      draft,
      fallbackMessage,
      allowPhotoMentionInWording
    );

    if (useNvidia) {
      try {
        const verificationPrompt = `Review and, if needed, repair this drafted veterinary follow-up message.

FULL SESSION MEMORY:
${memorySnapshot}
${phrasingContext ? `\nIMAGE REASONING CONTEXT:\n${phrasingContext}\n` : ""}
PHOTO SENT THIS TURN: ${hasPhoto ? "YES" : "NO"}
EXPLICITLY REFERENCE PHOTO IN WORDING: ${allowPhotoMentionInWording ? "YES" : "NO"}

REQUIRED QUESTION:
- Exact question text: "${questionText}"
- Internal ID: ${questionId}

DRAFT MESSAGE:
${draft}

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

        const verified = await verifyQuestionWithNemotron(verificationPrompt);
        const parsed = parseLooseJsonRecord(verified);
        const verifiedMessage =
          typeof parsed.message === "string" ? parsed.message : "";

        return sanitizeQuestionDraft(
          verifiedMessage,
          fallbackMessage,
          allowPhotoMentionInWording
        );
      } catch (verificationError) {
        console.error("Question verification failed:", verificationError);
      }
    }

    return draft;
  } catch (error) {
    console.error("Phrasing failed:", error);

    if (useNvidia && isAnthropicConfigured) {
      try {
        const claudeRes = await anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 256,
          messages: [{ role: "user", content: prompt }],
        });
        const content = claudeRes.content[0];
        if (content.type !== "text")
          throw new Error("Unexpected response type");
        return sanitizeQuestionDraft(content.text, fallbackMessage, hasPhoto);
      } catch {
        // Final fallback below
      }
    }

    return fallbackMessage;
  }
}

// =============================================================================
// STEP 5: Question Phrasing — Llama 3.3 70B → Claude fallback
// =============================================================================

async function phraseQuestion(
  questionText: string,
  questionId: string,
  session: TriageSession,
  pet: PetProfile,
  messages: { role: "user" | "assistant"; content: string }[],
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

// =============================================================================
// STEP 6: Diagnosis Report — Nemotron Ultra 253B (reasoning) + GLM-5 (safety)
// =============================================================================

// ── Server-side Supabase save (uses service role to bypass RLS) ──
function buildVetHandoffSummary(
  session: TriageSession,
  pet: PetProfile,
  report: Record<string, unknown>
): string {
  const ownerFacts = Object.entries(session.extracted_answers)
    .slice(0, 8)
    .map(([key, value]) => `${key}: ${String(value)}`);
  const differentials = Array.isArray(report.differential_diagnoses)
    ? (report.differential_diagnoses as Array<Record<string, unknown>>)
        .slice(0, 3)
        .map((entry) => String(entry.condition || "").trim())
        .filter(Boolean)
    : [];
  const tests = Array.isArray(report.recommended_tests)
    ? (report.recommended_tests as Array<Record<string, unknown>>)
        .slice(0, 3)
        .map((entry) => String(entry.test || "").trim())
        .filter(Boolean)
    : [];

  return [
    `Patient: ${pet.name}, ${pet.age_years}y ${pet.breed}, ${pet.weight} lbs.`,
    `Urgency: ${String(report.recommendation || report.severity || "monitor")}.`,
    `Main concerns: ${session.known_symptoms.join(", ") || "not fully established"}.`,
    ownerFacts.length > 0 ? `Owner-reported facts: ${ownerFacts.join("; ")}.` : "",
    session.vision_analysis
      ? `Visual findings: ${session.vision_analysis.replace(/\s+/g, " ").trim().slice(0, 220)}`
      : "",
    differentials.length > 0
      ? `Top differentials: ${differentials.join("; ")}.`
      : "",
    tests.length > 0 ? `Recommended diagnostics: ${tests.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateReport(
  session: TriageSession,
  pet: PetProfile,
  messages: { role: string; content: string }[],
  image?: string,
  requestOrigin?: string
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
  const retrievalResult = await buildReportRetrievalBundle(
    session,
    pet,
    knowledgeQuery,
    referenceImageQuery,
    context.top5.map((d) => d.medical_term)
  );
  session = retrievalResult.session;
  const retrievalBundle = retrievalResult.bundle;
  session.latest_retrieval_bundle = retrievalBundle;
  const reportMemory = ensureStructuredCaseMemory(session);
  session.case_memory = {
    ...reportMemory,
    retrieval_evidence: [
      ...reportMemory.retrieval_evidence,
      ...retrievalBundle.textChunks,
      ...retrievalBundle.imageMatches,
    ].slice(-16),
    evidence_chain: [
      ...reportMemory.evidence_chain,
      ...buildEvidenceChainForResponse(session, retrievalBundle),
    ].slice(-16),
  };
  const knowledgeContext = formatRetrievalTextContext(retrievalBundle);
  const referenceImageContext = formatRetrievalImageContext(retrievalBundle);

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

STRUCTURED CASE MEMORY:
${session.case_memory?.compressed_summary || buildDeterministicCaseSummary(session, pet)}

CLINICAL MATRIX CALCULATIONS (pre-calculated disease probabilities — use as your ranking):
${top5Formatted}

BREED RISK PROFILE: ${context.breed_risk_summary}
BODY SYSTEMS INVOLVED: ${context.body_systems.join(", ")}
RED FLAGS: ${context.red_flags.length > 0 ? context.red_flags.join(", ") : "None"}
MATRIX-DETERMINED URGENCY: ${context.highest_urgency}
OWNER-REPORTED FACTS:
- Latest owner turn: ${session.case_memory?.latest_owner_turn || "none"}
- Structured facts: ${Object.entries(session.extracted_answers)
  .map(([key, value]) => `${key}=${String(value)}`)
  .join("; ") || "none"}

DETERMINISTIC EXTRACTED FACTS:
${context.answer_summary}

VISUAL FINDINGS:
${formatVisualEvidenceForReport(session)}

CONSULT EVIDENCE:
${formatConsultEvidenceForReport(session)}

EVIDENCE CHAIN:
${formatEvidenceChainForReport(session)}

${session.image_inferred_breed ? `IMAGE-INFERRED BREED SIGNAL: ${session.image_inferred_breed} (${Math.round((session.image_inferred_breed_confidence || 0) * 100)}% confidence)\n` : ""}${session.breed_profile_summary ? `EXTERNAL BREED PROFILE: ${session.breed_profile_summary}\n` : ""}${session.roboflow_skin_summary ? `ROBOFLOW SKIN FLAG: ${session.roboflow_skin_summary}\n` : ""}${knowledgeContext ? `EXTERNAL KNOWLEDGE RETRIEVAL (trusted public corpus; use to support, not replace, the matrix ranking):\n${knowledgeContext}\n` : ""}
${referenceImageContext ? `REFERENCE IMAGE RETRIEVAL (similar corpus cases; use as supportive visual context, not a diagnosis by itself):\n${referenceImageContext}\n` : ""}

${session.vision_analysis ? `VISUAL ANALYSIS FROM PET PHOTO (analyzed by the NVIDIA 11B/90B vision stack):\n${session.vision_analysis}\n\nIMPORTANT: Incorporate the visual findings above into your differential diagnoses and clinical notes. Reference what was observed in the image (e.g., wound characteristics, skin condition, eye appearance). The visual analysis should heavily influence your report.\n` : ""}
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
  "vet_questions": ["3-5 questions tailored to top differentials"],
  "confidence": 0.0,
  "evidence_chain": ["brief evidence statements linking owner facts, visual findings, and supporting references"]
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
    report.confidence = capDiagnosticConfidence({
      baseConfidence:
        typeof report.confidence === "number"
          ? report.confidence
          : deriveBaselineReportConfidence(context),
      hasModelDisagreement: Boolean(
        session.case_memory?.consult_opinions?.some(
          (opinion) => opinion.disagreements.length > 0
        )
      ),
      lowQualityImage:
        session.latest_image_quality === "poor" ||
        session.latest_image_quality === "borderline",
      weakRetrievalSupport:
        retrievalBundle.textChunks.length === 0 &&
        retrievalBundle.imageMatches.length === 0,
      ambiguityFlags: session.case_memory?.ambiguity_flags || [],
    });
    if (!Array.isArray(report.evidence_chain)) {
      report.evidence_chain = buildEvidenceChainForResponse(
        session,
        retrievalBundle
      );
    }
    report.evidenceChain = buildStructuredEvidenceChain(
      session,
      retrievalBundle
    );

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
    let asyncReviewScheduled = false;
    const reviewImage = image;
    const shouldAttemptAsyncReview =
      Boolean(reviewImage) &&
      context.highest_urgency !== "emergency" &&
      shouldScheduleAsyncConsultReview(session) &&
      isMultimodalConsultConfigured() &&
      Boolean(requestOrigin);

    if (shouldAttemptAsyncReview) {
      const task = async () => {
        try {
          await enqueueAsyncReview({
            baseUrl: requestOrigin!,
            image: reviewImage!,
            pet,
            session,
            report: finalReport,
          });
          console.log("[HF Multimodal Consult] queued async review");
        } catch (error) {
          console.error("[HF Multimodal Consult] async review failed:", error);
        }
      };

      asyncReviewScheduled = runAfterSafely(task);
      if (!asyncReviewScheduled) {
        try {
          asyncReviewScheduled = await enqueueAsyncReview({
            baseUrl: requestOrigin!,
            image: reviewImage!,
            pet,
            session,
            report: finalReport,
          });
          if (asyncReviewScheduled) {
            console.log(
              "[HF Multimodal Consult] queued async review via inline fallback"
            );
          }
        } catch (error) {
          console.error(
            "[HF Multimodal Consult] inline fallback enqueue failed:",
            error
          );
        }
      }
    }

    if (asyncReviewScheduled) {
      finalReport.async_review_scheduled = true;
    }

    finalReport.vet_handoff_summary = buildVetHandoffSummary(
      session,
      pet,
      finalReport
    );
    finalReport.system_observability = buildObservabilitySnapshot(session);

    try {
      const reportStorageId = await saveSymptomReportToDB(
        session,
        pet,
        finalReport
      );
      if (reportStorageId) {
        finalReport.report_storage_id = reportStorageId;
        finalReport.outcome_feedback_enabled = true;
      }
    } catch (saveError) {
      console.error("[DB] Failed to save triage session:", saveError);
    }

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
        report.confidence = capDiagnosticConfidence({
          baseConfidence: deriveBaselineReportConfidence(context),
          hasModelDisagreement: Boolean(
            session.case_memory?.consult_opinions?.some(
              (opinion) => opinion.disagreements.length > 0
            )
          ),
          lowQualityImage:
            session.latest_image_quality === "poor" ||
            session.latest_image_quality === "borderline",
          weakRetrievalSupport:
            retrievalBundle.textChunks.length === 0 &&
            retrievalBundle.imageMatches.length === 0,
          ambiguityFlags: session.case_memory?.ambiguity_flags || [],
        });
        if (!Array.isArray(report.evidence_chain)) {
          report.evidence_chain = buildEvidenceChainForResponse(
            session,
            retrievalBundle
          );
        }
        report.evidenceChain = buildStructuredEvidenceChain(
          session,
          retrievalBundle
        );
        report.vet_handoff_summary = buildVetHandoffSummary(session, pet, report);
        report.system_observability = buildObservabilitySnapshot(session);
        try {
          const reportStorageId = await saveSymptomReportToDB(session, pet, report);
          if (reportStorageId) {
            report.report_storage_id = reportStorageId;
            report.outcome_feedback_enabled = true;
          }
        } catch (saveError) {
          console.error("[DB] Failed to save triage session:", saveError);
        }
        return NextResponse.json({ type: "report", report });
      } catch (fallbackError) {
        console.error("Claude fallback also failed:", fallbackError);
      }
    }

    throw error;
  }
}

function buildFallbackPreprocessResult(
  domain: SupportedImageDomain
): VisionPreprocessResult {
  return {
    domain,
    bodyRegion: domain === "skin_wound" ? "skin/limb region" : null,
    detectedRegions: [],
    bestCrop: null,
    imageQuality: "borderline",
    confidence: domain === "unsupported" ? 0.2 : 0.45,
    limitations: ["sidecar preprocess unavailable"],
  };
}

function buildVisionClinicalEvidence(input: {
  preprocess: VisionPreprocessResult | null;
  session: TriageSession;
  visionAnalysis: string | null;
  visionSymptoms: string[];
  visionRedFlags: string[];
  visionSeverity: "normal" | "needs_review" | "urgent";
  influencedQuestionSelection: boolean;
}): VisionClinicalEvidence | null {
  if (
    !input.preprocess &&
    !input.visionAnalysis &&
    input.visionSymptoms.length === 0 &&
    input.visionRedFlags.length === 0
  ) {
    return null;
  }

  const findings = [
    ...(input.visionAnalysis
      ? [input.visionAnalysis.replace(/\s+/g, " ").trim().slice(0, 220)]
      : []),
    ...input.visionSymptoms.map((symptom) => symptom.replace(/_/g, " ")),
    ...input.visionRedFlags.map((flag) => `red flag: ${flag.replace(/_/g, " ")}`),
  ].slice(0, 6);

  const confidenceFromAnalysis = extractNumericConfidence(input.visionAnalysis);
  const preprocessConfidence = input.preprocess?.confidence || 0;
  const confidence = Number(
    Math.max(confidenceFromAnalysis, preprocessConfidence, 0.45).toFixed(2)
  );

  return {
    domain: input.preprocess?.domain || sessionToDomainFallback(input.session),
    bodyRegion:
      input.preprocess?.bodyRegion ||
      input.session.latest_image_body_region ||
      null,
    findings,
    severity: input.visionSeverity,
    confidence,
    supportedSymptoms: input.visionSymptoms,
    contradictions: [],
    requiresConsult: false,
    limitations: [
      ...(input.preprocess?.limitations || []),
      ...(input.session.vision_analysis ? [] : ["limited vision context"]),
    ].slice(0, 4),
    influencedQuestionSelection: input.influencedQuestionSelection,
  };
}

function extractNumericConfidence(text: string | null | undefined): number {
  if (!text) return 0;
  const match = text.match(/"confidence"\s*:\s*([0-9.]+)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : 0;
}

function sessionToDomainFallback(session: TriageSession): SupportedImageDomain {
  if (session.latest_image_domain) return session.latest_image_domain;
  if (session.known_symptoms.includes("eye_discharge")) return "eye";
  if (session.known_symptoms.includes("ear_scratching")) return "ear";
  if (
    session.known_symptoms.includes("vomiting") ||
    session.known_symptoms.includes("diarrhea") ||
    session.known_symptoms.includes("blood_in_stool")
  ) {
    return "stool_vomit";
  }
  if (session.known_symptoms.includes("wound_skin_issue")) return "skin_wound";
  return "unsupported";
}

function deriveVisionContradictions(
  ownerText: string,
  session: TriageSession,
  evidence: VisionClinicalEvidence,
  preprocess: VisionPreprocessResult | null
): string[] {
  const contradictions = new Set<string>();
  const lowerOwner = ownerText.toLowerCase();
  const analysisText = (session.vision_analysis || "").toLowerCase();

  if (
    preprocess?.domain === "eye" &&
    !lowerOwner.includes("eye") &&
    !session.known_symptoms.includes("eye_discharge")
  ) {
    contradictions.add("image suggests an eye-focused issue while owner text is about a different complaint");
  }

  if (
    preprocess?.domain === "ear" &&
    !lowerOwner.includes("ear") &&
    !session.known_symptoms.includes("ear_scratching")
  ) {
    contradictions.add("image suggests an ear-focused issue while owner text is about a different complaint");
  }

  if (
    preprocess?.domain === "stool_vomit" &&
    !/(vomit|vomiting|stool|poop|diarrhea|diarrhoea)/.test(lowerOwner)
  ) {
    contradictions.add("image suggests stool or vomit evidence that is not clearly described in the owner message");
  }

  if (
    session.extracted_answers.which_leg &&
    evidence.bodyRegion &&
    !String(session.extracted_answers.which_leg)
      .toLowerCase()
      .includes(String(evidence.bodyRegion).toLowerCase().split(" ")[0]) &&
    /(left|right)/.test(String(session.extracted_answers.which_leg).toLowerCase())
  ) {
    contradictions.add("owner-reported location and image body region do not fully align");
  }

  if (
    evidence.severity === "urgent" &&
    !analysisText.includes("urgent") &&
    !session.red_flags_triggered.length
  ) {
    contradictions.add("visual severity is high without matching text red flags");
  }

  return [...contradictions];
}

function shouldTriggerSyncConsult(input: {
  visualEvidence: VisionClinicalEvidence;
  preprocess: VisionPreprocessResult | null;
  ownerText: string;
  session: TriageSession;
  contradictions: string[];
}): boolean {
  const lower = input.ownerText.toLowerCase();
  const multipleRegions = (input.preprocess?.detectedRegions.length || 0) > 1;
  const lowVisionConfidence = input.visualEvidence.confidence < 0.7;
  const severeVisualFinding = input.visualEvidence.severity === "urgent";
  const morphologyDomain =
    input.visualEvidence.domain === "eye" ||
    input.visualEvidence.domain === "ear" ||
    input.visualEvidence.domain === "stool_vomit";
  const moderateOrHigher =
    input.visualEvidence.severity === "needs_review" ||
    input.visualEvidence.severity === "urgent";
  const conflictWithOwner =
    input.contradictions.length > 0 ||
    (lower.includes("left") &&
      typeof input.session.extracted_answers.which_leg === "string" &&
      String(input.session.extracted_answers.which_leg).toLowerCase().includes("right"));

  return (
    lowVisionConfidence ||
    severeVisualFinding ||
    multipleRegions ||
    conflictWithOwner ||
    (morphologyDomain && moderateOrHigher)
  );
}

function buildEvidenceChainNotes(input: {
  preprocess: VisionPreprocessResult | null;
  visualEvidence: VisionClinicalEvidence | null;
  consultOpinion: ConsultOpinion | null;
}): string[] {
  const notes: string[] = [];

  if (input.preprocess) {
    notes.push(
      `Pre-vision classified image as ${input.preprocess.domain} with quality ${input.preprocess.imageQuality}`
    );
  }

  if (input.visualEvidence) {
    notes.push(
      `NVIDIA vision severity ${input.visualEvidence.severity} with findings: ${
        input.visualEvidence.findings[0] || "no structured findings"
      }`
    );
  }

  if (input.consultOpinion) {
    notes.push(
      `${input.consultOpinion.model} consult summary: ${input.consultOpinion.summary}`
    );
  }

  return notes;
}

function didVisualEvidenceInfluenceQuestion(
  nextQuestionId: string | null,
  visualEvidence: VisionClinicalEvidence | null,
  turnFocusSymptoms: string[]
): boolean {
  if (!nextQuestionId || !visualEvidence) return false;
  if (nextQuestionId.startsWith("wound_")) return true;
  if (visualEvidence.domain === "eye" && nextQuestionId.includes("eye")) return true;
  if (visualEvidence.domain === "ear" && nextQuestionId.includes("ear")) return true;
  if (
    visualEvidence.domain === "stool_vomit" &&
    /(stool|vomit|blood|diarrhea)/.test(nextQuestionId)
  ) {
    return true;
  }
  return visualEvidence.supportedSymptoms.some((symptom) =>
    turnFocusSymptoms.includes(symptom)
  );
}

async function buildReportRetrievalBundle(
  session: TriageSession,
  pet: PetProfile,
  knowledgeQuery: string,
  referenceImageQuery: string,
  conditionHints: string[]
): Promise<{ session: TriageSession; bundle: RetrievalBundle }> {
  const domain = session.latest_image_domain || null;
  const retrievalShadowMode =
    isShadowModeEnabledForService("text-retrieval-service") ||
    isShadowModeEnabledForService("image-retrieval-service");

  let sidecarBundle: RetrievalBundle | null = null;

  if (isTextRetrievalConfigured() || isImageRetrievalConfigured()) {
    const textStarted = Date.now();
    const imageStarted = Date.now();
    const [textResult, imageResult] = await Promise.allSettled([
      isTextRetrievalConfigured()
        ? retrieveVeterinaryTextEvidence({
            query: knowledgeQuery,
            domain,
            breed: pet.breed,
            conditionHints,
            dogOnly: true,
            textLimit: 3,
          })
        : Promise.resolve({
            textChunks: [],
            rerankScores: [],
            sourceCitations: [],
          }),
      isImageRetrievalConfigured()
        ? retrieveVeterinaryImageEvidence({
            query: referenceImageQuery,
            domain,
            breed: pet.breed,
            conditionHints,
            dogOnly: true,
            imageLimit: 4,
          })
        : Promise.resolve({
            imageMatches: [],
            sourceCitations: [],
          }),
    ]);

    if (textResult.status === "fulfilled") {
      session = appendSidecarObservation(session, {
        service: "text-retrieval-service",
        stage: "report-retrieval",
        latencyMs: Date.now() - textStarted,
        outcome: retrievalShadowMode ? "shadow" : "success",
        shadowMode: retrievalShadowMode,
        fallbackUsed: retrievalShadowMode,
        note: `chunks=${textResult.value.textChunks.length}`,
      });
    } else if (isTextRetrievalConfigured()) {
      const timedOut = isSidecarAbortError(textResult.reason);
      session = appendSidecarObservation(session, {
        service: "text-retrieval-service",
        stage: "report-retrieval",
        latencyMs: Date.now() - textStarted,
        outcome: timedOut ? "timeout" : "error",
        shadowMode: retrievalShadowMode,
        fallbackUsed: true,
        note: timedOut ? "text retrieval timeout" : "text retrieval failed",
      });
      if (timedOut) {
        session.case_memory = {
          ...ensureStructuredCaseMemory(session),
          service_timeouts: [
            ...ensureStructuredCaseMemory(session).service_timeouts,
            {
              service: "text-retrieval-service",
              stage: "report-retrieval",
              reason: "timeout",
            },
          ].slice(-10),
        };
      }
    }

    if (imageResult.status === "fulfilled") {
      session = appendSidecarObservation(session, {
        service: "image-retrieval-service",
        stage: "report-retrieval",
        latencyMs: Date.now() - imageStarted,
        outcome: retrievalShadowMode ? "shadow" : "success",
        shadowMode: retrievalShadowMode,
        fallbackUsed: retrievalShadowMode,
        note: `images=${imageResult.value.imageMatches.length}`,
      });
    } else if (isImageRetrievalConfigured()) {
      const timedOut = isSidecarAbortError(imageResult.reason);
      session = appendSidecarObservation(session, {
        service: "image-retrieval-service",
        stage: "report-retrieval",
        latencyMs: Date.now() - imageStarted,
        outcome: timedOut ? "timeout" : "error",
        shadowMode: retrievalShadowMode,
        fallbackUsed: true,
        note: timedOut ? "image retrieval timeout" : "image retrieval failed",
      });
      if (timedOut) {
        session.case_memory = {
          ...ensureStructuredCaseMemory(session),
          service_timeouts: [
            ...ensureStructuredCaseMemory(session).service_timeouts,
            {
              service: "image-retrieval-service",
              stage: "report-retrieval",
              reason: "timeout",
            },
          ].slice(-10),
        };
      }
    }

    sidecarBundle = {
      textChunks:
        textResult.status === "fulfilled" ? textResult.value.textChunks : [],
      imageMatches:
        imageResult.status === "fulfilled" ? imageResult.value.imageMatches : [],
      rerankScores:
        textResult.status === "fulfilled" ? textResult.value.rerankScores : [],
      sourceCitations: [
        ...(textResult.status === "fulfilled"
          ? textResult.value.sourceCitations
          : []),
        ...(imageResult.status === "fulfilled"
          ? imageResult.value.sourceCitations
          : []),
      ].slice(0, 8),
    };
  } else if (isRetrievalSidecarConfigured()) {
    const startedAt = Date.now();
    try {
      sidecarBundle = await retrieveVeterinaryEvidenceFromSidecar({
        query: knowledgeQuery,
        domain,
        breed: pet.breed,
        conditionHints,
        dogOnly: true,
        textLimit: 3,
        imageLimit: 4,
      });
      session = appendSidecarObservation(session, {
        service: "text-retrieval-service",
        stage: "legacy-combined-retrieval",
        latencyMs: Date.now() - startedAt,
        outcome: retrievalShadowMode ? "shadow" : "success",
        shadowMode: retrievalShadowMode,
        fallbackUsed: retrievalShadowMode,
        note: "legacy combined retrieval endpoint",
      });
    } catch (error) {
      console.error("[HF Retrieval Sidecar] failed:", error);
      session = appendSidecarObservation(session, {
        service: "text-retrieval-service",
        stage: "legacy-combined-retrieval",
        latencyMs: Date.now() - startedAt,
        outcome: isSidecarAbortError(error) ? "timeout" : "error",
        shadowMode: retrievalShadowMode,
        fallbackUsed: true,
        note: "legacy combined retrieval failed",
      });
    }
  }

  const fallbackBundle = await buildFallbackRetrievalBundle(
    knowledgeQuery,
    referenceImageQuery,
    domain
  );

  if (sidecarBundle) {
    if (retrievalShadowMode) {
      session = appendShadowComparison(
        session,
        describeShadowComparison(
          "text-retrieval-service",
          "fallback-retrieval",
          "hf-retrieval-sidecars",
          `Fallback text=${fallbackBundle.textChunks.length}, images=${fallbackBundle.imageMatches.length}; shadow text=${sidecarBundle.textChunks.length}, images=${sidecarBundle.imageMatches.length}`,
          Math.abs(fallbackBundle.textChunks.length - sidecarBundle.textChunks.length) +
            Math.abs(fallbackBundle.imageMatches.length - sidecarBundle.imageMatches.length)
        )
      );
      return { session, bundle: fallbackBundle };
    }

    return { session, bundle: sidecarBundle };
  }

  session = appendSidecarObservation(session, {
    service: "text-retrieval-service",
    stage: "report-retrieval",
    latencyMs: 0,
    outcome: "fallback",
    shadowMode: false,
    fallbackUsed: true,
    note: "using local retrieval fallback",
  });

  return { session, bundle: fallbackBundle };
}

async function buildFallbackRetrievalBundle(
  knowledgeQuery: string,
  referenceImageQuery: string,
  domain: SupportedImageDomain | null
): Promise<RetrievalBundle> {
  const knowledgeChunks = (await searchKnowledgeChunks(knowledgeQuery, 3)) || [];
  const referenceImageMatches =
    (await searchReferenceImages(
    referenceImageQuery,
    4,
    [],
    {
      domain,
      dogOnly: true,
      liveOnly: true,
    }
  )) || [];

  return {
    textChunks: knowledgeChunks.map((chunk) => ({
      title: chunk.sourceTitle,
      citation: chunk.citation || chunk.sourceUrl,
      score: chunk.score,
      summary: chunk.textContent,
      sourceUrl: chunk.sourceUrl,
    })),
    imageMatches: referenceImageMatches.map((match) => ({
      title: match.sourceTitle,
      citation: match.datasetUrl || match.assetUrl,
      score: match.similarity,
      summary: match.caption || match.conditionLabel,
      assetUrl: match.assetUrl,
      domain: inferSupportedImageDomain(
        `${match.conditionLabel} ${match.caption || ""}`
      ),
      conditionLabel: match.conditionLabel,
      dogOnly: true,
    })),
    rerankScores: [],
    sourceCitations: [
      ...knowledgeChunks
        .map((chunk) => chunk.citation || chunk.sourceUrl || "")
        .filter(Boolean),
      ...referenceImageMatches
        .map((match) => match.datasetUrl || match.assetUrl || "")
        .filter(Boolean),
    ].slice(0, 8),
  };
}

function formatRetrievalTextContext(bundle: RetrievalBundle): string {
  if (bundle.textChunks.length === 0) return "";

  return bundle.textChunks
    .map((chunk, index) => {
      const excerpt =
        chunk.summary.length > 700
          ? `${chunk.summary.slice(0, 700).trim()}...`
          : chunk.summary;
      const citation = chunk.citation || chunk.sourceUrl || "No source URL";
      return `${index + 1}. ${chunk.title}\nSource: ${citation}\nScore: ${chunk.score.toFixed(2)}\nExcerpt: ${excerpt}`;
    })
    .join("\n\n");
}

function formatRetrievalImageContext(bundle: RetrievalBundle): string {
  if (bundle.imageMatches.length === 0) return "";

  return bundle.imageMatches
    .map((match, index) => {
      const similarity = Number.isFinite(match.score)
        ? `${(match.score * 100).toFixed(1)}%`
        : "n/a";
      return `${index + 1}. ${match.conditionLabel || match.title} (${similarity} visual similarity)\nSource: ${match.title}\nCitation: ${match.citation || "No citation"}\nSummary: ${match.summary || "No summary"}`;
    })
    .join("\n\n");
}

function formatVisualEvidenceForReport(session: TriageSession): string {
  const evidence = session.case_memory?.visual_evidence || [];
  if (evidence.length === 0) {
    return session.vision_analysis || "No structured visual evidence recorded.";
  }

  return evidence
    .slice(-3)
    .map(
      (entry) =>
        `- ${entry.domain} | ${entry.bodyRegion || "unknown region"} | severity=${entry.severity} | confidence=${entry.confidence.toFixed(2)} | findings=${entry.findings.join("; ") || "none"} | limitations=${entry.limitations.join(", ") || "none"}`
    )
    .join("\n");
}

function formatConsultEvidenceForReport(session: TriageSession): string {
  const opinions = session.case_memory?.consult_opinions || [];
  if (opinions.length === 0) return "No specialist consult opinions recorded.";

  return opinions
    .slice(-3)
    .map(
      (opinion) =>
        `- ${opinion.model} (${opinion.mode}) confidence=${opinion.confidence.toFixed(2)} | summary=${opinion.summary} | agreements=${opinion.agreements.join(", ") || "none"} | disagreements=${opinion.disagreements.join(", ") || "none"} | uncertainties=${opinion.uncertainties.join(", ") || "none"}`
    )
    .join("\n");
}

function formatEvidenceChainForReport(session: TriageSession): string {
  const notes = session.case_memory?.evidence_chain || [];
  return notes.length > 0 ? notes.map((note) => `- ${note}`).join("\n") : "- No explicit evidence chain recorded.";
}

function buildEvidenceChainForResponse(
  session: TriageSession,
  retrievalBundle: RetrievalBundle
): string[] {
  return [
    ...(session.case_memory?.evidence_chain || []),
    ...(retrievalBundle.textChunks.slice(0, 2).map(
      (entry) => `Reference support: ${entry.title} (${entry.score.toFixed(2)})`
    )),
    ...(retrievalBundle.imageMatches.slice(0, 2).map(
      (entry) =>
        `Image support: ${entry.conditionLabel || entry.title} (${entry.score.toFixed(2)})`
    )),
  ].slice(-8);
}

function deriveBaselineReportConfidence(
  context: ReturnType<typeof buildDiagnosisContext>
): number {
  if (context.top5.length === 0) return 0.7;
  const topScore = context.top5[0]?.final_score || 0;
  if (topScore >= 1.6) return 0.92;
  if (topScore >= 1.1) return 0.87;
  if (topScore >= 0.8) return 0.82;
  return 0.76;
}

function shouldScheduleAsyncConsultReview(session: TriageSession): boolean {
  return Boolean(
    session.case_memory?.ambiguity_flags?.length ||
      session.case_memory?.consult_opinions?.some(
        (opinion) => opinion.uncertainties.length > 0
      )
  );
}

function hasPositiveVisionNarrative(visionAnalysis: string | null): boolean {
  if (!visionAnalysis) return false;

  return /(wound|lesion|ulcer|abrasion|rash|discharge|inflam|swelling|redness|ear|eye|vomit|stool|diarrh)/i.test(
    visionAnalysis
  );
}

function deriveSymptomsFromImageEvidence(input: {
  preprocess: VisionPreprocessResult | null;
  visionAnalysis: string | null;
  visionSymptoms: string[];
  visionRedFlags: string[];
  visionSeverity: "normal" | "needs_review" | "urgent";
}): string[] {
  const { preprocess, visionAnalysis, visionSymptoms, visionRedFlags, visionSeverity } =
    input;
  if (!preprocess) return [];

  const hasStructuredVisionEvidence =
    visionSymptoms.length > 0 || visionRedFlags.length > 0;
  const hasNarrativeEvidence = hasPositiveVisionNarrative(visionAnalysis);
  const hasEscalatedSeverity = visionSeverity !== "normal";

  // Domain classification alone is not enough to mutate symptom state.
  if (
    !hasStructuredVisionEvidence &&
    !hasNarrativeEvidence &&
    !hasEscalatedSeverity
  ) {
    return [];
  }

  switch (preprocess.domain) {
    case "eye":
      return ["eye_discharge"];
    case "ear":
      return ["ear_scratching"];
    case "stool_vomit":
      return ["vomiting", "diarrhea"];
    case "skin_wound":
      return ["wound_skin_issue"];
    default:
      return [];
  }
}

function runAfterSafely(task: () => Promise<void>): boolean {
  try {
    after(async () => {
      await task();
    });
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      /outside a request scope/i.test(error.message)
    ) {
      return false;
    }
    console.error("[Async After] failed to schedule:", error);
    return false;
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

function getNextQuestionAvoidingRepeat(
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

function coerceAnswerForQuestion(
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
      if (lower.includes("blood") || lower.includes("bloody") || lower.includes("bleed")) {
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
            lower.includes(`${spacedChoice}`) ||
            lower.includes(`${normalizedChoice}`)
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

function normalizeChoiceLabel(choice: string): string {
  return String(choice).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeIntentText(rawMessage: string): string {
  return rawMessage
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[,:;]+/g, " ")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
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
      question.choices.some((choice) => normalizeChoiceLabel(choice) === "normal"))
  );
}

function coerceChoiceAnswerFromIntent(
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
      /\b(drinking normally|water is normal|normal drinking|drinking okay|drinking ok|water seems fine|intake is normal)\b/.test(lower) ||
      /yes[^a-z]*[a-z]*[^a-z]*normal/.test(lower) ||
      ((lower.includes("normal") ||
        lower.includes("fine") ||
        lower.includes("okay") ||
        lower.includes("ok")) &&
        (lower.includes("drink") || lower.includes("water") || lower.includes("yes")))
    ) {
      return pickChoiceByPriority(choices, [["normal"], ["usual"]]);
    }

    // Handle "not really" / "no not really" / "not much" patterns for reduced water intake
    // These indicate the owner is being hesitant or negative about something
    if (
      /\b(not really|not at all|nothing much)\b/.test(lower) &&
      (lower.includes("drink") || lower.includes("water") || lower.includes("thirsty"))
    ) {
      return pickChoiceByPriority(choices, [
        ["less", "than", "usual"],
        ["less"],
        ["reduc"],
      ]);
    }

    // Handle standalone "not really" with optional "no" prefix - common hesitation pattern
    // e.g. "no not really", "not really" alone - these indicate reduced/normal at best
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
  const combinedText = `${question.question_text || ""} ${question.extraction_hint || ""}`.toLowerCase();
  return /\b(duration|how long|when did|when does|onset|started|going on|timing|frequency)\b/.test(
    combinedText
  );
}

function hasDurationLikeSignal(normalizedMessage: string): boolean {
  return /\b(\d+\s*(hour|day|week|month|year)s?|today|yesterday|tonight|this morning|last night|since|for\s+\w+|sudden|suddenly|gradual|gradually)\b/.test(
    normalizedMessage
  );
}

function shouldPersistRawPendingAnswer(
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

  const hasOtherTurnAnswers = Object.keys(turnAnswers).some((key) => key !== questionId);
  const hasOtherTurnSymptoms = turnSymptoms.length > 0;

  if (question.data_type === "string") {
    if (isShortUnknownResponse(normalizedMessage)) {
      return true;
    }

    if (hasOtherTurnAnswers || hasOtherTurnSymptoms) {
      return false;
    }

    if (questionLooksDurationLike(question) && hasDurationLikeSignal(normalizedMessage)) {
      return true;
    }

    if (messageMentionsQuestionContext(question, normalizedMessage)) {
      return true;
    }

    return normalizedMessage.split(/\s+/).length <= 5;
  }

  if (
    question.data_type === "choice" ||
    question.data_type === "boolean" ||
    question.data_type === "number"
  ) {
    return (
      isShortAffirmativeResponse(normalizedMessage) ||
      isShortNegativeResponse(normalizedMessage) ||
      isShortUnknownResponse(normalizedMessage) ||
      messageMentionsQuestionContext(question, normalizedMessage)
    );
  }

  return false;
}

function sanitizePendingRawAnswer(rawMessage: string): string | null {
  const cleaned = rawMessage.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, 160) : null;
}

function resolvePendingQuestionAnswer({
  questionId,
  rawMessage,
  combinedUserSignal,
  turnAnswers,
  turnSymptoms,
}: {
  questionId: string;
  rawMessage: string;
  combinedUserSignal: string;
  turnAnswers: Record<string, string | boolean | number>;
  turnSymptoms: string[];
}): { value: string | boolean | number; source: string } | null {
  const directAnswer = coerceFallbackAnswerForPendingQuestion(
    questionId,
    rawMessage,
    turnAnswers
  );
  if (directAnswer !== null) {
    return { value: directAnswer, source: "direct_coercion" };
  }

  const combinedAnswer = coerceFallbackAnswerForPendingQuestion(
    questionId,
    combinedUserSignal,
    turnAnswers
  );
  if (combinedAnswer !== null) {
    return { value: combinedAnswer, source: "combined_signal" };
  }

  if (!shouldPersistRawPendingAnswer(questionId, rawMessage, turnAnswers, turnSymptoms)) {
    return null;
  }

  const rawFallback = sanitizePendingRawAnswer(rawMessage);
  if (!rawFallback) {
    return null;
  }

  return { value: rawFallback, source: "raw_fallback" };
}

function coerceFallbackAnswerForPendingQuestion(
  questionId: string,
  rawMessage: string,
  turnAnswers: Record<string, string | boolean | number> = {}
): string | boolean | number | null {
  const deterministic = deriveDeterministicAnswerForQuestion(questionId, rawMessage);
  if (deterministic !== null) {
    return deterministic;
  }

  if (questionId === "which_leg" || questionId === "wound_location") {
    return null;
  }

  const question = FOLLOW_UP_QUESTIONS[questionId];
  if (!question || question.data_type === "string") {
    return null;
  }

  return coerceAnswerForQuestion(questionId, rawMessage);
}

function extractDeterministicAnswersForTurn(
  rawMessage: string,
  session: TriageSession
): Record<string, string | boolean | number> {
  const answers: Record<string, string | boolean | number> = {};
  const candidateQuestions = getDeterministicCandidateQuestionIds(session);

  for (const questionId of candidateQuestions) {
    if (shouldSkipDeterministicQuestion(session, questionId, rawMessage)) {
      continue;
    }

    const derivedAnswer = deriveDeterministicAnswerForQuestion(
      questionId,
      rawMessage
    );
    if (derivedAnswer !== null) {
      answers[questionId] = derivedAnswer;
    }
  }

  return answers;
}

function deriveDeterministicAnswerForQuestion(
  questionId: string,
  rawMessage: string
): string | boolean | number | null {
  switch (questionId) {
    case "which_leg":
      return extractLegLocation(rawMessage);
    case "wound_location":
      return extractBodyLocation(rawMessage);
    case "limping_onset":
      return extractLimpingOnset(rawMessage);
    case "breathing_onset":
      return extractBreathingOnset(rawMessage);
    case "abdomen_onset":
      return extractAbdomenOnset(rawMessage);
    case "limping_progression":
      return extractLimpingProgression(rawMessage);
    case "weight_bearing":
      return extractWeightBearingStatus(rawMessage);
    case "trauma_history":
      return extractTraumaHistory(rawMessage);
    case "gum_color":
      return extractGumColor(rawMessage);
    case "water_intake":
      return extractWaterIntake(rawMessage);
    case "consciousness_level":
      return extractConsciousnessLevel(rawMessage);
    case "blood_color":
      return extractBloodColor(rawMessage);
    case "blood_amount":
      return extractBloodAmount(rawMessage);
    case "rat_poison_access":
      return extractRatPoisonAccess(rawMessage);
    case "toxin_exposure":
      return extractToxinExposure(rawMessage);
    case "pain_on_touch":
      return extractPainOnTouch(rawMessage);
    case "worse_after_rest":
      return extractWorseAfterRest(rawMessage);
    case "swelling_present":
      return extractSwellingPresence(rawMessage);
    case "warmth_present":
      return extractWarmthPresence(rawMessage);
    case "prior_limping":
      return extractPriorLimping(rawMessage);
    default: {
      return null;
    }
  }
}

function getDeterministicCandidateQuestionIds(session: TriageSession): string[] {
  const questionIds = new Set<string>(getMissingQuestions(session));

  for (const symptom of session.known_symptoms) {
    for (const questionId of SYMPTOM_MAP[symptom]?.follow_up_questions || []) {
      questionIds.add(questionId);
    }
  }

  if (
    session.last_question_asked &&
    !session.answered_questions.includes(session.last_question_asked)
  ) {
    questionIds.add(session.last_question_asked);
  }

  return [...questionIds];
}

function shouldSkipDeterministicQuestion(
  session: TriageSession,
  questionId: string,
  rawMessage: string
): boolean {
  if (!Object.prototype.hasOwnProperty.call(session.extracted_answers, questionId)) {
    return false;
  }

  return !shouldRefreshDeterministicAnswer(session, questionId, rawMessage);
}

function shouldRefreshDeterministicAnswer(
  session: TriageSession,
  questionId: string,
  rawMessage: string
): boolean {
  if (!isRefreshableDeterministicQuestion(questionId)) {
    return false;
  }

  const refreshedAnswer = sanitizeAnswerForQuestion(
    questionId,
    deriveDeterministicAnswerForQuestion(questionId, rawMessage)
  );
  if (refreshedAnswer === null) {
    return false;
  }

  const currentAnswer = sanitizeAnswerForQuestion(
    questionId,
    session.extracted_answers[questionId]
  );

  return !areEquivalentAnswers(currentAnswer, refreshedAnswer);
}

function isRefreshableDeterministicQuestion(questionId: string): boolean {
  return [
    "which_leg",
    "wound_location",
    "limping_onset",
    "breathing_onset",
    "abdomen_onset",
    "limping_progression",
    "weight_bearing",
    "trauma_history",
    "gum_color",
    "water_intake",
    "consciousness_level",
    "blood_color",
    "blood_amount",
    "rat_poison_access",
    "toxin_exposure",
    "pain_on_touch",
    "worse_after_rest",
    "swelling_present",
    "warmth_present",
    "prior_limping",
  ].includes(questionId);
}

function areEquivalentAnswers(
  left: string | boolean | number | null,
  right: string | boolean | number | null
): boolean {
  if (left === right) {
    return true;
  }

  if (
    typeof left === "string" &&
    typeof right === "string" &&
    left.trim().toLowerCase() === right.trim().toLowerCase()
  ) {
    return true;
  }

  return false;
}

function mergeTurnAnswers(
  session: TriageSession,
  deterministicAnswers: Record<string, string | boolean | number>,
  modelAnswers: Record<string, string | boolean | number>
): Record<string, string | boolean | number> {
  const merged: Record<string, string | boolean | number> = {};
  const questionIds = new Set([
    ...Object.keys(deterministicAnswers),
    ...Object.keys(modelAnswers),
  ]);

  for (const questionId of questionIds) {
    const deterministicValue = sanitizeAnswerForQuestion(
      questionId,
      deterministicAnswers[questionId]
    );
    const modelValue = sanitizeAnswerForQuestion(
      questionId,
      modelAnswers[questionId]
    );

    const preferredValue = shouldPreferDeterministicAnswer(questionId)
      ? deterministicValue ?? modelValue
      : modelValue ?? deterministicValue;

    if (preferredValue !== null) {
      merged[questionId] = preferredValue;
    }
  }

  return merged;
}

function shouldPreferDeterministicAnswer(questionId: string): boolean {
  return [
    "which_leg",
    "wound_location",
    "limping_onset",
    "breathing_onset",
    "abdomen_onset",
    "limping_progression",
    "weight_bearing",
    "trauma_history",
    "gum_color",
    "water_intake",
    "consciousness_level",
    "blood_color",
    "blood_amount",
    "rat_poison_access",
    "toxin_exposure",
    "swelling_present",
    "warmth_present",
    "pain_on_touch",
    "worse_after_rest",
    "prior_limping",
  ].includes(questionId);
}

function sanitizeAnswerForQuestion(
  questionId: string,
  value: string | boolean | number | null | undefined
): string | boolean | number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  switch (questionId) {
    case "which_leg":
      return extractLegLocation(trimmed);
    case "wound_location":
      return extractBodyLocation(trimmed);
    case "limping_onset":
      return extractLimpingOnset(trimmed) ? trimmed : null;
    case "limping_progression":
      return extractLimpingProgression(trimmed);
    case "weight_bearing":
      return extractWeightBearingStatus(trimmed) ?? coerceAnswerForQuestion(questionId, trimmed);
    case "trauma_history":
      return extractTraumaHistory(trimmed) ?? coerceAnswerForQuestion(questionId, trimmed);
    default:
      return coerceAnswerForQuestion(questionId, trimmed);
  }
}

function extractLegLocation(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  const side = /\bleft\b/.test(lower) ? "left" : /\bright\b/.test(lower) ? "right" : "";
  const position =
    /\b(back|hind|rear)\b/.test(lower)
      ? "back"
      : /\b(front|fore)\b/.test(lower)
        ? "front"
        : "";

  if (!side) {
    return null;
  }

  const parts = [side, position, "leg"].filter(Boolean);
  return parts.join(" ").trim() || null;
}

function extractBodyLocation(rawMessage: string): string | null {
  const explicitLegLocation = extractLegLocation(rawMessage);
  if (explicitLegLocation) {
    return explicitLegLocation;
  }

  const lower = rawMessage.toLowerCase();
  const bodyAreaMatch = lower.match(
    /\b(head|face|eye|ear|neck|shoulder|chest|back|spine|belly|abdomen|stomach|flank|hip|tail|paw|foot|toe|leg|arm|elbow|knee|thigh)\b/
  );
  if (!bodyAreaMatch) {
    return null;
  }

  const side = /\bleft\b/.test(lower) ? "left " : /\bright\b/.test(lower) ? "right " : "";
  return `${side}${bodyAreaMatch[1]}`.trim();
}

function extractLimpingOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractBreathingOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractAbdomenOnset(rawMessage: string): string | null {
  return extractOnsetPattern(rawMessage);
}

function extractLimpingProgression(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(getting worse|worsening|worse)\b/.test(lower)) return "worse";
  if (/\b(getting better|improving|better)\b/.test(lower)) return "better";
  if (/\b(staying the same|about the same|same|unchanged|stable)\b/.test(lower)) {
    return "same";
  }

  return null;
}

function extractOnsetPattern(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (
    /\b(gradual|gradually|over time|slowly|progressively|for weeks|for months)\b/.test(
      lower
    )
  ) {
    return "gradual";
  }

  if (
    /\b(sudden|suddenly|all of a sudden|just started|started today|started this morning|since this morning|since yesterday|today|this morning|last night|yesterday|within hours|a few hours ago)\b/.test(
      lower
    )
  ) {
    return "sudden";
  }

  return null;
}

function extractGumColor(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(blue|bluish|gray|grey|purple)\b/.test(lower)) return "blue";
  if (/\b(pale|white|whitish)\b/.test(lower)) return "pale_white";
  if (/\b(bright red|very red|red gums)\b/.test(lower)) return "bright_red";
  if (/\b(yellow|jaundice|jaundiced)\b/.test(lower)) return "yellow";
  if (/\b(pink|normal)\b/.test(lower)) return "pink_normal";

  return null;
}

function extractWaterIntake(rawMessage: string): string | null {
  return coerceChoiceAnswerFromIntent("water_intake", rawMessage);
}

function extractConsciousnessLevel(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(unresponsive|passed out|collapsed|not waking up|won't wake|wont wake)\b/.test(lower)) {
    return "unresponsive";
  }
  if (/\b(dull|out of it|very weak|barely responsive|not acting alert)\b/.test(lower)) {
    return "dull";
  }
  if (/\b(alert|responsive|acting normal)\b/.test(lower)) {
    return "alert";
  }

  return null;
}

function extractBloodColor(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(bright red|fresh red)\b/.test(lower)) return "bright_red";
  if (/\b(dark|tarry|black)\b/.test(lower)) return "dark_tarry";

  return null;
}

function extractBloodAmount(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(mostly blood|all blood|pool of blood|a lot of blood|heavy bleeding)\b/.test(lower)) {
    return "mostly_blood";
  }
  if (/\b(mixed in|throughout|mixed with stool)\b/.test(lower)) {
    return "mixed_in";
  }
  if (/\b(streaks|streaking|on the surface|small amount)\b/.test(lower)) {
    return "streaks";
  }

  return null;
}

function extractRatPoisonAccess(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();

  if (/\b(no rat poison|no rodenticide|did not get into rat poison)\b/.test(lower)) {
    return false;
  }
  if (/\b(rat poison|rodenticide|mouse bait|bait station|warfarin|brodifacoum|bromadiolone)\b/.test(lower)) {
    return true;
  }

  return null;
}

function extractToxinExposure(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(rat poison|rodenticide|mouse bait|bait station|xylitol|chocolate|grapes|raisins|antifreeze|ibuprofen|naproxen|acetaminophen|marijuana|cannabis)\b/.test(
      lower
    )
  ) {
    return rawMessage.trim().slice(0, 160);
  }

  return null;
}

function extractWeightBearingStatus(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();

  if (/\bnon[_\s-]?weight[_\s-]?bearing\b/.test(lower)) {
    return "non_weight_bearing";
  }
  if (/\bweight[_\s-]?bearing\b/.test(lower)) {
    return "weight_bearing";
  }

  if (
    /\b(non weight bearing|non-weight-bearing|not putting weight|won't put weight|avoiding it completely|holding it up|won't use it|not using it|hopping)\b/.test(
      lower
    )
  ) {
    return "non_weight_bearing";
  }

  if (
    /\b(partial weight|barely putting weight|toe touching|touching toes|favoring it|limping but walking)\b/.test(
      lower
    )
  ) {
    return "partial";
  }

  if (/\b(putting weight|bearing weight|walking on it|still using it)\b/.test(lower)) {
    return "weight_bearing";
  }

  return null;
}

function extractTraumaHistory(rawMessage: string): string | null {
  const lower = rawMessage.toLowerCase();
  if (
    /\b(fall|fell|jump|jumped|rough play|collision|hit|slipped|slid|twisted|injured|injury|landed badly)\b/.test(
      lower
    )
  ) {
    return rawMessage.trim().slice(0, 160);
  }

  return null;
}

function extractPainOnTouch(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(doesn't react|doesnt react|no pain when touched|not painful)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(yelp|yelps|pulled away|pulls away|growl|growls|cries out|painful when touched|hurts when touched|tender to touch)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
}

function extractWorseAfterRest(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(not worse after rest|same after rest|no stiffness after rest)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(worse after rest|worse when .*gets up|stiff after rest|stiff when .*gets up|stiff after sleeping)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
}

function extractSwellingPresence(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(no swelling|not swollen)\b/.test(lower)) {
    return false;
  }
  if (/\b(swollen|swelling|puffy|enlarged)\b/.test(lower)) {
    return true;
  }
  return null;
}

function extractWarmthPresence(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(not warm|not hot|cool to touch)\b/.test(lower)) {
    return false;
  }
  if (/\b(warm to touch|hot to touch|feels warm|feels hot)\b/.test(lower)) {
    return true;
  }
  return null;
}

function extractPriorLimping(rawMessage: string): boolean | null {
  const lower = rawMessage.toLowerCase();
  if (/\b(first time|never before|no previous episodes)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(has happened before|previous limp|previous episode|again|recurring|comes and goes|used to limp)\b/.test(
      lower
    )
  ) {
    return true;
  }
  return null;
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

  if (session.latest_image_domain && session.latest_image_domain !== "unsupported") {
    parts.push(`Image domain: ${session.latest_image_domain}`);
  }

  if (session.latest_image_body_region) {
    parts.push(`Image body region: ${session.latest_image_body_region}`);
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

  // Include actual vision findings so the AI can reference what it SAW
  if (session.vision_analysis) {
    // Trim to most relevant 300 chars — this is what the AI will reference
    const visionSummary = session.vision_analysis
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .substring(0, 300);
    parts.push(`PHOTO FINDINGS: ${visionSummary}`);
  } else if (session.roboflow_skin_labels?.length) {
    parts.push(
      `Photo likely shows: ${session.roboflow_skin_labels.slice(0, 2).join(", ")}`
    );
  }

  if (visionSeverity && visionSeverity !== "normal") {
    parts.push(`Visual severity: ${visionSeverity}`);
  }

  if (session.vision_symptoms?.length) {
    parts.push(`Visual symptoms detected: ${session.vision_symptoms.join(", ")}`);
  }

  if (session.latest_visual_evidence) {
    parts.push(
      `Structured visual evidence: domain=${session.latest_visual_evidence.domain}, body_region=${session.latest_visual_evidence.bodyRegion || "unknown"}, findings=${session.latest_visual_evidence.findings.join(", ") || "none"}, contradictions=${session.latest_visual_evidence.contradictions.join(", ") || "none"}`
    );
  }

  if (session.latest_consult_opinion) {
    parts.push(
      `Specialist consult: ${session.latest_consult_opinion.summary}. Uncertainties: ${
        session.latest_consult_opinion.uncertainties.join(", ") || "none"
      }`
    );
  }

  // Tell the AI what the PREVIOUS question was so it can connect the answer
  if (session.last_question_asked && session.answered_questions.includes(session.last_question_asked)) {
    const prevQ = getQuestionText(session.last_question_asked);
    parts.push(`The owner's last message (including photo) answered: "${prevQ}"`);
  }

  return parts.join(". ");
}

function shouldIncludeImageContextInQuestion(
  questionId: string,
  session: TriageSession,
  preferredSymptoms: string[]
): boolean {
  if (questionId.startsWith("wound_")) {
    return true;
  }

  return (
    preferredSymptoms.some((symptom) =>
      SYMPTOM_MAP[symptom]?.follow_up_questions.includes(questionId)
    ) &&
    (Boolean(session.roboflow_skin_labels?.length) || Boolean(session.vision_analysis))
  );
}

function buildTurnFocusSymptoms(
  knownSymptomsBeforeTurn: Set<string>,
  session: TriageSession,
  visionSymptoms: string[] = [],
  extractedSymptoms: string[] = []
): string[] {
  const focus = new Set<string>();

  for (const symptom of session.known_symptoms) {
    if (!knownSymptomsBeforeTurn.has(symptom)) {
      focus.add(symptom);
    }
  }

  for (const symptom of [...visionSymptoms, ...extractedSymptoms]) {
    if (session.known_symptoms.includes(symptom)) {
      focus.add(symptom);
    }
  }

  return [...focus];
}

function propagateSharedLocationAnswers(session: TriageSession): TriageSession {
  const locationQuestionGroups = [["which_leg", "wound_location"]];
  let updated = session;

  for (const group of locationQuestionGroups) {
    const sourceQuestionId = group.find(
      (questionId) =>
        Object.prototype.hasOwnProperty.call(
          updated.extracted_answers,
          questionId
        ) &&
        updated.extracted_answers[questionId] !== ""
    );

    if (!sourceQuestionId) {
      continue;
    }

    const sourceValue = updated.extracted_answers[sourceQuestionId];

    for (const targetQuestionId of group) {
      if (targetQuestionId === sourceQuestionId) {
        continue;
      }

      if (
        updated.answered_questions.includes(targetQuestionId) ||
        !canPropagateLocationAnswer(
          updated,
          sourceQuestionId,
          targetQuestionId,
          sourceValue
        ) ||
        !isQuestionRelevantForCurrentSymptoms(updated, targetQuestionId)
      ) {
        continue;
      }

      updated = recordAnswer(updated, targetQuestionId, sourceValue);
    }
  }

  return updated;
}

function canPropagateLocationAnswer(
  session: TriageSession,
  sourceQuestionId: string,
  targetQuestionId: string,
  sourceValue: string | boolean | number
): boolean {
  const normalizedLocation = normalizeExplicitLegLocationAnswer(sourceValue);
  if (!normalizedLocation) {
    return false;
  }

  if (sourceQuestionId === "which_leg" && targetQuestionId === "wound_location") {
    return (
      session.known_symptoms.includes("wound_skin_issue") &&
      (Boolean(session.vision_analysis) ||
        Boolean(session.roboflow_skin_labels?.length) ||
        Boolean(session.vision_symptoms?.includes("wound_skin_issue")))
    );
  }

  if (sourceQuestionId === "wound_location" && targetQuestionId === "which_leg") {
    return session.known_symptoms.includes("limping");
  }

  return false;
}

function normalizeExplicitLegLocationAnswer(
  value: string | boolean | number
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase();
  const hasExplicitSide = /\bleft\b|\bright\b/.test(normalized);
  const mentionsLeg = /\bleg\b/.test(normalized);

  return hasExplicitSide && mentionsLeg ? normalized : null;
}

function isQuestionRelevantForCurrentSymptoms(
  session: TriageSession,
  questionId: string
): boolean {
  return session.known_symptoms.some((symptom) =>
    SYMPTOM_MAP[symptom]?.follow_up_questions.includes(questionId)
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

function isImageEvidenceQuestion(questionId?: string): boolean {
  if (!questionId) {
    return false;
  }

  return [
    "which_leg",
    "wound_location",
    "pain_on_touch",
    "swelling_present",
    "warmth_present",
    "wound_size",
    "wound_duration",
    "wound_color",
    "wound_discharge",
    "wound_odor",
    "wound_licking",
  ].includes(questionId);
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

