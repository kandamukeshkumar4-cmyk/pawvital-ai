import type {
  ShadowComparisonRecord,
  SidecarObservation,
  SidecarServiceName,
} from "./clinical-evidence";
import {
  isShadowTelemetryStoreConfigured,
  listShadowTelemetrySnapshots,
  readShadowLoadTestSummary,
  shouldPreferShadowTelemetryFileStore,
} from "./shadow-telemetry-store";
import { buildShadowRolloutSummary } from "./shadow-rollout";
import type { ShadowLoadTestSummary } from "./shadow-rollout";
import { getServiceSupabase } from "./supabase-admin";
import type { TriageSession } from "./triage-engine";

interface PersistedSystemObservability {
  recentServiceCalls?: unknown;
  recentShadowComparisons?: unknown;
  timeoutCount?: unknown;
  fallbackCount?: unknown;
  shadowReadout?: PersistedShadowReadout;
}

interface PersistedShadowReadout {
  reportPresent?: unknown;
  sessionPresent?: unknown;
  observationCount?: unknown;
  shadowComparisonCount?: unknown;
  timeoutCount?: unknown;
  fallbackCount?: unknown;
  providerErrorCount?: unknown;
  budgetExceededCount?: unknown;
}

interface PersistedAiResponse {
  system_observability?: PersistedSystemObservability;
}

export interface PersistedShadowServiceMetrics {
  service: SidecarServiceName;
  observationCount: number;
  shadowObservationCount: number;
  successfulObservationCount: number;
  comparisonCount: number;
  disagreementComparisonCount: number;
  timeoutRate: number;
  errorRate: number;
  fallbackRate: number;
  disagreementRate: number;
  p95LatencyMs: number | null;
}

export interface PersistedShadowBaselineSnapshot {
  generatedAt: string;
  windowHours: number;
  reportCount: number;
  parsedReportCount: number;
  malformedReportCount: number;
  reportPresenceCount: number;
  sessionPresenceCount: number;
  observationCount: number;
  shadowComparisonCount: number;
  timeoutCount: number;
  fallbackCount: number;
  providerErrorCount: number;
  budgetExceededCount: number;
  summary: ReturnType<typeof buildShadowRolloutSummary>;
  loadTest: ShadowLoadTestSummary | null;
  serviceMetrics: PersistedShadowServiceMetrics[];
  warning: string | null;
}

type ServiceSummary = PersistedShadowBaselineSnapshot["summary"]["services"][number];

interface ReadoutAggregateTotals {
  reportPresenceCount: number;
  sessionPresenceCount: number;
  observationCount: number;
  shadowComparisonCount: number;
  timeoutCount: number;
  fallbackCount: number;
  providerErrorCount: number;
  budgetExceededCount: number;
}

const SERVICE_NAMES: SidecarServiceName[] = [
  "vision-preprocess-service",
  "text-retrieval-service",
  "image-retrieval-service",
  "multimodal-consult-service",
  "async-review-service",
];

function buildEmptySession(): TriageSession {
  return {
    known_symptoms: [],
    answered_questions: [],
    extracted_answers: {},
    red_flags_triggered: [],
    candidate_diseases: [],
    body_systems_involved: [],
    case_memory: {
      turn_count: 0,
      chief_complaints: [],
      active_focus_symptoms: [],
      confirmed_facts: {},
      image_findings: [],
      red_flag_notes: [],
      unresolved_question_ids: [],
      clarification_reasons: {},
      timeline_notes: [],
      visual_evidence: [],
      retrieval_evidence: [],
      consult_opinions: [],
      evidence_chain: [],
      service_timeouts: [],
      service_observations: [],
      shadow_comparisons: [],
      ambiguity_flags: [],
    },
  };
}

function parseReportPayload(raw: unknown): PersistedAiResponse | null {
  try {
    if (typeof raw === "string") {
      return JSON.parse(raw) as PersistedAiResponse;
    }
    if (raw && typeof raw === "object") {
      return raw as PersistedAiResponse;
    }
  } catch {
    return null;
  }
  return null;
}

