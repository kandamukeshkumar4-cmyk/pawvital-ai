"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  FileJson,
  ShieldBan,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import {
  buildPrivateTesterEnvMutationPlan,
  evaluatePrivateTesterAccess,
  type PrivateTesterConfigSummary,
} from "@/lib/private-tester-access";
import type {
  PrivateTesterDashboardData,
  PrivateTesterDataSummary,
} from "@/lib/private-tester-admin";

function buildEnvLikeConfig(config: PrivateTesterConfigSummary) {
  return {
    NEXT_PUBLIC_PRIVATE_TESTER_FREE_ACCESS: config.freeAccess ? "1" : "0",
    NEXT_PUBLIC_PRIVATE_TESTER_GUEST_SYMPTOM_CHECKER: config.guestSymptomChecker
      ? "1"
      : "0",
    NEXT_PUBLIC_PRIVATE_TESTER_INVITE_ONLY: config.inviteOnly ? "1" : "0",
    NEXT_PUBLIC_PRIVATE_TESTER_MODE: config.modeEnabled ? "1" : "0",
    PRIVATE_TESTER_ALLOWED_EMAILS: (config.allowedEmails ?? []).join(","),
    PRIVATE_TESTER_BLOCKED_EMAILS: (config.blockedEmails ?? []).join(","),
  };
}

function renderEnvValue(values: string[]) {
  return values.length > 0 ? values.join(", ") : "(empty)";
}

