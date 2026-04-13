import { after } from "next/server";
import {
  type PetProfile,
  type TriageSession,
  buildDiagnosisContext,
} from "@/lib/triage-engine";
import { safeParseJson } from "@/lib/llm-output";
import {
  searchKnowledgeChunks,
  searchReferenceImages,
} from "@/lib/knowledge-retrieval";
import {
  capDiagnosticConfidence,
  inferSupportedImageDomain,
  type ConsultOpinion,
  type RetrievalBundle,
  type SupportedImageDomain,
  type VisionClinicalEvidence,
  type VisionPreprocessResult,
} from "@/lib/clinical-evidence";
import {
  isImageRetrievalConfigured,
  retrieveVeterinaryImageEvidence,
} from "@/lib/image-retrieval-service";
import {
  isTextRetrievalConfigured,
  retrieveVeterinaryTextEvidence,
} from "@/lib/text-retrieval-service";
import {
  isAbortLikeError as isSidecarAbortError,
  isRetrievalSidecarConfigured,
  retrieveVeterinaryEvidenceFromSidecar,
} from "@/lib/hf-sidecars";
import {
  appendShadowComparison,
  appendSidecarObservation,
  describeShadowComparison,
  isShadowModeEnabledForService,
} from "@/lib/sidecar-observability";
import { ensureStructuredCaseMemory } from "@/lib/symptom-memory";
import { verifyWithGLM } from "@/lib/nvidia-models";

type DiagnosisContext = ReturnType<typeof buildDiagnosisContext>;

