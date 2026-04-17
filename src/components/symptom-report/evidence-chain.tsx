"use client";

import { Activity } from "lucide-react";
import Badge from "@/components/ui/badge";
import type { StructuredEvidenceChainItem } from "./types";
import { CollapsibleSection } from "./collapsible-section";

function getSourceKindLabel(item: StructuredEvidenceChainItem): string {
  switch (item.source_kind) {
    case "deterministic_rule":
      return "Deterministic";
    case "visual":
      return "Visual";
    case "consult":
      return "Consult";
    case "retrieval":
      return "Retrieval";
    default:
      return item.source;
  }
}

function getSourceKindVariant(item: StructuredEvidenceChainItem) {
  switch (item.source_kind) {
    case "deterministic_rule":
      return "info";
    case "visual":
      return "success";
    case "consult":
      return "warning";
    case "retrieval":
      return "default";
    default:
      return "default";
  }
}

export function EvidenceChainSection({
  items,
}: {
  items: StructuredEvidenceChainItem[];
}) {
  if (!items.length) return null;

  return (
    <CollapsibleSection
      title="Evidence Chain"
      icon={Activity}
      iconColor="text-sky-600"
      defaultOpen={false}
    >
      <div className="space-y-3 mt-2">
        {items.map((item, index) => (
          <div
            key={`${item.claim_id || item.source}-${index}`}
            className="rounded-lg border border-sky-100 bg-sky-50/40 p-4"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getSourceKindVariant(item)}>
                {getSourceKindLabel(item)}
              </Badge>
              {item.evidence_tier && (
                <Badge variant="default">Tier {item.evidence_tier}</Badge>
              )}
              {item.high_stakes && <Badge variant="danger">High stakes</Badge>}
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {item.source}
              </span>
              <span className="text-xs text-sky-900">
                {(item.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-900">
              {item.finding}
            </p>
            {(item.claim_id || item.last_reviewed_at) && (
              <p className="mt-1 text-xs text-slate-600">
                {item.claim_id ? `Claim ID: ${item.claim_id}` : ""}
                {item.claim_id && item.last_reviewed_at ? " · " : ""}
                {item.last_reviewed_at
                  ? `Last reviewed: ${item.last_reviewed_at}`
                  : ""}
              </p>
            )}
            {item.provenance_ids && item.provenance_ids.length > 0 && (
              <p className="mt-1 text-xs text-slate-600">
                Provenance: {item.provenance_ids.join(", ")}
              </p>
            )}
            {item.supporting.length > 0 && (
              <p className="mt-1 text-xs text-gray-600">
                Supports: {item.supporting.join(" • ")}
              </p>
            )}
            {item.contradicting.length > 0 && (
              <p className="mt-1 text-xs text-red-700">
                Contradictions: {item.contradicting.join(" • ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
