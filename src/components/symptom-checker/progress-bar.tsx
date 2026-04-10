import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ConversationState } from "@/lib/conversation-state/types";
import {
  getConversationProgressLabel,
  getConversationProgressPercent,
  getConversationStateMeta,
} from "@/components/symptom-checker/state-styles";

interface ProgressBarProps {
  answered: number;
  total: number;
  state: ConversationState;
}

export function ProgressBar({ answered, total, state }: ProgressBarProps) {
  const meta = getConversationStateMeta(state);
  const label = getConversationProgressLabel(answered, total, state);
  const percent = getConversationProgressPercent(answered, total, state);

  return (
    <div aria-live="polite" className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          {state === "confirmed" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          )}
          {state === "escalation" && (
            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
          )}
          <span>{label}</span>
        </div>
      )}
      <div className={`h-2 overflow-hidden rounded-full ${meta.trackClassName}`}>
        <div
          data-testid="conversation-progress-fill"
          className={`h-full rounded-full transition-all duration-300 ease-out ${meta.barClassName}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
