"use client";

import { BookOpen } from "lucide-react";
import Badge from "@/components/ui/badge";
import type { SimilarCase } from "./types";
import { CollapsibleSection } from "./collapsible-section";
import { useState } from "react";

function SimilarCaseCard({ item }: { item: SimilarCase }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(Math.min(1, Math.max(0, item.similarity)) * 100);
  const barColor =
    pct > 70 ? "bg-green-500" : pct > 40 ? "bg-amber-500" : "bg-gray-300";

  return (
    <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-4">
      <h5 className="font-semibold text-gray-900 text-sm">{item.heading}</h5>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {pct}% match
        </span>
      </div>
      <p
        className={`text-sm text-gray-600 mt-2 leading-relaxed ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {item.body}
      </p>
      {item.body.length > 180 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 font-medium mt-1 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {item.keyword_tags && item.keyword_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {item.keyword_tags.map((tag) => (
            <Badge key={tag} variant="default" className="text-xs bg-gray-100 text-gray-700">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function SimilarCasesSection({ cases }: { cases: SimilarCase[] }) {
  if (!cases.length) return null;

  return (
    <CollapsibleSection
      title="Similar Clinical Cases"
      icon={BookOpen}
      iconColor="text-indigo-600"
      defaultOpen={false}
    >
      <div className="space-y-3 mt-2">
        {cases.map((c, i) => (
          <SimilarCaseCard key={`${c.heading}-${i}`} item={c} />
        ))}
      </div>
    </CollapsibleSection>
  );
}
