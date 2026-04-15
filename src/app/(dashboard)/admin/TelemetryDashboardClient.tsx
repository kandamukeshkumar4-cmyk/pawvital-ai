"use client";

import { useState, useTransition } from "react";
import {
  Activity,
  BellRing,
  ClipboardList,
  RefreshCw,
  Share2,
  Stethoscope,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminTelemetryDashboardData } from "@/lib/admin-telemetry";

interface TelemetryDashboardClientProps {
  initialTelemetry: AdminTelemetryDashboardData;
}

const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

const wholeNumberFormatter = new Intl.NumberFormat("en-US");

function buildFeedbackChartData(telemetry: AdminTelemetryDashboardData) {
  return [
    { label: "Matched", value: telemetry.distributions.feedback30d.yes },
    { label: "Partial", value: telemetry.distributions.feedback30d.partly },
    { label: "Mismatch", value: telemetry.distributions.feedback30d.no },
  ];
}

function buildNotificationChartData(telemetry: AdminTelemetryDashboardData) {
  return [
    {
      label: "Report ready",
      value: telemetry.distributions.notificationTypes7d.report_ready,
    },
    {
      label: "Urgency alert",
      value: telemetry.distributions.notificationTypes7d.urgency_alert,
    },
    {
      label: "Outcome reminder",
      value: telemetry.distributions.notificationTypes7d.outcome_reminder,
    },
    {
      label: "Subscription",
      value: telemetry.distributions.notificationTypes7d.subscription,
    },
    { label: "System", value: telemetry.distributions.notificationTypes7d.system },
  ];
}

function buildProposalChartData(telemetry: AdminTelemetryDashboardData) {
  return [
    { label: "Draft", value: telemetry.distributions.proposalStatus30d.draft },
    {
      label: "Approved",
      value: telemetry.distributions.proposalStatus30d.approved,
    },
    {
      label: "Rejected",
      value: telemetry.distributions.proposalStatus30d.rejected,
    },
    {
      label: "Superseded",
      value: telemetry.distributions.proposalStatus30d.superseded,
    },
  ];
}

function buildSeverityChartData(telemetry: AdminTelemetryDashboardData) {
  return [
    { label: "Low", value: telemetry.distributions.severity30d.low },
    { label: "Medium", value: telemetry.distributions.severity30d.medium },
    { label: "High", value: telemetry.distributions.severity30d.high },
    {
      label: "Emergency",
      value: telemetry.distributions.severity30d.emergency,
    },
  ];
}

function formatCount(value: number) {
  return wholeNumberFormatter.format(value);
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return percentFormatter.format(value);
}

function MetricCard({
  description,
  icon: Icon,
  title,
  value,
}: {
  description: string;
  icon: typeof Activity;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{description}</p>
    </div>
  );
}

function DistributionCard({
  bars,
  title,
}: {
  bars: Array<{ label: string; value: number }>;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#0f766e" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TelemetryDashboardClient({
  initialTelemetry,
}: TelemetryDashboardClientProps) {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refreshTelemetry = () => {
    startTransition(() => {
      void (async () => {
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
        }
      })();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Last refreshed</p>
          <p className="text-base font-semibold text-slate-950">
            {formatGeneratedAt(telemetry.generatedAt)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {telemetry.sources.join(" • ")}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshTelemetry}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          {isPending ? "Refreshing..." : "Refresh telemetry"}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Symptom checks"
          value={formatCount(telemetry.totals.symptomChecks24h)}
          description={`${formatCount(telemetry.totals.symptomChecks7d)} in 7d • ${formatCount(telemetry.totals.symptomChecks30d)} in 30d`}
          icon={Stethoscope}
        />
        <MetricCard
          title="Outcome feedback"
          value={formatCount(telemetry.totals.outcomeFeedback30d)}
          description={`${formatPercent(telemetry.ratios.feedbackCoverage30d)} of 30d checks produced feedback`}
          icon={ClipboardList}
        />
        <MetricCard
          title="Threshold proposals"
          value={formatCount(telemetry.totals.thresholdProposals30d)}
          description={`${formatPercent(telemetry.ratios.proposalApprovalRate30d)} approved in the same 30d window`}
          icon={Activity}
        />
        <MetricCard
          title="Notifications"
          value={formatCount(telemetry.totals.notifications7d)}
          description={`${formatCount(telemetry.totals.unreadNotifications)} currently unread across persisted notifications`}
          icon={BellRing}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-base font-semibold text-slate-950">
            Persisted activity trend (7 days)
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Counts are derived from records already stored in the app database.
          </p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={telemetry.series7d}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="symptomChecks"
                  name="Symptom checks"
                  stroke="#0f172a"
                  strokeWidth={3}
                />
                <Line
                  type="monotone"
                  dataKey="outcomeFeedback"
                  name="Outcome feedback"
                  stroke="#0f766e"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="shareLinks"
                  name="Share links"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="notifications"
                  name="Notifications"
                  stroke="#c2410c"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Quality-loop health
          </h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">
                Feedback mismatch rate
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {formatPercent(telemetry.ratios.mismatchRate30d)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatCount(telemetry.totals.feedbackMismatch30d)} of{" "}
                {formatCount(telemetry.totals.outcomeFeedback30d)} recent
                feedback entries were explicit mismatches.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">Share link load</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {formatCount(telemetry.totals.activeSharedReports)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Active share links right now •{" "}
                {formatPercent(telemetry.ratios.shareRate30d)} of recent checks
                were shared.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">
                Proposal approvals
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {formatCount(telemetry.totals.approvedProposals30d)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Approved threshold proposals in the last 30 days.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DistributionCard
          title="Symptom-check severity mix (30 days)"
          bars={buildSeverityChartData(telemetry)}
        />
        <DistributionCard
          title="Outcome feedback signals (30 days)"
          bars={buildFeedbackChartData(telemetry)}
        />
        <DistributionCard
          title="Threshold proposal statuses (30 days)"
          bars={buildProposalChartData(telemetry)}
        />
        <DistributionCard
          title="Notification types sent (7 days)"
          bars={buildNotificationChartData(telemetry)}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Telemetry notes
            </h2>
            <p className="text-sm text-slate-600">
              Honest caveats and operational cues derived from persisted data.
            </p>
          </div>
        </div>
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
      </div>
    </div>
  );
}
