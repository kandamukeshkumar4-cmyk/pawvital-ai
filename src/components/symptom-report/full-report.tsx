"use client";

import { useRef, useState } from "react";
import { Download, Share2, Copy, CheckCheck } from "lucide-react";
import type { SymptomReport } from "./types";
import { SeverityHeader } from "./severity-header";
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
import Button from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  buildVetHandoffPacket,
  getDefaultClinicLinkExpiry,
  isEscalatedReport,
} from "@/lib/report-handoff";

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

type ExpiryOption = "24h" | "7d" | "30d";

export function FullReport({
  report,
  onOutcomeFeedback,
  readOnlyShared = false,
}: FullReportProps) {
  const handoffRef = useRef<HTMLDivElement | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryOption>(() =>
    getDefaultClinicLinkExpiry(report)
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [linkCopyState, setLinkCopyState] = useState<"idle" | "copied">("idle");
  const [pdfBusy, setPdfBusy] = useState(false);
  const escalatedReport = isEscalatedReport(report);

  const copyVetSummary = async () => {
    try {
      await navigator.clipboard.writeText(
        buildVetHandoffPacket({
          ...report,
          vet_handoff_summary: report.vet_handoff_summary ?? report.explanation,
        })
      );
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

  const downloadPdf = async () => {
    if (!canExport || pdfBusy) return;
    setPdfBusy(true);
    try {
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          report: shareUrl
            ? { ...report, share_url: shareUrl }
            : report,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err.error === "string" ? err.error : "PDF download failed"
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
          : "Could not download PDF. Sign in and try again."
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
        e instanceof Error ? e.message : "Could not create share link"
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
    setExpiry(getDefaultClinicLinkExpiry(report));
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
        className={`gap-1.5 ${
          escalatedReport
            ? "border-red-600 text-red-700 hover:bg-red-50"
            : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
        }`}
        onClick={() => void downloadPdf()}
        loading={pdfBusy}
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">
          {escalatedReport ? "Download Clinic PDF" : "Download PDF"}
        </span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={
          escalatedReport
            ? "border-red-600 text-red-700 hover:bg-red-50"
            : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
        }
        onClick={openShareModal}
      >
        <Share2 className="w-4 h-4" />
        <span className="ml-1.5 hidden sm:inline">
          {escalatedReport ? "Share Clinic Link" : "Share with Vet"}
        </span>
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <SeverityHeader
        report={report}
        copyState={copyState}
        onCopyVetSummary={copyVetSummary}
        onJumpToHandoff={() =>
          handoffRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        }
        headerActions={headerActions}
      />

      <Modal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={escalatedReport ? "Share clinic link" : "Share with your veterinarian"}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {escalatedReport
              ? "Create a read-only clinic link you can hand to intake staff or text to the veterinary team before you arrive."
              : "Anyone with the link can view this report until it expires. Links are read-only."}
          </p>
          <label className="block text-sm font-medium text-gray-700">
            Link expires after
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryOption)}
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
              {escalatedReport ? "Create clinic link" : "Generate link"}
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

      {report.bayesian_differentials && report.bayesian_differentials.length > 0 && (
        <BayesianDifferentials bayesian_differentials={report.bayesian_differentials} />
      )}

      <div ref={handoffRef}>
        <VetHandoffSection
          report={report}
          summary={report.vet_handoff_summary ?? ""}
          copyState={copyState}
          onCopy={copyVetSummary}
        />
      </div>

      {report.differential_diagnoses && report.differential_diagnoses.length > 0 && (
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

      <ActionStepsSection
        actions={report.actions}
        warningSigns={report.warning_signs}
      />

      {report.vet_questions && report.vet_questions.length > 0 && (
        <VetQuestionsSection questions={report.vet_questions} />
      )}

      {!readOnlyShared ? (
        <OutcomeFeedbackSection report={report} onSubmit={onOutcomeFeedback} />
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
          <strong>Medical Disclaimer:</strong> This AI analysis is for informational
          purposes only and is NOT a substitute for hands-on physical examination,
          diagnostic testing, or professional veterinary medical advice. Always consult
          a licensed veterinarian for diagnosis and treatment decisions. In emergencies,
          contact your nearest emergency veterinary hospital immediately.
        </p>
      </div>
    </div>
  );
}
