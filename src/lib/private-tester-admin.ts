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

const PRIVATE_TESTER_ADMIN_METADATA_KEY = "pawvital_private_tester_admin";
const PRIVATE_TESTER_DISABLE_BAN_DURATION = "876000h";

export type PrivateTesterAdminAction =
  | "disable_access"
  | "restore_access"
  | "mark_deletion"
  | "clear_deletion_mark"
  | "delete_data";

export interface PrivateTesterAdminAuditEvent {
  action: PrivateTesterAdminAction;
  actorEmail: string | null;
  at: string;
  note: string | null;
}

export interface PrivateTesterAdminState {
  accessDisabled: boolean;
  accessDisabledAt: string | null;
  auditLog: PrivateTesterAdminAuditEvent[];
  deletionRequested: boolean;
  deletionRequestedAt: string | null;
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
  adminState: PrivateTesterAdminState;
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
  auditEvent: PrivateTesterAdminAuditEvent | null;
  deleted: boolean;
  dryRun: boolean;
  summary: PrivateTesterDataSummary;
}

export interface PrivateTesterDashboardData {
  config: ReturnType<typeof buildPrivateTesterConfigSummary>;
  summary: {
    active: number;
    authAccessDisabled: number;
    blocked: number;
    deletionRequested: number;
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return false;
  }

  if (error.code === "42P01") {
    return true;
  }

  const message = typeof error.message === "string" ? error.message : "";
  return (
    /does not exist/i.test(message) ||
    /schema cache/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

function formatSupabaseError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) {
    return "";
  }

  return [error.code, error.message]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(":");
}

function isBannedUntilActive(value: unknown) {
  const bannedUntil = asString(value);
  if (!bannedUntil) {
    return false;
  }

  const bannedUntilMs = Date.parse(bannedUntil);
  return Number.isFinite(bannedUntilMs) && bannedUntilMs > Date.now();
}

function normalizeAuditEvent(
  value: unknown
): PrivateTesterAdminAuditEvent | null {
  const record = asObject(value);
  const action = asString(record?.action);
  const at = asString(record?.at);

  if (
    !action ||
    !at ||
    ![
      "disable_access",
      "restore_access",
      "mark_deletion",
      "clear_deletion_mark",
      "delete_data",
    ].includes(action)
  ) {
    return null;
  }

  return {
    action: action as PrivateTesterAdminAction,
    actorEmail: asString(record?.actorEmail),
    at,
    note: asString(record?.note),
  };
}

function buildDefaultPrivateTesterAdminState(): PrivateTesterAdminState {
  return {
    accessDisabled: false,
    accessDisabledAt: null,
    auditLog: [],
    deletionRequested: false,
    deletionRequestedAt: null,
  };
}

function parsePrivateTesterAdminState(input: {
  appMetadata: unknown;
  bannedUntil: unknown;
}): PrivateTesterAdminState {
  const metadata = asObject(input.appMetadata);
  const rawState = asObject(metadata?.[PRIVATE_TESTER_ADMIN_METADATA_KEY]);
  const defaultState = buildDefaultPrivateTesterAdminState();
  const accessDisabled =
    rawState?.accessDisabled === true || isBannedUntilActive(input.bannedUntil);
  const auditLog = Array.isArray(rawState?.auditLog)
    ? rawState.auditLog
        .map(normalizeAuditEvent)
        .filter(
          (event): event is PrivateTesterAdminAuditEvent => event !== null
        )
        .slice(0, 12)
    : defaultState.auditLog;

  return {
    accessDisabled,
    accessDisabledAt: asString(rawState?.accessDisabledAt),
    auditLog,
    deletionRequested: rawState?.deletionRequested === true,
    deletionRequestedAt: asString(rawState?.deletionRequestedAt),
  };
}

function buildPrivateTesterAdminAuditEvent(input: {
  action: PrivateTesterAdminAction;
  actorEmail?: string | null;
  note?: string | null;
  now?: string;
}): PrivateTesterAdminAuditEvent {
  return {
    action: input.action,
    actorEmail: normalizePrivateTesterEmail(input.actorEmail) ?? null,
    at: input.now ?? new Date().toISOString(),
    note: asString(input.note),
  };
}

