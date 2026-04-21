import { createClient } from "@supabase/supabase-js";
import type { SymptomReport } from "@/components/symptom-report/types";
import type { PetProfile, TriageSession } from "./triage-engine";
import { buildThresholdProposalDraft } from "./threshold-proposals";

export interface OutcomeFeedbackInput {
  symptomCheckId: string;
  matchedExpectation: "yes" | "partly" | "no";
  confirmedDiagnosis?: string;
  requestingUserId: string;
  vetOutcome?: string;
  ownerNotes?: string;
}

export interface OutcomeFeedbackSaveResult {
  errorCode?: "forbidden" | "not_found" | "server_unavailable";
  ok: boolean;
  legacyUpdated: boolean;
  proposalCreated: boolean;
  structuredStored: boolean;
  warnings: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your_supabase")) {
    return null;
  }

  return createClient(url, serviceKey);
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function saveSymptomReportToDB(
  session: TriageSession,
  pet: PetProfile,
  report: Record<string, unknown>
): Promise<string | null> {
  const supabase = getServerSupabase();
  if (!supabase) return null;

  const urgency = (report.urgency_level as string) || (report.severity as string) || "low";
  const severityMap: Record<string, string> = {
    emergency: "emergency",
    high: "high",
    medium: "medium",
    moderate: "medium",
    low: "low",
  };
  const recMap: Record<string, string> = {
    emergency: "emergency_vet",
    high: "vet_24h",
    medium: "vet_48h",
    moderate: "vet_48h",
    low: "monitor",
  };

  const symptoms = session.known_symptoms.join(", ") || "unknown";
  const petId = (pet as PetProfile & { id?: string }).id;
  if (!petId || petId === "demo") return null;

  const { data, error } = await supabase
    .from("symptom_checks")
    .insert({
      pet_id: petId,
      symptoms,
      ai_response: JSON.stringify(report),
      severity: severityMap[urgency] || "low",
      recommendation: recMap[urgency] || "monitor",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[DB] Failed to save triage session:", error);
    return null;
  }

  if (data?.id) {
    console.log("[DB] Triage session saved to symptom_checks");
    return String(data.id);
  }

  return null;
}

export async function saveOutcomeFeedbackToDB(
  input: OutcomeFeedbackInput
): Promise<OutcomeFeedbackSaveResult> {
  if (!isUuid(input.symptomCheckId)) {
    return {
      errorCode: "not_found",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Invalid symptom check identifier"],
    };
  }

  if (!isUuid(input.requestingUserId)) {
    return {
      errorCode: "forbidden",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Invalid authenticated user context"],
    };
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return {
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Supabase is not configured"],
    };
  }

  const { data, error } = await supabase
    .from("symptom_checks")
    .select("id, pet_id, symptoms, severity, recommendation, ai_response")
    .eq("id", input.symptomCheckId)
    .maybeSingle();

  if (error || !data) {
    console.error("[DB] Failed to load symptom check for feedback:", error);
    return {
      errorCode: "not_found",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Failed to load symptom check"],
    };
  }

  const petId = typeof data.pet_id === "string" ? data.pet_id : null;
  if (!petId) {
    return {
      errorCode: "not_found",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Missing symptom check ownership data"],
    };
  }

  const { data: petData, error: petError } = await supabase
    .from("pets")
    .select("user_id")
    .eq("id", petId)
    .maybeSingle();

  const ownerUserId =
    petData && typeof petData === "object" && typeof petData.user_id === "string"
      ? petData.user_id
      : null;

  if (petError || !ownerUserId || ownerUserId !== input.requestingUserId) {
    if (petError) {
      console.error("[DB] Failed to verify symptom check ownership:", petError);
    }
    return {
      errorCode: "forbidden",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Symptom check does not belong to the authenticated user"],
    };
  }

  let aiResponse: Record<string, unknown> = {};
  try {
    aiResponse =
      typeof data.ai_response === "string"
        ? (JSON.parse(data.ai_response) as Record<string, unknown>)
        : ((data.ai_response as Record<string, unknown> | null) || {});
  } catch {
    aiResponse = {};
  }

  const feedbackPayload = {
    matched_expectation: input.matchedExpectation,
    confirmed_diagnosis: normalizeOptionalText(input.confirmedDiagnosis),
    vet_outcome: normalizeOptionalText(input.vetOutcome),
    owner_notes: normalizeOptionalText(input.ownerNotes),
    submitted_at: new Date().toISOString(),
  };
  aiResponse.outcome_feedback = feedbackPayload;

  const { error: updateError } = await supabase
    .from("symptom_checks")
    .update({
      ai_response: JSON.stringify(aiResponse),
    })
    .eq("id", input.symptomCheckId)
    .eq("pet_id", petId);

  if (updateError) {
    console.error("[DB] Failed to save outcome feedback:", updateError);
    return {
      errorCode: "server_unavailable",
      ok: false,
      legacyUpdated: false,
      proposalCreated: false,
      structuredStored: false,
      warnings: ["Failed to update legacy ai_response outcome feedback"],
    };
  }

  const warnings: string[] = [];
  let structuredStored = false;
  let proposalCreated = false;
  let outcomeFeedbackId: string | null = null;

  try {
    const reportSnapshot = aiResponse as unknown as SymptomReport;
    const { data: feedbackEntry, error: feedbackError } = await supabase
      .from("outcome_feedback_entries")
      .insert({
        confirmed_diagnosis: feedbackPayload.confirmed_diagnosis,
        feedback_source: "owner_feedback",
        matched_expectation: input.matchedExpectation,
        owner_notes: feedbackPayload.owner_notes,
        report_recommendation:
          typeof data.recommendation === "string" ? data.recommendation : null,
        report_severity:
          typeof data.severity === "string" ? data.severity : null,
        report_snapshot: aiResponse,
        report_title:
          typeof reportSnapshot.title === "string" ? reportSnapshot.title : null,
        submitted_at: feedbackPayload.submitted_at,
        symptom_check_id: input.symptomCheckId,
        symptom_summary:
          typeof data.symptoms === "string" ? data.symptoms : null,
        vet_outcome: feedbackPayload.vet_outcome,
      })
      .select("id")
      .maybeSingle();

    if (feedbackError) {
      warnings.push("Structured outcome feedback write failed");
      console.error(
        "[DB] Failed to dual-write outcome feedback entry:",
        feedbackError
      );
    } else {
      structuredStored = true;
      outcomeFeedbackId =
        feedbackEntry && typeof feedbackEntry.id === "string"
          ? feedbackEntry.id
          : null;
    }

    const proposal = buildThresholdProposalDraft({
      feedback: input,
      report: reportSnapshot,
      symptomSummary:
        typeof data.symptoms === "string" ? data.symptoms : "unknown",
    });

    if (proposal && structuredStored) {
      const { error: proposalError } = await supabase
        .from("threshold_proposals")
        .insert({
          outcome_feedback_id: outcomeFeedbackId,
          payload: proposal.payload,
          proposal_type: proposal.proposalType,
          rationale: proposal.rationale,
          status: "draft",
          summary: proposal.summary,
          symptom_check_id: input.symptomCheckId,
        });

      if (proposalError) {
        warnings.push("Threshold proposal draft write failed");
        console.error(
          "[DB] Failed to create threshold proposal draft:",
          proposalError
        );
      } else {
        proposalCreated = true;
      }
    }
  } catch (structuredError) {
    warnings.push("Structured outcome feedback write threw unexpectedly");
    console.error(
      "[DB] Unexpected structured outcome feedback failure:",
      structuredError
    );
  }

  return {
    ok: true,
    legacyUpdated: true,
    proposalCreated,
    structuredStored,
    warnings,
  };
}
