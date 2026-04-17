import { NextResponse } from "next/server";
import {
  diagnoseWithDeepSeek,
  isNvidiaConfigured,
} from "@/lib/nvidia-models";
import type { RetrievalBundle } from "@/lib/clinical-evidence";
import {
  buildDiagnosisContext,
  type PetProfile,
  type TriageSession,
} from "@/lib/triage-engine";
import { formatBreedRiskContext, getBreedRiskProfiles } from "@/lib/breed-risk";
import { computeBayesianScore } from "@/lib/bayesian-scorer";
import { buildStructuredEvidenceChain } from "@/lib/evidence-chain";
import { emit, EventType } from "@/lib/events/event-bus";
import {
  buildKnowledgeSearchQuery,
  buildReferenceImageQuery,
  formatClinicalCaseContext,
  searchClinicalCases,
} from "@/lib/knowledge-retrieval";
import { fetchBreedProfile, isLikelyDogContext } from "@/lib/pet-enrichment";
import { getProvenanceRegistry } from "@/lib/provenance-registry";
import { buildReportConfidenceCalibration } from "@/lib/report-confidence";
import { saveSymptomReportToDB } from "@/lib/report-storage";
import { appendShadowTelemetrySnapshot } from "@/lib/shadow-telemetry-store";
import {
  appendSidecarObservation,
  buildInternalShadowTelemetrySnapshot,
  buildObservabilitySnapshot,
  describeShadowModeDecision,
  getShadowModeDecision,
} from "@/lib/sidecar-observability";
import {
  buildDeterministicCaseSummary,
  ensureStructuredCaseMemory,
} from "@/lib/symptom-memory";
import { enqueueAsyncReview } from "@/lib/async-review-client";
import {
  describeLiveTrafficDecision,
  getLiveTrafficDecision,
  isAsyncReviewServiceConfigured,
} from "@/lib/hf-sidecars";
import {
  buildEvidenceChainForResponse,
  buildReportRetrievalBundle,
  deriveBaselineReportConfidence,
  formatConsultEvidenceForReport,
  formatEvidenceChainForReport,
  formatRetrievalImageContext,
  formatRetrievalTextContext,
  formatVisualEvidenceForReport,
  parseReportJSON,
  runAfterSafely,
  safetyVerify,
  shouldScheduleAsyncConsultReview,
} from "./report-helpers";

const useNvidia = isNvidiaConfigured();

export interface SymptomChatMessage {
  role: string;
  content: string;
}

