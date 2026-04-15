import type { AdminRequestContext } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 7;

const SEVERITY_LEVELS = ["low", "medium", "high", "emergency"] as const;
const FEEDBACK_OUTCOMES = ["yes", "partly", "no"] as const;
const PROPOSAL_STATUSES = [
  "draft",
  "approved",
  "rejected",
  "superseded",
] as const;
const NOTIFICATION_TYPES = [
  "report_ready",
  "urgency_alert",
  "outcome_reminder",
  "subscription",
  "system",
] as const;

export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];
export type FeedbackOutcome = (typeof FEEDBACK_OUTCOMES)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AdminTelemetrySeriesPoint {
  date: string;
  label: string;
  notifications: number;
  outcomeFeedback: number;
  shareLinks: number;
  symptomChecks: number;
}

export interface AdminTelemetryTotals {
  activeSharedReports: number;
  approvedProposals30d: number;
  feedbackMismatch30d: number;
  notifications7d: number;
  outcomeFeedback30d: number;
  sharedReports30d: number;
  symptomChecks24h: number;
  symptomChecks30d: number;
  symptomChecks7d: number;
  thresholdProposals30d: number;
  unreadNotifications: number;
}

export interface AdminTelemetryRatios {
  feedbackCoverage30d: number;
  mismatchRate30d: number;
  proposalApprovalRate30d: number;
  shareRate30d: number;
}

export interface AdminTelemetryDistributions {
  feedback30d: Record<FeedbackOutcome, number>;
  notificationTypes7d: Record<NotificationType, number>;
  proposalStatus30d: Record<ProposalStatus, number>;
  severity30d: Record<SeverityLevel, number>;
}

export interface AdminTelemetryDashboardData {
  distributions: AdminTelemetryDistributions;
  generatedAt: string;
  isDemo: boolean;
  notes: string[];
  ratios: AdminTelemetryRatios;
  series7d: AdminTelemetrySeriesPoint[];
  sources: string[];
  totals: AdminTelemetryTotals;
}

export interface AdminTelemetryAggregateInput {
  distributions: AdminTelemetryDistributions;
  generatedAt: string;
  isDemo: boolean;
  series7d: AdminTelemetrySeriesPoint[];
  totals: AdminTelemetryTotals;
}

interface CountSpec {
  before?: string;
  eq?: Record<string, boolean | string>;
  gt?: Record<string, string>;
  since?: string;
  table:
    | "notifications"
    | "outcome_feedback_entries"
    | "shared_reports"
    | "symptom_checks"
    | "threshold_proposals";
  timestampColumn?: string;
}

