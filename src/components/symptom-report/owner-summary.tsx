"use client";

import {
  ClipboardList,
  Download,
  Heart,
  MessageSquareMore,
  Share2,
  Stethoscope,
} from "lucide-react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import { formatConfidenceLevelLabel } from "@/lib/report-confidence";
import type { SymptomReport } from "./types";

interface OwnerSummarySectionProps {
  canExport: boolean;
  confidenceCalibration?: SymptomReport["calibrated_confidence"];
  explanation: string;
  feedbackEnabled: boolean;
  limitations: string[];
  pdfBusy?: boolean;
  recommendationLabel: string;
  onCopyVetSummary: () => void | Promise<void>;
  onJumpToHandoff?: () => void;
  onJumpToFeedback?: () => void;
  onDownloadPdf?: () => void;
  onOpenShareModal?: () => void;
  readOnlyShared?: boolean;
}

export function OwnerSummarySection({
  canExport,
  confidenceCalibration,
  explanation,
  feedbackEnabled,
  limitations,
  pdfBusy = false,
  recommendationLabel,
  onCopyVetSummary,
  onJumpToHandoff,
  onJumpToFeedback,
  onDownloadPdf,
  onOpenShareModal,
  readOnlyShared = false,
}: OwnerSummarySectionProps) {
  return (
    <section
      aria-label="Owner summary"
      className="space-y-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Start Here
        </p>
        <h4 className="text-lg font-semibold text-gray-900">
          What this result means for your dog right now
        </h4>
        <p className="text-sm leading-6 text-gray-600">
          {recommendationLabel}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 h-5 w-5 text-blue-600" />
            <div className="space-y-2">
              <h5 className="text-sm font-semibold text-gray-900">
                Why PawVital recommended this
              </h5>
              <p className="text-sm leading-6 text-gray-700">
                {explanation}
              </p>
              {confidenceCalibration ? (
                <p className="text-xs text-gray-500">
                  How certain PawVital is right now:{" "}
                  <span className="font-semibold text-gray-700">
                    {formatConfidenceLevelLabel(
                      confidenceCalibration.confidence_level,
                    )}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card className="border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <Stethoscope className="mt-0.5 h-5 w-5 text-red-600" />
            <div className="space-y-3">
              <div className="space-y-1">
                <h5 className="text-sm font-semibold text-gray-900">
                  What to tell the vet
                </h5>
                <p className="text-sm leading-6 text-gray-700">
                  Bring the clinic handoff so the veterinary team can quickly
                  see the urgency level, key symptom summary, and the red-flag
                  changes that would make this more urgent.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-center sm:w-auto"
                  onClick={() => void onCopyVetSummary()}
                >
                  Copy Clinic Handoff
                </Button>
                {onJumpToHandoff ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    onClick={onJumpToHandoff}
                  >
                    Review the handoff
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 h-5 w-5 text-amber-600" />
            <div className="space-y-2">
              <h5 className="text-sm font-semibold text-gray-900">
                What PawVital still can&apos;t determine
              </h5>
              <ul className="space-y-2 text-sm leading-6 text-gray-700">
                {limitations.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {!readOnlyShared ? (
          <Card className="border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <Share2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div className="w-full space-y-3">
                <div className="space-y-1">
                  <h5 className="text-sm font-semibold text-gray-900">
                    Save or share this report
                  </h5>
                  <p className="text-sm leading-6 text-gray-700">
                    Keep this result handy for check-in, texting, or emailing to
                    your veterinary team.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    onClick={() => void onCopyVetSummary()}
                  >
                    Copy Shareable Summary
                  </Button>
                  {canExport && onDownloadPdf ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center sm:w-auto"
                      onClick={onDownloadPdf}
                      loading={pdfBusy}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Download PDF
                    </Button>
                  ) : null}
                  {canExport && onOpenShareModal ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full justify-center sm:w-auto"
                      onClick={onOpenShareModal}
                    >
                      <Share2 className="mr-1.5 h-4 w-4" />
                      Share Report
                    </Button>
                  ) : null}
                </div>
                {!canExport ? (
                  <p className="text-xs text-gray-500">
                    PDF download and report sharing appear when this saved report
                    is available. You can still copy the shareable summary right
                    now.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        {!readOnlyShared ? (
          <Card className="border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <Heart className="mt-0.5 h-5 w-5 text-rose-600" />
              <div className="w-full space-y-3">
                <div className="space-y-1">
                  <h5 className="text-sm font-semibold text-gray-900">
                    Feedback
                  </h5>
                  <p className="text-sm leading-6 text-gray-700">
                    Let PawVital know whether this result felt useful now, and
                    after a vet visit if you have one.
                  </p>
                </div>
                {onJumpToFeedback ? (
                  <Button
                    type="button"
                    variant={feedbackEnabled ? "primary" : "outline"}
                    size="sm"
                    className="w-full justify-center sm:w-auto"
                    onClick={onJumpToFeedback}
                  >
                    <MessageSquareMore className="mr-1.5 h-4 w-4" />
                    {feedbackEnabled ? "Open Feedback" : "See Feedback Area"}
                  </Button>
                ) : null}
                {!feedbackEnabled ? (
                  <p className="text-xs text-gray-500">
                    Tester feedback tools are still being connected in a
                    parallel lane. The feedback section below stays visible so
                    you know where it will appear.
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