function applyAdminActionToState(input: {
  currentState: PrivateTesterAdminState;
  event: PrivateTesterAdminAuditEvent;
}) {
  const nextAuditLog = [input.event, ...input.currentState.auditLog].slice(0, 12);

  switch (input.event.action) {
    case "disable_access":
      return {
        accessDisabled: true,
        accessDisabledAt: input.event.at,
        auditLog: nextAuditLog,
        deletionRequested: input.currentState.deletionRequested,
        deletionRequestedAt: input.currentState.deletionRequestedAt,
      } satisfies PrivateTesterAdminState;
    case "restore_access":
      return {
        accessDisabled: false,
        accessDisabledAt: null,
        auditLog: nextAuditLog,
        deletionRequested: input.currentState.deletionRequested,
        deletionRequestedAt: input.currentState.deletionRequestedAt,
      } satisfies PrivateTesterAdminState;
    case "mark_deletion":
      return {
        accessDisabled: input.currentState.accessDisabled,
        accessDisabledAt: input.currentState.accessDisabledAt,
        auditLog: nextAuditLog,
        deletionRequested: true,
        deletionRequestedAt: input.event.at,
      } satisfies PrivateTesterAdminState;
    case "clear_deletion_mark":
      return {
        accessDisabled: input.currentState.accessDisabled,
        accessDisabledAt: input.currentState.accessDisabledAt,
        auditLog: nextAuditLog,
        deletionRequested: false,
        deletionRequestedAt: null,
      } satisfies PrivateTesterAdminState;
    case "delete_data":
      return {
        accessDisabled: true,
        accessDisabledAt: input.currentState.accessDisabledAt ?? input.event.at,
        auditLog: nextAuditLog,
        deletionRequested: true,
        deletionRequestedAt:
          input.currentState.deletionRequestedAt ?? input.event.at,
      } satisfies PrivateTesterAdminState;
  }
}

async function loadPrivateTesterAdminState(
  supabase: SupabaseClient,
  userId: string
): Promise<PrivateTesterAdminState> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(`AUTH_USER_LOOKUP_FAILED:${error.message}`);
  }

  return parsePrivateTesterAdminState({
    appMetadata: data.user?.app_metadata,
    bannedUntil: data.user?.banned_until,
  });
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
      authAccessDisabled: 0,
      blocked: configuredSummary.blocked,
      deletionRequested: 0,
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
    if (isMissingRelationError(error)) {
      return 0;
    }

    throw new Error(`COUNT_FAILED:${table}:${formatSupabaseError(error)}`);
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
    if (isMissingRelationError(symptomChecksError)) {
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

    throw new Error(
      `COUNT_FAILED:symptom_checks:${formatSupabaseError(symptomChecksError)}`
    );
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

  let caseOutcomesCount = caseOutcomes.count ?? 0;
  if (caseOutcomes.error) {
    if (isMissingRelationError(caseOutcomes.error)) {
      caseOutcomesCount = 0;
    } else {
      throw new Error(
        `COUNT_FAILED:case_outcomes:${formatSupabaseError(caseOutcomes.error)}`
      );
    }
  }
  let outcomeFeedbackEntriesCount = outcomeFeedbackEntries.count ?? 0;
  if (outcomeFeedbackEntries.error) {
    if (isMissingRelationError(outcomeFeedbackEntries.error)) {
      outcomeFeedbackEntriesCount = 0;
    } else {
      throw new Error(
        `COUNT_FAILED:outcome_feedback_entries:${formatSupabaseError(outcomeFeedbackEntries.error)}`
      );
    }
  }
  let sharedReportsCount = sharedReports.count ?? 0;
  if (sharedReports.error) {
    if (isMissingRelationError(sharedReports.error)) {
      sharedReportsCount = 0;
    } else {
      throw new Error(
        `COUNT_FAILED:shared_reports:${formatSupabaseError(sharedReports.error)}`
      );
    }
  }
  let thresholdProposalsCount = thresholdProposals.count ?? 0;
  if (thresholdProposals.error) {
    if (isMissingRelationError(thresholdProposals.error)) {
      thresholdProposalsCount = 0;
    } else {
      throw new Error(
        `COUNT_FAILED:threshold_proposals:${formatSupabaseError(thresholdProposals.error)}`
      );
    }
  }
  let feedbackRows = feedbackEntries.data ?? [];
  if (feedbackEntries.error) {
    if (isMissingRelationError(feedbackEntries.error)) {
      feedbackRows = [];
    } else {
      throw new Error(
        `COUNT_FAILED:outcome_feedback_entries:${formatSupabaseError(feedbackEntries.error)}`
      );
    }
  }

  const flaggedCheckIds = new Set(
    feedbackRows
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
      caseOutcomes: caseOutcomesCount,
      negativeFeedbackEntries: flaggedCheckIds.size,
      outcomeFeedbackEntries: outcomeFeedbackEntriesCount,
      sharedReports: sharedReportsCount,
      symptomChecks: checkIds.length,
      thresholdProposals: thresholdProposalsCount,
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
  const adminState = await loadPrivateTesterAdminState(supabase, profile.id);
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
    adminState,
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
      active: Math.max(
        0,
        configuredSummary.active -
          testers.filter((tester) => tester.adminState.accessDisabled).length
      ),
      authAccessDisabled: testers.filter(
        (tester) => tester.adminState.accessDisabled
      ).length,
      blocked:
        configuredSummary.blocked +
        testers.filter(
          (tester) => tester.adminState.accessDisabled && !tester.access.blocked
        ).length,
      deletionRequested: testers.filter(
        (tester) => tester.adminState.deletionRequested
      ).length,
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
  actorEmail?: string | null;
  dryRun?: boolean;
  email?: string | null;
  note?: string | null;
  userId?: string | null;
}): Promise<PrivateTesterDeleteResult> {
  const supabase = getServiceSupabase();
  const summary = await inspectPrivateTesterData(input);
  const dryRun = input.dryRun !== false;

  if (dryRun) {
    return {
      auditEvent: null,
      deleted: false,
      dryRun: true,
      summary,
    };
  }

  const auditEvent = buildPrivateTesterAdminAuditEvent({
    action: "delete_data",
    actorEmail: input.actorEmail,
    note: input.note,
  });
  const currentUser = await supabase.auth.admin.getUserById(summary.user.id);
  if (currentUser.error) {
    throw new Error(`AUTH_USER_LOOKUP_FAILED:${currentUser.error.message}`);
  }

  const currentState = parsePrivateTesterAdminState({
    appMetadata: currentUser.data.user?.app_metadata,
    bannedUntil: currentUser.data.user?.banned_until,
  });
  const nextState = applyAdminActionToState({
    currentState,
    event: auditEvent,
  });
  const nextAppMetadata = {
    ...(asObject(currentUser.data.user?.app_metadata) ?? {}),
    [PRIVATE_TESTER_ADMIN_METADATA_KEY]: nextState,
  };

  const metadataResult = await supabase.auth.admin.updateUserById(summary.user.id, {
    app_metadata: nextAppMetadata,
    ban_duration: PRIVATE_TESTER_DISABLE_BAN_DURATION,
  });

  if (metadataResult.error) {
    throw new Error(`AUTH_USER_UPDATE_FAILED:${metadataResult.error.message}`);
  }

  const { error } = await supabase.auth.admin.deleteUser(summary.user.id, true);
  if (error) {
    throw new Error(`DELETE_FAILED:${error.message}`);
  }

  return {
    auditEvent,
    deleted: true,
    dryRun: false,
    summary,
  };
}

