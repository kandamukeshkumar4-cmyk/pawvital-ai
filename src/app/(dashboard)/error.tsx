"use client";

import { useEffect } from "react";
import Button from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] route error:", error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
      <h2 className="text-lg font-semibold text-red-800">
        We couldn&apos;t load this dashboard view
      </h2>
      <p className="mt-2 text-sm text-red-700">
        Please try again. If the problem keeps happening, refresh the page.
      </p>
      <div className="mt-4 flex justify-center">
        <Button onClick={reset} variant="outline">
          Try Again
        </Button>
      </div>
    </div>
  );
}
