"use client";

import { ShieldCheck } from "lucide-react";
import Card from "@/components/ui/card";

interface UrgencyRationaleProps {
  rationale?: string;
  heading: string;
}

export function UrgencyRationaleSection({
  rationale,
  heading,
}: UrgencyRationaleProps) {
  if (!rationale?.trim()) return null;

  return (
    <Card className="border border-l-4 border-l-blue-600 border-blue-100 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <div className="min-w-0 space-y-2">
          <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
            {heading}
          </h3>
          <p className="text-sm leading-6 text-gray-700">{rationale}</p>
        </div>
      </div>
    </Card>
  );
}
