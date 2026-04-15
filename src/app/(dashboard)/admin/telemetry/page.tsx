import Link from "next/link";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { loadAdminTelemetryDashboardData } from "@/lib/admin-telemetry";
import TelemetryDashboardClient from "../TelemetryDashboardClient";

export default async function AdminTelemetryPage() {
  const adminContext = await getAdminRequestContext();

  if (!adminContext) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">
            Admin access required
          </p>
          <h1 className="mt-2 text-2xl font-bold text-red-950">
            Production telemetry is only available to signed-in admins.
          </h1>
          <p className="mt-3 text-sm text-red-800">
            This page reads persisted operational data from protected tables and
            does not expose demo or anonymous fallbacks.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          >
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const telemetry = await loadAdminTelemetryDashboardData(adminContext);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Admin telemetry
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Production telemetry dashboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Persisted application telemetry only: symptom checks, feedback,
            proposals, shares, and notifications already stored in Supabase.
          </p>
        </div>
        <Link
          href="/admin"
          className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Back to admin ops
        </Link>
      </div>

      {telemetry.isDemo && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Demo mode is active because trusted Supabase telemetry access is not
          configured in this environment.
        </div>
      )}

      <TelemetryDashboardClient initialTelemetry={telemetry} />
    </div>
  );
}
