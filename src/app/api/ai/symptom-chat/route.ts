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
  ensureStructuredCaseMemory,
  recordConversationTelemetry,
  type RecoverySource,
  updateStructuredCaseMemory,
} from "@/lib/symptom-memory";
import {
  getStateSnapshot,
  inferConversationState,
  transitionToAnswered,
  transitionToConfirmed,
  transitionToNeedsClarification,
  transitionToEscalation,
} from "@/lib/conversation-state";
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
  resolvePendingQuestionAnswer,
  extractDeterministicAnswersForTurn,
  mergeTurnAnswers,
} from "@/lib/symptom-chat/answer-extraction";
import {
  buildCompactImageSignalContext,
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
  extractDeterministicEmergencyRedFlags,
  extractSymptomsFromKeywords,
} from "@/lib/symptom-chat/extraction-helpers";
import { maybeCompressStructuredCaseMemory } from "@/lib/symptom-chat/memory-compression";
import { orchestrateNextQuestion } from "@/lib/symptom-chat/next-question-orchestration";
import { buildQuestionResponseFlow } from "@/lib/symptom-chat/question-response-flow";
import { resolveVerifiedUserId } from "@/lib/symptom-chat/server-identity";
import { maybeBuildUsageLimitResponse } from "@/lib/symptom-chat/usage-limit-gate";
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