export function buildFallbackPreprocessResult(
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

export function buildVisionClinicalEvidence(input: {
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
    ...input.visionRedFlags.map(
      (flag) => `red flag: ${flag.replace(/_/g, " ")}`
    ),
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

export function deriveVisionContradictions(
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
    contradictions.add(
      "image suggests an eye-focused issue while owner text is about a different complaint"
    );
  }

  if (
    preprocess?.domain === "ear" &&
    !lowerOwner.includes("ear") &&
    !session.known_symptoms.includes("ear_scratching")
  ) {
    contradictions.add(
      "image suggests an ear-focused issue while owner text is about a different complaint"
    );
  }

  if (
    preprocess?.domain === "stool_vomit" &&
    !/(vomit|vomiting|stool|poop|diarrhea|diarrhoea)/.test(lowerOwner)
  ) {
    contradictions.add(
      "image suggests stool or vomit evidence that is not clearly described in the owner message"
    );
  }

  if (
    session.extracted_answers.which_leg &&
    evidence.bodyRegion &&
    !String(session.extracted_answers.which_leg)
      .toLowerCase()
      .includes(String(evidence.bodyRegion).toLowerCase().split(" ")[0]) &&
    /(left|right)/.test(
      String(session.extracted_answers.which_leg).toLowerCase()
    )
  ) {
    contradictions.add(
      "owner-reported location and image body region do not fully align"
    );
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

export function shouldTriggerSyncConsult(input: {
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
      String(input.session.extracted_answers.which_leg)
        .toLowerCase()
        .includes("right"));

  return (
    lowVisionConfidence ||
    severeVisualFinding ||
    multipleRegions ||
    conflictWithOwner ||
    (morphologyDomain && moderateOrHigher)
  );
}

export function buildEvidenceChainNotes(input: {
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

export function didVisualEvidenceInfluenceQuestion(
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

export async function buildReportRetrievalBundle(
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
          Math.abs(
            fallbackBundle.textChunks.length - sidecarBundle.textChunks.length
          ) +
            Math.abs(
              fallbackBundle.imageMatches.length -
                sidecarBundle.imageMatches.length
            )
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
    (await searchReferenceImages(referenceImageQuery, 4, [], {
      domain,
      dogOnly: true,
      liveOnly: true,
    })) || [];

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

export function formatRetrievalTextContext(bundle: RetrievalBundle): string {
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

export function formatRetrievalImageContext(bundle: RetrievalBundle): string {
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

export function formatVisualEvidenceForReport(session: TriageSession): string {
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

export function formatConsultEvidenceForReport(session: TriageSession): string {
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

export function formatEvidenceChainForReport(session: TriageSession): string {
  const notes = session.case_memory?.evidence_chain || [];
  return notes.length > 0
    ? notes.map((note) => `- ${note}`).join("\n")
    : "- No explicit evidence chain recorded.";
}

export function buildEvidenceChainForResponse(
  session: TriageSession,
  retrievalBundle: RetrievalBundle
): string[] {
  return [
    ...(session.case_memory?.evidence_chain || []),
    ...retrievalBundle.textChunks
      .slice(0, 2)
      .map(
        (entry) => `Reference support: ${entry.title} (${entry.score.toFixed(2)})`
      ),
    ...retrievalBundle.imageMatches
      .slice(0, 2)
      .map(
        (entry) =>
          `Image support: ${entry.conditionLabel || entry.title} (${entry.score.toFixed(2)})`
      ),
  ].slice(-8);
}

export function deriveBaselineReportConfidence(
  context: DiagnosisContext
): number {
  if (context.top5.length === 0) return 0.7;
  const topScore = context.top5[0]?.final_score || 0;
  if (topScore >= 1.6) return 0.92;
  if (topScore >= 1.1) return 0.87;
  if (topScore >= 0.8) return 0.82;
  return 0.76;
}

export function shouldScheduleAsyncConsultReview(
  session: TriageSession
): boolean {
  return Boolean(
    session.case_memory?.ambiguity_flags?.length ||
      session.case_memory?.consult_opinions?.some(
        (opinion) => opinion.uncertainties.length > 0
      )
  );
}

function hasPositiveVisionNarrative(visionAnalysis: string | null): boolean {
  if (!visionAnalysis) return false;

  return /(wound|lesion|ulcer|abrasion|rash|discharge|inflam|swelling|redness|ear|eye|vomit|stool|diarrhea)/i.test(
    visionAnalysis
  );
}

export function deriveSymptomsFromImageEvidence(input: {
  preprocess: VisionPreprocessResult | null;
  visionAnalysis: string | null;
  visionSymptoms: string[];
  visionRedFlags: string[];
  visionSeverity: "normal" | "needs_review" | "urgent";
}): string[] {
  const {
    preprocess,
    visionAnalysis,
    visionSymptoms,
    visionRedFlags,
    visionSeverity,
  } = input;
  if (!preprocess) return [];

  const hasStructuredVisionEvidence =
    visionSymptoms.length > 0 || visionRedFlags.length > 0;
  const hasNarrativeEvidence = hasPositiveVisionNarrative(visionAnalysis);
  const hasEscalatedSeverity = visionSeverity !== "normal";

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

export function runAfterSafely(task: () => Promise<void>): boolean {
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

export function parseReportJSON(rawText: string): Record<string, unknown> {
  return safeParseJson<Record<string, unknown>>(rawText, "symptom chat report");
}

export async function safetyVerify(
  report: Record<string, unknown>,
  pet: PetProfile,
  context: DiagnosisContext
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

  let safety: {
    safe?: boolean;
    corrections?: {
      severity?: string | null;
      recommendation?: string | null;
      add_warning_signs?: string[];
      add_to_explanation?: string | null;
      safety_note?: string | null;
    };
    reasoning?: string;
  };

  try {
    safety = safeParseJson<{
      safe?: boolean;
      corrections?: {
        severity?: string | null;
        recommendation?: string | null;
        add_warning_signs?: string[];
        add_to_explanation?: string | null;
        safety_note?: string | null;
      };
      reasoning?: string;
    }>(rawResponse, "symptom chat safety review");
  } catch (error) {
    const parseError =
      error instanceof SyntaxError
        ? error
        : new SyntaxError(
            error instanceof Error ? error.message : String(error)
          );
    console.error(
      "[Safety] GLM-5 JSON parse failed (non-blocking, skipping safety corrections):",
      parseError
    );
    console.log(
      "[Safety] Continuing with report generation without safety corrections"
    );
    return report;
  }

  if (!safety.safe && safety.corrections) {
    const c = safety.corrections;

    if (c.severity) {
      report.severity = c.severity;
    }
    if (c.recommendation) {
      report.recommendation = c.recommendation;
    }
    if (
      c.add_warning_signs &&
      Array.isArray(c.add_warning_signs) &&
      c.add_warning_signs.length > 0
    ) {
      const existing = (report.warning_signs as string[]) || [];
      report.warning_signs = [...existing, ...c.add_warning_signs];
    }
    if (c.add_to_explanation && typeof report.explanation === "string") {
      report.explanation = `${report.explanation} ${c.add_to_explanation}`;
    }
    if (c.safety_note && typeof report.clinical_notes === "string") {
      report.clinical_notes =
        `${report.clinical_notes}\n\nSAFETY REVIEW: ${c.safety_note}`;
    }

    console.log("[Safety] GLM-5 applied corrections:", safety.reasoning);
  } else {
    console.log("[Safety] GLM-5: Report is clinically sound");
  }

  return report;
}
