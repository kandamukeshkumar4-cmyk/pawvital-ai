"use client";

import { useState } from "react";
import { Activity, RefreshCw, ShieldAlert, Stethoscope } from "lucide-react";
import type {
  AdminTelemetryDashboardData,
  AdminTelemetrySidecarSummary,
  AdminTelemetryWindowMetric,
} from "@/lib/admin-telemetry";

interface TelemetryDashboardClientProps {
  initialTelemetry: AdminTelemetryDashboardData;
}

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value: number | null) {
  return value === null ? "Unavailable" : percentFormatter.format(value);
}

function formatRateDetail(metric: AdminTelemetryWindowMetric) {
  if (metric.availability !== "available") {
    return metric.note || "Unavailable in persisted production telemetry.";
  }

  return `${metric.numerator24h}/${metric.denominator24h} in 24h • ${metric.numerator7d}/${metric.denominator7d} in 7d`;
}

function formatLatency(value: number | null) {
  return value === null ? "No 24h data" : `${Math.round(value)}ms`;
}

function formatLastSeen(value: string | null) {
  if (!value) {
    return "No recent observations";
  }

  return formatGeneratedAt(value);
}

function PipelineMetricCard({
  description,
  icon: Icon,
  metric,
  title,
}: {
  description: string;
  icon: typeof Activity;
  metric: AdminTelemetryWindowMetric;
  title: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last 24h
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-950">
            {formatPercent(metric.rate24h)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last 7d
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-950">
            {formatPercent(metric.rate7d)}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-slate-600">{formatRateDetail(metric)}</p>
    </article>
  );
}

function SidecarCard({ sidecar }: { sidecar: AdminTelemetrySidecarSummary }) {
  return (
    <article
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid={`sidecar-${sidecar.service}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            {sidecar.service}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Last seen {formatLastSeen(sidecar.lastSeenAt)}
          </p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          {sidecar.observationCount24h} obs
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            P95 latency
          </dt>
          <dd className="mt-1 text-xl font-semibold text-slate-950">
            {formatLatency(sidecar.p95LatencyMs)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Timeout rate
          </dt>
          <dd className="mt-1 text-xl font-semibold text-slate-950">
            {formatPercent(sidecar.timeoutRate24h)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Error rate
          </dt>
          <dd className="mt-1 text-xl font-semibold text-slate-950">
            {formatPercent(sidecar.errorRate24h)}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Shadow disagreement
          </dt>
          <dd className="mt-1 text-xl font-semibold text-slate-950">
            {formatPercent(sidecar.shadowDisagreementRate24h)}
          </dd>
          <p className="mt-1 text-xs text-slate-500">
            {sidecar.shadowDisagreementCount24h} disagreement(s) across{" "}
            {sidecar.shadowComparisonCount24h} comparison(s)
          </p>
        </div>
      </dl>
    </article>
  );
}

export default function TelemetryDashboardClient({
  initialTelemetry,
}: TelemetryDashboardClientProps) {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshTelemetry = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/telemetry", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const nextTelemetry =
        (await response.json()) as AdminTelemetryDashboardData;
      setTelemetry(nextTelemetry);
    } catch (refreshError) {
      console.error("Telemetry refresh failed:", refreshError);
      setError("Unable to refresh telemetry right now.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Last refreshed</p>
          <p className="text-base font-semibold text-slate-950">
            {formatGeneratedAt(telemetry.generatedAt)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {telemetry.symptomCheckCount7d} persisted report(s) sampled across{" "}
            {telemetry.historyWindowDays} day(s)
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {telemetry.sources.join(" • ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshTelemetry();
          }}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
          {isRefreshing ? "Refreshing..." : "Refresh telemetry"}
        </button>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PipelineMetricCard
          title="Extraction success rate"
          description="Structured extraction with valid JSON, measured from persisted conversation telemetry."
          icon={Stethoscope}
          metric={telemetry.pipeline.extractionSuccess}
        />
        <PipelineMetricCard
          title="Pending-question rescue rate"
          description="How often pending follow-up questions resolved instead of staying in clarification."
          icon={ShieldAlert}
          metric={telemetry.pipeline.pendingQuestionRescue}
        />
        <PipelineMetricCard
          title="Repeat-question attempt rate"
          description="Suppressed repeats per extraction turn, showing how often the flow tried to ask the same question again."
          icon={Activity}
          metric={telemetry.pipeline.repeatQuestionAttempt}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Sidecar health (24h)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Derived from persisted sidecar observations and shadow comparison
            summaries already stored alongside symptom-check reports.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {telemetry.sidecars.map((sidecar) => (
            <SidecarCard key={sidecar.service} sidecar={sidecar} />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">
          Telemetry notes
        </h2>
        <ul className="mt-4 space-y-3 text-sm text-slate-700">
          {telemetry.notes.map((note) => (
            <li
              key={note}
              className="rounded-xl bg-slate-50 px-4 py-3 leading-6"
            >
              {note}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
