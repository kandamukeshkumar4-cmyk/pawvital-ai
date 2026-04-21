"use client";

import { useRef, useState } from "react";
import { Download, Share2, Copy, CheckCheck } from "lucide-react";
import type { SymptomReport } from "./types";
import { SeverityHeader } from "./severity-header";
import { ConfidenceCalibrationSection } from "./confidence-calibration";
import { EvidenceSourcesBar } from "./evidence-sources-bar";
import { VetHandoffSection } from "./vet-handoff";
import { DifferentialDiagnoses } from "./differential-diagnoses";
import { ClinicalNotesSection } from "./clinical-notes";
import { EvidenceChainSection } from "./evidence-chain";
import { SimilarCasesSection } from "./similar-cases";
import { ReferenceImagesSection } from "./reference-images";
import { RecommendedTestsSection } from "./recommended-tests";
import { HomeCareSection } from "./home-care";
import { ActionStepsSection } from "./action-steps";
import { VetQuestionsSection } from "./vet-questions";
import { OutcomeFeedbackSection } from "./outcome-feedback";
import { BayesianDifferentials } from "./bayesian-differentials";
import { OwnerSummarySection } from "./owner-summary";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  buildReportPresentation,
  type ShareExpiryOption,
} from "./report-presentation";

type CopyState = "idle" | "copied" | "error";

interface FullReportProps {
  report: SymptomReport;
  onOutcomeFeedback?: (data: {
    symptomCheckId: string;
    matchedExpectation: "yes" | "partly" | "no";
    confirmedDiagnosis: string;
    vetOutcome: string;
    ownerNotes: string;
  }) => void | Promise<void>;
  /** Public shared view: hide owner-only UI */
  readOnlyShared?: boolean;
}

