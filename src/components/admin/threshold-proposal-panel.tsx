"use client";

import { useState } from "react";
import type {
  ThresholdProposalDashboardData,
  ThresholdProposalRecord,
  ThresholdProposalStatus,
} from "@/lib/admin-threshold-proposals";
import { summarizeThresholdProposals } from "@/lib/admin-threshold-proposals";

interface DraftResult {
  draft: {
    body: string;
    filePath: string;
    title: string;
  };
  mode: "github" | "preview";
  url?: string;
}

interface ThresholdProposalPanelProps {
  initialData: ThresholdProposalDashboardData;
}

function statusClasses(status: ThresholdProposalStatus) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "superseded":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

function proposalTypeLabel(proposal: ThresholdProposalRecord) {
  return proposal.proposalType === "threshold_review"
    ? "Threshold review"
    : "Calibration review";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function ThresholdProposalPanel({
  initialData,
}: ThresholdProposalPanelProps) {
  const [proposals, setProposals] = useState(initialData.proposals);
  const [reviewerNotes, setReviewerNotes] = useState<Record<string, string>>(
    Object.fromEntries(
      initialData.proposals.map((proposal) => [proposal.id, proposal.reviewerNotes])
    )
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [draftState, setDraftState] = useState<{
    message: string;
    result: DraftResult | null;
    status: "idle" | "submitting" | "success" | "error";
  }>({
    message: "",
    result: null,
    status: "idle",
  });

  const summary = summarizeThresholdProposals(proposals);
  const approvedProposalIds = proposals
    .filter((proposal) => proposal.status === "approved")
    .map((proposal) => proposal.id);

  async function reviewProposal(
    proposalId: string,
    status: Extract<ThresholdProposalStatus, "approved" | "rejected" | "superseded">
  ) {
    setSavingId(proposalId);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/threshold-proposals", {
        body: JSON.stringify({
          proposalId,
          reviewerNotes: reviewerNotes[proposalId] || "",
          status,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save review");
      }

      setProposals((current) =>
        current.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                reviewerNotes: payload.proposal.reviewerNotes,
                status: payload.proposal.status,
                updatedAt: payload.proposal.updatedAt,
              }
            : proposal
        )
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save review"
      );
    } finally {
      setSavingId(null);
    }
  }

  async function createDraftPullRequest() {
    setDraftState({
      message: "",
      result: null,
      status: "submitting",
    });

    try {
      const response = await fetch("/api/admin/threshold-proposals/pr-draft", {
        body: JSON.stringify({
          proposalIds: approvedProposalIds,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create draft PR");
      }

      setDraftState({
        message:
          payload.mode === "github"
            ? "Draft PR created. Merge remains blocked until a human engineer and a clinical reviewer approve it."
            : "Preview draft generated. Add GitHub credentials to create the draft PR remotely.",
        result: {
          draft: {
            body: payload.draft.body,
            filePath: payload.draft.filePath,
            title: payload.draft.title,
          },
          mode: payload.mode,
          url: payload.url,
        },
        status: "success",
      });
    } catch (error) {
      setDraftState({
        message:
          error instanceof Error ? error.message : "Failed to create draft PR",
        result: null,
        status: "error",
      });
    }
  }

  return (
    <section className="mt-6 rounded-lg bg-white p-6 shadow">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Threshold Proposal Review
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Proposal drafts stay observational until a human engineer and a
            clinical reviewer approve a follow-up implementation path. This
            dashboard only records review notes and can generate a draft PR
            summary for manual follow-through.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={approvedProposalIds.length === 0 || draftState.status === "submitting"}
          onClick={createDraftPullRequest}
          type="button"
        >
          {draftState.status === "submitting"
            ? "Creating Draft..."
            : `Create Draft PR (${summary.readyForDraftPr})`}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-500">Total Proposals</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {summary.total}
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-700">Awaiting Review</p>
          <p className="mt-2 text-2xl font-semibold text-amber-900">
            {summary.draft}
          </p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-700">Approved</p>
          <p className="mt-2 text-2xl font-semibold text-green-900">
            {summary.approved}
          </p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-700">Review Mix</p>
          <p className="mt-2 text-sm font-semibold text-sky-900">
            {summary.thresholdReview} threshold / {summary.calibrationReview} calibration
          </p>
        </div>
      </div>

      {draftState.status !== "idle" && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm ${
            draftState.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <p className="font-medium">{draftState.message}</p>
          {draftState.result?.url ? (
            <a
              className="mt-2 inline-block text-sm font-semibold text-indigo-600 underline"
              href={draftState.result.url}
              rel="noreferrer"
              target="_blank"
            >
              Open Draft PR
            </a>
          ) : null}
          {draftState.result ? (
            <div className="mt-3 rounded-md bg-white p-3 text-xs text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">Draft title:</span>{" "}
                {draftState.result.draft.title}
              </p>
              <p className="mt-1">
                <span className="font-semibold text-slate-800">Batch file:</span>{" "}
                {draftState.result.draft.filePath}
              </p>
              <pre className="mt-3 overflow-auto rounded bg-slate-950 p-3 text-slate-100">
                {draftState.result.draft.body}
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {errorMessage ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {proposals.map((proposal) => (
          <article
            className="rounded-lg border border-slate-200 p-5"
            key={proposal.id}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    {proposal.summary}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(proposal.status)}`}
                  >
                    {proposal.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {proposalTypeLabel(proposal)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{proposal.rationale}</p>
              </div>
              <div className="text-xs text-slate-500">
                <p>Created {formatDate(proposal.createdAt)}</p>
                <p className="mt-1">Updated {formatDate(proposal.updatedAt)}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Signal</p>
                <p className="mt-1">
                  Match: {proposal.feedback?.matchedExpectation || "unknown"}
                </p>
                <p className="mt-1">
                  Severity: {proposal.feedback?.reportSeverity || "unknown"}
                </p>
                <p className="mt-1">
                  Recommendation: {proposal.feedback?.reportRecommendation || "unknown"}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Clinical context</p>
                <p className="mt-1">
                  Diagnosis: {proposal.feedback?.confirmedDiagnosis || "Not recorded"}
                </p>
                <p className="mt-1">
                  Vet outcome: {proposal.feedback?.vetOutcome || "Not recorded"}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Symptoms</p>
                <p className="mt-1">
                  {proposal.feedback?.symptomSummary || "No symptom summary stored."}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Owner notes</p>
                <p className="mt-1">
                  {proposal.feedback?.ownerNotes || "No owner notes recorded."}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label
                className="block text-sm font-medium text-slate-900"
                htmlFor={`reviewer-notes-${proposal.id}`}
              >
                Reviewer Notes
              </label>
              <textarea
                className="mt-2 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                id={`reviewer-notes-${proposal.id}`}
                onChange={(event) =>
                  setReviewerNotes((current) => ({
                    ...current,
                    [proposal.id]: event.target.value,
                  }))
                }
                rows={4}
                value={reviewerNotes[proposal.id] || ""}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-green-300"
                disabled={savingId === proposal.id}
                onClick={() => reviewProposal(proposal.id, "approved")}
                type="button"
              >
                {savingId === proposal.id ? "Saving..." : "Approve"}
              </button>
              <button
                className="rounded-md bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                disabled={savingId === proposal.id}
                onClick={() => reviewProposal(proposal.id, "rejected")}
                type="button"
              >
                {savingId === proposal.id ? "Saving..." : "Reject"}
              </button>
              <button
                className="rounded-md bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={savingId === proposal.id}
                onClick={() => reviewProposal(proposal.id, "superseded")}
                type="button"
              >
                {savingId === proposal.id ? "Saving..." : "Mark Superseded"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
