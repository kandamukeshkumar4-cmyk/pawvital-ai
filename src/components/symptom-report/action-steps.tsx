"use client";

import { CheckCircle2, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/card";

interface ActionStepsProps {
  actions: string[];
  actionTitle: string;
  warningSigns: string[];
  warningTitle: string;
}

export function ActionStepsSection({
  actions,
  actionTitle,
  warningSigns,
  warningTitle,
}: ActionStepsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border border-gray-200 border-t-4 border-t-emerald-500 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-gray-900 sm:text-lg">
                {actionTitle}
              </h4>
              <p className="text-sm text-gray-600">
                Practical steps you can start right now.
              </p>
            </div>
            <ul className="space-y-2">
              {actions.map((action, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm leading-6 text-gray-800"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="border border-gray-200 border-t-4 border-t-red-500 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-gray-900 sm:text-lg">
                {warningTitle}
              </h4>
              <p className="text-sm text-gray-600">
                These changes mean your dog may need faster care than the
                current plan.
              </p>
            </div>
            <ul className="space-y-2">
              {warningSigns.map((sign, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm leading-6 text-gray-800"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <span>{sign}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
