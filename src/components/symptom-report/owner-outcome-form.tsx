"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import Card from "@/components/ui/card";

type MatchedExpectation = "yes" | "partly" | "no";

// Mirror the server zod limits in src/app/api/ai/outcome-feedback/route.ts.
const CONFIRMED_DIAGNOSIS_MAX = 2000;
const VET_OUTCOME_MAX = 2000;
const OWNER_NOTES_MAX = 4000;

interface OwnerOutcomeFormProps {
  symptomCheckId?: string | null;
}

interface OutcomeFeedbackSubmitResponse {
  ok?: boolean;
  proposalCreated?: boolean;
}

function getSafeOutcomeErrorMessage(status: number) {
  switch (status) {
    case 400:
      return "Please review your update and try again.";
    case 401:
      return "Please sign in again to share an outcome.";
    case 403:
    case 404:
      return "We could not link this update to a saved report.";
    case 429:
      return "You're sending updates too quickly. Please try again shortly.";
    default:
      return "Outcome updates are temporarily unavailable. Please try again shortly.";
  }
}

function ChoiceButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

export function OwnerOutcomeForm({ symptomCheckId }: OwnerOutcomeFormProps) {
  const [matchedExpectation, setMatchedExpectation] =
    useState<MatchedExpectation | null>(null);
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState("");
  const [vetOutcome, setVetOutcome] = useState("");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [proposalCreated, setProposalCreated] = useState(false);

  if (!symptomCheckId) {
    return null;
  }

  const submit = async () => {
    if (saveState === "saving") {
      return;
    }
    if (!matchedExpectation) {
      setErrorMessage("Please choose whether this matched what happened.");
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      const trimmedDiagnosis = confirmedDiagnosis.trim();
      const trimmedVetOutcome = vetOutcome.trim();
      const trimmedNotes = ownerNotes.trim();

      const response = await fetch("/api/ai/outcome-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptomCheckId,
          matchedExpectation,
          ...(trimmedDiagnosis ? { confirmedDiagnosis: trimmedDiagnosis } : {}),
          ...(trimmedVetOutcome ? { vetOutcome: trimmedVetOutcome } : {}),
          ...(trimmedNotes ? { ownerNotes: trimmedNotes } : {}),
        }),
      });

      const payload = (await response
        .json()
        .catch(() => ({}))) as OutcomeFeedbackSubmitResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(getSafeOutcomeErrorMessage(response.status));
      }

      setProposalCreated(Boolean(payload.proposalCreated));
      setSaveState("saved");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this update right now"
      );
      setSaveState("error");
    }
  };

  return (
    <Card className="border border-emerald-100 bg-emerald-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
          <ClipboardCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Did this match what happened?
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              If you&apos;ve since seen a vet or learned what was going on, let us
              know. Your update helps calibrate future triage and is reviewed by
              our clinical team.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">
              Did the outcome match this assessment?
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={matchedExpectation === "yes"}
                label="Yes, it matched"
                onClick={() => setMatchedExpectation("yes")}
              />
              <ChoiceButton
                active={matchedExpectation === "partly"}
                label="Partly"
                onClick={() => setMatchedExpectation("partly")}
              />
              <ChoiceButton
                active={matchedExpectation === "no"}
                label="No, it was different"
                onClick={() => setMatchedExpectation("no")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`owner-outcome-diagnosis-${symptomCheckId}`}
              className="text-sm font-medium text-gray-900"
            >
              Confirmed diagnosis (optional)
            </label>
            <input
              id={`owner-outcome-diagnosis-${symptomCheckId}`}
              type="text"
              value={confirmedDiagnosis}
              maxLength={CONFIRMED_DIAGNOSIS_MAX}
              onChange={(event) => setConfirmedDiagnosis(event.target.value)}
              placeholder="What did the vet diagnose?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`owner-outcome-vet-${symptomCheckId}`}
              className="text-sm font-medium text-gray-900"
            >
              What did the vet do? (optional)
            </label>
            <input
              id={`owner-outcome-vet-${symptomCheckId}`}
              type="text"
              value={vetOutcome}
              maxLength={VET_OUTCOME_MAX}
              onChange={(event) => setVetOutcome(event.target.value)}
              placeholder="Treatment, tests, or next steps"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`owner-outcome-notes-${symptomCheckId}`}
              className="text-sm font-medium text-gray-900"
            >
              Anything else? (optional)
            </label>
            <textarea
              id={`owner-outcome-notes-${symptomCheckId}`}
              value={ownerNotes}
              maxLength={OWNER_NOTES_MAX}
              onChange={(event) => setOwnerNotes(event.target.value)}
              rows={3}
              placeholder="How is your dog doing now?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={saveState === "saving" || saveState === "saved"}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === "saving"
                ? "Sharing..."
                : saveState === "saved"
                  ? "Update shared"
                  : "Share outcome"}
            </button>

            {saveState === "saved" ? (
              <span className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {proposalCreated
                  ? "Thank you — your report was flagged for clinical review."
                  : "Thank you — your update was saved."}
              </span>
            ) : null}

            {saveState === "error" && errorMessage ? (
              <span className="inline-flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {errorMessage}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
