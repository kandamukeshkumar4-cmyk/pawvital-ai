"use client";

import { useRef, useState } from "react";
import { Download, Share2, Copy, CheckCheck } from "lucide-react";
import type { SymptomReport } from "./types";
import { UrgencyHero } from "./urgency-hero";
import { WhatsHappeningSection } from "./whats-happening";
import { UrgencyRationaleSection } from "./urgency-rationale";
import { WhatItCouldBeSection } from "./what-it-could-be";
import { VetHandoffCard } from "./vet-handoff-card";
import { ReferenceImagesSection } from "./reference-images";
import { RecommendedTestsSection } from "./recommended-tests";
import { HomeCareSection } from "./home-care";
import { ActionStepsSection } from "./action-steps";
import { OutcomeFeedbackSection } from "./outcome-feedback";
import { NearestVetFinder } from "./nearest-vet-finder";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  buildReportPresentation,
  type ShareExpiryOption,
} from "./report-presentation";

type CopyState = "idle" | "copied" | "error";

const URGENCY_TIMEFRAME: Record<SymptomReport["recommendation"], string> = {
  monitor: "monitoring at home",
  vet_48h: "48 hours",
  vet_24h: "24 hours",
  emergency_vet: "right now",
};

function buildHeroSubtitle(report: SymptomReport): string {
  const topDifferential = report.differential_diagnoses?.find((dx) =>
    dx.condition?.trim(),
  )?.condition;
  if (topDifferential) {
    return `Most likely: ${topDifferential.trim()}. A vet exam confirms the cause.`;
  }
  const explanation = report.explanation?.trim();
  if (explanation) {
    const firstSentence = explanation.split(/(?<=[.!?])\s/)[0];
    return firstSentence?.trim() ?? "";
  }
  return "";
}

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
    report.outcome_feedback_enabled !== false;

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
      <UrgencyHero
        report={report}
        tone={presentation.tone}
        recommendationLabel={presentation.recommendationLabel}
        subtitle={buildHeroSubtitle(report)}
        headerActions={headerActions}
      />

      <WhatsHappeningSection explanation={report.explanation} />

      <UrgencyRationaleSection
        rationale={report.urgency_rationale}
        heading={`Why a vet — and why within ${URGENCY_TIMEFRAME[report.recommendation]}`}
      />

      <WhatItCouldBeSection
        bayesian={report.bayesian_differentials}
        differentials={report.differential_diagnoses}
      />

      <ActionStepsSection
        actions={report.actions}
        actionTitle={presentation.actionTitle}
        warningSigns={report.warning_signs}
        warningTitle="Go sooner if you notice"
      />

      <div ref={handoffRef}>
        <VetHandoffCard
          intro={presentation.vetHandoffIntro}
          summary={report.vet_handoff_summary ?? ""}
          copyState={copyState}
          onCopy={copyVetSummary}
        />
      </div>

      {!readOnlyShared &&
        (report.recommendation === "emergency_vet" ||
          report.severity === "emergency") && <NearestVetFinder />}

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

      {report.recommended_tests && report.recommended_tests.length > 0 && (
        <RecommendedTestsSection tests={report.recommended_tests} />
      )}

      {report.home_care && report.home_care.length > 0 && (
        <HomeCareSection items={report.home_care} />
      )}

      {report.reference_images && report.reference_images.length > 0 && (
        <ReferenceImagesSection images={report.reference_images} />
      )}

      {!readOnlyShared ? (
        <div ref={feedbackRef}>
          {feedbackEnabled ? (
            <OutcomeFeedbackSection report={report} />
          ) : (
            <Card className="border border-dashed border-emerald-300 bg-emerald-50/70 p-4">
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-emerald-900">
                  Feedback for this report
                </p>
                <p className="text-sm leading-6 text-emerald-900/80">
                  This report is not linked to a saved symptom check yet, so
                  feedback cannot be submitted from this page right now.
                </p>
              </div>
            </Card>
          )}
        </div>
      ) : null}

      <div
        className="p-4 rounded-xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
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
