import { notFound } from "next/navigation";
import { ShadowRolloutControlPanel } from "@/components/admin/shadow-rollout-control-panel";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildAdminShadowRolloutDashboardData,
  buildDemoShadowRolloutDashboardData,
} from "@/lib/admin-shadow-rollout";

export const dynamic = "force-dynamic";

export default async function AdminSidecarsPage() {
  const adminContext = await getAdminRequestContext();
  if (!adminContext) {
    notFound();
  }

  let dashboard = buildDemoShadowRolloutDashboardData();
  let errorMessage: string | null = null;

  try {
    dashboard = await buildAdminShadowRolloutDashboardData();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Unable to load live sidecar rollout data.";
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Admin Sidecar Rollout
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Review sidecar health, shadow gate readiness, and controlled live-split
          changes from a dedicated admin surface.
        </p>
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Falling back to preview data because live rollout data failed to load.
          {` ${errorMessage}`}
        </div>
      ) : null}

      <ShadowRolloutControlPanel initialData={dashboard} />
    </div>
  );
}