interface GenerateReportInput {
  session: TriageSession;
  pet: PetProfile;
  messages: SymptomChatMessage[];
  image?: string;
  requestOrigin?: string;
  verifiedUserId?: string | null;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildEvidenceSummary(input: {
  evidenceChain: Array<{
    source_kind?: string;
    provenance_ids?: string[];
    evidence_tier?: string;
    last_reviewed_at?: string;
  }>;
  retrievalBundle: RetrievalBundle;
}) {
  const deterministicItems = input.evidenceChain.filter(
    (item) => item.source_kind === "deterministic_rule"
  );

  return {
    cases_found: input.retrievalBundle.textChunks.length,
    knowledge_chunks_found: input.retrievalBundle.textChunks.length,
    reference_images_found: input.retrievalBundle.imageMatches.length,
    deterministic_rules_applied: deterministicItems.length,
    provenance_backed_claims: deterministicItems.filter(
      (item) =>
        (item.provenance_ids?.length ?? 0) > 0 &&
        Boolean(item.evidence_tier) &&
        Boolean(item.last_reviewed_at)
    ).length,
    retrieval_sources_found: dedupeStrings(input.retrievalBundle.sourceCitations)
      .length,
  };
}

function applyHighStakesProvenanceGuard(
  report: Record<string, unknown>,
  evidenceChain: Array<{
    high_stakes?: boolean;
    provenance_ids?: string[];
    evidence_tier?: string;
    last_reviewed_at?: string;
  }>
): Record<string, unknown> {
  const hasUnbackedHighStakesClaim = evidenceChain.some(
    (item) =>
      item.high_stakes &&
      ((item.provenance_ids?.length ?? 0) === 0 ||
        !item.evidence_tier ||
        !item.last_reviewed_at)
  );

  if (!hasUnbackedHighStakesClaim) {
    return report;
  }

  const existingClinicalNotes =
    typeof report.clinical_notes === "string" ? report.clinical_notes : "";
  const recommendation =
    typeof report.recommendation === "string" ? report.recommendation : "";
  const genericTitle =
    recommendation === "emergency_vet"
      ? "Emergency dog triage recommendation"
      : "Dog triage recommendation";

  return {
    ...report,
    title: genericTitle,
    explanation:
      "This guidance is being phrased conservatively because one or more high-stakes clinical claims could not be linked to reviewed provenance. Please follow the urgency recommendation and seek veterinary care promptly if your dog worsens.",
    clinical_notes: [
      existingClinicalNotes,
      "High-stakes specificity was suppressed until reviewed provenance is available for every surfaced claim.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    high_stakes_claims_suppressed: true,
  };
}

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

export async function generateReport({
  session,
  pet,
  messages,
  image,
  requestOrigin,
  verifiedUserId,
}: GenerateReportInput) {
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
  const rankedConditions = context.top5.map((d) => d.medical_term);
  const knowledgeQuery = buildKnowledgeSearchQuery(
    session,
    pet,
    rankedConditions
  );
  const referenceImageQuery = buildReferenceImageQuery(
    session,
    pet,
    rankedConditions
  );
  const retrievalResult = await buildReportRetrievalBundle(
    session,
    pet,
    knowledgeQuery,
    referenceImageQuery,
    rankedConditions
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

  let clinicalCaseContext = "";
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
    .map((m) => `${m.role === "user" ? "Owner" : "Triage AI"}: ${m.content}`)
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
  "explanation": "4-6 sentences for a dog owner. Reference breed-specific data from the matrix. Use medical terms with plain-English parenthetical explanations.",
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
    if (!Array.isArray(report.evidence_chain)) {
      report.evidence_chain = buildEvidenceChainForResponse(
        session,
        retrievalBundle
      );
    }
    const structuredEvidenceChain = buildStructuredEvidenceChain({
      session,
      retrievalBundle,
      pet,
      highestUrgency: context.highest_urgency,
    });
    report.evidenceChain = structuredEvidenceChain;

    let finalReport = report;
    if (useNvidia) {
      try {
        finalReport = await safetyVerify(report, pet, context);
        console.log("[Engine] Safety: GLM-5 verified");
      } catch (safetyError) {
        console.error("Safety verification failed (non-blocking):", safetyError);
      }
    }

    finalReport.evidenceChain = structuredEvidenceChain;
    finalReport.knowledge_sources_used = dedupeStrings(
      retrievalBundle.sourceCitations
    );
    finalReport.provenance_registry_version = getProvenanceRegistry().version;
    finalReport.evidence_summary = buildEvidenceSummary({
      evidenceChain: structuredEvidenceChain,
      retrievalBundle,
    });
    finalReport = applyHighStakesProvenanceGuard(
      finalReport,
      structuredEvidenceChain
    );

    const hasModelDisagreement = Boolean(
      session.case_memory?.consult_opinions?.some(
        (opinion) => opinion.disagreements.length > 0
      )
    );
    try {
      finalReport.calibrated_confidence = buildReportConfidenceCalibration({
        baseConfidence:
          typeof finalReport.confidence === "number"
            ? finalReport.confidence
            : deriveBaselineReportConfidence(context),
        reportSeverity:
          finalReport.severity === "emergency" ||
          finalReport.severity === "high" ||
          finalReport.severity === "medium" ||
          finalReport.severity === "low"
            ? finalReport.severity
            : context.highest_urgency === "emergency" ||
                context.highest_urgency === "high" ||
                context.highest_urgency === "moderate"
              ? context.highest_urgency === "moderate"
                ? "medium"
                : context.highest_urgency
              : "low",
        session,
        hasModelDisagreement,
        textChunkCount: retrievalBundle.textChunks.length,
        imageMatchCount: retrievalBundle.imageMatches.length,
        breedKnown: Boolean(pet.breed?.trim()),
        ageKnown: Number.isFinite(pet.age_years),
        topDifferentialCondition:
          Array.isArray(finalReport.differential_diagnoses) &&
          finalReport.differential_diagnoses.length > 0 &&
          typeof finalReport.differential_diagnoses[0]?.condition === "string"
            ? finalReport.differential_diagnoses[0].condition
            : null,
      });
    } catch (calibrationError) {
      console.error(
        "[Engine] Confidence calibration failed (non-blocking):",
        calibrationError
      );
      finalReport.calibrated_confidence = null;
    }

    let asyncReviewScheduled = false;
    const reviewImage = image;
    const asyncReviewAdditionalKey = [
      String(finalReport.title || "").trim(),
      String(finalReport.recommendation || "").trim(),
    ]
      .filter(Boolean)
      .join("|");
    const asyncReviewShadowDecision =
      reviewImage && requestOrigin
        ? getShadowModeDecision({
            service: "async-review-service",
            session,
            pet,
            urgencyHint: context.highest_urgency,
            additionalKey: asyncReviewAdditionalKey,
          })
        : null;
    const asyncReviewLiveDecision = reviewImage
      ? getLiveTrafficDecision({
          service: "async-review-service",
          session,
          additionalKey: asyncReviewAdditionalKey,
        })
      : null;
    const shouldAttemptAsyncReview =
      Boolean(reviewImage) &&
      context.highest_urgency !== "emergency" &&
      shouldScheduleAsyncConsultReview(session) &&
      isAsyncReviewServiceConfigured() &&
      Boolean(requestOrigin) &&
      Boolean(
        asyncReviewShadowDecision?.enabled || asyncReviewLiveDecision?.enabled
      );

    if (
      shouldAttemptAsyncReview &&
      asyncReviewShadowDecision &&
      asyncReviewLiveDecision
    ) {
      const startedAt = Date.now();
      try {
        asyncReviewScheduled = await enqueueAsyncReview({
          baseUrl: requestOrigin!,
          image: reviewImage!,
          pet,
          session,
          report: finalReport,
        });
        session = appendSidecarObservation(session, {
          service: "async-review-service",
          stage: "queue",
          latencyMs: Date.now() - startedAt,
          outcome: asyncReviewScheduled
            ? asyncReviewShadowDecision.enabled
              ? "shadow"
              : "success"
            : "error",
          shadowMode: asyncReviewShadowDecision.enabled,
          fallbackUsed:
            asyncReviewShadowDecision.enabled || !asyncReviewScheduled,
          note: `queued=${asyncReviewScheduled}; ${describeShadowModeDecision(asyncReviewShadowDecision)}; ${describeLiveTrafficDecision(asyncReviewLiveDecision)}`,
        });
        if (asyncReviewScheduled) {
          console.log("[HF Multimodal Consult] queued async review");
        }
      } catch (error) {
        session = appendSidecarObservation(session, {
          service: "async-review-service",
          stage: "queue",
          latencyMs: Date.now() - startedAt,
          outcome: "error",
          shadowMode: asyncReviewShadowDecision.enabled,
          fallbackUsed: true,
          note: `queue_exception=true; ${describeShadowModeDecision(asyncReviewShadowDecision)}; ${describeLiveTrafficDecision(asyncReviewLiveDecision)}`,
        });
        console.error("[HF Multimodal Consult] async review failed:", error);
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
    const observabilitySnapshot = buildObservabilitySnapshot(session);
    finalReport.system_observability = observabilitySnapshot;
    const persistedShadowTelemetrySnapshot =
      buildInternalShadowTelemetrySnapshot(session);

    const persistShadowTelemetry = async () => {
      try {
        await appendShadowTelemetrySnapshot(persistedShadowTelemetrySnapshot);
      } catch (shadowTelemetryError) {
        console.error(
          "[ShadowTelemetry] Failed to persist report telemetry:",
          shadowTelemetryError
        );
      }
    };

    if (!runAfterSafely(persistShadowTelemetry)) {
      void persistShadowTelemetry();
    }

    try {
      finalReport.bayesian_differentials = await computeBayesianScore(
        session.known_symptoms,
        pet.breed,
        pet.age_years,
        context.top5
      );
    } catch (bayesianError) {
      console.error(
        "[Bayesian] Failed to score report differentials:",
        bayesianError
      );
    }

    let reportStorageId: string | null = null;
    try {
      reportStorageId = await saveSymptomReportToDB(session, pet, finalReport);
      if (reportStorageId) {
        finalReport.report_storage_id = reportStorageId;
        finalReport.outcome_feedback_enabled = true;
      }
    } catch (saveError) {
      console.error("[DB] Failed to save triage session:", saveError);
    }

    if (verifiedUserId && reportStorageId) {
      emit(EventType.REPORT_READY, {
        userId: verifiedUserId,
        sessionId: null,
        reportStorageId,
        urgency: context.highest_urgency,
        petName: pet.name ?? "your dog",
      });

      if (
        context.highest_urgency === "emergency" ||
        context.highest_urgency === "high"
      ) {
        emit(EventType.URGENCY_HIGH, {
          userId: verifiedUserId,
          sessionId: null,
          urgency: context.highest_urgency as "emergency" | "high",
          petName: pet.name ?? "your dog",
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
