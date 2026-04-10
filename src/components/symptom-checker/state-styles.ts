import type { ConversationState } from "@/lib/conversation-state/types";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface ConversationStateMeta {
  label: string;
  badgeVariant: BadgeVariant;
  badgeClassName: string;
  barClassName: string;
  trackClassName: string;
}

export const CONVERSATION_STATE_META: Record<ConversationState, ConversationStateMeta> = {
  idle: {
    label: "Ready",
    badgeVariant: "default",
    badgeClassName: "border border-gray-200 bg-gray-100 text-gray-700",
    barClassName: "bg-gray-400",
    trackClassName: "bg-gray-100",
  },
  asking: {
    label: "Asking",
    badgeVariant: "info",
    badgeClassName: "border border-blue-200 bg-blue-100 text-blue-700",
    barClassName: "bg-blue-500",
    trackClassName: "bg-blue-100/80",
  },
  answered_unconfirmed: {
    label: "Processing",
    badgeVariant: "warning",
    badgeClassName: "border border-amber-200 bg-amber-100 text-amber-800",
    barClassName: "bg-amber-500",
    trackClassName: "bg-amber-100/80",
  },
  confirmed: {
    label: "Analysis Ready",
    badgeVariant: "success",
    badgeClassName: "border border-green-200 bg-green-100 text-green-700",
    barClassName: "bg-green-500",
    trackClassName: "bg-green-100/80",
  },
  needs_clarification: {
    label: "Clarifying",
    badgeVariant: "default",
    badgeClassName: "border border-orange-200 bg-orange-100 text-orange-700",
    barClassName: "bg-orange-500",
    trackClassName: "bg-orange-100/80",
  },
  escalation: {
    label: "Emergency",
    badgeVariant: "danger",
    badgeClassName: "border border-red-200 bg-red-100 text-red-700",
    barClassName: "bg-red-500",
    trackClassName: "bg-red-100/80",
  },
};

export function getConversationStateMeta(state: ConversationState): ConversationStateMeta {
  return CONVERSATION_STATE_META[state];
}

export function getConversationProgressPercent(
  answered: number,
  total: number,
  state: ConversationState
): number {
  if (state === "confirmed" || state === "escalation") {
    return 100;
  }

  if (total <= 0) {
    return 0;
  }

  return Math.min(Math.max((answered / Math.max(total, 1)) * 100, 0), 100);
}

export function getConversationProgressLabel(
  answered: number,
  total: number,
  state: ConversationState
): string | null {
  if (state === "confirmed") {
    return "Complete";
  }

  if (state === "escalation") {
    return "Emergency - seek immediate care";
  }

  if (total > 0) {
    return `${answered} of ${total} questions answered`;
  }

  return null;
}