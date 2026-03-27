import { createClient } from "@supabase/supabase-js";
import type { PetProfile, TriageSession } from "./triage-engine";

export interface OutcomeFeedbackInput {
  symptomCheckId: string;
  matchedExpectation: "yes" | "partly" | "no";
  confirmedDiagnosis?: string;
  vetOutcome?: string;
  ownerNotes?: string;
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey || url.includes("your_supabase")) {
    return null;
  }

  return createClient(url, serviceKey);
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
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("symptom_checks")
    .select("id, ai_response")
    .eq("id", input.symptomCheckId)
    .maybeSingle();

  if (error || !data) {
    console.error("[DB] Failed to load symptom check for feedback:", error);
    return false;
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

  aiResponse.outcome_feedback = {
    matched_expectation: input.matchedExpectation,
    confirmed_diagnosis: input.confirmedDiagnosis?.trim() || null,
    vet_outcome: input.vetOutcome?.trim() || null,
    owner_notes: input.ownerNotes?.trim() || null,
    submitted_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from("symptom_checks")
    .update({
      ai_response: JSON.stringify(aiResponse),
    })
    .eq("id", input.symptomCheckId);

  if (updateError) {
    console.error("[DB] Failed to save outcome feedback:", updateError);
    return false;
  }

  return true;
}
