import type {
  ShadowComparisonRecord,
  SidecarObservation,
  SidecarServiceName,
} from "./clinical-evidence";
import type { AdminRequestContext } from "@/lib/admin-auth";
import { getServiceSupabase } from "@/lib/supabase-admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const HISTORY_LIMIT = 500;

const PIPELINE_TELEMETRY_STAGES = new Set([
  "extraction",
  "pending_recovery",
  "repeat_suppression",
] as const);

const SIDECAR_SERVICES: SidecarServiceName[] = [
  "vision-preprocess-service",
  "text-retrieval-service",
  "image-retrieval-service",
  "multimodal-consult-service",
  "async-review-service",
];

type PipelineTelemetryStage =
  | "extraction"
  | "pending_recovery"
  | "repeat_suppression";

type TelemetryAvailability = "available" | "unavailable";

export interface PersistedSymptomCheckTelemetryRow {
  ai_response: Record<string, unknown> | string | null;
  created_at: string;
}

export interface TelemetryHistoryAdapter {
  listSymptomChecks(
    sinceIso: string
  ): Promise<PersistedSymptomCheckTelemetryRow[]>;
}

export interface AdminTelemetryWindowMetric {
  availability: TelemetryAvailability;
  denominator24h: number;
  denominator7d: number;
  note: string | null;
  numerator24h: number;
  numerator7d: number;
  rate24h: number | null;
  rate7d: number | null;
}

export interface AdminTelemetryPipelineMetrics {
  extractionSuccess: AdminTelemetryWindowMetric;
  pendingQuestionRescue: AdminTelemetryWindowMetric;
  repeatQuestionAttempt: AdminTelemetryWindowMetric;
}

export interface AdminTelemetrySidecarSummary {
  errorRate24h: number | null;
  lastSeenAt: string | null;
  observationCount24h: number;
  p95LatencyMs: number | null;
  service: SidecarServiceName;
  shadowComparisonCount24h: number;
  shadowDisagreementCount24h: number;
  shadowDisagreementRate24h: number | null;
  timeoutRate24h: number | null;
}

export interface AdminTelemetryDashboardData {
  dataMode: "live" | "unavailable";
  generatedAt: string;
  historyWindowDays: number;
  notes: string[];
  pipeline: AdminTelemetryPipelineMetrics;
  sidecars: AdminTelemetrySidecarSummary[];
  sources: string[];
  symptomCheckCount7d: number;
}

export interface AdminTelemetryAggregateInput {
  dataMode?: AdminTelemetryDashboardData["dataMode"];
  generatedAt: string;
  notes?: string[];
  rows: PersistedSymptomCheckTelemetryRow[];
}

interface ParsedStoredTelemetry {
  createdAt: string;
  pipelineEvents: ConversationTelemetryEvent[];
  shadowComparisons: ShadowComparisonRecord[];
  sidecarObservations: SidecarObservation[];
}

interface ConversationTelemetryEvent {
  note: string;
  outcome: string | null;
  recordedAt: string;
  stage: PipelineTelemetryStage;
}

type ParsedPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(3));
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );

  return sorted[index] ?? null;
}

function parseStoredPayload(
  raw: PersistedSymptomCheckTelemetryRow["ai_response"]
): ParsedPayload | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isRecord(raw) ? raw : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  const direct = readString(value);
  if (direct && Number.isFinite(Date.parse(direct))) {
    return direct;
  }
  return fallback;
}

function readNestedArray(
  value: Record<string, unknown>,
  ...path: string[]
): unknown[] {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return [];
    }
    current = current[segment];
  }

  return Array.isArray(current) ? current : [];
}

function isSidecarServiceName(value: unknown): value is SidecarServiceName {
  return (
    typeof value === "string" &&
    SIDECAR_SERVICES.includes(value as SidecarServiceName)
  );
}

