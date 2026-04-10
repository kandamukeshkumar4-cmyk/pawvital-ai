import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Badge from "@/components/ui/badge";
import type { ConversationState } from "@/lib/conversation-state/types";
import { getConversationStateMeta } from "@/components/symptom-checker/state-styles";

interface StateBadgeProps {
  state: ConversationState;
}

export function StateBadge({ state }: StateBadgeProps) {
  const meta = getConversationStateMeta(state);

  return (
    <Badge
      variant={meta.badgeVariant}
      className={`gap-1.5 px-3 py-1 text-[11px] font-semibold ${meta.badgeClassName}`}
    >
      {state === "asking" && (
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        </span>
      )}
      {state === "answered_unconfirmed" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state === "confirmed" && <CheckCircle2 className="h-3.5 w-3.5" />}
      {state === "needs_clarification" && (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[10px] leading-none">
          ?
        </span>
      )}
      {state === "escalation" && <AlertTriangle className="h-3.5 w-3.5" />}
      <span>{meta.label}</span>
    </Badge>
  );
}