import Link from "next/link";
import { getAdminRequestContext } from "@/lib/admin-auth";
import {
  buildPrivateTesterDashboardFallback,
  listPrivateTesterSummaries,
} from "@/lib/private-tester-admin";
import TesterAccessDashboardClient from "./TesterAccessDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminTesterAccessPage() {
  const adminContext = await getAdminRequestContext();

  if (!adminContext) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">
            Admin access required
          </p>
          <h1 className="mt-2 text-2xl font-bold text-red-950">
            Tester access controls are only available to signed-in admins.
          </h1>
          <p className="mt-3 text-sm text-red-800">
            This page manages invite-only private tester access, deletion
            controls, and rollout guardrails for the release candidate.
          </p>
          <Link
            href="/admin"
            className="mt-4 inline-flex rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
          >
            Return to admin
          </Link>
        </div>
      </div>
    );
  }

  let dashboard = buildPrivateTesterDashboardFallback();

  try {
    dashboard = await listPrivateTesterSummaries();
  } catch (error) {
    const warning =
      error instanceof Error
        ? error.message
        : "Unable to load private tester dashboard data.";
    dashboard = buildPrivateTesterDashboardFallback(warning);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <TesterAccessDashboardClient initialData={dashboard} />
    </div>
  );
}
