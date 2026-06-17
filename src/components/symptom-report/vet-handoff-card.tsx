"use client";

import { Stethoscope, Copy, CheckCheck } from "lucide-react";
import Card from "@/components/ui/card";

type CopyState = "idle" | "copied" | "error";

interface VetHandoffCardProps {
  intro: string;
  summary: string;
  copyState: CopyState;
  onCopy: () => void | Promise<void>;
}

export function VetHandoffCard({
  intro,
  summary,
  copyState,
  onCopy,
}: VetHandoffCardProps) {
  if (!summary?.trim()) return null;

  return (
    <Card className="border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Stethoscope className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">
              For your vet
            </h3>
            <p className="text-sm text-gray-600">{intro}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy clinic handoff for your vet"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:flex-shrink-0"
        >
          {copyState === "copied" ? (
            <CheckCheck className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copyState === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
          {summary}
        </p>
      </div>
      {copyState === "error" ? (
        <p className="mt-2 text-xs text-red-600">
          Couldn&apos;t access your clipboard. You can still select and copy the
          summary manually.
        </p>
      ) : null}
    </Card>
  );
}
