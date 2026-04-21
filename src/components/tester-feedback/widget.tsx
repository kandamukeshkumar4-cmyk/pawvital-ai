"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareHeart,
} from "lucide-react";
import Card from "@/components/ui/card";
import {
  TESTER_FEEDBACK_CONFUSING_AREA_VALUES,
  type TesterFeedbackConfusingArea,
  type TesterFeedbackHelpfulness,
  type TesterFeedbackSurface,
  type TesterFeedbackTrustLevel,
} from "@/lib/tester-feedback-contract";

const CONFUSING_AREA_LABELS: Record<TesterFeedbackConfusingArea, string> = {
  questions: "Questions",
  result: "Result",
  wording: "Wording",
  next_steps: "Next steps",
  report: "Report",
  other: "Other",
};

interface TesterFeedbackWidgetProps {
  symptomCheckId?: string | null;
  reportTitle?: string | null;
  urgencyLabel?: string | null;
  surface?: TesterFeedbackSurface;
}

function ChoiceButton<T extends string>({
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
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

export function TesterFeedbackWidget({
  symptomCheckId,
  reportTitle,
  urgencyLabel,
  surface = "result_page",
}: TesterFeedbackWidgetProps) {
  const [helpfulness, setHelpfulness] =
    useState<TesterFeedbackHelpfulness>("somewhat");
  const [trustLevel, setTrustLevel] = useState<TesterFeedbackTrustLevel>("yes");
  const [confusingAreas, setConfusingAreas] = useState<
    TesterFeedbackConfusingArea[]
  >([]);
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);

  if (!symptomCheckId) {
    return null;
  }

  const toggleConfusingArea = (area: TesterFeedbackConfusingArea) => {
    setConfusingAreas((current) =>
      current.includes(area)
        ? current.filter((value) => value !== area)
        : [...current, area]
    );
  };

  const submit = async () => {
    if (saveState === "saving") {
      return;
    }

    setSaveState("saving");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/outcome-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symptomCheckId,
          helpfulness,
          confusingAreas,
          trustLevel,
          notes,
          surface,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        case?: { flagged?: boolean };
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Unable to save feedback");
      }

      setFlagged(Boolean(payload.case?.flagged));
      setSaveState("saved");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save feedback right now"
      );
      setSaveState("error");
    }
  };

  return (
    <Card className="border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-blue-100 p-2 text-blue-700">
          <MessageSquareHeart className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Private tester feedback
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Tell us whether this {reportTitle ? `"${reportTitle}"` : "result"}{" "}
              felt useful. Emergency and confusing cases are automatically
              flagged so they are easier to review.
            </p>
            {urgencyLabel ? (
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-blue-700">
                Urgency: {urgencyLabel}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">Was this helpful?</p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={helpfulness === "yes"}
                label="Yes"
                onClick={() => setHelpfulness("yes")}
              />
              <ChoiceButton
                active={helpfulness === "somewhat"}
                label="Somewhat"
                onClick={() => setHelpfulness("somewhat")}
              />
              <ChoiceButton
                active={helpfulness === "no"}
                label="No"
                onClick={() => setHelpfulness("no")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">
              What, if anything, was confusing?
            </p>
            <div className="flex flex-wrap gap-2">
              {TESTER_FEEDBACK_CONFUSING_AREA_VALUES.map((area) => (
                <ChoiceButton
                  key={area}
                  active={confusingAreas.includes(area)}
                  label={CONFUSING_AREA_LABELS[area]}
                  onClick={() => toggleConfusingArea(area)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-900">
              Would you trust this for your dog?
            </p>
            <div className="flex flex-wrap gap-2">
              <ChoiceButton
                active={trustLevel === "yes"}
                label="Yes"
                onClick={() => setTrustLevel("yes")}
              />
              <ChoiceButton
                active={trustLevel === "not_sure"}
                label="Not sure"
                onClick={() => setTrustLevel("not_sure")}
              />
              <ChoiceButton
                active={trustLevel === "no"}
                label="No"
                onClick={() => setTrustLevel("no")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor={`tester-feedback-${symptomCheckId}`}
              className="text-sm font-medium text-gray-900"
            >
              Optional notes
            </label>
            <textarea
              id={`tester-feedback-${symptomCheckId}`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="What felt clear, confusing, or missing?"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={saveState === "saving" || saveState === "saved"}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Feedback saved"
                  : "Send feedback"}
            </button>

            {saveState === "saved" ? (
              <span className="inline-flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {flagged
                  ? "Saved and flagged for follow-up review."
                  : "Saved. Thanks for helping improve PawVital."}
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
