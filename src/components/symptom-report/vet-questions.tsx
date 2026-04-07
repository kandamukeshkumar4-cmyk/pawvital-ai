"use client";

import { MessageSquare } from "lucide-react";
import { CollapsibleSection } from "./collapsible-section";

export function VetQuestionsSection({ questions }: { questions: string[] }) {
  if (!questions.length) return null;

  return (
    <CollapsibleSection
      title="Questions to Ask Your Veterinarian"
      icon={MessageSquare}
      iconColor="text-teal-600"
      defaultOpen={false}
    >
      <ul className="space-y-2 mt-2">
        {questions.map((q, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
            <MessageSquare className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
            {q}
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}
