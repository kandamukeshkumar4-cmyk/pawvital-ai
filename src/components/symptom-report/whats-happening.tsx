"use client";

import { Info } from "lucide-react";
import Card from "@/components/ui/card";

interface WhatsHappeningProps {
  explanation: string;
}

export function WhatsHappeningSection({ explanation }: WhatsHappeningProps) {
  if (!explanation?.trim()) return null;

  return (
    <Card className="border border-gray-200 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <div className="min-w-0 space-y-2">
          <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
            What&apos;s happening
          </h3>
          <p className="text-sm leading-6 text-gray-700">{explanation}</p>
        </div>
      </div>
    </Card>
  );
}
