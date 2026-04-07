"use client";

import { BookOpen } from "lucide-react";
import type { RecommendedTest } from "./types";
import { CollapsibleSection } from "./collapsible-section";
import { urgencyColors } from "./constants";

export function RecommendedTestsSection({
  tests,
}: {
  tests: RecommendedTest[];
}) {
  if (!tests.length) return null;

  return (
    <CollapsibleSection
      title="Recommended Diagnostic Tests"
      icon={BookOpen}
      iconColor="text-indigo-600"
      defaultOpen={true}
    >
      <div className="space-y-2 mt-2">
        {tests.map((test, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${urgencyColors[test.urgency]} flex-shrink-0 mt-0.5`}
            >
              {test.urgency === "stat"
                ? "STAT"
                : test.urgency === "urgent"
                  ? "URGENT"
                  : "ROUTINE"}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{test.test}</p>
              <p className="text-xs text-gray-600 mt-0.5">{test.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
