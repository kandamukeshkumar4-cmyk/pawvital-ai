import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getAdminRequestContext } from "@/lib/admin-auth";
import { buildDemoAdminFeedbackLedgerDashboardData } from "@/lib/admin-feedback-ledger";
import { buildPrivateTesterDashboardFallback } from "@/lib/private-tester-admin";
import { buildPrivateTesterCohortCommandCenter } from "@/lib/private-tester-cohort";

export const dynamic = "force-dynamic";

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortId(value: string | null) {
  if (!value) return "n/a";
  return value.length <= 16 ? value : `${value.slice(0, 8)}...`;
}

export default async function AdminCohortLaunchPage() {
  const adminContext = await getAdminRequestContext();

  if (!adminContext) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-700">
            Admin access required
          </p>
          <h1 className="mt-2 text-2xl font-bold text-red-950">
            The Cohort 1 command center is only available to signed-in admins.
          </h1>
          <p className="mt-3 text-sm text-red-800">
            This page combines private tester access controls, founder-review
            queues, and launch-ops checkpoints for the first cohort.
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

  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const cookieHeader = (await cookies()).toString();

  let privateTesterDashboard = buildPrivateTesterDashboardFallback(
    "Private tester service-role data is unavailable."
  );
  let feedbackDashboard = buildDemoAdminFeedbackLedgerDashboardData();

  try {
    const [privateTesterResponse, feedbackResponse] = await Promise.all([
      fetch(`${baseUrl}/api/admin/private-tester`, {
        headers: { cookie: cookieHeader },
      }),
      fetch(`${baseUrl}/api/admin/tester-feedback`, {
        headers: { cookie: cookieHeader },
      }),
    ]);

    if (privateTesterResponse.ok) {
      privateTesterDashboard = await privateTesterResponse.json();
    }
    if (feedbackResponse.ok) {
      feedbackDashboard = await feedbackResponse.json();
    }
  } catch (error) {
    console.error("Failed to load cohort launch data:", error);
  }

  const commandCenter = buildPrivateTesterCohortCommandCenter({
    feedbackDashboard,
    privateTesterDashboard,
  });

  const summaryCards = [
    ["Testers invited", commandCenter.summary.testersInvited],
    ["Signed-in testers", commandCenter.summary.signedInTesters],
    ["Completed symptom checks", commandCenter.summary.completedSymptomChecks],
    ["Report-linked cases", commandCenter.summary.reportsOpened],
    ["Feedback submitted", commandCenter.summary.feedbackSubmitted],
    ["Negative feedback", commandCenter.summary.negativeFeedback],
    ["Emergency results", commandCenter.summary.emergencyResults],
    ["Repeated-question flags", commandCenter.summary.repeatedQuestionFlags],
    ["Report failures", commandCenter.summary.reportFailures],
    ["Sign-in failures", commandCenter.summary.signInFailures],
    ["Tester access disabled", commandCenter.summary.testerAccessDisabled],
    ["Deletion requests", commandCenter.summary.dataDeletionRequests],
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            VET-1380
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            Private Tester Cohort 1 Command Center
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Founder view for cohort launch, monitoring, bug triage, and stop-testing
            review. This page stays scoped to private-tester access and stored
            founder-review cases.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/tester-access"
            className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tester access
          </Link>
          <Link
            href="/admin/telemetry"
            className="inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Telemetry
          </Link>
          <Link
            href="/admin"
            className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Back to admin
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(([label, value]) => (
          <article
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-950">
          Operational notes
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-900">
          {commandCenter.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              High-risk sessions
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {commandCenter.highRiskSessions.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {commandCenter.highRiskSessions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No high-risk cohort sessions are currently stored.
              </p>
            ) : (
              commandCenter.highRiskSessions.map((entry) => (
                <article
                  key={entry.symptomCheckId}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                      {entry.urgencyResult}
                    </span>
                    {entry.reportFailed ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        report_failed
                      </span>
                    ) : null}
                    {entry.flagReasons.includes("question_flow_issue") ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        repeated_question
                      </span>
                    ) : null}
                    {entry.trustLevel ? (
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                        trust: {entry.trustLevel}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-slate-950">
                    {entry.reportTitle || entry.symptomInput}
                  </h3>
                  <p className="mt-1 text-sm text-slate-700">{entry.symptomInput}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    Case {shortId(entry.symptomCheckId)} • Report {shortId(entry.reportId)} •{" "}
                    {formatWhen(entry.createdAt)}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Founder triage queue
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {commandCenter.filters.latestSessions.length}
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {(["P0", "P1", "P2", "P3"] as const).map((severity) => (
              <div key={severity} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-950">{severity}</h3>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {commandCenter.triage[severity].length}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  {commandCenter.triage[severity].length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No cases are currently classified into this queue.
                    </p>
                  ) : (
                    commandCenter.triage[severity].map((entry) => (
                      <article
                        key={`${severity}-${entry.caseSummary.symptomCheckId}`}
                        className="rounded-xl bg-slate-50 p-3"
                      >
                        <p className="text-sm font-semibold text-slate-950">
                          {entry.category}
                        </p>
                        <p className="mt-1 text-sm text-slate-700">
                          {entry.caseSummary.symptomInput}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.rationale}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Session filters</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li>Latest sessions: {commandCenter.filters.latestSessions.length}</li>
            <li>Emergency sessions: {commandCenter.filters.emergencySessions.length}</li>
            <li>No-feedback sessions: {commandCenter.filters.noFeedbackSessions.length}</li>
            <li>
              Negative-feedback sessions: {commandCenter.filters.negativeFeedbackSessions.length}
            </li>
            <li>
              Failed-report sessions: {commandCenter.filters.failedReportSessions.length}
            </li>
            <li>
              Failed sign-in or access sessions:{" "}
              {commandCenter.filters.failedSignInOrAccessSessions.length}
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Blocked or access-follow-up testers</h2>
          <div className="mt-4 space-y-3">
            {commandCenter.filters.failedSignInOrAccessSessions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No blocked or not-invited tester accounts are currently surfaced.
              </p>
            ) : (
              commandCenter.filters.failedSignInOrAccessSessions.map((entry) => (
                <article
                  key={entry.testerId}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="text-sm font-semibold text-slate-950">
                    {entry.email || entry.testerId}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    {entry.blocked ? "blocked" : "needs invite follow-up"} • {entry.accessReason}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Symptom checks: {entry.symptomChecks} • Negative feedback:{" "}
                    {entry.negativeFeedbackEntries}
                  </p>
                  {entry.accessDisabled || entry.deletionRequested ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {entry.accessDisabled ? "Auth disabled" : "Auth active"}
                      {entry.deletionRequested
                        ? " • deletion requested"
                        : " • no deletion request"}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Repo launch assets</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li>`docs/private-tester-invite.md`</li>
            <li>`docs/private-tester-cohort-1-registry-template.csv`</li>
            <li>`docs/private-tester-result-copy-qa.md`</li>
            <li>`docs/private-tester-incident-runbook.md`</li>
            <li>`docs/private-tester-cohort-1-report-template.md`</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