export async function updatePrivateTesterAdminState(input: {
  action:
    | "disable_access"
    | "restore_access"
    | "mark_deletion"
    | "clear_deletion_mark";
  actorEmail?: string | null;
  email?: string | null;
  note?: string | null;
  userId?: string | null;
}): Promise<PrivateTesterDataSummary> {
  const supabase = getServiceSupabase();
  const profile = await resolveProfileByIdentity(supabase, input);
  const authLookup = await supabase.auth.admin.getUserById(profile.id);

  if (authLookup.error) {
    throw new Error(`AUTH_USER_LOOKUP_FAILED:${authLookup.error.message}`);
  }

  const currentAppMetadata = asObject(authLookup.data.user?.app_metadata) ?? {};
  const currentState = parsePrivateTesterAdminState({
    appMetadata: currentAppMetadata,
    bannedUntil: authLookup.data.user?.banned_until,
  });
  const event = buildPrivateTesterAdminAuditEvent({
    action: input.action,
    actorEmail: input.actorEmail,
    note: input.note,
  });
  const nextState = applyAdminActionToState({
    currentState,
    event,
  });
  const nextAppMetadata = {
    ...currentAppMetadata,
    [PRIVATE_TESTER_ADMIN_METADATA_KEY]: nextState,
  };
  const banDuration =
    input.action === "disable_access"
      ? PRIVATE_TESTER_DISABLE_BAN_DURATION
      : input.action === "restore_access"
        ? "none"
        : undefined;
  const updateResult = await supabase.auth.admin.updateUserById(profile.id, {
    app_metadata: nextAppMetadata,
    ...(banDuration ? { ban_duration: banDuration } : {}),
  });

  if (updateResult.error) {
    throw new Error(`AUTH_USER_UPDATE_FAILED:${updateResult.error.message}`);
  }

  return inspectPrivateTesterData({ userId: profile.id });
}
