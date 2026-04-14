import { NextResponse } from "next/server";
import {
  isNvidiaConfigured,
  phraseWithLlama,
  reviewQuestionPlanWithNemotron,
  verifyQuestionWithNemotron,
  diagnoseWithDeepSeek,
  runVisionPipeline,
  parseVisionForMatrix,
  imageGuardrail,
} from "@/lib/nvidia-models";
import {
  safeParseJson,
  stripMarkdownCodeFences,
  stripThinkingBlocks,
} from "@/lib/llm-output";
import {
  createSession,
  addSymptoms,
  recordAnswer,
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
  formatBreedRiskContext,
  getBreedRiskProfiles,
} from "@/lib/breed-risk";
import {
  buildReferenceImageQuery,
  buildKnowledgeSearchQuery,
  searchClinicalCases,
  formatClinicalCaseContext,
} from "@/lib/knowledge-retrieval";
import {
  capDiagnosticConfidence,
  inferSupportedImageDomain,
  type ConsultOpinion,
  type ServiceTimeoutRecord,
  type VisionClinicalEvidence,
  type VisionPreprocessResult,
} from "@/lib/clinical-evidence";
import { buildStructuredEvidenceChain } from "@/lib/evidence-chain";
import { enqueueAsyncReview } from "@/lib/async-review-client";
import {
  consultWithMultimodalSidecar,
  isAbortLikeError as isSidecarAbortError,
  isMultimodalConsultConfigured,
  isVisionPreprocessConfigured,
  preprocessVeterinaryImage,
} from "@/lib/hf-sidecars";
import {
  symptomChatLimiter,
  checkRateLimit,
  getRateLimitId,
} from "@/lib/rate-limit";
import { computeBayesianScore } from "@/lib/bayesian-scorer";
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
  type RecoverySource,
  updateStructuredCaseMemory,
} from "@/lib/symptom-memory";
import {
  getStateSnapshot,
  inferConversationState,
  transitionToAnswered,
  transitionToAsked,
  transitionToConfirmed,
  transitionToNeedsClarification,
  transitionToEscalation,
} from "@/lib/conversation-state";
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
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { CLINICAL_ARCHITECTURE_FOOTER } from "@/lib/clinical/llm-narrative-contract";
import {
  buildContradictionRecord,
  detectTextContradictions,
} from "@/lib/clinical/contradiction-detector";
import {
  buildAlternateObservableRecoveryOutcome,
  buildCannotAssessOutcome,
  buildTerminalOutcomeMessage,
  type AlternateObservableRecoveryOutcome,
  detectOutOfScopeTurn,
  type UncertaintyTerminalOutcome,
} from "@/lib/clinical/uncertainty-routing";
import { emit, EventType } from "@/lib/events/event-bus";
import "@/lib/events/notification-handler";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import {
  getNextQuestionAvoidingRepeat,
  coerceAnswerForQuestion,
  shouldEscalateForUnknown,
  questionAllowsCanonicalUnknown,
} from "@/lib/symptom-chat/answer-coercion";
import {
  resolvePendingQuestionAnswer,
  extractDeterministicAnswersForTurn,
  mergeTurnAnswers,
  sanitizeAnswerForQuestion,
} from "@/lib/symptom-chat/answer-extraction";
import {
  buildCompactImageSignalContext,
  buildQuestionPhrasingContext,
  shouldIncludeImageContextInQuestion,
  buildTurnFocusSymptoms,
  propagateSharedLocationAnswers,
  getDeterministicFastPathExtraction,
  hashImage,
  buildGateCacheKey,
  buildVisionCacheKey,
  evaluateAndCacheGate,
  readCachedGateWarning,
  resetImageStateForNewUpload,
  isGenericImagePrompt,
  isImageEvidenceQuestion,
  sanitizeSessionForClient,
} from "@/lib/symptom-chat/context-helpers";
import {
  buildFallbackPreprocessResult,
  buildVisionClinicalEvidence,
  deriveVisionContradictions,
  shouldTriggerSyncConsult,
  buildEvidenceChainNotes,
  didVisualEvidenceInfluenceQuestion,
  buildReportRetrievalBundle,
  formatRetrievalTextContext,
  formatRetrievalImageContext,
  formatVisualEvidenceForReport,
  formatConsultEvidenceForReport,
  formatEvidenceChainForReport,
  buildEvidenceChainForResponse,
  deriveBaselineReportConfidence,
  shouldScheduleAsyncConsultReview,
  deriveSymptomsFromImageEvidence,
  runAfterSafely,
  parseReportJSON,
  safetyVerify,
} from "@/lib/symptom-chat/report-helpers";
import {
  extractDataFromMessage,
  extractSymptomsFromKeywords,
  parseLooseJsonRecord,
  buildConfirmedQASummary,
  buildDeterministicQuestionFallback,
} from "@/lib/symptom-chat/extraction-helpers";