function humanizeEmergencySignal(signal: string): string {
  return signal.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function collectDeterministicEmergencySignals(
  session: TriageSession,
  diagnosisContext: ReturnType<typeof buildDiagnosisContext>
): string[] {
  return Array.from(
    new Set([
      ...session.red_flags_triggered,
      ...session.known_symptoms,
      ...diagnosisContext.top5
        .filter((candidate) => candidate.urgency === "emergency")
        .map((candidate) => candidate.name),
    ])
  );
}

function collectRouteEmergencyOverrideSignals(
  rawMessage: string,
  session: TriageSession,
  incomingUnresolvedIds: string[],
  context: {
    answersBeforeTurn: TriageSession["extracted_answers"];
    ambiguityFlagsBeforeTurn: string[];
  }
): string[] {
  const lower = rawMessage.toLowerCase();
  const signals = new Set<string>();
  const priorToxinExposure = String(session.extracted_answers.toxin_exposure || "");
  const unresolvedQuestionIds = new Set(
    session.case_memory?.unresolved_question_ids ?? []
  );
  const chiefComplaints = new Set(session.case_memory?.chief_complaints ?? []);
  const activeFocusSymptoms = new Set(
    session.case_memory?.active_focus_symptoms ?? []
  );
  const candidateDiseases = new Set(session.candidate_diseases ?? []);
  const bodySystems = new Set(session.body_systems_involved ?? []);
  const turnCount = session.case_memory?.turn_count ?? 0;
  const ambiguityFlagsBeforeTurn = new Set(context.ambiguityFlagsBeforeTurn);
  const ambiguousUnknownReply =
    coerceAmbiguousReplyToUnknown(rawMessage) !== null ||
    /\b(can(?:not|'t) tell|not sure|don't know|do not know)\b/.test(lower);
  const hadPriorUnknownAnswer = (questionId: string) =>
    String(context.answersBeforeTurn[questionId] ?? "")
      .trim()
      .toLowerCase() === "unknown";
  const hasCarriedOverRespiratoryUnknown =
    turnCount >= 2 &&
    session.known_symptoms.includes("difficulty_breathing") &&
    chiefComplaints.has("difficulty_breathing") &&
    activeFocusSymptoms.has("difficulty_breathing") &&
    bodySystems.has("respiratory");
  const hasCarriedOverSeizureUnknown =
    turnCount >= 2 &&
    session.known_symptoms.includes("seizure_collapse") &&
    chiefComplaints.has("seizure_collapse") &&
    activeFocusSymptoms.has("seizure_collapse") &&
    bodySystems.has("neurologic");

  const hasChemicalExposure =
    /\b(drain cleaner|bleach|acid|lye|caustic|chemical|oven cleaner|pool chemical)\b/.test(
      lower
    ) ||
    /\b(drain cleaner|bleach|acid|lye|caustic|chemical|oven cleaner|pool chemical)\b/.test(
      priorToxinExposure.toLowerCase()
    );
  const hasChemicalInjury =
    /\b(blister|blistered|burn|burned|burnt|raw|peeling|ulcerated)\b/.test(
      lower
    ) ||
    (/\bred\b/.test(lower) && /\b(paw|foot|leg|skin|mouth|face)\b/.test(lower));
  if (
    hasChemicalExposure &&
    (hasChemicalInjury ||
      /\b(stepped in|paw|foot|skin|mouth|face)\b/.test(lower))
  ) {
    signals.add("chemical_burn_exposure");
  }

  const hasAnticoagulantExposure =
    /\b(rat poison|rodenticide|mouse bait|bait station|warfarin|brodifacoum|bromadiolone)\b/.test(
      lower
    ) ||
    session.extracted_answers.rat_poison_access === true ||
    /\b(rat poison|rodenticide|mouse bait|bait station|warfarin|brodifacoum|bromadiolone)\b/.test(
      priorToxinExposure.toLowerCase()
    );
  const hasActiveBleeding =
    /\b(bleeding|bleed|blood)\b/.test(lower) &&
    /\b(gum|gums|mouth|nose|stool|diarrhea|urine|vomit|vomiting)\b/.test(lower);
  if (hasAnticoagulantExposure && hasActiveBleeding) {
    signals.add("anticoagulant_poisoning_bleeding");
  }

  if (
    /\b(hit by (a )?car|struck by (a )?car|ran over)\b/.test(lower) &&
    /\b(can(?:not|'t) stand(?: up)?|unable to stand|won't stand|collapsed|collapse|won't get up|weak)\b/.test(
      lower
    )
  ) {
    signals.add("major_trauma_hit_by_car");
  }

  if (
    /\b(heatstroke|heat stroke|overheat|overheated|in the heat|too hot)\b/.test(
      lower
    ) &&
    (/\b(panting hard|breathing hard|weak|collapse|collapsed)\b/.test(lower) ||
      /\b(bright red|brick red)\b/.test(lower)) &&
    (/\bgum\b|\bgums\b/.test(lower) ||
      /\b(panting hard|breathing hard|weak|collapse|collapsed)\b/.test(lower))
  ) {
    signals.add("heatstroke_emergency");
  }

  if (
    /\b(struggling to breathe|labored breathing|can't breathe|cannot breathe|gasping)\b/.test(
      lower
    ) ||
    (/\b(open[- ]mouth breathing|mouth open breathing|breathing with mouth open)\b/.test(
      lower
    ) &&
      /\b(rest|resting|at rest)\b/.test(lower)) ||
    (/\bhonking\b/.test(lower) &&
      /\b(struggling to breathe|trouble breathing|labored breathing)\b/.test(
        lower
      ))
  ) {
    signals.add("clear_respiratory_distress");
  }

  if (
    /\bpuppy\b/.test(lower) &&
    /\b(vomit|vomiting)\b/.test(lower) &&
    (/\bbloody diarrhea\b/.test(lower) ||
      (/\b(diarrhea|stool)\b/.test(lower) && /\b(blood|bloody)\b/.test(lower))) &&
    /\b(unvaccinated|won't drink|will not drink|not drinking|weak|lethargic)\b/.test(
      lower
    )
  ) {
    signals.add("parvo_style_puppy_emergency");
  }

  const hasXylitolExposure =
    /\b(xylitol|sugar[- ]free gum|sugar[- ]free candy)\b/.test(lower) ||
    /\b(xylitol|sugar[- ]free gum|sugar[- ]free candy)\b/.test(
      priorToxinExposure.toLowerCase()
    );
  if (
    hasXylitolExposure &&
    /\b(vomit|vomiting|throwing up|threw up|shaky|shaking|trembling|weak|collapse|collapsed|confused|disoriented|stumbling)\b/.test(
      lower
    )
  ) {
    signals.add("xylitol_toxicity_emergency");
  }

  if (
    /\b(electrical cord|power cord|extension cord|electrical shock|electrocuted|live wire|outlet)\b/.test(
      lower
    ) &&
    /\b(chew|chewed|bit|bitten|trembling|shaking|weak|collapse|collapsed|burn|burned|mouth|breathing|panting)\b/.test(
      lower
    )
  ) {
    signals.add("electrical_shock_emergency");
  }

  if (
    /\b(diabetic)\b/.test(lower) &&
    /\b(stumbling|stumble|confused|disoriented|weak|shaky|shaking|trembling|collapse|collapsed|barely responsive)\b/.test(
      lower
    )
  ) {
    signals.add("diabetic_crisis_emergency");
  }

  if (
    /\b(tiny|toy breed|toy-breed|small breed|tiny puppy|small puppy|puppy)\b/.test(
      lower
    ) &&
    /\b(shaky|shaking|trembling|weak|wobbly|stumbling|flopped over|collapse|collapsed)\b/.test(
      lower
    ) &&
    /\b(not eating|not eating well|won't eat|wouldn't eat|refusing food|low blood sugar|hypoglycemia)\b/.test(
      lower
    )
  ) {
    signals.add("hypoglycemia_collapse_emergency");
  }

  if (
    /\b(shaking|shaky|trembling|tremors?)\b/.test(lower) &&
    /\b(barely responsive|not responsive|unresponsive|won't wake|will not wake|won't get up)\b/.test(
      lower
    )
  ) {
    signals.add("post_tremor_unresponsive_emergency");
  }

  if (
    /\b(shaking|shaky|trembling|tremors?)\b/.test(lower) &&
    /\b(weak|weakness|collapse|collapsed)\b/.test(lower) &&
    (/\bcold\b/.test(lower) ||
      /\b(ears|paws|feet)\b[^.?!]*\bfeel cold\b/.test(lower))
  ) {
    signals.add("cold_extremities_weakness_emergency");
  }

  if (
    (/\b(open fracture|visible bone|bone visible|bone sticking out|exposed bone)\b/.test(
      lower
    ) ||
      /\b(see|seeing|can see)\b[^.?!]*\bbone\b[^.?!]*\b(wound|leg|arm|limb)\b/.test(
        lower
      ) ||
      /\bbone\b[^.?!]*\bthrough\b[^.?!]*\b(wound|skin)\b/.test(lower)) &&
    /\b(limp|limping|wound|leg|fracture|broken|injur)\b/.test(lower)
  ) {
    signals.add("visible_fracture_emergency");
  }

  if (
    (/\b(attacked|dog bite|bite wound|puncture wound|puncture wounds|bitten)\b/.test(
      lower
    ) &&
      /\b(deep|gaping|severe|multiple|chest|neck|abdomen|belly|tissue damage)\b/.test(
        lower
      )) ||
    (/\b(puncture wound|puncture wounds)\b/.test(lower) &&
      /\b(chest|neck|abdomen|belly|face)\b/.test(lower))
  ) {
    signals.add("severe_bite_wound_emergency");
  }

  if (
    /\b(heaving|retching|trying to vomit|trying to throw up|needs to vomit)\b/.test(
      lower
    ) &&
    /\b(nothing is coming up|nothing comes up|nothing comes out|nonproductive|nothing is coming out)\b/.test(
      lower
    )
  ) {
    signals.add("unproductive_heaving_emergency");
  }

  if (
    /\b(eye|eyeball)\b/.test(lower) &&
    /\b(cloudy|bulging|swollen|enlarged)\b/.test(lower) &&
    /\b(pain|painful|hurts|squinting|won't open)\b/.test(lower)
  ) {
    signals.add("painful_bulging_eye_emergency");
  }

  if (
    /\b(tiny red spots|pinpoint red spots|petechiae|red spots all over)\b/.test(
      lower
    ) &&
    /\b(gum|gums|mouth)\b/.test(lower) &&
    /\b(weak|weakness|bleeding|lethargic|lethargy)\b/.test(lower)
  ) {
    signals.add("mucosal_bleeding_weakness_emergency");
  }

  if (
    (/\b(in labor|in labour|giving birth|strong contractions|having contractions|straining)\b/.test(
      lower
    ) &&
      /\b(over (one|two|three|\d+) hours?|for hours?)\b/.test(lower) &&
      /\b(no puppy|not delivered|has not delivered|hasn't delivered|still no puppy|without producing a puppy)\b/.test(
        lower
      )) ||
    (/\b(contractions|straining)\b/.test(lower) &&
      /\b(no puppy|not delivered|has not delivered|hasn't delivered)\b/.test(
        lower
      ))
  ) {
    signals.add("hard_labor_no_puppy_emergency");
  }

  if (
    /\bdiabetic\b/.test(lower) &&
    /\b(stumbling|staggering|wobbly|disoriented|confused)\b/.test(lower)
  ) {
    signals.add("diabetic_crisis");
  }

  if (
    /\b(attacked|dog bite|bitten)\b/.test(lower) &&
    /\b(deep puncture|deep wound|puncture wounds?)\b/.test(lower)
  ) {
    signals.add("dog_bite_trauma");
  }

  if (
    /\b(electrical cord|power cord|extension cord|electrocuted|electrical shock)\b/.test(
      lower
    ) &&
    /\b(trembling|shaking|weak|collapse|collapsed)\b/.test(lower)
  ) {
    signals.add("electrical_shock");
  }

  if (
    /\beye\b/.test(lower) &&
    /\b(cloudy|bulging)\b/.test(lower) &&
    /\b(pain|painful|hurts?)\b/.test(lower)
  ) {
    signals.add("acute_glaucoma_emergency");
  }

  if (
    /\blimp(?:ing)?\b/.test(lower) &&
    /\b(cry(?:ing)?|yelping|yelps|pain(?:ful)?|hurts?)\b/.test(lower) &&
    /\b(back|spine|neck)\b/.test(lower) &&
    /\b(won'?t let me touch|won'?t let anyone touch|can(?:not|'t) touch|guarding)\b/.test(
      lower
    )
  ) {
    signals.add("severe_limping_spinal_pain");
  }

  if (
    /\b(nosebleed|nose bleed)\b/.test(lower) &&
    /\b(major|heavy|severe|won'?t stop|a lot)\b/.test(lower) &&
    /\b(weak|shaky|wobbly|collapse|collapsed)\b/.test(lower)
  ) {
    signals.add("nosebleed_collapse");
  }

  if (
    /\b(throat|neck)\b/.test(lower) &&
    /\b(lump|mass|swelling)\b/.test(lower) &&
    /\b(struggling to swallow|trouble swallowing|hard to swallow|can(?:not|'t) swallow|struggling to breathe|trouble breathing|can(?:not|'t) breathe)\b/.test(
      lower
    )
  ) {
    signals.add("obstructive_throat_mass");
  }

  if (
    /\b(unspayed|not spayed|intact female)\b/.test(lower) &&
    /\b(foul|smelly|bad[- ]smelling|stinky)\b/.test(lower) &&
    /\bdischarge\b/.test(lower) &&
    /\b(drinking a lot|drinking more|feverish|fever|miserable|weak|lethargic)\b/.test(
      lower
    )
  ) {
    signals.add("pyometra_style_emergency");
  }

  if (
    /\bpenis\b/.test(lower) &&
    /\b(stuck out|stuck outside|won'?t go back in|won'?t retract|can(?:not|'t) retract)\b/.test(
      lower
    ) &&
    /\b(swollen|red|purple|dry|painful|uncomfortable)\b/.test(lower)
  ) {
    signals.add("paraphimosis_emergency");
  }

  if (
    /\b(finished having puppies|after giving birth|after whelping|after having puppies)\b/.test(
      lower
    ) &&
    /\b(strong contractions|still has strong contractions|still contracting|still has contractions|straining)\b/.test(
      lower
    ) &&
    /\b(weak|distressed|collapse|collapsed|miserable)\b/.test(lower)
  ) {
    signals.add("retained_puppy_distress");
  }

  if (
    /\b(contractions|straining)\b/.test(lower) &&
    /\b(over two hours|for two hours|for 2 hours|still has not delivered|has not delivered|no puppy)\b/.test(
      lower
    )
  ) {
    signals.add("dystocia_no_puppy");
  }

  if (
    (/\b(antifreeze|ethylene glycol)\b/.test(lower) ||
      (/\bgreen fluid\b/.test(lower) && /\bgarage\b/.test(lower))) &&
    /\b(staggering|stumbling|wobbly|drooling|vomiting|weak)\b/.test(lower)
  ) {
    signals.add("antifreeze_toxicity");
  }

  if (
    /\b(xylitol|sugar[- ]free gum|sugar free gum)\b/.test(lower) &&
    /\b(vomit|vomiting|weak|collapse|collapsed|shaky|staggering)\b/.test(lower)
  ) {
    signals.add("xylitol_toxicity");
  }

  if (
    /\b(sago palm)\b/.test(lower) &&
    /\b(vomit|vomiting|weak|collapse|collapsed|lethargic)\b/.test(lower)
  ) {
    signals.add("sago_palm_toxicity");
  } else if (
    /\b(lily|lilies|toxic plant|poisonous plant)\b/.test(lower) &&
    /\b(vomit|vomiting|weak|collapse|collapsed|lethargic)\b/.test(lower)
  ) {
    signals.add("toxic_plant_exposure");
  }

  if (
    /\b(moldy trash|mouldy trash|moldy food|mouldy food|compost)\b/.test(
      lower
    ) &&
    /\b(shaking hard|tremors?|cannot walk right|can'?t walk right|staggering|wobbly)\b/.test(
      lower
    )
  ) {
    signals.add("tremorgenic_mycotoxin");
  }

  if (
    /\b(tiny puppy|toy breed|small puppy)\b/.test(lower) &&
    /\b(shaky|trembling|weak|flopped over|collapsed|collapse)\b/.test(lower) &&
    /\b(not eating|won'?t eat|not eating well|didn'?t eat)\b/.test(lower)
  ) {
    signals.add("hypoglycemia_collapse");
  }

  if (
    /\b(tiny red spots|pinpoint red spots|petechiae)\b/.test(lower) &&
    /\bgums?\b/.test(lower) &&
    /\b(weak|lethargic|collapse|collapsed)\b/.test(lower)
  ) {
    signals.add("gum_petechiae_weakness");
  }

  if (
    /\b(bone sticking out|bone visible|see bone|see the bone)\b/.test(lower)
  ) {
    signals.add("open_fracture");
  }

  if (
    hadPriorUnknownAnswer("breathing_onset") &&
    hasCarriedOverRespiratoryUnknown &&
    ambiguousUnknownReply
  ) {
    signals.add("respiratory_distress_unknown_breathing_onset");
  }

  if (
    hadPriorUnknownAnswer("breathing_pattern") &&
    hasCarriedOverRespiratoryUnknown &&
    ambiguousUnknownReply
  ) {
    signals.add("respiratory_distress_unknown_breathing_pattern");
  }

  if (
    hadPriorUnknownAnswer("consciousness_level") &&
    hasCarriedOverSeizureUnknown &&
    ambiguousUnknownReply
  ) {
    signals.add("neurologic_emergency_unknown_consciousness");
  }

  if (
    hadPriorUnknownAnswer("seizure_duration") &&
    hasCarriedOverSeizureUnknown &&
    ambiguousUnknownReply
  ) {
    signals.add("neurologic_emergency_unknown_seizure_duration");
  }

  if (
    incomingUnresolvedIds.includes("gum_color") &&
    ambiguityFlagsBeforeTurn.has("alternate_observable_prompted_gum_color") &&
    unresolvedQuestionIds.has("gum_color") &&
    session.known_symptoms.includes("difficulty_breathing") &&
    chiefComplaints.has("difficulty_breathing") &&
    activeFocusSymptoms.has("difficulty_breathing") &&
    bodySystems.has("respiratory") &&
    (candidateDiseases.has("heart_failure") ||
      candidateDiseases.has("allergic_reaction")) &&
    turnCount >= 2 &&
    ambiguousUnknownReply
  ) {
    signals.add("respiratory_distress_unknown_gum_color");
  }

  return Array.from(signals);
}

function buildDeterministicEmergencyMessage(
  petName: string,
  session: TriageSession,
  diagnosisContext: ReturnType<typeof buildDiagnosisContext>
): string {
  const signalSummary = collectDeterministicEmergencySignals(
    session,
    diagnosisContext
  )
    .slice(0, 3)
    .map(humanizeEmergencySignal)
    .join(", ");

  const details = signalSummary ? ` (${signalSummary})` : "";

  return `Based on the symptoms you've shared${details}, ${petName} may be having a medical emergency. Please go to the nearest emergency veterinary hospital now. I have enough information to prepare an emergency summary for the vet while you're on the way.`;
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

    // Keep report generation in explicit demo mode when no AI providers are
    // configured, but still run chat turns through the deterministic engine so
    // local release-gate and benchmark paths remain clinically auditable.
    if (!useNvidia && action === "generate_report") {
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
    const ambiguityFlagsBeforeTurn = [
      ...(session.case_memory?.ambiguity_flags ?? []),
    ];
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

    const directEmergencyFlags = extractDeterministicEmergencyRedFlags(
      lastUserMessage.content,
      session.known_symptoms
    );
    if (directEmergencyFlags.length > 0) {
      session = {
        ...session,
        red_flags_triggered: Array.from(
          new Set([...session.red_flags_triggered, ...directEmergencyFlags])
        ),
      };
    }

    if (session.red_flags_triggered.length > 0) {
      session = transitionToEscalation({
        session,
        redFlags: session.red_flags_triggered,
        reason: "deterministic_emergency_first_turn",
      });

      return NextResponse.json(
        buildRedFlagEmergencyResponse({
          petName: pet.name,
          redFlags: session.red_flags_triggered,
          session,
        })
      );
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
    const diagnosisContext = buildDiagnosisContext(session, effectivePet);

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

    const routeEmergencyOverrideSignals = collectRouteEmergencyOverrideSignals(
      lastUserMessage.content,
      session,
      incomingUnresolvedIds,
      {
        answersBeforeTurn,
        ambiguityFlagsBeforeTurn,
      }
    );
    const hasRouteEmergencyOverride = routeEmergencyOverrideSignals.length > 0;
    if (hasRouteEmergencyOverride) {
      session = {
        ...session,
        red_flags_triggered: Array.from(
          new Set([
            ...session.red_flags_triggered,
            ...routeEmergencyOverrideSignals,
          ])
        ),
      };
    }

    if (hasRouteEmergencyOverride) {
      session = transitionToEscalation({
        session,
        redFlags: Array.from(
          new Set([
            ...collectDeterministicEmergencySignals(session, diagnosisContext),
            ...routeEmergencyOverrideSignals,
          ])
        ),
        reason: "clinical_escalation",
      });

      return NextResponse.json({
        type: "emergency" as const,
        message: buildDeterministicEmergencyMessage(
          effectivePet.name || pet.name || "your dog",
          session,
          diagnosisContext
        ),
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

    const nextQuestionState = orchestrateNextQuestion({
      session,
      incomingUnresolvedIds,
      pendingQResolvedThisTurn,
      turnFocusSymptoms,
      visualEvidence,
    });
    session = nextQuestionState.session;
    const nextQuestionId = nextQuestionState.nextQuestionId;
    const needsClarificationQuestionId =
      nextQuestionState.needsClarificationQuestionId;
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

    return buildQuestionResponseFlow({
      session,
      nextQuestionId,
      needsClarificationQuestionId,
      pet,
      effectivePet,
      messages,
      lastUserMessage: lastUserMessage.content,
      turnFocusSymptoms,
      visionAnalysis,
      visionSeverity,
      image,
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
