import { NextResponse } from "next/server";
import {
  isNvidiaConfigured,
  runVisionPipeline,
  parseVisionForMatrix,
  imageGuardrail,
} from "@/lib/nvidia-models";
import { safeParseJson } from "@/lib/llm-output";
import { coerceAmbiguousReplyToUnknown } from "@/lib/ambiguous-reply";
import {
  createSession,
  addSymptoms,
  getMissingQuestions,
  getQuestionText,
  getExtractionSchema,
  isReadyForDiagnosis,
  buildDiagnosisContext,
  type TriageSession,
  type PetProfile,
} from "@/lib/triage-engine";
import {
  shouldAnalyzeWoundImage,
  type ImageMeta,
} from "@/lib/image-gate";
import {
  detectBreedWithNyckel,
  getEffectivePetProfile,
  isLikelyDogContext,
  runRoboflowSkinWorkflow,
  shouldUseImageInferredBreed,
} from "@/lib/pet-enrichment";
import {
  inferSupportedImageDomain,
  type ConsultOpinion,
  type ServiceTimeoutRecord,
  type VisionClinicalEvidence,
  type VisionPreprocessResult,
} from "@/lib/clinical-evidence";
import {
  consultWithMultimodalSidecar,
  describeLiveTrafficDecision,
  getLiveTrafficDecision,
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
import {
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
  describeShadowComparison,
  describeShadowModeDecision,
  getShadowModeDecision,
} from "@/lib/sidecar-observability";
import {
  buildContradictionRecord,
  detectTextContradictions,
} from "@/lib/clinical/contradiction-detector";
import {
  buildCannotAssessOutcome,
  findReportBlockingCriticalInfo,
  type AlternateObservableRecoveryOutcome,
  detectOutOfScopeTurn,
  type UncertaintyTerminalOutcome,
} from "@/lib/clinical/uncertainty-routing";
import { evaluateCriticalInfoRule } from "@/lib/clinical/critical-info-rules";
import "@/lib/events/notification-handler";
import {
  getNextQuestionAvoidingRepeat,
} from "@/lib/symptom-chat/answer-coercion";
import {
  resolvePendingQuestionAnswer,
  extractDeterministicAnswersForTurn,
  mergeTurnAnswers,
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
  deriveSymptomsFromImageEvidence,
} from "@/lib/symptom-chat/report-helpers";
import {
  buildAlternateObservableRecoveryResponse,
  buildImageGateMessage,
  buildOutOfScopeResponse,
  buildRedFlagEmergencyResponse,
  buildTerminalOutcomeResponse,
  buildVisionGuardrailEmergencyResponse,
  recordTerminalOutcomeTelemetry,
} from "@/lib/symptom-chat/response-builders";
import {
  extractDataFromMessage,
  extractSymptomsFromKeywords,
} from "@/lib/symptom-chat/extraction-helpers";
import { resolveVerifiedUserId } from "@/lib/symptom-chat/server-identity";
import { maybeBuildUsageLimitResponse } from "@/lib/symptom-chat/usage-limit-gate";
import {
  gateQuestionBeforePhrasing,
  phraseQuestion,
} from "@/lib/symptom-chat/question-phrasing";
import { demoResponse } from "@/lib/symptom-chat/demo-response";
import { generateReport } from "@/lib/symptom-chat/report-pipeline";

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
    const usageLimitResponse = await maybeBuildUsageLimitResponse({
      action,
      messages,
      session,
    });
    if (usageLimitResponse) {
      return usageLimitResponse;
    }

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
    const verifiedUserId = await resolveVerifiedUserId();

    if (action === "generate_report") {
      const reportBlockingCriticalInfo = findReportBlockingCriticalInfo(session);
      if (reportBlockingCriticalInfo) {
        return NextResponse.json(
          buildTerminalOutcomeResponse(
            buildCannotAssessOutcome({
              petName: pet.name || "your dog",
              questionId: reportBlockingCriticalInfo.questionId,
              questionText: reportBlockingCriticalInfo.questionText,
            }),
            session
          )
        );
      }

      return await generateReport({
        session,
        pet: effectivePet,
        messages,
        image,
        requestOrigin: new URL(request.url).origin,
        verifiedUserId,
      });
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
        buildOutOfScopeResponse({
          outcome: outOfScopeOutcome,
          session,
        })
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
      const visionPreprocessDecision = getShadowModeDecision({
        service: "vision-preprocess-service",
        session,
        pet: effectivePet,
        additionalKey: imageHash || lastUserMessage.content,
      });
      const visionLiveDecision = getLiveTrafficDecision({
        service: "vision-preprocess-service",
        session,
        additionalKey: imageHash || lastUserMessage.content,
      });
      const shouldInvokeVisionPreprocess =
        visionPreprocessDecision.enabled || visionLiveDecision.enabled;
      if (isVisionPreprocessConfigured()) {
        if (shouldInvokeVisionPreprocess) {
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
              outcome: visionPreprocessDecision.enabled ? "shadow" : "success",
              shadowMode: visionPreprocessDecision.enabled,
              fallbackUsed: visionPreprocessDecision.enabled,
              note: `domain=${preprocessedImage.domain}; quality=${preprocessedImage.imageQuality}; ${describeShadowModeDecision(visionPreprocessDecision)}; ${describeLiveTrafficDecision(visionLiveDecision)}`,
            });

            if (visionPreprocessDecision.enabled) {
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
              shadowMode: visionPreprocessDecision.enabled,
              fallbackUsed: true,
              note: `${timedOut ? "vision preprocess timeout" : "vision preprocess failed"}; ${describeShadowModeDecision(visionPreprocessDecision)}; ${describeLiveTrafficDecision(visionLiveDecision)}`,
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

              return NextResponse.json(
                buildVisionGuardrailEmergencyResponse({
                  petName: pet.name,
                  flags: guardrail.flags,
                  session,
                })
              );
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
      const criticalInfoDecision = evaluateCriticalInfoRule({
        questionId: pendingQ,
        rawMessage: lastUserMessage.content,
        hasRecoveredAnswer: pendingAnswer !== null,
        ambiguityFlags: session.case_memory?.ambiguity_flags ?? [],
        alternateObservablePetName: effectivePet.name || pet.name || "your dog",
        cannotAssessPetName: pet.name || "your dog",
        questionText: getQuestionText(pendingQ),
      });

      if (criticalInfoDecision) {
        if (criticalInfoDecision.kind === "alternate_observable") {
          const caseMemory = ensureStructuredCaseMemory(session);
          const unresolvedQuestionIds = caseMemory.unresolved_question_ids.includes(
            pendingQ
          )
            ? caseMemory.unresolved_question_ids
            : [...caseMemory.unresolved_question_ids, pendingQ];
          const ambiguityFlags = caseMemory.ambiguity_flags.includes(
            criticalInfoDecision.outcome.retryMarker
          )
            ? caseMemory.ambiguity_flags
            : [
                ...caseMemory.ambiguity_flags,
                criticalInfoDecision.outcome.retryMarker,
              ];

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
            reason: criticalInfoDecision.outcome.reasonCode,
            pending_before: hadUnresolved,
            pending_after: true,
          });
          alternateObservableOutcome = criticalInfoDecision.outcome;
        } else {
          session = transitionToEscalation({
            session,
            redFlags: [criticalInfoDecision.redFlag],
            reason: criticalInfoDecision.transitionReason,
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
            reason: criticalInfoDecision.telemetryReason,
            pending_before: hadUnresolved,
            pending_after: true,
          });
          terminalOutcome = criticalInfoDecision.outcome;
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
        const consultShadowDecision = getShadowModeDecision({
          service: "multimodal-consult-service",
          session,
          pet: effectivePet,
          urgencyHint:
            visualEvidence.severity === "urgent"
              ? "high"
              : buildDiagnosisContext(session, effectivePet).highest_urgency,
          additionalKey: imageHash || lastUserMessage.content,
        });
        const consultLiveDecision = getLiveTrafficDecision({
          service: "multimodal-consult-service",
          session,
          additionalKey: imageHash || lastUserMessage.content,
        });
        const shouldInvokeConsult =
          consultShadowDecision.enabled || consultLiveDecision.enabled;
        if (shouldInvokeConsult) {
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
              outcome: consultShadowDecision.enabled ? "shadow" : "success",
              shadowMode: consultShadowDecision.enabled,
              fallbackUsed: consultShadowDecision.enabled,
              note: `disagreements=${nextConsultOpinion.disagreements.length}; ${describeShadowModeDecision(consultShadowDecision)}; ${describeLiveTrafficDecision(consultLiveDecision)}`,
            });

            if (consultShadowDecision.enabled) {
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
              shadowMode: consultShadowDecision.enabled,
              fallbackUsed: true,
              note: `${timedOut ? "multimodal consult timeout" : "multimodal consult failed"}; ${describeShadowModeDecision(consultShadowDecision)}; ${describeLiveTrafficDecision(consultLiveDecision)}`,
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
      // VET-900: Fire escalation state transition before returning
      // so sidecar telemetry records the red-flag override.
      session = transitionToEscalation({
        session,
        redFlags: session.red_flags_triggered,
        reason: "red_flags_detected",
      });

      return NextResponse.json(
        buildRedFlagEmergencyResponse({
          petName: pet.name,
          redFlags: session.red_flags_triggered,
          session,
        })
      );
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

// =============================================================================
// STEP 6: Diagnosis Report — Nemotron Ultra 253B (reasoning) + GLM-5 (safety)
// =============================================================================
