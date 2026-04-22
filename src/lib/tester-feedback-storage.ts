import { getServiceSupabase } from "./supabase-admin";
import type { PetProfile, TriageSession } from "./triage-engine";
import {
  buildTesterFeedbackCaseLedger,
  buildTesterFeedbackCaseSummary,
  buildTesterFeedbackRecord,
  mergeTesterFeedbackIntoReport,
  parseStoredReportPayload,
  parseStoredTesterFeedbackCase,
  type TesterFeedbackCaseSummary,
  type TesterFeedbackSubmissionInput,
  updateLedgerAfterFeedback,
} from "./tester-feedback";

interface SymptomCheckRow {
  id: string;
  pet_id: string | null;
  symptoms: string;
  ai_response: string | Record<string, unknown> | null;
  severity: string | null;
  recommendation: string | null;
  created_at: string;
}

export interface TesterFeedbackSaveResult {
  errorCode?: "not_found" | "server_unavailable";
  ok: boolean;
  caseSummary: TesterFeedbackCaseSummary | null;
  warnings: string[];
}

export interface TesterFeedbackListResult {
  errorCode?: "not_found" | "server_unavailable";
  ok: boolean;
  cases: TesterFeedbackCaseSummary[];
  warnings: string[];
}

export interface SaveTesterFeedbackCaseLedgerInput {
  symptomCheckId: string;
  verifiedUserId?: string | null;
  pet: PetProfile & { id?: string };
  report: Record<string, unknown>;
  session: TriageSession;
}

async function loadOwnedSymptomChecks(
  userId: string,
  symptomCheckId?: string
): Promise<{
  errorCode?: "server_unavailable";
  ok: boolean;
  rows: SymptomCheckRow[];
  warnings: string[];
}> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      errorCode: "server_unavailable",
      ok: false,
      rows: [],
      warnings: ["Supabase is not configured"],
    };
  }

  const { data: petRows, error: petError } = await supabase
    .from("pets")
    .select("id")
    .eq("user_id", userId);

  if (petError) {
    console.error("[TesterFeedback] Failed to load owned pets:", petError);
    return {
      errorCode: "server_unavailable",
      ok: false,
      rows: [],
      warnings: ["Failed to load owned pets"],
    };
  }

  const petIds = (petRows ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));

  if (petIds.length === 0) {
    return {
      ok: true,
      rows: [],
      warnings: [],
    };
  }

  let query = supabase
    .from("symptom_checks")
    .select(
      "id, pet_id, symptoms, ai_response, severity, recommendation, created_at"
    )
    .in("pet_id", petIds)
    .order("created_at", { ascending: false });

  if (symptomCheckId) {
    query = query.eq("id", symptomCheckId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[TesterFeedback] Failed to load symptom checks:", error);
    return {
      errorCode: "server_unavailable",
      ok: false,
      rows: [],
      warnings: ["Failed to load symptom checks"],
    };
  }

  return {
    ok: true,
    rows: ((data ?? []) as SymptomCheckRow[]).map((row) => ({
      ...row,
      pet_id: typeof row.pet_id === "string" ? row.pet_id : null,
      severity: typeof row.severity === "string" ? row.severity : null,
      recommendation:
        typeof row.recommendation === "string" ? row.recommendation : null,
    })),
    warnings: [],
  };
}

function buildCaseSummaryFromRow(row: SymptomCheckRow) {
  const report = parseStoredReportPayload(row.ai_response);
  return buildTesterFeedbackCaseSummary({
    symptomCheckId: row.id,
    petId: row.pet_id,
    createdAt: row.created_at,
    report,
    symptoms: row.symptoms,
    recommendation: row.recommendation ?? row.severity ?? "monitor",
  });
}

export async function saveTesterFeedbackCaseLedgerToDB(
  input: SaveTesterFeedbackCaseLedgerInput
): Promise<{ ok: boolean; warnings: string[] }> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      ok: false,
      warnings: ["Supabase is not configured"],
    };
  }

  const petId =
    typeof input.pet.id === "string" && input.pet.id.trim()
      ? input.pet.id
      : null;

  const ledger = buildTesterFeedbackCaseLedger({
    symptomCheckId: input.symptomCheckId,
    verifiedUserId: input.verifiedUserId,
    petId,
    session: input.session,
    pet: input.pet,
    report: input.report,
  });

  const payload = mergeTesterFeedbackIntoReport(input.report, ledger);

  const { error } = await supabase
    .from("symptom_checks")
    .update({
      ai_response: JSON.stringify(payload),
    })
    .eq("id", input.symptomCheckId);

  if (error) {
    console.error("[TesterFeedback] Failed to save case ledger:", error);
    return {
      ok: false,
      warnings: ["Failed to save tester feedback case ledger"],
    };
  }

  return {
    ok: true,
    warnings: [],
  };
}

export async function saveTesterFeedbackToDB(input: {
  userId: string;
  feedback: TesterFeedbackSubmissionInput;
}): Promise<TesterFeedbackSaveResult> {
  const ownedChecks = await loadOwnedSymptomChecks(
    input.userId,
    input.feedback.symptomCheckId
  );

  if (!ownedChecks.ok) {
    return {
      errorCode: ownedChecks.errorCode,
      ok: false,
      caseSummary: null,
      warnings: ownedChecks.warnings,
    };
  }

  const row = ownedChecks.rows[0];
  if (!row) {
    return {
      errorCode: "not_found",
      ok: false,
      caseSummary: null,
      warnings: ["Symptom check not found or access denied"],
    };
  }

  const supabase = getServiceSupabase();
  if (!supabase) {
    return {
      errorCode: "server_unavailable",
      ok: false,
      caseSummary: null,
      warnings: ["Supabase is not configured"],
    };
  }

  const report = parseStoredReportPayload(row.ai_response);
  const ledger = parseStoredTesterFeedbackCase(report, row.id, row.created_at, {
    petId: row.pet_id,
    symptoms: row.symptoms,
    recommendation: row.recommendation ?? row.severity ?? "monitor",
  });
  const feedback = buildTesterFeedbackRecord(input.feedback, ledger);
  const nextLedger = updateLedgerAfterFeedback(ledger, feedback);
  const payload = mergeTesterFeedbackIntoReport(report, nextLedger, feedback);

  const { error } = await supabase
    .from("symptom_checks")
    .update({
      ai_response: JSON.stringify(payload),
    })
    .eq("id", row.id);

  if (error) {
    console.error("[TesterFeedback] Failed to save tester feedback:", error);
    return {
      errorCode: "server_unavailable",
      ok: false,
      caseSummary: null,
      warnings: ["Unable to save tester feedback"],
    };
  }

  return {
    ok: true,
    caseSummary: buildCaseSummaryFromRow({
      ...row,
      ai_response: payload,
    }),
    warnings: [],
  };
}

export async function listTesterFeedbackCases(input: {
  userId: string;
  flaggedOnly?: boolean;
  symptomCheckId?: string;
}): Promise<TesterFeedbackListResult> {
  const ownedChecks = await loadOwnedSymptomChecks(
    input.userId,
    input.symptomCheckId
  );

  if (!ownedChecks.ok) {
    return {
      errorCode: ownedChecks.errorCode,
      ok: false,
      cases: [],
      warnings: ownedChecks.warnings,
    };
  }

  const cases = ownedChecks.rows
    .map(buildCaseSummaryFromRow)
    .filter((summary) => (input.flaggedOnly ? summary.flagged : true));

  return {
    ok: true,
    cases,
    warnings: [],
  };
}