function emptyReadoutAggregateTotals(): ReadoutAggregateTotals {
  return {
    reportPresenceCount: 0,
    sessionPresenceCount: 0,
    observationCount: 0,
    shadowComparisonCount: 0,
    timeoutCount: 0,
    fallbackCount: 0,
    providerErrorCount: 0,
    budgetExceededCount: 0,
  };
}

function addReadoutAggregateTotals(
  totals: ReadoutAggregateTotals,
  next: ReadoutAggregateTotals
): ReadoutAggregateTotals {
  return {
    reportPresenceCount: totals.reportPresenceCount + next.reportPresenceCount,
    sessionPresenceCount:
      totals.sessionPresenceCount + next.sessionPresenceCount,
    observationCount: totals.observationCount + next.observationCount,
    shadowComparisonCount:
      totals.shadowComparisonCount + next.shadowComparisonCount,
    timeoutCount: totals.timeoutCount + next.timeoutCount,
    fallbackCount: totals.fallbackCount + next.fallbackCount,
    providerErrorCount: totals.providerErrorCount + next.providerErrorCount,
    budgetExceededCount: totals.budgetExceededCount + next.budgetExceededCount,
  };
}

function countFromUnknown(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function normalizeReadoutAggregate(
  observability: PersistedSystemObservability | undefined
): ReadoutAggregateTotals | null {
  const readout = observability?.shadowReadout;
  if (!readout || typeof readout !== "object") {
    return null;
  }

  return {
    reportPresenceCount: readout.reportPresent === true ? 1 : 0,
    sessionPresenceCount: readout.sessionPresent === true ? 1 : 0,
    observationCount: countFromUnknown(readout.observationCount),
    shadowComparisonCount: countFromUnknown(readout.shadowComparisonCount),
    timeoutCount: countFromUnknown(
      readout.timeoutCount ?? observability?.timeoutCount
    ),
    fallbackCount: countFromUnknown(
      readout.fallbackCount ?? observability?.fallbackCount
    ),
    providerErrorCount: countFromUnknown(readout.providerErrorCount),
    budgetExceededCount: countFromUnknown(readout.budgetExceededCount),
  };
}

function asSidecarServiceName(value: unknown): SidecarServiceName | null {
  return typeof value === "string" && SERVICE_NAMES.includes(value as SidecarServiceName)
    ? (value as SidecarServiceName)
    : null;
}

function normalizeObservation(value: unknown): SidecarObservation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const service = asSidecarServiceName(candidate.service);
  if (!service || typeof candidate.recordedAt !== "string") return null;

  const outcome = candidate.outcome;
  const latencyMs = Number(candidate.latencyMs);
  if (
    outcome !== "success" &&
    outcome !== "timeout" &&
    outcome !== "error" &&
    outcome !== "fallback" &&
    outcome !== "shadow"
  ) {
    return null;
  }

  return {
    service,
    stage: typeof candidate.stage === "string" ? candidate.stage : "persisted_report",
    latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0,
    outcome,
    shadowMode: Boolean(candidate.shadowMode),
    fallbackUsed: Boolean(candidate.fallbackUsed),
    note: typeof candidate.note === "string" ? candidate.note : undefined,
    recordedAt: candidate.recordedAt,
  };
}

function normalizeComparison(value: unknown): ShadowComparisonRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const service = asSidecarServiceName(candidate.service);
  if (
    !service ||
    typeof candidate.recordedAt !== "string" ||
    typeof candidate.usedStrategy !== "string" ||
    typeof candidate.shadowStrategy !== "string" ||
    typeof candidate.summary !== "string"
  ) {
    return null;
  }

  return {
    service,
    usedStrategy: candidate.usedStrategy,
    shadowStrategy: candidate.shadowStrategy,
    summary: candidate.summary,
    disagreementCount: Math.max(0, Number(candidate.disagreementCount) || 0),
    recordedAt: candidate.recordedAt,
  };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );
  return sorted[index] ?? null;
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

