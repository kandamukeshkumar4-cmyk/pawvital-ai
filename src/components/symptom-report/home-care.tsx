"use client";

import { Heart } from "lucide-react";
import type { HomeCare } from "./types";
import { CollapsibleSection } from "./collapsible-section";

export function HomeCareSection({ items }: { items: HomeCare[] }) {
  if (!items.length) return null;

  return (
    <CollapsibleSection
      title="Home Care Protocol"
      icon={Heart}
      iconColor="text-rose-600"
      defaultOpen={true}
    >
      <div className="space-y-3 mt-2">
        {items.map((care, i) => (
          <div
            key={i}
            className="p-4 rounded-lg bg-rose-50/50 border border-rose-100"
          >
            <div className="flex items-start justify-between">
              <h5 className="text-sm font-semibold text-gray-900">
                {care.instruction}
              </h5>
              <span className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded flex-shrink-0 ml-2">
                {care.duration}
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
              {care.details}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
