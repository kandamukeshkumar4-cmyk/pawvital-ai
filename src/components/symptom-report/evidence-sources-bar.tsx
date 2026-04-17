"use client";

import { BookOpen } from "lucide-react";
import type { SymptomReport } from "./types";

export function EvidenceSourcesBar({ report }: { report: SymptomReport }) {
  const summary = report.evidence_summary;
  if (!summary) return null;

  const parts: string[] = [];
  if ((summary.deterministic_rules_applied ?? 0) > 0) {
    parts.push(
      `${summary.deterministic_rules_applied} deterministic rule${summary.deterministic_rules_applied === 1 ? "" : "s"}`
    );
  }
  if ((summary.provenance_backed_claims ?? 0) > 0) {
    parts.push(
      `${summary.provenance_backed_claims} provenance-backed claim${summary.provenance_backed_claims === 1 ? "" : "s"}`
    );
  }
  if (summary.knowledge_chunks_found > 0) {
    parts.push(
      `${summary.knowledge_chunks_found} knowledge article${summary.knowledge_chunks_found === 1 ? "" : "s"}`
    );
  }
  if (summary.cases_found > 0) {
    parts.push(
      `${summary.cases_found} similar case${summary.cases_found === 1 ? "" : "s"}`
    );
  }
  if (summary.reference_images_found > 0) {
    parts.push(
      `${summary.reference_images_found} ref image${summary.reference_images_found === 1 ? "" : "s"}`
    );
  }

  if (parts.length === 0) return null;

  const sources = report.knowledge_sources_used?.filter(Boolean) ?? [];

  return (
    <div className="bg-blue-50/60 border border-blue-100 rounded-lg px-4 py-2.5 flex items-start gap-2">
      <BookOpen className="text-blue-500 w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-blue-700">
          <span className="font-medium">Based on:</span> {parts.join(" · ")}
        </p>
        <p className="text-xs text-blue-700/80 mt-1">
          Deterministic clinical rules are primary. Retrieval and similar cases
          are supportive context only.
        </p>
        {sources.length > 0 && (
          <p className="text-xs text-blue-600/70 italic mt-1">
            Sources: {sources.join(", ")}
          </p>
        )}
        {report.high_stakes_claims_suppressed && (
          <p className="text-xs text-amber-700 mt-1">
            Some high-stakes details were phrased conservatively until reviewed
            provenance is available.
          </p>
        )}
      </div>
    </div>
  );
}