function buildServiceMetrics(session: TriageSession): PersistedShadowServiceMetrics[] {
  const memory = session.case_memory!;

  return SERVICE_NAMES.map((service) => {
    const observations = memory.service_observations.filter(
      (entry) => entry.service === service
    );
    const comparisons = memory.shadow_comparisons.filter(
      (entry) => entry.service === service
    );
    const latencies = observations
      .map((entry) => entry.latencyMs)
      .filter((value) => Number.isFinite(value) && value >= 0);

    return {
      service,
      observationCount: observations.length,
      shadowObservationCount: observations.filter((entry) => entry.shadowMode).length,
      successfulObservationCount: observations.filter(
        (entry) => entry.outcome === "success" || entry.outcome === "shadow"
      ).length,
      comparisonCount: comparisons.length,
      disagreementComparisonCount: comparisons.filter(
        (entry) => entry.disagreementCount > 0
      ).length,
      timeoutRate: rate(
        observations.filter((entry) => entry.outcome === "timeout").length,
        observations.length
      ),
      errorRate: rate(
        observations.filter((entry) => entry.outcome === "error").length,
        observations.length
      ),
      fallbackRate: rate(
        observations.filter((entry) => entry.outcome === "fallback").length,
        observations.length
      ),
      disagreementRate: rate(
        comparisons.filter((entry) => entry.disagreementCount > 0).length,
        comparisons.length
      ),
      p95LatencyMs: percentile(latencies, 0.95),
    };
  });
}

function appendObservabilityPayload(
  session: TriageSession,
  recentServiceCalls: unknown[],
  recentShadowComparisons: unknown[]
) {
  const observations = recentServiceCalls
    .map((entry) => normalizeObservation(entry))
    .filter((entry): entry is SidecarObservation => Boolean(entry));
  const comparisons = recentShadowComparisons
    .map((entry) => normalizeComparison(entry))
    .filter((entry): entry is ShadowComparisonRecord => Boolean(entry));

  session.case_memory!.service_observations.push(...observations);
  session.case_memory!.shadow_comparisons.push(...comparisons);

  return { observations, comparisons };
}

function buildReadoutTotalsFromRecords(
  observations: SidecarObservation[],
  comparisons: ShadowComparisonRecord[],
  reportPresenceCount: number,
  sessionPresenceCount: number
): ReadoutAggregateTotals {
  const noteIncludes = (entry: SidecarObservation, marker: string) =>
    typeof entry.note === "string" && entry.note.includes(marker);

  return {
    reportPresenceCount,
    sessionPresenceCount,
    observationCount: observations.length,
    shadowComparisonCount: comparisons.length,
    timeoutCount: observations.filter((entry) => entry.outcome === "timeout")
      .length,
    fallbackCount: observations.filter(
      (entry) => entry.fallbackUsed && !entry.shadowMode
    ).length,
    providerErrorCount: observations.filter(
      (entry) =>
        entry.outcome === "error" || noteIncludes(entry, "reason=provider_error")
    ).length,
    budgetExceededCount: observations.filter((entry) =>
      noteIncludes(entry, "reason=budget_exceeded")
    ).length,
  };
}

function buildReadoutTotalsFromSession(
  session: TriageSession,
  reportPresenceCount: number,
  sessionPresenceCount: number
): ReadoutAggregateTotals {
  const memory = session.case_memory!;
  const totals = buildReadoutTotalsFromRecords(
    memory.service_observations,
    memory.shadow_comparisons,
    reportPresenceCount,
    sessionPresenceCount
  );

  return {
    ...totals,
    timeoutCount: Math.max(totals.timeoutCount, memory.service_timeouts.length),
  };
}