// =============================================================================
// HYBRID STATE MACHINE API — 4-Model NVIDIA NIM Pipeline
//
// Pipeline:
//   Qwen 3.5 122B    → Data extraction (structured JSON from user text)
//   Clinical Matrix   → All medical logic (pure code, deterministic)
//   Llama 3.3 70B     → Question phrasing (warm, empathetic)
//   Nemotron Ultra    → Diagnosis report (deep clinical reasoning)
//   GLM-5             → Safety verification (catch missed emergencies)
//
// Long-form instructions below are narrative / schema shaping only. They do not
// replace triage rules in clinical-matrix.ts or triage-engine.ts. Shared
// contract text: CLINICAL_ARCHITECTURE_FOOTER in @/lib/clinical/llm-narrative-contract.
//
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
    if (!useNvidia) {
      return demoResponse(action, pet);
    }

    let session = clientSession || createSession();
    const incomingUnresolvedIds =
      session.case_memory?.unresolved_question_ids ?? [];
    let effectivePet = getEffectivePetProfile(pet, session);
    const imageHash = image ? hashImage(image) : null;
    const knownSymptomsBeforeTurn = new Set(session.known_symptoms);
    const answersBeforeTurn = { ...session.extracted_answers };
    const answerKeysBeforeTurn = new Set(Object.keys(session.extracted_answers));
    let imagePreprocess: VisionPreprocessResult | null = null;
    let visualEvidence: VisionClinicalEvidence | null = null;
    let consultOpinion: ConsultOpinion | null = null;
    const serviceTimeouts: ServiceTimeoutRecord[] = [];
    const ambiguityFlags: string[] = [];
    let alternateObservableOutcome: AlternateObservableRecoveryOutcome | null =
      null;
    let terminalOutcome: UncertaintyTerminalOutcome | null = null;

    if (imageHash && session.last_uploaded_image_hash !== imageHash) {
      resetImageStateForNewUpload(session);
      session.last_uploaded_image_hash = imageHash;
      effectivePet = getEffectivePetProfile(pet, session);
    }

    // ── Server-side identity (VET-825) ──────────────────────────────────
    // Resolve the authenticated user server-side so REPORT_READY / URGENCY_HIGH
    // can be emitted with a trusted userId. Falls back to null in demo mode or
    // when the session cookie is absent — emissions are skipped in that case.
    let verifiedUserId: string | null = null;
    try {
      const supabase = await createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      verifiedUserId = user?.id ?? null;
    } catch {
      // Demo mode or misconfigured Supabase — safe to continue without auth
    }

    if (action === "generate_report") {
      return await generateReport(
        session,
        effectivePet,
        messages,
        image,
        new URL(request.url).origin,
        verifiedUserId
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

    const outOfScopeOutcome = detectOutOfScopeTurn({
      pet: effectivePet,
      session,
      message: lastUserMessage.content,
    });
    if (outOfScopeOutcome) {
      session = recordTerminalOutcomeTelemetry(
        session,
        outOfScopeOutcome,
        undefined,
        (session.case_memory?.turn_count ?? 0) + 1
      );
      return NextResponse.json(
        buildTerminalOutcomeResponse(outOfScopeOutcome, session)
      );
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
          const tier1Data = safeParseJson<Record<string, unknown>>(
            visionResult.tier1_fast,
            "symptom chat vision guardrail"
          );
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
                session: sanitizeSessionForClient(session),
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
    // STEP 1: EXTRACT structured data — Qwen 3.5 122B
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
    const mergedAnswers = mergeTurnAnswers(
      session,
      deterministicSupplementalAnswers,
      extracted.answers || {}
    );

    for (const [key, value] of Object.entries(mergedAnswers)) {
      if (value !== null && value !== undefined && value !== "") {
        session = transitionToAnswered({
          session,
          questionId: key,
          value,
          reason: "turn_answer_recorded",
        });
      }
    }

    // ── Fix: Handle negative/null answers so questions don't loop ──
    // If the session had a pending question and extraction didn't capture
    // the answer (e.g. user said "no", "nothing", "I don't know"), force-
    // record the user's raw text so the question is marked answered.
    const pendingQ = session.last_question_asked;
    const pendingQWasAnsweredBeforeTurn =
      pendingQ !== undefined && answerKeysBeforeTurn.has(pendingQ);
    let pendingQResolvedThisTurn = Boolean(
      pendingQ &&
        !pendingQWasAnsweredBeforeTurn &&
        session.answered_questions.includes(pendingQ)
    );

    if (
      pendingQ &&
      (!session.answered_questions.includes(pendingQ) ||
        incomingUnresolvedIds.includes(pendingQ))
    ) {
      // Build a rich combined answer from text + vision analysis
      // e.g. user sent "left leg" + photo → combined = "left leg [vision: wound on left leg, raw area]"
      const combinedUserSignal = [
        lastUserMessage.content,
        visionAnalysis ? `[vision: ${visionAnalysis.substring(0, 200)}]` : null,
      ]
        .filter(Boolean)
        .join(" ");

      const pendingAnswer = resolvePendingQuestionAnswer({
        questionId: pendingQ,
        rawMessage: lastUserMessage.content,
        combinedUserSignal,
        turnAnswers: mergedAnswers,
        turnSymptoms: turnTextSymptoms,
      });
      const hadUnresolved =
        incomingUnresolvedIds.includes(pendingQ) ||
        (session.case_memory?.unresolved_question_ids ?? []).includes(pendingQ);
      const isAmbiguousReply =
        coerceAmbiguousReplyToUnknown(lastUserMessage.content) !== null;

      const alternateRecovery = shouldEscalateForUnknown(pendingQ)
        ? buildAlternateObservableRecoveryOutcome({
            petName: effectivePet.name || pet.name || "your dog",
            questionId: pendingQ,
          })
        : null;
      const alternateAlreadyOffered = Boolean(
        alternateRecovery &&
          (session.case_memory?.ambiguity_flags ?? []).includes(
            alternateRecovery.retryMarker
          )
      );
      const shouldEscalateAfterAlternateRetry = Boolean(
        alternateRecovery && alternateAlreadyOffered && pendingAnswer === null
      );

      if (
        shouldEscalateForUnknown(pendingQ) &&
        (isAmbiguousReply || shouldEscalateAfterAlternateRetry)
      ) {

        if (alternateRecovery && !alternateAlreadyOffered) {
          const caseMemory = ensureStructuredCaseMemory(session);
          const unresolvedQuestionIds = caseMemory.unresolved_question_ids.includes(
            pendingQ
          )
            ? caseMemory.unresolved_question_ids
            : [...caseMemory.unresolved_question_ids, pendingQ];
          const ambiguityFlags = caseMemory.ambiguity_flags.includes(
            alternateRecovery.retryMarker
          )
            ? caseMemory.ambiguity_flags
            : [...caseMemory.ambiguity_flags, alternateRecovery.retryMarker];

          session = {
            ...session,
            case_memory: {
              ...caseMemory,
              ambiguity_flags: ambiguityFlags,
              unresolved_question_ids: unresolvedQuestionIds,
            },
          };
          console.log(
            `[Engine] Alternate observable recovery offered for critical indicator "${pendingQ}"`
          );
          session = recordConversationTelemetry(session, {
            event: "pending_recovery",
            turn_count: session.case_memory?.turn_count ?? 0,
            question_id: pendingQ,
            outcome: "needs_clarification",
            source: "unresolved",
            reason: alternateRecovery.reasonCode,
            pending_before: hadUnresolved,
            pending_after: true,
          });
          alternateObservableOutcome = alternateRecovery;
        } else {
          session = transitionToEscalation({
            session,
            redFlags: [`cannot_assess_${pendingQ}`],
            reason: "owner_cannot_assess_critical_indicator",
          });
          console.log(
            `[Engine] Escalation triggered — owner cannot assess critical indicator "${pendingQ}"`
          );
          session = recordConversationTelemetry(session, {
            event: "pending_recovery",
            turn_count: session.case_memory?.turn_count ?? 0,
            question_id: pendingQ,
            outcome: "escalation",
            source: "unresolved",
            reason: "owner_cannot_assess_critical_indicator",
            pending_before: hadUnresolved,
            pending_after: true,
          });
          terminalOutcome = buildCannotAssessOutcome({
            petName: pet.name || "your dog",
            questionId: pendingQ,
            questionText: getQuestionText(pendingQ),
          });
        }
      } else if (pendingAnswer !== null) {
        session = transitionToAnswered({
          session,
          questionId: pendingQ,
          value: pendingAnswer.value,
          reason: "pending_question_recovered",
        });
        console.log(
          `[Engine] Resolved pending question "${pendingQ}" via ${pendingAnswer.source} (signal: "${lastUserMessage.content.substring(0, 80)}")`
        );
        pendingQResolvedThisTurn = true;
        session = recordConversationTelemetry(session, {
          event: "pending_recovery",
          turn_count: session.case_memory?.turn_count ?? 0,
          question_id: pendingQ,
          outcome: "success",
          source: pendingAnswer.source as RecoverySource,
          pending_before: hadUnresolved,
          pending_after: false,
        });
      } else {
        session = transitionToNeedsClarification({
          session,
          questionId: pendingQ,
          reason: "pending_recovery_failed",
        });
        console.log(
          `[Engine] Pending question "${pendingQ}" still unresolved after extraction and deterministic fallback`
        );
        session = recordConversationTelemetry(session, {
          event: "pending_recovery",
          turn_count: session.case_memory?.turn_count ?? 0,
          question_id: pendingQ,
          outcome: isAmbiguousReply ? "needs_clarification" : "failure",
          source: "unresolved",
          reason: isAmbiguousReply
            ? "needs_clarification_re_ask"
            : "pending_recovery_failed",
          pending_before: hadUnresolved,
          pending_after: true,
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
    const textContradictions = detectTextContradictions({
      ownerText: lastUserMessage.content,
      pet: effectivePet,
      previousAnswers: answersBeforeTurn,
      session,
    });
    if (textContradictions.length > 0) {
      ambiguityFlags.push(...textContradictions.map((item) => item.flag));
      const contradictionRecords = textContradictions.map((item) =>
        buildContradictionRecord(item, session.case_memory?.turn_count ?? 0)
      );
      session = recordConversationTelemetry(session, {
        event: "contradiction_detection",
        turn_count: session.case_memory?.turn_count ?? 0,
        outcome: "warning",
        reason: textContradictions.map((item) => item.id).join(","),
        contradiction_count: textContradictions.length,
        contradiction_ids: textContradictions.map((item) => item.id),
        contradiction_records: contradictionRecords,
      });
    }

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

      // VET-900: Fire escalation state transition before returning
      // so sidecar telemetry records the red-flag override.
      session = transitionToEscalation({
        session,
        redFlags: session.red_flags_triggered,
        reason: "red_flags_detected",
      });

      return NextResponse.json({
        type: "emergency",
        message: `I've detected potential emergency signs (${flags}). This could be life-threatening. Please take ${pet.name} to the nearest emergency veterinary hospital IMMEDIATELY. Do not wait. Call ahead so they can prepare. I can still generate a full analysis while you're on the way.`,
        session: sanitizeSessionForClient(session),
        ready_for_report: true,
      });
    }

    if (terminalOutcome) {
      session = recordTerminalOutcomeTelemetry(
        session,
        terminalOutcome,
        session.last_question_asked ?? undefined
      );
      return NextResponse.json(
        buildTerminalOutcomeResponse(terminalOutcome, session)
      );
    }

    if (alternateObservableOutcome) {
      return NextResponse.json(
        buildAlternateObservableRecoveryResponse(
          alternateObservableOutcome,
          session
        )
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Query Clinical Matrix (pure deterministic code)
    // ═══════════════════════════════════════════════════════════════════
    const ready = isReadyForDiagnosis(session);

    if (ready) {
      // VET-736: Fire confirmed state transition before returning
      // so the observer records this milestone reliably.
      session = transitionToConfirmed({
        session,
        reason: "all_questions_answered",
      });

      return NextResponse.json({
        type: "ready",
        message:
          "I have enough clinical information to generate a comprehensive analysis. Preparing your veterinary report now.",
        session: sanitizeSessionForClient(session),
        ready_for_report: true,
        conversationState: inferConversationState(getStateSnapshot(session)),
      });
    }

    const needsClarificationQuestionId =
      session.last_question_asked &&
      !pendingQResolvedThisTurn &&
      (
        session.case_memory?.clarification_reasons?.[
          session.last_question_asked
        ] ||
        incomingUnresolvedIds.includes(session.last_question_asked)
      )
        ? session.last_question_asked
        : null;

    const nextQuestionId =
      needsClarificationQuestionId ??
      getNextQuestionAvoidingRepeat(session, turnFocusSymptoms);
    const wasRepeatSuppressed =
      needsClarificationQuestionId === null &&
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
      });
    }

    if (needsClarificationQuestionId) {
      session = recordConversationTelemetry(session, {
        event: "pending_recovery",
        turn_count: session.case_memory?.turn_count ?? 0,
        question_id: needsClarificationQuestionId,
        outcome: "needs_clarification",
        source: "unresolved",
        reason: "needs_clarification_re_ask",
        pending_before: true,
        pending_after: true,
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
          session: sanitizeSessionForClient(session),
          ready_for_report: false,
        });
      }

      return NextResponse.json({
        type: "ready",
        message:
          "I have enough information. Let me generate your full veterinary report.",
        session: sanitizeSessionForClient(session),
        ready_for_report: true,
      });
    }

    if (!needsClarificationQuestionId) {
      const lastAnsweredQuestionId = session.last_question_asked;
      if (
        lastAnsweredQuestionId &&
        session.answered_questions.includes(lastAnsweredQuestionId)
      ) {
        session = transitionToConfirmed({
          session,
          reason: "sufficient_data_reached",
        });
      }

      // Track which question we're asking so we can detect unanswered loops
      session = transitionToAsked({
        session,
        questionId: nextQuestionId,
        reason: "next_question_selected",
      });
    }

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
      session: sanitizeSessionForClient(session),
      ready_for_report: isReadyForDiagnosis(session),
      conversationState: needsClarificationQuestionId
        ? "needs_clarification"
        : inferConversationState(getStateSnapshot(session)),
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
// STEP 1: Data Extraction — Qwen 3.5 122B
// =============================================================================

function sanitizeQuestionDraft(
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

  const protectedState = getProtectedConversationState(session);

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
    const mergedSession = mergeCompressionResult(
      session,
      compressed,
      protectedState
    );
    return recordConversationTelemetry(mergedSession, {
      event: "compression",
      turn_count: mergedSession.case_memory?.turn_count ?? 0,
      outcome: "success",
      model: compressed.model,
      compression_used: true,
      compression_model: compressed.model,
      narrative_only: true,
      control_state_preserved: true,
    });
  } catch (error) {
    console.error("MiniMax memory compression failed:", error);
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
    const draft = await phraseWithLlama(prompt);
    console.log("[Engine] Phrasing primary: Llama 3.3 70B Instruct");

    const sanitizedDraft = sanitizeQuestionDraft(
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

    return sanitizedDraft;
  } catch (error) {
    console.error("Phrasing failed:", error);

    return fallbackMessage;
  }
}

// =============================================================================
// STEP 5: Question Phrasing — Llama 3.3 70B
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
  requestOrigin?: string,
  verifiedUserId?: string | null
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
  let breedRiskContext = "";

  if (pet.breed) {
    try {
      const breedRiskProfiles = await getBreedRiskProfiles(pet.breed);
      breedRiskContext = formatBreedRiskContext(breedRiskProfiles);
    } catch (error) {
      console.error("[Report] Breed risk lookup failed:", error);
    }
  }

  // Supplementary: search for similar clinical cases from CSV corpus
  let clinicalCaseContext = '';
  try {
    const topSymptoms = session.known_symptoms.slice(0, 6);
    if (topSymptoms.length > 0) {
      const clinicalCases = await searchClinicalCases(topSymptoms, pet.breed, 5);
      clinicalCaseContext = formatClinicalCaseContext(clinicalCases);
    }
  } catch {
    // Non-fatal — clinical case search is supplementary
  }

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
${breedRiskContext ? `${breedRiskContext}\n` : ""}
${referenceImageContext ? `REFERENCE IMAGE RETRIEVAL (similar corpus cases; use as supportive visual context, not a diagnosis by itself):\n${referenceImageContext}\n` : ""}
${clinicalCaseContext ? `SIMILAR CLINICAL CASES (CSV corpus; use as supplementary case-similarity evidence, not a replacement for matrix ranking):\n${clinicalCaseContext}\n` : ""}

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
    const rawReport = await diagnoseWithDeepSeek(reportPrompt);
    console.log("[Engine] Diagnosis: Nemotron Ultra 253B");

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
      finalReport.bayesian_differentials = await computeBayesianScore(
        session.known_symptoms,
        pet.breed,
        pet.age_years,
        context.top5
      );
    } catch (bayesianError) {
      console.error("[Bayesian] Failed to score report differentials:", bayesianError);
    }

    let reportStorageId: string | null = null;
    try {
      reportStorageId = await saveSymptomReportToDB(
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

    // Emit post-report notifications using the server-verified userId (VET-825).
    // verifiedUserId comes from auth.getUser() at the top of POST(), never from
    // the client request body — this prevents cross-user notification injection.
    if (verifiedUserId && reportStorageId) {
      emit(EventType.REPORT_READY, {
        userId: verifiedUserId,
        sessionId: null,
        reportStorageId,
        urgency: context.highest_urgency,
        petName: pet.name ?? "your pet",
      });

      if (
        context.highest_urgency === "emergency" ||
        context.highest_urgency === "high"
      ) {
        emit(EventType.URGENCY_HIGH, {
          userId: verifiedUserId,
          sessionId: null,
          urgency: context.highest_urgency as "emergency" | "high",
          petName: pet.name ?? "your pet",
          topDiagnosis: context.top5[0]?.medical_term ?? "Unknown",
        });
      }
    }

    return NextResponse.json({ type: "report", report: finalReport });
  } catch (error) {
    console.error("Report generation failed:", error);

    throw error;
  }
}

function demoResponse(action: string, pet: PetProfile) {
  if (action === "generate_report") {
    return NextResponse.json({
      type: "report",
      report: {
        severity: "high",
        recommendation: "vet_48h",
        title: "Demo Mode — Configure API Keys",
        explanation: `This is demo mode. Add your NVIDIA NIM API key to enable the 4-model clinical diagnosis engine for ${pet.name}.`,
        differential_diagnoses: [
          {
            condition: "Demo Mode",
            likelihood: "high",
            description:
              "Configure API keys to unlock: Qwen 3.5 (extraction) → Llama 3.3 (phrasing) → Nemotron Ultra / DeepSeek V3.2 (diagnosis) → GLM-5 (safety verification).",
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

function buildTerminalOutcomeResponse(
  outcome: UncertaintyTerminalOutcome,
  session: TriageSession
) {
  return {
    type: outcome.type,
    terminal_state: outcome.terminalState,
    reason_code: outcome.reasonCode,
    owner_message: outcome.ownerMessage,
    recommended_next_step: outcome.recommendedNextStep,
    message: buildTerminalOutcomeMessage(outcome),
    session: sanitizeSessionForClient(session),
    ready_for_report: false,
    conversationState: outcome.conversationState,
  };
}

function recordTerminalOutcomeTelemetry(
  session: TriageSession,
  outcome: UncertaintyTerminalOutcome,
  questionId?: string,
  turnNumberOverride?: number
) {
  const turnNumber =
    turnNumberOverride ?? (session.case_memory?.turn_count ?? 0);

  return recordConversationTelemetry(session, {
    event: "terminal_outcome",
    turn_count: turnNumber,
    question_id: questionId,
    outcome: "success",
    reason: outcome.reasonCode,
    terminal_outcome_metric: {
      terminal_state: outcome.terminalState,
      reason_code: outcome.reasonCode,
      conversation_state: outcome.conversationState,
      recommended_next_step: outcome.recommendedNextStep,
      turn_number: turnNumber,
      ...(questionId ? { question_id: questionId } : {}),
    },
  });
}

function buildAlternateObservableRecoveryResponse(
  outcome: AlternateObservableRecoveryOutcome,
  session: TriageSession
) {
  return {
    type: "question",
    question_id: outcome.questionId,
    reason_code: outcome.reasonCode,
    message: outcome.message,
    session: sanitizeSessionForClient(session),
    ready_for_report: false,
    conversationState: outcome.conversationState,
  };
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
