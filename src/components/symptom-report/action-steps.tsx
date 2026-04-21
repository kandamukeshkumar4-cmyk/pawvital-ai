"use client";

import { Shield, AlertTriangle } from "lucide-react";
import Card from "@/components/ui/card";
import type { ReportTone } from "./report-presentation";

interface ActionStepsProps {
  actions: string[];
  tone: ReportTone;
  actionTitle: string;
  warningSigns: string[];
  warningTitle: string;
}

const TONE_STYLES: Record<
  ReportTone,
  { card: string; icon: string; stepBadge: string }
> = {
  emergency: {
    card: "border-red-200 bg-red-50",
    icon: "text-red-700",
    stepBadge: "bg-red-100 text-red-700",
  },
  routine: {
    card: "border-emerald-200 bg-emerald-50",
    icon: "text-emerald-700",
    stepBadge: "bg-emerald-100 text-emerald-700",
  },
  urgent: {
    card: "border-orange-200 bg-orange-50",
    icon: "text-orange-700",
    stepBadge: "bg-orange-100 text-orange-700",
  },
};

export function ActionStepsSection({
  actions,
  tone,
  actionTitle,
  warningSigns,
  warningTitle,
}: ActionStepsProps) {
  const toneStyles = TONE_STYLES[tone];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
      <Card className={`border p-4 sm:p-5 ${toneStyles.card}`}>
        <div className="flex items-start gap-3">
          <Shield className={`mt-0.5 h-5 w-5 ${toneStyles.icon}`} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-gray-900 sm:text-lg">
                {actionTitle}
              </h4>
              <p className="text-sm text-gray-700">
                Keep these steps above the detailed explanation so they are easy
                to use on your phone.
              </p>
            </div>
            <ul className="space-y-2.5">
              {actions.map((action, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-2xl bg-white/80 px-3 py-2 text-sm leading-6 text-gray-800"
                >
                  <span
                    className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneStyles.stepBadge}`}
                  >
                    {i + 1}
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card className="border border-red-200 bg-red-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-700" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-gray-900 sm:text-lg">
                {warningTitle}
              </h4>
              <p className="text-sm text-gray-700">
                These changes mean your dog may need faster care than the
                current plan.
              </p>
            </div>
            <ul className="space-y-2.5">
              {warningSigns.map((sign, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-2xl bg-white/80 px-3 py-2 text-sm leading-6 text-gray-800"
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