function buildSnapshotFromSession(input: {
  session: TriageSession;
  windowHours: number;
  reportCount: number;
  parsedReportCount: number;
  malformedReportCount: number;
  readoutTotals?: ReadoutAggregateTotals;
  loadTest: ShadowLoadTestSummary | null;
  warning: string | null;
}): PersistedShadowBaselineSnapshot {
  const readoutTotals =
    input.readoutTotals ??
    buildReadoutTotalsFromSession(
      input.session,
      input.parsedReportCount,
      input.parsedReportCount
    );

  return {
    generatedAt: new Date().toISOString(),
    windowHours: input.windowHours,
    reportCount: input.reportCount,
    parsedReportCount: input.parsedReportCount,
    malformedReportCount: input.malformedReportCount,
    reportPresenceCount: readoutTotals.reportPresenceCount,
    sessionPresenceCount: readoutTotals.sessionPresenceCount,
    observationCount: readoutTotals.observationCount,
    shadowComparisonCount: readoutTotals.shadowComparisonCount,
    timeoutCount: readoutTotals.timeoutCount,
    fallbackCount: readoutTotals.fallbackCount,
    providerErrorCount: readoutTotals.providerErrorCount,
    budgetExceededCount: readoutTotals.budgetExceededCount,
    summary: buildShadowRolloutSummary(input.session, {
      loadTest: input.loadTest,
    }),
    loadTest: input.loadTest,
    serviceMetrics: buildServiceMetrics(input.session),
    warning: input.warning,
  };
}

