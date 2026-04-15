import type {
  ShadowComparisonRecord,
  SidecarObservation,
  SidecarServiceName,
} from "./clinical-evidence";
import { buildShadowRolloutSummary } from "./shadow-rollout";
import { getServiceSupabase } from "./supabase-admin";
import type { TriageSession } from "./triage-engine";

interface PersistedSystemObservability {
  recentServiceCalls?: unknown;
  recentShadowComparisons?: unknown;
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
  observationCount: number;
  shadowComparisonCount: number;
  summary: ReturnType<typeof buildShadowRolloutSummary>;
  serviceMetrics: PersistedShadowServiceMetrics[];
  warning: string | null;
}

type ServiceSummary = PersistedShadowBaselineSnapshot["summary"]["services"][number];

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

export async function buildPersistedShadowBaselineSnapshot(options?: {
  windowHours?: number;
  limit?: number;
}): Promise<PersistedShadowBaselineSnapshot> {
  const windowHours = Math.max(1, options?.windowHours || 24);
  const limit = Math.max(50, options?.limit || 1000);
  const emptySession = buildEmptySession();
  const supabase = getServiceSupabase();

  if (!supabase) {
    return {
      generatedAt: new Date().toISOString(),
      windowHours,
      reportCount: 0,
      parsedReportCount: 0,
      malformedReportCount: 0,
      observationCount: 0,
      shadowComparisonCount: 0,
      summary: buildShadowRolloutSummary(emptySession),
      serviceMetrics: buildServiceMetrics(emptySession),
      warning: "Supabase service client is not configured.",
    };
  }

  const sinceIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("symptom_checks")
    .select("id, ai_response")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(
      `Unable to load persisted shadow telemetry: ${error.message || "unknown error"}`
    );
  }

  let parsedReportCount = 0;
  let malformedReportCount = 0;

  for (const row of data || []) {
    const report = parseReportPayload((row as Record<string, unknown>).ai_response);
    if (!report) {
      malformedReportCount += 1;
      continue;
    }

    parsedReportCount += 1;
    const recentServiceCalls = Array.isArray(
      report.system_observability?.recentServiceCalls
    )
      ? report.system_observability?.recentServiceCalls
      : [];
    const recentShadowComparisons = Array.isArray(
      report.system_observability?.recentShadowComparisons
    )
      ? report.system_observability?.recentShadowComparisons
      : [];

    emptySession.case_memory!.service_observations.push(
      ...recentServiceCalls
        .map((entry) => normalizeObservation(entry))
        .filter((entry): entry is SidecarObservation => Boolean(entry))
    );
    emptySession.case_memory!.shadow_comparisons.push(
      ...recentShadowComparisons
        .map((entry) => normalizeComparison(entry))
        .filter((entry): entry is ShadowComparisonRecord => Boolean(entry))
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    reportCount: (data || []).length,
    parsedReportCount,
    malformedReportCount,
    observationCount: emptySession.case_memory!.service_observations.length,
    shadowComparisonCount: emptySession.case_memory!.shadow_comparisons.length,
    summary: buildShadowRolloutSummary(emptySession),
    serviceMetrics: buildServiceMetrics(emptySession),
    warning: null,
  };
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
