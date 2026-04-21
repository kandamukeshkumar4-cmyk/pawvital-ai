"use client";

import { Stethoscope, Copy, CheckCheck } from "lucide-react";
import { CollapsibleSection } from "./collapsible-section";

type CopyState = "idle" | "copied" | "error";

interface VetHandoffSectionProps {
  intro: string;
  summary: string;
  copyState: CopyState;
  onCopy: () => void | Promise<void>;
}

export function VetHandoffSection({
  intro,
  summary,
  copyState,
  onCopy,
}: VetHandoffSectionProps) {
  if (!summary) return null;

  return (
    <CollapsibleSection
      title="Clinic Handoff"
      icon={Stethoscope}
      iconColor="text-red-600"
      defaultOpen={true}
    >
      <div className="space-y-3 mt-2">
        <p className="text-sm text-gray-600">{intro}</p>
        <div className="rounded-lg border border-red-100 bg-red-50/60 p-4">
          <p className="text-sm leading-relaxed text-red-950 whitespace-pre-wrap">
            {summary}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copyState === "copied" ? (
              <CheckCheck className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copyState === "copied" ? "Copied" : "Copy Clinic Packet"}
          </button>
          {copyState === "error" && (
            <span className="text-xs text-red-600">
              Couldn&apos;t access your clipboard. You can still select and copy the
              summary manually.
            </span>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