function normalizeSidecarObservation(
  value: unknown,
  fallbackRecordedAt: string
): SidecarObservation | null {
  if (!isRecord(value) || !isSidecarServiceName(value.service)) {
    return null;
  }

  const stage = readString(value.stage);
  const outcome = readString(value.outcome);
  const latencyMs =
    typeof value.latencyMs === "number" && Number.isFinite(value.latencyMs)
      ? value.latencyMs
      : 0;

  if (
    !stage ||
    !outcome ||
    !["success", "timeout", "error", "fallback", "shadow"].includes(outcome)
  ) {
    return null;
  }

  return {
    fallbackUsed: value.fallbackUsed === true,
    latencyMs,
    note: readString(value.note) || undefined,
    outcome: outcome as SidecarObservation["outcome"],
    recordedAt: normalizeTimestamp(value.recordedAt, fallbackRecordedAt),
    service: value.service,
    shadowMode: value.shadowMode === true,
    stage,
  };
}

function normalizeShadowComparison(
  value: unknown,
  fallbackRecordedAt: string
): ShadowComparisonRecord | null {
  if (!isRecord(value) || !isSidecarServiceName(value.service)) {
    return null;
  }

  const usedStrategy = readString(value.usedStrategy);
  const shadowStrategy = readString(value.shadowStrategy);
  const summary = readString(value.summary);
  const disagreementCount =
    typeof value.disagreementCount === "number" &&
    Number.isFinite(value.disagreementCount)
      ? value.disagreementCount
      : 0;

  if (!usedStrategy || !shadowStrategy || !summary) {
    return null;
  }

  return {
    disagreementCount,
    recordedAt: normalizeTimestamp(value.recordedAt, fallbackRecordedAt),
    service: value.service,
    shadowStrategy,
    summary,
    usedStrategy,
  };
}

function normalizeConversationTelemetryEvent(
  value: unknown,
  fallbackRecordedAt: string
): ConversationTelemetryEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const stage = readString(value.stage);
  if (!stage || !PIPELINE_TELEMETRY_STAGES.has(stage as PipelineTelemetryStage)) {
    return null;
  }

  return {
    note: readString(value.note) || "",
    outcome: readString(value.outcome),
    recordedAt: normalizeTimestamp(value.recordedAt, fallbackRecordedAt),
    stage: stage as PipelineTelemetryStage,
  };
}

function parseNoteTokens(note: string): Record<string, string> {
  return note
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((tokens, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0) {
        return tokens;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (key) {
        tokens[key] = value;
      }
      return tokens;
    }, {});
}