export interface TelemetryCountAdapter {
  count(spec: CountSpec): Promise<number>;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function buildDailyWindows(now: Date, days: number) {
  const todayStart = startOfUtcDay(now);

  return Array.from({ length: days }, (_, index) => {
    const offset = days - 1 - index;
    const start = addDays(todayStart, -offset);
    const end = addDays(start, 1);

    return {
      before: end.toISOString(),
      label: formatUtcDayLabel(start),
      since: start.toISOString(),
      start,
    };
  });
}

function buildNotes(totals: AdminTelemetryTotals) {
  const notes = [
    "Only persisted application data is shown here. Runtime-only latency and sidecar health remain on the rollout/readiness tools.",
  ];

  if (totals.symptomChecks30d === 0) {
    notes.push("No persisted symptom checks were recorded in the last 30 days.");
  }

  if (totals.symptomChecks30d > 0 && totals.outcomeFeedback30d === 0) {
    notes.push(
      "Outcome feedback has not entered the quality loop in the last 30 days."
    );
  }

  if (totals.outcomeFeedback30d > 0 && totals.thresholdProposals30d === 0) {
    notes.push(
      "Recent outcome feedback has not produced any threshold proposals yet."
    );
  }

  if (totals.activeSharedReports > 0) {
    notes.push(
      `${totals.activeSharedReports} share link(s) are currently live and should be monitored for expiry hygiene.`
    );
  }

  return notes;
}

export function buildAdminTelemetryDashboardData(
  input: AdminTelemetryAggregateInput
): AdminTelemetryDashboardData {
  const { totals } = input;

  return {
    ...input,
    notes: buildNotes(totals),
    ratios: {
      feedbackCoverage30d: safeRatio(
        totals.outcomeFeedback30d,
        totals.symptomChecks30d
      ),
      mismatchRate30d: safeRatio(
        totals.feedbackMismatch30d,
        totals.outcomeFeedback30d
      ),
      proposalApprovalRate30d: safeRatio(
        totals.approvedProposals30d,
        totals.thresholdProposals30d
      ),
      shareRate30d: safeRatio(
        totals.sharedReports30d,
        totals.symptomChecks30d
      ),
    },
    sources: [
      "symptom_checks",
      "outcome_feedback_entries",
      "threshold_proposals",
      "shared_reports",
      "notifications",
    ],
  };
}

export function buildDemoAdminTelemetryDashboardData(
  generatedAt = new Date().toISOString()
): AdminTelemetryDashboardData {
  return buildAdminTelemetryDashboardData({
    distributions: {
      feedback30d: { no: 6, partly: 11, yes: 29 },
      notificationTypes7d: {
        outcome_reminder: 7,
        report_ready: 18,
        subscription: 2,
        system: 1,
        urgency_alert: 4,
      },
      proposalStatus30d: {
        approved: 3,
        draft: 5,
        rejected: 1,
        superseded: 1,
      },
      severity30d: {
        emergency: 9,
        high: 25,
        low: 54,
        medium: 38,
      },
    },
    generatedAt,
    isDemo: true,
    series7d: [
      {
        date: "2026-04-08T00:00:00.000Z",
        label: "Apr 8",
        notifications: 2,
        outcomeFeedback: 1,
        shareLinks: 1,
        symptomChecks: 11,
      },
      {
        date: "2026-04-09T00:00:00.000Z",
        label: "Apr 9",
        notifications: 3,
        outcomeFeedback: 2,
        shareLinks: 0,
        symptomChecks: 13,
      },
      {
        date: "2026-04-10T00:00:00.000Z",
        label: "Apr 10",
        notifications: 4,
        outcomeFeedback: 2,
        shareLinks: 1,
        symptomChecks: 15,
      },
      {
        date: "2026-04-11T00:00:00.000Z",
        label: "Apr 11",
        notifications: 5,
        outcomeFeedback: 3,
        shareLinks: 1,
        symptomChecks: 17,
      },
      {
        date: "2026-04-12T00:00:00.000Z",
        label: "Apr 12",
        notifications: 6,
        outcomeFeedback: 2,
        shareLinks: 2,
        symptomChecks: 19,
      },
      {
        date: "2026-04-13T00:00:00.000Z",
        label: "Apr 13",
        notifications: 7,
        outcomeFeedback: 4,
        shareLinks: 1,
        symptomChecks: 22,
      },
      {
        date: "2026-04-14T00:00:00.000Z",
        label: "Apr 14",
        notifications: 8,
        outcomeFeedback: 5,
        shareLinks: 2,
        symptomChecks: 24,
      },
    ],
    totals: {
      activeSharedReports: 5,
      approvedProposals30d: 3,
      feedbackMismatch30d: 6,
      notifications7d: 32,
      outcomeFeedback30d: 46,
      sharedReports30d: 8,
      symptomChecks24h: 24,
      symptomChecks30d: 126,
      symptomChecks7d: 121,
      thresholdProposals30d: 10,
      unreadNotifications: 4,
    },
  });
}

function createSupabaseTelemetryAdapter(
  serviceSupabase: NonNullable<ReturnType<typeof getServiceSupabase>>
): TelemetryCountAdapter {
  return {
    async count(spec) {
      let query = serviceSupabase
        .from(spec.table)
        .select("*", { count: "exact", head: true });

      if (spec.timestampColumn && spec.since) {
        query = query.gte(spec.timestampColumn, spec.since);
      }

      if (spec.timestampColumn && spec.before) {
        query = query.lt(spec.timestampColumn, spec.before);
      }

      for (const [column, value] of Object.entries(spec.eq || {})) {
        query = query.eq(column, value);
      }

      for (const [column, value] of Object.entries(spec.gt || {})) {
        query = query.gt(column, value);
      }

      const { count, error } = await query;
      if (error) {
        console.error("Admin telemetry count failed:", spec, error);
        return 0;
      }

      return count ?? 0;
    },
  };
}

function formatUtcDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

async function getDistributionCounts<T extends readonly string[]>(
  adapter: TelemetryCountAdapter,
  values: T,
  specFactory: (value: T[number]) => CountSpec
) {
  const counts = await Promise.all(
    values.map(async (value) => [value, await adapter.count(specFactory(value))])
  );

  return Object.fromEntries(counts) as Record<T[number], number>;
}

async function getSeriesCounts(
  adapter: TelemetryCountAdapter,
  now: Date
): Promise<AdminTelemetrySeriesPoint[]> {
  const windows = buildDailyWindows(now, SERIES_DAYS);

  return Promise.all(
    windows.map(async (window) => ({
      date: window.start.toISOString(),
      label: window.label,
      notifications: await adapter.count({
        before: window.before,
        since: window.since,
        table: "notifications",
        timestampColumn: "created_at",
      }),
      outcomeFeedback: await adapter.count({
        before: window.before,
        since: window.since,
        table: "outcome_feedback_entries",
        timestampColumn: "submitted_at",
      }),
      shareLinks: await adapter.count({
        before: window.before,
        since: window.since,
        table: "shared_reports",
        timestampColumn: "created_at",
      }),
      symptomChecks: await adapter.count({
        before: window.before,
        since: window.since,
        table: "symptom_checks",
        timestampColumn: "created_at",
      }),
    }))
  );
}

async function loadTelemetryDistributions(
  adapter: TelemetryCountAdapter,
  ago7d: string,
  ago30d: string
) {
  const [severity30d, feedback30d, proposalStatus30d, notificationTypes7d] =
    await Promise.all([
      getDistributionCounts(adapter, SEVERITY_LEVELS, (severity) => ({
        eq: { severity },
        since: ago30d,
        table: "symptom_checks",
        timestampColumn: "created_at",
      })),
      getDistributionCounts(adapter, FEEDBACK_OUTCOMES, (outcome) => ({
        eq: { matched_expectation: outcome },
        since: ago30d,
        table: "outcome_feedback_entries",
        timestampColumn: "submitted_at",
      })),
      getDistributionCounts(adapter, PROPOSAL_STATUSES, (status) => ({
        eq: { status },
        since: ago30d,
        table: "threshold_proposals",
        timestampColumn: "created_at",
      })),
      getDistributionCounts(
        adapter,
        NOTIFICATION_TYPES,
        (notificationType) => ({
          eq: { type: notificationType },
          since: ago7d,
          table: "notifications",
          timestampColumn: "created_at",
        })
      ),
    ]);

  return {
    feedback30d,
    notificationTypes7d,
    proposalStatus30d,
    severity30d,
  };
}

async function loadTelemetryTotals(
  adapter: TelemetryCountAdapter,
  nowIso: string,
  ago24h: string,
  ago7d: string,
  ago30d: string
) {
  const [
    symptomChecks24h,
    symptomChecks7d,
    symptomChecks30d,
    outcomeFeedback30d,
    feedbackMismatch30d,
    thresholdProposals30d,
    approvedProposals30d,
    sharedReports30d,
    activeSharedReports,
    notifications7d,
    unreadNotifications,
  ] = await Promise.all([
    adapter.count({
      since: ago24h,
      table: "symptom_checks",
      timestampColumn: "created_at",
    }),
    adapter.count({
      since: ago7d,
      table: "symptom_checks",
      timestampColumn: "created_at",
    }),
    adapter.count({
      since: ago30d,
      table: "symptom_checks",
      timestampColumn: "created_at",
    }),
    adapter.count({
      since: ago30d,
      table: "outcome_feedback_entries",
      timestampColumn: "submitted_at",
    }),
    adapter.count({
      eq: { matched_expectation: "no" },
      since: ago30d,
      table: "outcome_feedback_entries",
      timestampColumn: "submitted_at",
    }),
    adapter.count({
      since: ago30d,
      table: "threshold_proposals",
      timestampColumn: "created_at",
    }),
    adapter.count({
      eq: { status: "approved" },
      since: ago30d,
      table: "threshold_proposals",
      timestampColumn: "created_at",
    }),
    adapter.count({
      since: ago30d,
      table: "shared_reports",
      timestampColumn: "created_at",
    }),
    adapter.count({
      gt: { expires_at: nowIso },
      table: "shared_reports",
    }),
    adapter.count({
      since: ago7d,
      table: "notifications",
      timestampColumn: "created_at",
    }),
    adapter.count({
      eq: { read: false },
      table: "notifications",
    }),
  ]);

  return {
    activeSharedReports,
    approvedProposals30d,
    feedbackMismatch30d,
    notifications7d,
    outcomeFeedback30d,
    sharedReports30d,
    symptomChecks24h,
    symptomChecks30d,
    symptomChecks7d,
    thresholdProposals30d,
    unreadNotifications,
  };
}

export async function loadAdminTelemetryDashboardData(
  adminContext: AdminRequestContext,
  adapter?: TelemetryCountAdapter
): Promise<AdminTelemetryDashboardData> {
  if (adminContext.isDemo) {
    return buildDemoAdminTelemetryDashboardData();
  }

  const serviceSupabase = getServiceSupabase();
  if (!serviceSupabase && !adapter) {
    return buildDemoAdminTelemetryDashboardData();
  }

  const effectiveAdapter =
    adapter || createSupabaseTelemetryAdapter(serviceSupabase!);
  const now = new Date();
  const nowIso = now.toISOString();
  const ago24h = new Date(now.getTime() - DAY_MS).toISOString();
  const ago7d = new Date(now.getTime() - DAY_MS * 7).toISOString();
  const ago30d = new Date(now.getTime() - DAY_MS * 30).toISOString();

  const [totals, distributions, series7d] = await Promise.all([
    loadTelemetryTotals(effectiveAdapter, nowIso, ago24h, ago7d, ago30d),
    loadTelemetryDistributions(effectiveAdapter, ago7d, ago30d),
    getSeriesCounts(effectiveAdapter, now),
  ]);

  return buildAdminTelemetryDashboardData({
    distributions,
    generatedAt: nowIso,
    isDemo: false,
    series7d,
    totals,
  });
}

function safeRatio(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(3));
}

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
