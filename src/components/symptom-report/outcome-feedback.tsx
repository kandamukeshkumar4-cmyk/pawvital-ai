"use client";

import { useState } from "react";
import { Heart, CheckCheck } from "lucide-react";
import { CollapsibleSection } from "./collapsible-section";
import type { SymptomReport } from "./types";

interface OutcomeFeedbackSectionProps {
  report: SymptomReport;
  onSubmit?: (payload: {
    symptomCheckId: string;
    matchedExpectation: "yes" | "partly" | "no";
    confirmedDiagnosis: string;
    vetOutcome: string;
    ownerNotes: string;
  }) => void | Promise<void>;
}

export function OutcomeFeedbackSection({
  report,
  onSubmit,
}: OutcomeFeedbackSectionProps) {
  const [feedbackState, setFeedbackState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [matchedExpectation, setMatchedExpectation] = useState<
    "yes" | "partly" | "no"
  >("partly");
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState("");
  const [vetOutcome, setVetOutcome] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");

  if (!report.outcome_feedback_enabled || !report.report_storage_id) {
    return null;
  }

  const submitOutcomeFeedback = async () => {
    if (!report.report_storage_id || feedbackState === "saving") return;

    if (onSubmit) {
      setFeedbackState("saving");
      try {
        await onSubmit({
          symptomCheckId: report.report_storage_id,
          matchedExpectation,
          confirmedDiagnosis,
          vetOutcome,
          ownerNotes,
        });
        setFeedbackState("saved");
      } catch {
        setFeedbackState("error");
      }
      return;
    }

    setFeedbackState("saving");
    try {
      const response = await fetch("/api/ai/outcome-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptomCheckId: report.report_storage_id,
          matchedExpectation,
          confirmedDiagnosis,
          vetOutcome,
          ownerNotes,
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback request failed");
      }

      setFeedbackState("saved");
    } catch {
      setFeedbackState("error");
    }
  };

  return (
    <CollapsibleSection
      title="After Your Vet Visit"
      icon={Heart}
      iconColor="text-emerald-600"
      defaultOpen={false}
    >
      <div className="space-y-4 mt-2">
        <p className="text-sm text-gray-600">
          Sharing the confirmed outcome helps PawVital get better at thresholds,
          retrieval quality, and ambiguity handling over time. These entries now
          feed reviewable proposal drafts rather than automatic threshold changes.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            How close was this report to what your vet said?
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["yes", "Very close"],
                ["partly", "Partly right"],
                ["no", "Not close"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMatchedExpectation(value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  matchedExpectation === value
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Confirmed diagnosis
            </label>
            <input
              value={confirmedDiagnosis}
              onChange={(event) => setConfirmedDiagnosis(event.target.value)}
              placeholder="Example: otitis externa"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">
              Vet outcome
            </label>
            <input
              value={vetOutcome}
              onChange={(event) => setVetOutcome(event.target.value)}
              placeholder="Example: ear cytology + meds prescribed"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-1">
            Notes
          </label>
          <textarea
            value={ownerNotes}
            onChange={(event) => setOwnerNotes(event.target.value)}
            rows={3}
            placeholder="Anything useful that the vet found, ruled out, or corrected."
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitOutcomeFeedback}
            disabled={feedbackState === "saving" || feedbackState === "saved"}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            {feedbackState === "saved" ? (
              <CheckCheck className="w-4 h-4" />
            ) : null}
            {feedbackState === "saving"
              ? "Saving..."
              : feedbackState === "saved"
                ? "Feedback Saved"
                : "Save Outcome Feedback"}
          </button>
          {feedbackState === "error" && (
            <span className="text-sm text-red-600">
              I couldn&apos;t save that right now. Please try again in a moment.
            </span>
          )}
          {feedbackState === "saved" && (
            <span className="text-sm text-emerald-700">
              Thanks. This case can now be used for future quality review and
              proposal drafting.
            </span>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
