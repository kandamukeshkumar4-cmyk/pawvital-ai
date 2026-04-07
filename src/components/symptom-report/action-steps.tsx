"use client";

import { Shield, CheckCircle, AlertTriangle } from "lucide-react";
import { CollapsibleSection } from "./collapsible-section";

interface ActionStepsProps {
  actions: string[];
  warningSigns: string[];
}

export function ActionStepsSection({ actions, warningSigns }: ActionStepsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CollapsibleSection
        title="Action Steps"
        icon={Shield}
        iconColor="text-green-600"
        defaultOpen={true}
      >
        <ul className="space-y-2 mt-2">
          {actions.map((action, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              {action}
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        title="Warning Signs — Go to ER If:"
        icon={AlertTriangle}
        iconColor="text-red-600"
        defaultOpen={true}
      >
        <ul className="space-y-2 mt-2">
          {warningSigns.map((sign, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              {sign}
            </li>
          ))}
        </ul>
      </CollapsibleSection>
    </div>
  );
}
