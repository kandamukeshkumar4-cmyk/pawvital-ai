"use client";

import { BayesianDifferentials, type ScoredDifferential } from "./bayesian-differentials";
import { OutcomeFeedbackForm } from "./outcome-feedback";

interface FullReportProps {
  title?: string;
  summary?: string;
  evidence_sources?: string[] | null;
  bayesian_differentials?: ScoredDifferential[] | null;
  check_id?: string | null;
}

function EvidenceSourcesBar({ evidence_sources }: { evidence_sources?: string[] | null }) {
  const items = evidence_sources ?? [];
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Evidence Sources</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((source) => (
          <span
            key={source}
            className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800"
          >
            {source}
          </span>
        ))}
      </div>
    </section>
  );
}

export function FullReport({
  title = "Veterinary Report",
  summary,
  evidence_sources,
  bayesian_differentials,
  check_id,
}: FullReportProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {summary ? <p className="mt-2 text-sm text-gray-700">{summary}</p> : null}
      </section>

      <EvidenceSourcesBar evidence_sources={evidence_sources} />
      <BayesianDifferentials bayesian_differentials={bayesian_differentials} />

      <OutcomeFeedbackForm check_id={check_id} />
    </div>
  );
}
