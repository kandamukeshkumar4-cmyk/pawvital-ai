"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to telemetry in production
    if (process.env.NODE_ENV === "production") {
      console.error("[PawVital] Application error:", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="mb-2 text-xl font-semibold text-red-800">
          Something went wrong
        </h2>
        <p className="mb-4 text-sm text-red-600">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          Try again
        </button>
        {process.env.NODE_ENV === "development" && (
          <pre className="mt-4 overflow-auto rounded bg-gray-900 p-3 text-left text-xs text-green-400">
            {error.message}
          </pre>
        )}
      </div>
    </div>
  );
}
