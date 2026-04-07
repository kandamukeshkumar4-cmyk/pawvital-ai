"use client";

import { FlaskConical } from "lucide-react";
import type { DifferentialDiagnosis } from "./types";
import { CollapsibleSection } from "./collapsible-section";
import { likelihoodColors } from "./constants";

export function DifferentialDiagnoses({
  diagnoses,
}: {
  diagnoses: DifferentialDiagnosis[];
}) {
  if (!diagnoses.length) return null;

  return (
    <CollapsibleSection
      title="Differential Diagnoses"
      icon={FlaskConical}
      iconColor="text-purple-600"
      defaultOpen={true}
    >
      <div className="space-y-3 mt-2">
        {diagnoses.map((dx, i) => (
          <div key={i} className="p-4 rounded-lg bg-gray-50 border border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <h5 className="font-bold text-gray-900">
                {i + 1}. {dx.condition}
              </h5>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium border ${likelihoodColors[dx.likelihood]}`}
              >
                {dx.likelihood === "high"
                  ? "Most Likely"
                  : dx.likelihood === "moderate"
                    ? "Possible"
                    : "Less Likely"}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              {dx.description}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
