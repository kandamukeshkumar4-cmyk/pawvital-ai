"use client";

import { Activity } from "lucide-react";
import type { StructuredEvidenceChainItem } from "./types";
import { CollapsibleSection } from "./collapsible-section";

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
            key={`${item.source}-${index}`}
            className="rounded-lg border border-sky-100 bg-sky-50/40 p-4"
          >
            <div className="flex items-center gap-2 flex-wrap">
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
