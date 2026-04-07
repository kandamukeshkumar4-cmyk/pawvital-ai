"use client";

import { FileText } from "lucide-react";
import { CollapsibleSection } from "./collapsible-section";

export function ClinicalNotesSection({ notes }: { notes: string }) {
  if (!notes) return null;

  return (
    <CollapsibleSection
      title="Clinical Notes"
      icon={FileText}
      iconColor="text-blue-600"
      defaultOpen={false}
    >
      <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <p className="text-sm text-slate-700 leading-relaxed font-mono">
          {notes}
        </p>
      </div>
      <p className="text-xs text-gray-400 mt-2 italic">
        Technical notes — share these with your veterinarian
      </p>
    </CollapsibleSection>
  );
}
