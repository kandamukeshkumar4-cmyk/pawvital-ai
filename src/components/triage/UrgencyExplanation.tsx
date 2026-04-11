import React from "react";
import { getUrgencyExplanation } from "@/lib/clinical/urgency-explanations";

interface UrgencyExplanationProps {
  urgencyLevel: string;
  redFlags?: string[];
  symptoms?: string[];
  missingInfo?: string[];
}

const URGENCY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  emergency_vet_now: { bg: "bg-red-50", border: "border-red-300", text: "text-red-900", icon: "🚨" },
  same_day_vet: { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-900", icon: "⚠️" },
  vet_within_48h: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-900", icon: "📋" },
  monitor_and_reassess: { bg: "bg-green-50", border: "border-green-300", text: "text-green-900", icon: "✅" },
  cannot_safely_assess: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-900", icon: "❓" },
};

export const UrgencyExplanationComponent: React.FC<UrgencyExplanationProps> = ({
  urgencyLevel,
  redFlags = [],
  symptoms = [],
  missingInfo = [],
}) => {
  const explanation = getUrgencyExplanation(urgencyLevel, redFlags, symptoms, missingInfo);
  const colors = URGENCY_COLORS[urgencyLevel] || URGENCY_COLORS.cannot_safely_assess;

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-4 space-y-3`}>
      <div className="flex items-start gap-2">
        <span className="text-xl">{colors.icon}</span>
        <div>
          <h3 className={`font-semibold ${colors.text}`}>
            {urgencyLevel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </h3>
          <p className={`text-sm ${colors.text} mt-1`}>{explanation.plain_language}</p>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-800 mb-1">Red flags detected:</h4>
          <ul className="list-disc list-inside text-sm text-gray-700">
            {redFlags.map((flag, i) => (
              <li key={i}>{flag.replace(/_/g, " ")}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white p-3 rounded border">
        <h4 className="text-sm font-medium text-gray-800 mb-1">Safe next step:</h4>
        <p className="text-sm text-gray-700">{explanation.safe_next_step}</p>
      </div>

      {explanation.evidence_citations.length > 0 && (
        <div className="text-xs text-gray-600">
          <span className="font-medium">Based on:</span> {explanation.evidence_citations.join(", ")}
        </div>
      )}
    </div>
  );
};

export default UrgencyExplanationComponent;
