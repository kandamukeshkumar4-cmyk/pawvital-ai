"use client";

import { useMemo, useState } from "react";
import type {
  AdminShadowRolloutDashboardData,
  AdminShadowRolloutServiceControl,
} from "@/lib/admin-shadow-rollout";
import {
  LIVE_SPLIT_VALUES,
  type LiveSplitPct,
} from "@/lib/admin-shadow-rollout-shared";

interface ShadowRolloutControlPanelProps {
  initialData: AdminShadowRolloutDashboardData;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function buildConfirmationMessage(
  service: AdminShadowRolloutServiceControl,
  nextLiveSplitPct: LiveSplitPct,
  writeMode: AdminShadowRolloutDashboardData["writeMode"]
) {
  if (nextLiveSplitPct === 0 && service.currentLiveSplitPct > 0) {
    return (
      `Kill switch ${service.serviceLabel} from ${service.currentLiveSplitPct}% to 0% live traffic? ` +
      "This change should be reserved for active production risk."
    );
  }

  if (writeMode === "live") {
    return (
      `Apply ${service.serviceLabel} live split change from ${service.currentLiveSplitPct}% ` +
      `to ${nextLiveSplitPct}% and queue a production redeploy?`
    );
  }

  return null;
}

function healthClasses(status: AdminShadowRolloutServiceControl["health"]["status"]) {
  switch (status) {
    case "healthy":
      return "bg-green-100 text-green-800";
    case "warming":
      return "bg-sky-100 text-sky-800";
    case "stub":
      return "bg-amber-100 text-amber-800";
    case "unhealthy":
    case "unreachable":
    case "misconfigured":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function rolloutClasses(
  status: AdminShadowRolloutServiceControl["shadow"]["status"]
) {
  switch (status) {
    case "ready":
      return "bg-green-100 text-green-800";
    case "watch":
      return "bg-amber-100 text-amber-800";
    case "blocked":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function ShadowRolloutControlPanel({
  initialData,
}: ShadowRolloutControlPanelProps) {
  const [dashboard, setDashboard] = useState(initialData);
  const [selectedSplits, setSelectedSplits] = useState<Record<string, LiveSplitPct>>(
    Object.fromEntries(
      initialData.services.map((service) => [
        service.service,
        service.currentLiveSplitPct,
      ])
    )
  );
  const [savingService, setSavingService] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    tone: "error" | "success";
    value: string;
  } | null>(null);

  const promotedLiveCount = useMemo(
    () => dashboard.services.filter((service) => service.rollout.promotedLive).length,
    [dashboard.services]
  );

  async function applyLiveSplitChange(
    service: AdminShadowRolloutServiceControl,
    nextLiveSplitPct: LiveSplitPct
  ) {
    const confirmationMessage = buildConfirmationMessage(
      service,
      nextLiveSplitPct,
      dashboard.writeMode
    );
    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      return;
    }

    setSavingService(service.service);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/sidecars", {
        body: JSON.stringify({
          liveSplitPct: nextLiveSplitPct,
          service: service.service,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to update live split");
      }

      setDashboard((current) => ({
        ...current,
        services: current.services.map((entry) =>
          entry.service === service.service ? payload.control : entry
        ),
        summary: {
          ...current.summary,
          promotedLiveCount: current.services.filter((entry) =>
            entry.service === service.service
              ? payload.control.rollout.promotedLive
              : entry.rollout.promotedLive
          ).length,
          totalLiveSplitPct: current.services.reduce(
            (sum, entry) =>
              sum +
              (entry.service === service.service
                ? payload.control.currentLiveSplitPct
                : entry.currentLiveSplitPct),
            0
          ),
        },
      }));
      setSelectedSplits((current) => ({
        ...current,
        [service.service]: payload.control.currentLiveSplitPct,
      }));
      setStatusMessage({
        tone: "success",
        value:
          payload.deployment?.url && payload.mode === "live"
            ? `${payload.message} Deployment: ${payload.deployment.url}`
            : payload.message,
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        value:
          error instanceof Error ? error.message : "Failed to update live split",
      });
    } finally {
      setSavingService(null);
    }
  }

  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Shadow Rollout Control Panel
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Live split controls stay within the existing promotion guardrails.
            Increases only unlock when the sidecar is healthy and its shadow gate
            is ready. Reductions and kill switches stay available immediately.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">
            {dashboard.writeMode === "live" ? "Production write mode" : "Preview-only mode"}
          </p>
          <p className="mt-1">{dashboard.writeReason}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-500">Overall Gate</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {dashboard.shadow.overallStatus}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {dashboard.shadow.baseline.observationCount} observations /{" "}
            {dashboard.shadow.baseline.shadowComparisonCount} comparisons
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-700">Healthy Sidecars</p>
          <p className="mt-2 text-2xl font-semibold text-green-900">
            {dashboard.summary.healthyServiceCount}
          </p>
          <p className="mt-2 text-xs text-green-700">
            {dashboard.readiness.healthyCount} healthy /{" "}
            {dashboard.readiness.warmingCount} warming /{" "}
            {dashboard.summary.totalServices} total
          </p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-700">Promoted Live</p>
          <p className="mt-2 text-2xl font-semibold text-sky-900">
            {promotedLiveCount}
          </p>
          <p className="mt-2 text-xs text-sky-700">
            Aggregate split {dashboard.summary.totalLiveSplitPct}%
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-700">Window Gate</p>
          <p className="mt-2 text-sm font-semibold text-amber-900">
            {dashboard.shadow.baseline.windowHours}h /{" "}
            {dashboard.shadow.gateConfig.requiredHealthySamples} healthy samples
          </p>
          <p className="mt-2 text-xs text-amber-700">
            Ratio target {formatPercent(dashboard.shadow.gateConfig.requiredHealthyRatio)}
          </p>
        </div>
      </div>

      {statusMessage ? (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            statusMessage.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {statusMessage.value}
        </div>
      ) : null}

      {dashboard.shadow.baseline.warning ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {dashboard.shadow.baseline.warning}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {dashboard.services.map((service) => {
          const selectedSplit =
            selectedSplits[service.service] ?? service.currentLiveSplitPct;

          return (
            <article
              className="rounded-lg border border-slate-200 p-5"
              key={service.service}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {service.serviceLabel}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${healthClasses(service.health.status)}`}
                    >
                      {service.health.status}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${rolloutClasses(service.shadow.status)}`}
                    >
                      {service.shadow.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      Live split {service.currentLiveSplitPct}%
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Env: <span className="font-mono">{service.liveSplitEnv}</span>{" "}
                    · Path <span className="font-mono">{service.config.expectedPath}</span>
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  <p>Readiness snapshot {formatDate(dashboard.readiness.generatedAt)}</p>
                  <p className="mt-1">
                    Shadow baseline {formatDate(dashboard.shadow.baseline.generatedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Health</p>
                  <p className="mt-1">
                    Checked: {formatDate(dashboard.readiness.generatedAt)}
                  </p>
                  <p className="mt-1">
                    Last healthy:{" "}
                    {service.health.status === "healthy"
                      ? formatDate(dashboard.readiness.generatedAt)
                      : "Not healthy in the latest snapshot"}
                  </p>
                  <p className="mt-1">Mode: {service.health.mode || "unknown"}</p>
                  <p className="mt-1">Model: {service.health.model || "unknown"}</p>
                  <p className="mt-1">
                    Detail: {service.health.detail || "No health detail reported."}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Shadow window</p>
                  <p className="mt-1">
                    Observations: {service.shadow.totalObservations}
                  </p>
                  <p className="mt-1">
                    Healthy ratio: {formatPercent(service.shadow.window.healthySampleRatio)}
                  </p>
                  <p className="mt-1">
                    Load test: {service.shadow.loadTestStatus}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Metrics</p>
                  <p className="mt-1">
                    Timeout: {formatPercent(service.shadow.metrics.timeoutRate)}
                  </p>
                  <p className="mt-1">
                    Error: {formatPercent(service.shadow.metrics.errorRate)}
                  </p>
                  <p className="mt-1">
                    Fallback: {formatPercent(service.shadow.metrics.fallbackRate)}
                  </p>
                  <p className="mt-1">
                    Disagreement: {formatPercent(service.shadow.metrics.disagreementRate)}
                  </p>
                </div>
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Latency</p>
                  <p className="mt-1">
                    p95: {service.shadow.metrics.p95LatencyMs ?? "n/a"}ms
                  </p>
                  <p className="mt-1">
                    Shadow obs: {service.shadow.metrics.shadowObservationCount}
                  </p>
                  <p className="mt-1">
                    Comparisons: {service.shadow.metrics.comparisonCount}
                  </p>
                </div>
              </div>

              {service.shadow.blockers.length > 0 || service.rollout.blockedReason ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">Rollout guardrails</p>
                  <ul className="mt-2 list-disc pl-5">
                    {service.rollout.blockedReason ? (
                      <li>{service.rollout.blockedReason}</li>
                    ) : null}
                    {service.shadow.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="text-sm font-medium text-slate-900">
                  Live split
                  <select
                    className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    onChange={(event) =>
                      setSelectedSplits((current) => ({
                        ...current,
                        [service.service]: Number(event.target.value) as LiveSplitPct,
                      }))
                    }
                    value={selectedSplit}
                  >
                    {LIVE_SPLIT_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {value}%
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={
                      savingService === service.service ||
                      selectedSplit === service.currentLiveSplitPct
                    }
                    onClick={() => applyLiveSplitChange(service, selectedSplit)}
                    type="button"
                  >
                    {savingService === service.service
                      ? "Saving..."
                      : dashboard.writeMode === "live"
                        ? "Apply Live Split"
                        : "Preview Change"}
                  </button>
                  <button
                    className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                    disabled={
                      savingService === service.service || !service.rollout.canKillSwitch
                    }
                    onClick={() => applyLiveSplitChange(service, 0)}
                    type="button"
                  >
                    Kill Switch
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