function parseBooleanNoteToken(
  note: string,
  key: string
): boolean | undefined {
  const value = parseNoteTokens(note)[key];
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function isWithinLookback(recordedAt: string, sinceIso: string): boolean {
  const recordedMs = Date.parse(recordedAt);
  const sinceMs = Date.parse(sinceIso);
  return Number.isFinite(recordedMs) && Number.isFinite(sinceMs)
    ? recordedMs >= sinceMs
    : false;
}

function extractPipelineTelemetry(
  payload: ParsedPayload,
  fallbackRecordedAt: string
): ConversationTelemetryEvent[] {
  const candidateArrays = [
    readNestedArray(payload, "session", "case_memory", "service_observations"),
    readNestedArray(payload, "case_memory", "service_observations"),
    readNestedArray(payload, "service_observations"),
  ];

  return candidateArrays.flatMap((entries) =>
    entries
      .map((entry) =>
        normalizeConversationTelemetryEvent(entry, fallbackRecordedAt)
      )
      .filter((entry): entry is ConversationTelemetryEvent => entry !== null)
  );
}

function extractSidecarObservations(
  payload: ParsedPayload,
  fallbackRecordedAt: string
): SidecarObservation[] {
  return readNestedArray(payload, "system_observability", "recentServiceCalls")
    .map((entry) => normalizeSidecarObservation(entry, fallbackRecordedAt))
    .filter((entry): entry is SidecarObservation => entry !== null);
}

function extractShadowComparisons(
  payload: ParsedPayload,
  fallbackRecordedAt: string
): ShadowComparisonRecord[] {
  return readNestedArray(
    payload,
    "system_observability",
    "recentShadowComparisons"
  )
    .map((entry) => normalizeShadowComparison(entry, fallbackRecordedAt))
    .filter((entry): entry is ShadowComparisonRecord => entry !== null);
}

function parsePersistedTelemetryRow(
  row: PersistedSymptomCheckTelemetryRow
): ParsedStoredTelemetry | null {
  const payload = parseStoredPayload(row.ai_response);
  if (!payload) {
    return null;
  }

  return {
    createdAt: normalizeTimestamp(row.created_at, new Date(0).toISOString()),
    pipelineEvents: extractPipelineTelemetry(payload, row.created_at),
    shadowComparisons: extractShadowComparisons(payload, row.created_at),
    sidecarObservations: extractSidecarObservations(payload, row.created_at),
  };
}

function buildUnavailableWindowMetric(
  note: string
): AdminTelemetryWindowMetric {
  return {
    availability: "unavailable",
    denominator24h: 0,
    denominator7d: 0,
    note,
    numerator24h: 0,
    numerator7d: 0,
    rate24h: null,
    rate7d: null,
  };
}

function buildWindowMetric(input: {
  denominator24h: number;
  denominator7d: number;
  note: string | null;
  numerator24h: number;
  numerator7d: number;
}): AdminTelemetryWindowMetric {
  return {
    availability:
      input.denominator24h > 0 || input.denominator7d > 0
        ? "available"
        : "unavailable",
    denominator24h: input.denominator24h,
    denominator7d: input.denominator7d,
    note: input.note,
    numerator24h: input.numerator24h,
    numerator7d: input.numerator7d,
    rate24h: safeRatio(input.numerator24h, input.denominator24h),
    rate7d: safeRatio(input.numerator7d, input.denominator7d),
  };
}

function buildExtractionMetric(
  telemetry: ConversationTelemetryEvent[],
  since24h: string,
  since7d: string
): AdminTelemetryWindowMetric {
  const extractionEvents = telemetry.filter((event) => event.stage === "extraction");
  if (extractionEvents.length === 0) {
    return buildUnavailableWindowMetric(
      "No persisted extraction telemetry was found in saved production reports."
    );
  }

  const calcCounts = (sinceIso: string) => {
    const inWindow = extractionEvents.filter((event) =>
      isWithinLookback(event.recordedAt, sinceIso)
    );
    const numerator = inWindow.filter(
      (event) => parseBooleanNoteToken(event.note, "valid_json") === true
    ).length;
    return { denominator: inWindow.length, numerator };
  };

  const in24h = calcCounts(since24h);
  const in7d = calcCounts(since7d);

  return buildWindowMetric({
    denominator24h: in24h.denominator,
    denominator7d: in7d.denominator,
    note: "Counts only turns where extraction telemetry was durably persisted.",
    numerator24h: in24h.numerator,
    numerator7d: in7d.numerator,
  });
}

function buildPendingRecoveryMetric(
  telemetry: ConversationTelemetryEvent[],
  since24h: string,
  since7d: string
): AdminTelemetryWindowMetric {
  const recoveryEvents = telemetry.filter(
    (event) => event.stage === "pending_recovery"
  );
  if (recoveryEvents.length === 0) {
    return buildUnavailableWindowMetric(
      "No persisted pending-question recovery telemetry was found in saved production reports."
    );
  }

  const calcCounts = (sinceIso: string) => {
    const inWindow = recoveryEvents.filter((event) =>
      isWithinLookback(event.recordedAt, sinceIso)
    );
    const numerator = inWindow.filter((event) => {
      const pendingAfter = parseBooleanNoteToken(event.note, "pending_after");
      return pendingAfter === false || event.outcome === "success";
    }).length;
    return { denominator: inWindow.length, numerator };
  };

  const in24h = calcCounts(since24h);
  const in7d = calcCounts(since7d);

  return buildWindowMetric({
    denominator24h: in24h.denominator,
    denominator7d: in7d.denominator,
    note: "Rescue succeeds when a pending question resolves instead of staying unresolved.",
    numerator24h: in24h.numerator,
    numerator7d: in7d.numerator,
  });
}

function buildRepeatQuestionMetric(
  telemetry: ConversationTelemetryEvent[],
  since24h: string,
  since7d: string
): AdminTelemetryWindowMetric {
  const repeatEvents = telemetry.filter(
    (event) => event.stage === "repeat_suppression"
  );
  const extractionEvents = telemetry.filter((event) => event.stage === "extraction");

  if (repeatEvents.length === 0 && extractionEvents.length === 0) {
    return buildUnavailableWindowMetric(
      "No persisted repeat-question telemetry was found in saved production reports."
    );
  }

  const calcCounts = (sinceIso: string) => {
    const repeatInWindow = repeatEvents.filter((event) =>
      isWithinLookback(event.recordedAt, sinceIso)
    );
    const extractionInWindow = extractionEvents.filter((event) =>
      isWithinLookback(event.recordedAt, sinceIso)
    );
    return {
      denominator: extractionInWindow.length,
      numerator: repeatInWindow.length,
    };
  };

  const in24h = calcCounts(since24h);
  const in7d = calcCounts(since7d);

  return buildWindowMetric({
    denominator24h: in24h.denominator,
    denominator7d: in7d.denominator,
    note: "Rate is based on suppressed repeat attempts per extraction turn.",
    numerator24h: in24h.numerator,
    numerator7d: in7d.numerator,
  });
}

function buildSidecarSummary(
  service: SidecarServiceName,
  parsedRows: ParsedStoredTelemetry[],
  since24h: string
): AdminTelemetrySidecarSummary {
  const observations24h = parsedRows.flatMap((row) =>
    row.sidecarObservations.filter(
      (entry) =>
        entry.service === service && isWithinLookback(entry.recordedAt, since24h)
    )
  );
  const comparisons24h = parsedRows.flatMap((row) =>
    row.shadowComparisons.filter(
      (entry) =>
        entry.service === service && isWithinLookback(entry.recordedAt, since24h)
    )
  );
  const latencies = observations24h
    .map((entry) => entry.latencyMs)
    .filter((value) => Number.isFinite(value) && value >= 0);
  const lastSeen = [...observations24h, ...comparisons24h]
    .map((entry) => entry.recordedAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1);

  return {
    errorRate24h: safeRatio(
      observations24h.filter((entry) => entry.outcome === "error").length,
      observations24h.length
    ),
    lastSeenAt: lastSeen ?? null,
    observationCount24h: observations24h.length,
    p95LatencyMs: percentile(latencies, 0.95),
    service,
    shadowComparisonCount24h: comparisons24h.length,
    shadowDisagreementCount24h: comparisons24h.reduce(
      (sum, entry) => sum + entry.disagreementCount,
      0
    ),
    shadowDisagreementRate24h: safeRatio(
      comparisons24h.filter((entry) => entry.disagreementCount > 0).length,
      comparisons24h.length
    ),
    timeoutRate24h: safeRatio(
      observations24h.filter((entry) => entry.outcome === "timeout").length,
      observations24h.length
    ),
  };
}

function buildNotes(
  parsedRows: ParsedStoredTelemetry[],
  pipeline: AdminTelemetryPipelineMetrics,
  dataMode: AdminTelemetryDashboardData["dataMode"],
  seedNotes: string[]
): string[] {
  const notes = [
    ...seedNotes,
    "Read-only aggregates only. Raw internal telemetry markers and per-case event payloads stay hidden from the dashboard.",
  ];

  if (dataMode === "unavailable") {
    return notes;
  }

  if (parsedRows.length === 0) {
    notes.push(
      `No persisted symptom-check reports were found in the last ${LOOKBACK_DAYS} days.`
    );
  }

  if (pipeline.extractionSuccess.availability === "unavailable") {
    notes.push(
      "Extraction, pending-question rescue, and repeat-question metrics only appear when saved reports include durable conversation telemetry."
    );
  }

  return notes;
}

export function buildAdminTelemetryDashboardData(
  input: AdminTelemetryAggregateInput
): AdminTelemetryDashboardData {
  const dataMode = input.dataMode || "live";
  const since24h = new Date(Date.parse(input.generatedAt) - DAY_MS).toISOString();
  const since7d = new Date(
    Date.parse(input.generatedAt) - DAY_MS * LOOKBACK_DAYS
  ).toISOString();
  const parsedRows = input.rows
    .map(parsePersistedTelemetryRow)
    .filter((row): row is ParsedStoredTelemetry => row !== null);
  const pipelineTelemetry = parsedRows.flatMap((row) => row.pipelineEvents);
  const pipeline: AdminTelemetryPipelineMetrics = {
    extractionSuccess: buildExtractionMetric(
      pipelineTelemetry,
      since24h,
      since7d
    ),
    pendingQuestionRescue: buildPendingRecoveryMetric(
      pipelineTelemetry,
      since24h,
      since7d
    ),
    repeatQuestionAttempt: buildRepeatQuestionMetric(
      pipelineTelemetry,
      since24h,
      since7d
    ),
  };

  return {
    dataMode,
    generatedAt: input.generatedAt,
    historyWindowDays: LOOKBACK_DAYS,
    notes: buildNotes(parsedRows, pipeline, dataMode, input.notes || []),
    pipeline,
    sidecars: SIDECAR_SERVICES.map((service) =>
      buildSidecarSummary(service, parsedRows, since24h)
    ),
    sources: [
      "Persisted symptom-check reports",
      "Saved sidecar observability snapshots",
      "Durable conversation telemetry when available",
    ],
    symptomCheckCount7d: input.rows.length,
  };
}

export function buildUnavailableAdminTelemetryDashboardData(
  generatedAt = new Date().toISOString(),
  reason = "Production telemetry storage is not configured in this environment."
): AdminTelemetryDashboardData {
  return buildAdminTelemetryDashboardData({
    dataMode: "unavailable",
    generatedAt,
    notes: [reason],
    rows: [],
  });
}

function createSupabaseTelemetryHistoryAdapter(
  serviceSupabase: NonNullable<ReturnType<typeof getServiceSupabase>>
): TelemetryHistoryAdapter {
  return {
    async listSymptomChecks(sinceIso) {
      const { data, error } = await serviceSupabase
        .from("symptom_checks")
        .select("created_at, ai_response")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (error) {
        console.error("Admin telemetry symptom_checks query failed:", error);
        return [];
      }

      return Array.isArray(data)
        ? data
            .map((row) =>
              isRecord(row)
                ? {
                    ai_response:
                      typeof row.ai_response === "string" || isRecord(row.ai_response)
                        ? row.ai_response
                        : null,
                    created_at:
                      readString(row.created_at) || new Date(0).toISOString(),
                  }
                : null
            )
            .filter(
              (row): row is PersistedSymptomCheckTelemetryRow => row !== null
            )
        : [];
    },
  };
}

export async function loadAdminTelemetryDashboardData(
  adminContext: AdminRequestContext,
  adapter?: TelemetryHistoryAdapter
): Promise<AdminTelemetryDashboardData> {
  const generatedAt = new Date().toISOString();

  if (adminContext.isDemo) {
    return buildUnavailableAdminTelemetryDashboardData(
      generatedAt,
      "Demo mode cannot show real production telemetry."
    );
  }

  const serviceSupabase = getServiceSupabase();
  if (!serviceSupabase && !adapter) {
    return buildUnavailableAdminTelemetryDashboardData(generatedAt);
  }

  const effectiveAdapter =
    adapter || createSupabaseTelemetryHistoryAdapter(serviceSupabase!);
  const sinceIso = new Date(Date.parse(generatedAt) - DAY_MS * LOOKBACK_DAYS)
    .toISOString();
  const rows = await effectiveAdapter.listSymptomChecks(sinceIso);
  const notes: string[] = [];

  if (rows.length >= HISTORY_LIMIT) {
    notes.push(
      `Telemetry is sampled from the newest ${HISTORY_LIMIT} persisted reports in the ${LOOKBACK_DAYS}-day window.`
    );
  }

  return buildAdminTelemetryDashboardData({
    generatedAt,
    notes,
    rows,
  });
}
