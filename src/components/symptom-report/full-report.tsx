"use client";

import { useState } from "react";
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
}

export function FullReport({ report, onOutcomeFeedback }: FullReportProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const copyVetSummary = async () => {
    if (!report.vet_handoff_summary) return;

    try {
      await navigator.clipboard.writeText(report.vet_handoff_summary);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <SeverityHeader
        report={report}
        copyState={copyState}
        onCopyVetSummary={copyVetSummary}
      />

      <EvidenceSourcesBar report={report} />

      {report.bayesian_differentials && report.bayesian_differentials.length > 0 && (
        <BayesianDifferentials bayesian_differentials={report.bayesian_differentials} />
      )}

      <VetHandoffSection
        summary={report.vet_handoff_summary ?? ""}
        copyState={copyState}
        onCopy={copyVetSummary}
      />

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

      <OutcomeFeedbackSection report={report} onSubmit={onOutcomeFeedback} />

      {report.system_observability && (
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