async function buildFallbackSnapshotFromRedis(
  windowHours: number,
  limit: number,
  loadTest: ShadowLoadTestSummary | null,
  warning: string | null
): Promise<PersistedShadowBaselineSnapshot> {
  const emptySession = buildEmptySession();
  let entries: Awaited<ReturnType<typeof listShadowTelemetrySnapshots>>;

  try {
    entries = await listShadowTelemetrySnapshots(limit);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return buildSnapshotFromSession({
      session: emptySession,
      windowHours,
      reportCount: 0,
      parsedReportCount: 0,
      malformedReportCount: 0,
      loadTest,
      warning: [
        warning,
        `Upstash shadow telemetry fallback failed (${details}).`,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (!entries) {
    return buildSnapshotFromSession({
      session: emptySession,
      windowHours,
      reportCount: 0,
      parsedReportCount: 0,
      malformedReportCount: 0,
      loadTest,
      warning:
        warning ||
        "Neither Supabase nor the Upstash shadow telemetry store is configured.",
    });
  }

  const windowStartMs = Date.now() - windowHours * 60 * 60 * 1000;
  let reportCount = 0;
  let parsedReportCount = 0;
  let malformedReportCount = 0;
  let readoutTotals = emptyReadoutAggregateTotals();

  for (const entry of entries) {
    const recordedAtMs = Date.parse(entry.generatedAt);
    if (!Number.isFinite(recordedAtMs) || recordedAtMs < windowStartMs) {
      continue;
    }

    reportCount += 1;

    const hasArrays =
      Array.isArray(entry.recentServiceCalls) &&
      Array.isArray(entry.recentShadowComparisons);
    if (!hasArrays) {
      malformedReportCount += 1;
      continue;
    }

    parsedReportCount += 1;
    const appended = appendObservabilityPayload(
      emptySession,
      entry.recentServiceCalls,
      entry.recentShadowComparisons
    );
    readoutTotals = addReadoutAggregateTotals(
      readoutTotals,
      buildReadoutTotalsFromRecords(
        appended.observations,
        appended.comparisons,
        1,
        1
      )
    );
  }

  return buildSnapshotFromSession({
    session: emptySession,
    windowHours,
    reportCount,
    parsedReportCount,
    malformedReportCount,
    readoutTotals,
    loadTest,
    warning,
  });
}

export function buildEmptyPersistedShadowBaselineSnapshot(
  warning: string | null = null,
  windowHours = 24
): PersistedShadowBaselineSnapshot {
  const emptySession = buildEmptySession();

  return buildSnapshotFromSession({
    session: emptySession,
    windowHours,
    reportCount: 0,
    parsedReportCount: 0,
    malformedReportCount: 0,
    loadTest: null,
    warning,
  });
}

export async function buildPersistedShadowBaselineSnapshot(options?: {
  windowHours?: number;
  limit?: number;
}): Promise<PersistedShadowBaselineSnapshot> {
  const windowHours = Math.max(1, options?.windowHours || 24);
  const limit = Math.max(50, options?.limit || 1000);
  const supabase = getServiceSupabase();
  const loadTest = await readShadowLoadTestSummary().catch(() => null);

  if (shouldPreferShadowTelemetryFileStore()) {
    return buildFallbackSnapshotFromRedis(
      windowHours,
      limit,
      loadTest,
      "Using local shadow telemetry file store because SHADOW_TELEMETRY_FILE_FALLBACK is enabled."
    );
  }

  if (!supabase) {
    return buildFallbackSnapshotFromRedis(
      windowHours,
      limit,
      loadTest,
      isShadowTelemetryStoreConfigured()
        ? "Using Upstash shadow telemetry fallback because Supabase is not configured."
        : "Supabase service client is not configured."
    );
  }

  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;

  try {
    const result = await supabase
      .from("symptom_checks")
      .select("id, ai_response")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);
    data = result.data as unknown[] | null;
    error = result.error as { message?: string } | null;
  } catch (queryError) {
    if (isShadowTelemetryStoreConfigured()) {
      return buildFallbackSnapshotFromRedis(
        windowHours,
        limit,
        loadTest,
        `Supabase telemetry read threw (${queryError instanceof Error ? queryError.message : String(queryError)}); using Upstash shadow telemetry fallback.`
      );
    }
    throw queryError;
  }

  if (error) {
    if (isShadowTelemetryStoreConfigured()) {
      return buildFallbackSnapshotFromRedis(
        windowHours,
        limit,
        loadTest,
        `Supabase telemetry read failed (${error.message || "unknown error"}); using Upstash shadow telemetry fallback.`
      );
    }
    throw new Error(
      `Unable to load persisted shadow telemetry: ${error.message || "unknown error"}`
    );
  }

  const emptySession = buildEmptySession();

  let parsedReportCount = 0;
  let malformedReportCount = 0;
  let readoutTotals = emptyReadoutAggregateTotals();

  for (const row of data || []) {
    const report = parseReportPayload((row as Record<string, unknown>).ai_response);
    if (!report) {
      malformedReportCount += 1;
      continue;
    }

    parsedReportCount += 1;
    const aggregateReadout = normalizeReadoutAggregate(
      report.system_observability
    );
    if (aggregateReadout) {
      readoutTotals = addReadoutAggregateTotals(readoutTotals, aggregateReadout);
      continue;
    }

    const hasRecentServiceCalls = Array.isArray(
      report.system_observability?.recentServiceCalls
    );
    const hasRecentShadowComparisons = Array.isArray(
      report.system_observability?.recentShadowComparisons
    );

    if (!hasRecentServiceCalls && !hasRecentShadowComparisons) {
      readoutTotals = addReadoutAggregateTotals(readoutTotals, {
        ...emptyReadoutAggregateTotals(),
        reportPresenceCount: 1,
      });
      continue;
    }

    const appended = appendObservabilityPayload(
      emptySession,
      hasRecentServiceCalls
        ? (report.system_observability?.recentServiceCalls as unknown[])
        : [],
      hasRecentShadowComparisons
        ? (report.system_observability?.recentShadowComparisons as unknown[])
        : []
    );
    readoutTotals = addReadoutAggregateTotals(
      readoutTotals,
      buildReadoutTotalsFromRecords(
        appended.observations,
        appended.comparisons,
        1,
        1
      )
    );
  }

  return buildSnapshotFromSession({
    session: emptySession,
    windowHours,
    reportCount: (data || []).length,
    parsedReportCount,
    malformedReportCount,
    readoutTotals,
    loadTest,
    warning: null,
  });
}

export function mergeServiceSummaryWithMetrics(
  summaryServices: PersistedShadowBaselineSnapshot["summary"]["services"],
  serviceMetrics: PersistedShadowBaselineSnapshot["serviceMetrics"]
) {
  const metricByService = new Map(
    serviceMetrics.map((metrics) => [metrics.service, metrics])
  );

  return summaryServices.map((service): ServiceSummary & {
    metrics: PersistedShadowServiceMetrics;
  } => ({
    ...service,
    metrics:
      metricByService.get(service.service) ||
      ({
        service: service.service,
        observationCount: 0,
        shadowObservationCount: 0,
        successfulObservationCount: 0,
        comparisonCount: 0,
        disagreementComparisonCount: 0,
        timeoutRate: 0,
        errorRate: 0,
        fallbackRate: 0,
        disagreementRate: 0,
        p95LatencyMs: null,
      } satisfies PersistedShadowServiceMetrics),
  }));
}
