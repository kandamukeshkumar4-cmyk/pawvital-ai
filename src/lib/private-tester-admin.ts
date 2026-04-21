import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildPrivateTesterConfigSummary,
  evaluatePrivateTesterAccess,
  getPrivateTesterAllowedEmails,
  getPrivateTesterBlockedEmails,
  normalizePrivateTesterEmail,
} from "./private-tester-access";

interface ServiceProfileRow {
  email: string | null;
  full_name: string | null;
  id: string;
}

interface ServicePetRow {
  id: string;
  name: string | null;
}

export interface PrivateTesterRecentCase {
  createdAt: string | null;
  negativeFeedbackFlagged: boolean;
  petName: string | null;
  recommendation: string | null;
  severity: string | null;
  symptomCheckId: string;
}

export interface PrivateTesterDataSummary {
  access: ReturnType<typeof evaluatePrivateTesterAccess>;
  config: ReturnType<typeof buildPrivateTesterConfigSummary>;
  counts: {
    caseOutcomes: number;
    journalEntries: number;
    negativeFeedbackEntries: number;
    notifications: number;
    outcomeFeedbackEntries: number;
    pets: number;
    sharedReports: number;
    subscriptions: number;
    thresholdProposals: number;
    symptomChecks: number;
  };
  recentCases: PrivateTesterRecentCase[];
  user: {
    email: string | null;
    fullName: string | null;
    id: string;
  };
}

export interface PrivateTesterDeleteResult {
  deleted: boolean;
  dryRun: boolean;
  summary: PrivateTesterDataSummary;
}

export interface PrivateTesterDashboardData {
  config: ReturnType<typeof buildPrivateTesterConfigSummary>;
  summary: {
    active: number;
    blocked: number;
    negativeFeedbackEntries: number;
    symptomChecks: number;
    total: number;
  };
  testers: PrivateTesterDataSummary[];
  warning?: string;
}

function summarizeConfiguredTesterEmails(
  config: ReturnType<typeof buildPrivateTesterConfigSummary>
) {
  const emails = Array.from(
    new Set([...(config.allowedEmails ?? []), ...(config.blockedEmails ?? [])])
  );

  return {
    active: emails.filter((email) => evaluatePrivateTesterAccess({ email }).allowed)
      .length,
    blocked: emails.filter((email) =>
      evaluatePrivateTesterAccess({ email }).blocked
    ).length,
    total: emails.length,
  };
}

export function buildPrivateTesterDashboardFallback(
  warning?: string
): PrivateTesterDashboardData {
  const config = buildPrivateTesterConfigSummary();
  const configuredSummary = summarizeConfiguredTesterEmails(config);

  return {
    config,
    summary: {
      active: configuredSummary.active,
      blocked: configuredSummary.blocked,
      negativeFeedbackEntries: 0,
      symptomChecks: 0,
      total: configuredSummary.total,
    },
    testers: [],
    warning,
  };
}

function getServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey || url.includes("your_supabase")) {
    throw new Error("SUPABASE_SERVICE_ROLE_REQUIRED");
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function resolveProfileByIdentity(
  supabase: SupabaseClient,
  input: {
    email?: string | null;
    userId?: string | null;
  }
): Promise<ServiceProfileRow> {
  if (input.userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", input.userId)
      .maybeSingle();

    if (error) {
      throw new Error(`PROFILE_LOOKUP_FAILED:${error.message}`);
    }

    if (data && typeof data.id === "string") {
      return data as ServiceProfileRow;
    }
  }

  const normalizedEmail = normalizePrivateTesterEmail(input.email);
  if (!normalizedEmail) {
    throw new Error("TESTER_IDENTITY_REQUIRED");
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_LOOKUP_FAILED:${error.message}`);
  }

  if (!data || typeof data.id !== "string") {
    throw new Error("TESTER_NOT_FOUND");
  }

  return data as ServiceProfileRow;
}

async function countRows(
  supabase: SupabaseClient,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw new Error(`COUNT_FAILED:${table}:${error.message}`);
  }

  return count ?? 0;
}

async function loadRelatedSymptomData(
  supabase: SupabaseClient,
  pets: ServicePetRow[]
) {
  if (pets.length === 0) {
    return {
      counts: {
        caseOutcomes: 0,
        negativeFeedbackEntries: 0,
        outcomeFeedbackEntries: 0,
        sharedReports: 0,
        symptomChecks: 0,
        thresholdProposals: 0,
      },
      recentCases: [] as PrivateTesterRecentCase[],
    };
  }

  const petIds = pets.map((pet) => pet.id);
  const petNames = new Map(pets.map((pet) => [pet.id, pet.name ?? null]));

  const { data: symptomChecks, error: symptomChecksError } = await supabase
    .from("symptom_checks")
    .select("id, pet_id, severity, recommendation, created_at")
    .in("pet_id", petIds);

  if (symptomChecksError) {
    throw new Error(`COUNT_FAILED:symptom_checks:${symptomChecksError.message}`);
  }

  const checkIds = (symptomChecks ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);

  if (checkIds.length === 0) {
    return {
      counts: {
        caseOutcomes: 0,
        negativeFeedbackEntries: 0,
        outcomeFeedbackEntries: 0,
        sharedReports: 0,
        symptomChecks: 0,
        thresholdProposals: 0,
      },
      recentCases: [] as PrivateTesterRecentCase[],
    };
  }

  const counts = await Promise.all([
    supabase
      .from("case_outcomes")
      .select("*", { count: "exact", head: true })
      .in("check_id", checkIds),
    supabase
      .from("outcome_feedback_entries")
      .select("*", { count: "exact", head: true })
      .in("symptom_check_id", checkIds),
    supabase
      .from("shared_reports")
      .select("*", { count: "exact", head: true })
      .in("check_id", checkIds),
    supabase
      .from("threshold_proposals")
      .select("*", { count: "exact", head: true })
      .in("symptom_check_id", checkIds),
    supabase
      .from("outcome_feedback_entries")
      .select("symptom_check_id, matched_expectation")
      .in("symptom_check_id", checkIds),
  ]);

  const [
    caseOutcomes,
    outcomeFeedbackEntries,
    sharedReports,
    thresholdProposals,
    feedbackEntries,
  ] = counts;

  if (caseOutcomes.error) {
    throw new Error(`COUNT_FAILED:case_outcomes:${caseOutcomes.error.message}`);
  }
  if (outcomeFeedbackEntries.error) {
    throw new Error(
      `COUNT_FAILED:outcome_feedback_entries:${outcomeFeedbackEntries.error.message}`
    );
  }
  if (sharedReports.error) {
    throw new Error(`COUNT_FAILED:shared_reports:${sharedReports.error.message}`);
  }
  if (thresholdProposals.error) {
    throw new Error(
      `COUNT_FAILED:threshold_proposals:${thresholdProposals.error.message}`
    );
  }
  if (feedbackEntries.error) {
    throw new Error(
      `COUNT_FAILED:outcome_feedback_entries:${feedbackEntries.error.message}`
    );
  }

  const flaggedCheckIds = new Set(
    (feedbackEntries.data ?? [])
      .filter(
        (row) =>
          String(
            (row as { matched_expectation?: string }).matched_expectation ?? ""
          ) === "no"
      )
      .map((row) => String((row as { symptom_check_id?: string }).symptom_check_id ?? ""))
      .filter(Boolean)
  );

  const recentCases = [...(symptomChecks ?? [])]
    .sort((left, right) =>
      String((right as { created_at?: string }).created_at ?? "").localeCompare(
        String((left as { created_at?: string }).created_at ?? "")
      )
    )
    .slice(0, 5)
    .map((row) => {
      const symptomCheckId = String((row as { id?: string }).id ?? "").trim();
      const petId = String((row as { pet_id?: string }).pet_id ?? "").trim();

      return {
        createdAt:
          typeof (row as { created_at?: string }).created_at === "string"
            ? (row as { created_at?: string }).created_at ?? null
            : null,
        negativeFeedbackFlagged: flaggedCheckIds.has(symptomCheckId),
        petName: petNames.get(petId) ?? null,
        recommendation:
          typeof (row as { recommendation?: string }).recommendation === "string"
            ? (row as { recommendation?: string }).recommendation ?? null
            : null,
        severity:
          typeof (row as { severity?: string }).severity === "string"
            ? (row as { severity?: string }).severity ?? null
            : null,
        symptomCheckId,
      };
    });

  return {
    counts: {
      caseOutcomes: caseOutcomes.count ?? 0,
      negativeFeedbackEntries: flaggedCheckIds.size,
      outcomeFeedbackEntries: outcomeFeedbackEntries.count ?? 0,
      sharedReports: sharedReports.count ?? 0,
      symptomChecks: checkIds.length,
      thresholdProposals: thresholdProposals.count ?? 0,
    },
    recentCases,
  };
}

export async function inspectPrivateTesterData(input: {
  email?: string | null;
  userId?: string | null;
}): Promise<PrivateTesterDataSummary> {
  const supabase = getServiceSupabase();
  const profile = await resolveProfileByIdentity(supabase, input);
  const access = evaluatePrivateTesterAccess({ email: profile.email });
  const config = buildPrivateTesterConfigSummary();

  const { data: pets, error: petsError } = await supabase
    .from("pets")
    .select("id, name")
    .eq("user_id", profile.id);

  if (petsError) {
    throw new Error(`COUNT_FAILED:pets:${petsError.message}`);
  }

  const petRows = (pets ?? [])
    .flatMap((row) => {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) {
        return [];
      }

      return [
        {
          id,
          name:
            typeof (row as { name?: string | null }).name === "string"
              ? (row as { name?: string | null }).name ?? null
              : null,
        },
      ] satisfies ServicePetRow[];
    });

  const [journalEntries, notifications, subscriptions, relatedSymptomData] =
    await Promise.all([
      countRows(supabase, "journal_entries", "user_id", profile.id),
      countRows(supabase, "notifications", "user_id", profile.id),
      countRows(supabase, "subscriptions", "user_id", profile.id),
      loadRelatedSymptomData(supabase, petRows),
    ]);

  return {
    access,
    config,
    counts: {
      caseOutcomes: relatedSymptomData.counts.caseOutcomes,
      journalEntries,
      notifications,
      negativeFeedbackEntries: relatedSymptomData.counts.negativeFeedbackEntries,
      outcomeFeedbackEntries: relatedSymptomData.counts.outcomeFeedbackEntries,
      pets: petRows.length,
      sharedReports: relatedSymptomData.counts.sharedReports,
      subscriptions,
      symptomChecks: relatedSymptomData.counts.symptomChecks,
      thresholdProposals: relatedSymptomData.counts.thresholdProposals,
    },
    recentCases: relatedSymptomData.recentCases,
    user: {
      email: profile.email,
      fullName: profile.full_name,
      id: profile.id,
    },
  };
}

export async function listPrivateTesterSummaries(): Promise<PrivateTesterDashboardData> {
  const config = buildPrivateTesterConfigSummary();
  const allowedEmails = getPrivateTesterAllowedEmails();
  const blockedEmails = getPrivateTesterBlockedEmails();
  const uniqueEmails = Array.from(
    new Set([...allowedEmails, ...blockedEmails].map((email) => normalizePrivateTesterEmail(email)).filter(Boolean))
  ) as string[];

  const testerResults = await Promise.allSettled(
    uniqueEmails.map((email) => inspectPrivateTesterData({ email }))
  );

  const testers = testerResults
    .flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    )
    .sort((left, right) =>
      String(right.user.email ?? "").localeCompare(String(left.user.email ?? ""))
    );
  const configuredSummary = summarizeConfiguredTesterEmails(config);

  return {
    config,
    summary: {
      active: configuredSummary.active,
      blocked: configuredSummary.blocked,
      negativeFeedbackEntries: testers.reduce(
        (total, tester) => total + tester.counts.negativeFeedbackEntries,
        0
      ),
      symptomChecks: testers.reduce(
        (total, tester) => total + tester.counts.symptomChecks,
        0
      ),
      total: configuredSummary.total,
    },
    testers,
  };
}

export async function deletePrivateTesterData(input: {
  dryRun?: boolean;
  email?: string | null;
  userId?: string | null;
}): Promise<PrivateTesterDeleteResult> {
  const supabase = getServiceSupabase();
  const summary = await inspectPrivateTesterData(input);
  const dryRun = input.dryRun !== false;

  if (dryRun) {
    return {
      deleted: false,
      dryRun: true,
      summary,
    };
  }

  const { error } = await supabase.auth.admin.deleteUser(summary.user.id);
  if (error) {
    throw new Error(`DELETE_FAILED:${error.message}`);
  }

  return {
    deleted: true,
    dryRun: false,
    summary,
  };
}
