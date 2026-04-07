"use client";

import { useEffect, useMemo, useState } from "react";

interface OutcomeFeedbackFormProps {
  check_id?: string | null;
}

type VetConfirmedValue = "yes" | "no";
type SubmitState = "idle" | "submitting" | "success" | "error";

export function OutcomeFeedbackForm({ check_id }: OutcomeFeedbackFormProps) {
  const [reportedDiagnosis, setReportedDiagnosis] = useState("");
  const [vetConfirmed, setVetConfirmed] = useState<VetConfirmedValue>("yes");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const storageKey = useMemo(() => {
    if (!check_id) return null;
    return `outcome-feedback-submitted:${check_id}`;
  }, [check_id]);

  useEffect(() => {
    if (!storageKey) return;
    const submitted = window.localStorage.getItem(storageKey) === "true";
    if (submitted) {
      setAlreadySubmitted(true);
      setSubmitState("success");
    }
  }, [storageKey]);

  if (!check_id) return null;

  const disabled = alreadySubmitted || submitState === "submitting";

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    setSubmitState("submitting");
    try {
      const response = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check_id,
          reported_diagnosis: reportedDiagnosis.trim(),
          vet_confirmed: vetConfirmed === "yes",
          outcome_notes: outcomeNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Outcome submission failed");
      }

      if (storageKey) {
        window.localStorage.setItem(storageKey, "true");
      }
      setAlreadySubmitted(true);
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  };

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="text-sm font-semibold text-gray-900">Outcome Feedback</h3>
      <p className="mt-1 text-xs text-gray-600">
        Share your vet visit outcome so we can improve future differential quality.
      </p>

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900" htmlFor="reported_diagnosis">
            Reported diagnosis
          </label>
          <input
            id="reported_diagnosis"
            value={reportedDiagnosis}
            onChange={(e) => setReportedDiagnosis(e.target.value)}
            disabled={disabled}
            required
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Example: otitis externa"
          />
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-gray-900">Vet confirmed?</p>
          <div className="flex gap-2">
            {(["yes", "no"] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => setVetConfirmed(value)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  vetConfirmed === value
                    ? "border-emerald-500 bg-emerald-100 text-emerald-800"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {value === "yes" ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-900" htmlFor="outcome_notes">
            Outcome notes (optional)
          </label>
          <textarea
            id="outcome_notes"
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            disabled={disabled}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            placeholder="Any vet findings, ruled-out conditions, or treatment notes."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={disabled}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitState === "submitting"
              ? "Submitting..."
              : alreadySubmitted
              ? "Already Submitted"
              : "Submit Feedback"}
          </button>

          {submitState === "success" && (
            <p className="text-sm text-emerald-700">
              Thank you — this helps improve future diagnoses
            </p>
          )}
          {submitState === "error" && (
            <p className="text-sm text-red-600">Could not submit feedback. Please try again.</p>
          )}
        </div>
      </form>
    </section>
  );
}