export function FullReport({
  report,
  onOutcomeFeedback,
  readOnlyShared = false,
}: FullReportProps) {
  const presentation = buildReportPresentation(report);
  const handoffRef = useRef<HTMLDivElement | null>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [expiry, setExpiry] = useState<ShareExpiryOption>(() =>
    presentation.defaultExpiry,
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [linkCopyState, setLinkCopyState] = useState<"idle" | "copied">("idle");
  const [pdfBusy, setPdfBusy] = useState(false);
  const actionToneClass =
    presentation.tone === "emergency"
      ? "border-red-600 text-red-700 hover:bg-red-50"
      : presentation.tone === "urgent"
        ? "border-orange-600 text-orange-700 hover:bg-orange-50"
        : "border-emerald-600 text-emerald-700 hover:bg-emerald-50";

  const copyVetSummary = async () => {
    try {
      await navigator.clipboard.writeText(presentation.vetHandoffPacket);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  };

  const canExport =
    !readOnlyShared &&
    Boolean(report.report_storage_id) &&
    isSupabaseConfigured;
  const feedbackEnabled =
    !readOnlyShared &&
    Boolean(report.report_storage_id) &&
    Boolean(report.outcome_feedback_enabled);

  const downloadPdf = async () => {
    if (!canExport || pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          report: shareUrl ? { ...report, share_url: shareUrl } : report,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "PDF download failed",
        );
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition");
      const match = dispo?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "pawvital-report.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(
        e instanceof Error
          ? e.message
          : "Could not download PDF. Sign in and try again.",
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const createShareLink = async () => {
    if (!report.report_storage_id || shareBusy) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await fetch("/api/reports/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          check_id: report.report_storage_id,
          expires_in: expiry,
        }),
      });
      const data = (await res.json()) as {
        share_url?: string;
        expires_at?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not create share link");
      }
      if (data.share_url && data.expires_at) {
        setShareUrl(data.share_url);
        setShareExpiresAt(data.expires_at);
      }
    } catch (e) {
      setShareError(
        e instanceof Error ? e.message : "Could not create share link",
      );
    } finally {
      setShareBusy(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopyState("copied");
      window.setTimeout(() => setLinkCopyState("idle"), 2000);
    } catch {
      setShareError("Could not copy to clipboard");
    }
  };

  const openShareModal = () => {
    setShareModalOpen(true);
    setExpiry(presentation.defaultExpiry);
    setShareError(null);
    setShareUrl(null);
    setShareExpiresAt(null);
    setLinkCopyState("idle");
  };

  const headerActions = canExport ? (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`w-full justify-center gap-1.5 sm:w-auto ${actionToneClass}`}
        onClick={() => void downloadPdf()}
        loading={pdfBusy}
      >
        <Download className="w-4 h-4" />
        <span>{presentation.downloadLabel}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`w-full justify-center sm:w-auto ${actionToneClass}`}
        onClick={openShareModal}
      >
        <Share2 className="w-4 h-4" />
        <span className="ml-1.5">{presentation.shareButtonLabel}</span>
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-4 animate-fade-in sm:space-y-5">
      <SeverityHeader
        banner={presentation.headerBanner}
        recommendationLabel={presentation.recommendationLabel}
        report={report}
        tone={presentation.tone}
        urgencyBody={presentation.urgencyBody}
        urgencyLabel={presentation.urgencyLabel}
        copyState={copyState}
        onCopyVetSummary={copyVetSummary}
        onJumpToHandoff={() =>
          handoffRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
        headerActions={headerActions}
      />

      <ActionStepsSection
        actions={report.actions}
        tone={presentation.tone}
        actionTitle={presentation.actionTitle}
        warningSigns={report.warning_signs}
        warningTitle={presentation.warningTitle}
      />

      <OwnerSummarySection
        canExport={canExport}
        confidenceCalibration={
          report.calibrated_confidence ?? report.confidence_calibration
        }
        explanation={report.explanation}
        feedbackEnabled={feedbackEnabled}
        limitations={presentation.limitations}
        pdfBusy={pdfBusy}
        recommendationLabel={presentation.recommendationLabel}
        onCopyVetSummary={copyVetSummary}
        onJumpToHandoff={
          report.vet_handoff_summary
            ? () =>
                handoffRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
            : undefined
        }
        onJumpToFeedback={
          !readOnlyShared
            ? () =>
                feedbackRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
            : undefined
        }
        onDownloadPdf={() => void downloadPdf()}
        onOpenShareModal={openShareModal}
        readOnlyShared={readOnlyShared}
      />

      <Modal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={presentation.shareModalTitle}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {presentation.shareDescription}
          </p>
          <label className="block text-sm font-medium text-gray-700">
            Link expires after
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ShareExpiryOption)}
              disabled={shareBusy}
            >
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
            </select>
          </label>
          {shareError ? (
            <p className="text-sm text-red-600">{shareError}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void createShareLink()}
              loading={shareBusy}
              disabled={shareBusy}
            >
              {presentation.sharePrimaryLabel}
            </Button>
            {shareUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyShareLink()}
              >
                {linkCopyState === "copied" ? (
                  <CheckCheck className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="ml-1.5">
                  {linkCopyState === "copied" ? "Copied" : "Copy link"}
                </span>
              </Button>
            ) : null}
          </div>
          {shareUrl ? (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-500 break-all">
                {shareUrl}
              </p>
              {shareExpiresAt ? (
                <p className="text-xs text-gray-500 mt-2">
                  Expires:{" "}
                  {new Date(shareExpiresAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>

      <EvidenceSourcesBar report={report} />

      <ConfidenceCalibrationSection
        calibration={report.calibrated_confidence ?? report.confidence_calibration}
      />

      {report.bayesian_differentials &&
        report.bayesian_differentials.length > 0 && (
          <BayesianDifferentials
            bayesian_differentials={report.bayesian_differentials}
          />
        )}

      <div ref={handoffRef}>
        <VetHandoffSection
          intro={presentation.vetHandoffIntro}
          summary={report.vet_handoff_summary ?? ""}
          copyState={copyState}
          onCopy={copyVetSummary}
        />
      </div>

      {report.differential_diagnoses &&
        report.differential_diagnoses.length > 0 && (
          <DifferentialDiagnoses diagnoses={report.differential_diagnoses} />
        )}

      {report.clinical_notes && (
        <ClinicalNotesSection notes={report.clinical_notes} />
      )}

      {report.evidenceChain && report.evidenceChain.length > 0 && (
        <EvidenceChainSection items={report.evidenceChain} />
      )}

      {report.similar_cases && report.similar_cases.length > 0 && (
        <SimilarCasesSection cases={report.similar_cases} />
      )}

      {report.reference_images && report.reference_images.length > 0 && (
        <ReferenceImagesSection images={report.reference_images} />
      )}

      {report.recommended_tests && report.recommended_tests.length > 0 && (
        <RecommendedTestsSection tests={report.recommended_tests} />
      )}

      {report.home_care && report.home_care.length > 0 && (
        <HomeCareSection items={report.home_care} />
      )}

      {report.vet_questions && report.vet_questions.length > 0 && (
        <VetQuestionsSection questions={report.vet_questions} />
      )}

      {!readOnlyShared ? (
        <div ref={feedbackRef}>
          {feedbackEnabled ? (
            <OutcomeFeedbackSection
              report={report}
              onSubmit={onOutcomeFeedback}
            />
          ) : (
            <Card className="border border-dashed border-emerald-300 bg-emerald-50/70 p-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-emerald-900">
                  Feedback for this report
                </p>
                <p className="text-sm leading-6 text-emerald-900/80">
                  Tester feedback tools are still being connected in a parallel
                  lane. This placeholder marks where the private tester feedback
                  widget will appear once it is ready.
                </p>
              </div>
            </Card>
          )}
        </div>
      ) : null}

      {!readOnlyShared && report.system_observability && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            System Notes
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Recent fallbacks: {report.system_observability.fallbackCount ?? 0} |
            Timeouts: {report.system_observability.timeoutCount ?? 0}
          </p>
        </div>
      )}

      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
        <p className="text-xs text-gray-500 leading-relaxed">
          <strong>Medical Disclaimer:</strong> PawVital is an informational
          screening tool and cannot replace a hands-on veterinary exam,
          diagnostic testing, or professional veterinary advice. A licensed
          veterinarian should confirm the cause and safest care plan for your
          dog. If your dog worsens, develops the warning signs above, or seems
          unable to travel safely, contact a veterinary clinic right away.
        </p>
      </div>
    </div>
  );
}