function formatWhen(value: string | null) {
  if (!value) {
    return "not recorded";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusTone(tester: PrivateTesterDataSummary) {
  if (tester.adminState.accessDisabled || tester.access.blocked) {
    return "bg-red-100 text-red-800";
  }

  if (tester.access.allowed) {
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-amber-100 text-amber-800";
}

function accessStatusTone(access: PrivateTesterDataSummary["access"]) {
  if (access.blocked) {
    return "bg-red-100 text-red-800";
  }

  if (access.allowed) {
    return "bg-emerald-100 text-emerald-800";
  }

  return "bg-amber-100 text-amber-800";
}

function buildBusyKey(email: string, action: string) {
  return `${action}:${email}`;
}

function downloadSafeSummary(tester: PrivateTesterDataSummary) {
  const safeSlug = (tester.user.email ?? tester.user.id)
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          tester,
        },
        null,
        2
      ),
    ],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeSlug || "private-tester"}-safe-summary.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TesterAccessDashboardClient({
  initialData,
}: {
  initialData: PrivateTesterDashboardData;
}) {
  const [dashboard, setDashboard] = useState(initialData);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshDashboard() {
    const response = await fetch("/api/admin/private-tester", {
      cache: "no-store",
    });
    const payload = (await response.json()) as PrivateTesterDashboardData & {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Failed to refresh tester dashboard");
    }

    setDashboard(payload);
  }

  async function runAdminAction(
    email: string,
    action:
      | "disable_access"
      | "restore_access"
      | "mark_deletion"
      | "clear_deletion_mark"
  ) {
    const nextBusyKey = buildBusyKey(email, action);
    setBusyKey(nextBusyKey);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/private-tester", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          email,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        summary?: PrivateTesterDataSummary;
      };

      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || "Admin update failed");
      }

      await refreshDashboard();

      const actionMessage = {
        clear_deletion_mark: `Cleared deletion-request marker for ${email}.`,
        disable_access: `Disabled sign-in access for ${email}.`,
        mark_deletion: `Marked ${email} for deletion follow-up.`,
        restore_access: `Restored sign-in access for ${email}.`,
      } satisfies Record<typeof action, string>;

      setMessage(actionMessage[action]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Tester admin update failed"
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function runDelete(email: string, dryRun: boolean) {
    const nextBusyKey = buildBusyKey(email, dryRun ? "dry_run_delete" : "delete");
    setBusyKey(nextBusyKey);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/private-tester", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          dryRun,
          email,
        }),
      });
      const payload = (await response.json()) as {
        deleted?: boolean;
        dryRun?: boolean;
        error?: string;
        summary?: PrivateTesterDataSummary;
      };

      if (!response.ok || !payload.summary) {
        throw new Error(payload.error || "Delete request failed");
      }

      if (dryRun) {
        setMessage(
          `Dry run for ${email}: ${payload.summary.counts.symptomChecks} symptom checks, ${payload.summary.counts.negativeFeedbackEntries} flagged negative feedback entries, ${payload.summary.counts.thresholdProposals} threshold proposals.`
        );
      } else {
        setMessage(`Deleted private tester data for ${email}.`);
        await refreshDashboard();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Tester deletion failed"
      );
    } finally {
      setBusyKey(null);
    }
  }

  const configEnv = buildEnvLikeConfig(dashboard.config);
  const knownTesterEmails = new Set(
    dashboard.testers
      .map((tester) => tester.user.email?.toLowerCase())
      .filter((email): email is string => Boolean(email))
  );
  const pendingEmails = Array.from(
    new Set([
      ...(dashboard.config.allowedEmails ?? []),
      ...(dashboard.config.blockedEmails ?? []),
    ])
  )
    .filter((email) => !knownTesterEmails.has(email.toLowerCase()))
    .sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Tester Access Controls
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Invite-only mode, real auth disablement, deletion markers, safe
            summary export, and data deletion controls for the private tester
            release.
          </p>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          Back to Admin
        </Link>
      </div>

      {dashboard.warning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dashboard.warning}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <UserRoundCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Configured Emails
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.total}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Active Access
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.active}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldBan className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Auth Disabled
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.authAccessDisabled}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <FileJson className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Deletion Requested
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.deletionRequested}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <ShieldBan className="h-5 w-5 text-rose-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Blocked Testers
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.blocked}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                Flagged Feedback
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dashboard.summary.negativeFeedbackEntries}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-slate-700" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Current Private Tester Config
            </h2>
            <p className="text-sm text-gray-600">
              Environment-backed allow/block lists still govern invite scope.
              Auth disablement and deletion-request markers add a second founder
              control layer without exposing raw tester content.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
            <p>
              <strong>Mode enabled:</strong>{" "}
              {dashboard.config.modeEnabled ? "Yes" : "No"}
            </p>
            <p>
              <strong>Invite only:</strong>{" "}
              {dashboard.config.inviteOnly ? "Yes" : "No"}
            </p>
            <p>
              <strong>Free access:</strong>{" "}
              {dashboard.config.freeAccess ? "Yes" : "No"}
            </p>
            <p>
              <strong>Guest symptom checker:</strong>{" "}
              {dashboard.config.guestSymptomChecker ? "Yes" : "No"}
            </p>
          </div>

          <div className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-800">
            <div>
              <p className="font-semibold text-slate-900">
                `PRIVATE_TESTER_ALLOWED_EMAILS`
              </p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-700">
                {renderEnvValue(dashboard.config.allowedEmails ?? [])}
              </pre>
            </div>
            <div>
              <p className="font-semibold text-slate-900">
                `PRIVATE_TESTER_BLOCKED_EMAILS`
              </p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-700">
                {renderEnvValue(dashboard.config.blockedEmails ?? [])}
              </pre>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-4">
        {pendingEmails.length > 0 ? (
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">
              Configured Emails Without Profiles Yet
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              These invite or block entries are already live in the current
              environment, but no persisted tester profile was found yet.
            </p>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {pendingEmails.map((email) => {
                const access = evaluatePrivateTesterAccess({ email }, configEnv);
                const disablePlan = buildPrivateTesterEnvMutationPlan(
                  email,
                  "block",
                  configEnv
                );
                const restorePlan = buildPrivateTesterEnvMutationPlan(
                  email,
                  "allow",
                  configEnv
                );
                const removePlan = buildPrivateTesterEnvMutationPlan(
                  email,
                  "remove",
                  configEnv
                );

                return (
                  <div
                    key={email}
                    className="rounded-2xl border border-gray-200 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{email}</p>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${accessStatusTone(
                          access
                        )}`}
                      >
                        {access.blocked
                          ? "Blocked"
                          : access.allowed
                            ? "Invited"
                            : "Not Invited"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-400">
                      Access reason: {access.reason}
                    </p>

                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Disable Access
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(disablePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(disablePlan.blockedEmails)}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Restore Access
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(restorePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(restorePlan.blockedEmails)}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Remove Invite
                        </p>
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(removePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(removePlan.blockedEmails)}`}
                        </pre>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {dashboard.testers.map((tester) => {
          const email = tester.user.email ?? "";
          const disablePlan = buildPrivateTesterEnvMutationPlan(
            email,
            "block",
            configEnv
          );
          const restorePlan = buildPrivateTesterEnvMutationPlan(
            email,
            "allow",
            configEnv
          );
          const removePlan = buildPrivateTesterEnvMutationPlan(
            email,
            "remove",
            configEnv
          );

          return (
            <section
              key={tester.user.id}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {tester.user.fullName || tester.user.email || tester.user.id}
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(
                        tester
                      )}`}
                    >
                      {tester.adminState.accessDisabled || tester.access.blocked
                        ? "Blocked"
                        : tester.access.allowed
                          ? "Invited"
                          : "Not Invited"}
                    </span>
                    {tester.adminState.accessDisabled ? (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                        Auth disabled
                      </span>
                    ) : null}
                    {tester.adminState.deletionRequested ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        Deletion requested
                      </span>
                    ) : null}
                    {tester.access.freeAccess ? (
                      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                        Free access
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{email}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-400">
                    Access reason: {tester.access.reason}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSafeSummary(tester)}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4" />
                    Export Safe Summary
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAdminAction(
                        email,
                        tester.adminState.accessDisabled
                          ? "restore_access"
                          : "disable_access"
                      )
                    }
                    disabled={
                      !email ||
                      busyKey ===
                        buildBusyKey(
                          email,
                          tester.adminState.accessDisabled
                            ? "restore_access"
                            : "disable_access"
                        )
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <ShieldBan className="h-4 w-4" />
                    {tester.adminState.accessDisabled
                      ? "Restore Access"
                      : "Disable Access"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAdminAction(
                        email,
                        tester.adminState.deletionRequested
                          ? "clear_deletion_mark"
                          : "mark_deletion"
                      )
                    }
                    disabled={
                      !email ||
                      busyKey ===
                        buildBusyKey(
                          email,
                          tester.adminState.deletionRequested
                            ? "clear_deletion_mark"
                            : "mark_deletion"
                        )
                    }
                    className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <FileJson className="h-4 w-4" />
                    {tester.adminState.deletionRequested
                      ? "Clear Deletion Mark"
                      : "Mark for Deletion"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runDelete(email, true)}
                    disabled={
                      !email ||
                      busyKey === buildBusyKey(email, "dry_run_delete")
                    }
                    className="inline-flex items-center rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Dry-Run Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => runDelete(email, false)}
                    disabled={!email || busyKey === buildBusyKey(email, "delete")}
                    className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Data
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-6">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Symptom Checks
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {tester.counts.symptomChecks}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Negative Feedback
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {tester.counts.negativeFeedbackEntries}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Threshold Proposals
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {tester.counts.thresholdProposals}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Pets
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900">
                    {tester.counts.pets}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Auth Access
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {tester.adminState.accessDisabled ? "Disabled" : "Active"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatWhen(tester.adminState.accessDisabledAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    Deletion Status
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">
                    {tester.adminState.deletionRequested ? "Marked" : "Clear"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatWhen(tester.adminState.deletionRequestedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Founder Control Audit
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Real auth disablement and deletion markers are stored in
                    admin-only metadata. The safe export uses the sanitized
                    tester summary shown on this page.
                  </p>
                  <div className="mt-3 space-y-2">
                    {tester.adminState.auditLog.length > 0 ? (
                      tester.adminState.auditLog.map((event) => (
                        <div
                          key={`${tester.user.id}-${event.action}-${event.at}`}
                          className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700"
                        >
                          <p className="font-semibold text-slate-900">
                            {event.action}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatWhen(event.at)}
                            {event.actorEmail ? ` • ${event.actorEmail}` : ""}
                          </p>
                          {event.note ? (
                            <p className="mt-2 text-sm text-slate-700">
                              {event.note}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">
                        No founder actions recorded for this tester yet.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Recent Tester Cases
                  </h3>
                  <div className="mt-3 space-y-3">
                    {tester.recentCases.length > 0 ? (
                      tester.recentCases.map((recentCase) => (
                        <div
                          key={recentCase.symptomCheckId}
                          className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {recentCase.petName || "Unnamed dog"}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              {recentCase.severity || "unknown"}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              {recentCase.recommendation || "n/a"}
                            </span>
                            {recentCase.negativeFeedbackFlagged ? (
                              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                                Negative feedback flagged
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            Symptom check: {recentCase.symptomCheckId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Created: {recentCase.createdAt || "unknown"}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-500">
                        No recent tester cases found for this account.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Invite Env Control Snippets
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Use these values when you need to disable, restore, or fully
                    remove this tester from the invite-only release at the
                    environment layer.
                  </p>

                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Disable Access
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(disablePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(disablePlan.blockedEmails)}`}
                      </pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Restore Access
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(restorePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(restorePlan.blockedEmails)}`}
                      </pre>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                        Remove Invite
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
{`PRIVATE_TESTER_ALLOWED_EMAILS=${renderEnvValue(removePlan.allowedEmails)}
PRIVATE_TESTER_BLOCKED_EMAILS=${renderEnvValue(removePlan.blockedEmails)}`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          );
        })}

        {dashboard.testers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No configured tester emails were found in the current private tester
            allow/block lists.
          </div>
        ) : null}
      </div>
    </div>
  );
}
