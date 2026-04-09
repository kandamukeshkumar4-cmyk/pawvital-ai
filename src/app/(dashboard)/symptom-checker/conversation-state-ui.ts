import {
  CONVERSATION_STATE_VALUES,
  type ConversationState,
} from "@/lib/conversation-state/types";
import { inferConversationState } from "@/lib/conversation-state/transitions";
import type { ConversationControlStateSnapshot } from "@/lib/conversation-state/types";

export type ConversationUiTone = "neutral" | "info" | "warning" | "success";

export interface ConversationStateUi {
  /** Short status label (e.g. for badges); not raw enum values */
  label: string;
  tone: ConversationUiTone;
  /** Primary heading for the guidance panel */
  title: string;
  /** Supporting line; may be empty when a single sentence is enough */
  body: string;
  showClarificationHelper: boolean;
  elevateReportCta: boolean;
}

function isConversationState(value: string): value is ConversationState {
  return (CONVERSATION_STATE_VALUES as readonly string[]).includes(value);
}

/**
 * Builds the same control snapshot as server-side getStateSnapshot from a
 * client-held session object (API JSON). Pure; safe for the browser bundle.
 */
export function clientSessionToControlSnapshot(
  session: unknown
): ConversationControlStateSnapshot | null {
  if (!session || typeof session !== "object") return null;
  const s = session as Record<string, unknown>;
  const memory = s.case_memory as Record<string, unknown> | undefined;
  const answered = s.answered_questions;
  const extracted = s.extracted_answers;
  const unresolved = memory?.unresolved_question_ids;
  const lastAsked = s.last_question_asked;

  return {
    answeredQuestionIds: Array.isArray(answered)
      ? answered.filter((id): id is string => typeof id === "string")
      : [],
    extractedAnswers:
      extracted && typeof extracted === "object" && !Array.isArray(extracted)
        ? { ...(extracted as Record<string, string | boolean | number>) }
        : {},
    unresolvedQuestionIds: Array.isArray(unresolved)
      ? unresolved.filter((id): id is string => typeof id === "string")
      : [],
    lastQuestionAsked:
      typeof lastAsked === "string" && lastAsked.length > 0
        ? lastAsked
        : undefined,
  };
}

/**
 * Prefer API `conversationState` when present; otherwise infer from session
 * so the UI stays aligned with backend state-machine rules.
 */
export function resolveConversationStateFromSession(
  session: unknown,
  apiConversationState: string | undefined | null
): ConversationState {
  if (
    apiConversationState != null &&
    typeof apiConversationState === "string" &&
    isConversationState(apiConversationState)
  ) {
    return apiConversationState;
  }
  const snap = clientSessionToControlSnapshot(session);
  if (!snap) return "idle";
  return inferConversationState(snap);
}

/** Shown above the composer when clarification is needed */
export const CLARIFICATION_COMPOSER_HINT =
  "Try answering the last question directly, even if the answer is 'not sure.'";

/**
 * Maps triage conversationState + report readiness to owner-facing UI copy.
 * Never interpolates raw enum identifiers into user-visible strings.
 */
export function getConversationStateUi(
  conversationState: ConversationState,
  readyForReport: boolean
): ConversationStateUi {
  const elevateReportCta =
    readyForReport && conversationState === "confirmed";

  switch (conversationState) {
    case "idle":
      return {
        label: "Not started",
        tone: "neutral",
        title: "Clinical progress",
        body: "Waiting to start a triage conversation.",
        showClarificationHelper: false,
        elevateReportCta,
      };
    case "asking":
      return {
        label: "Gathering details",
        tone: "info",
        title: "Clinical progress",
        body: "We're still gathering key clinical details.",
        showClarificationHelper: false,
        elevateReportCta,
      };
    case "answered_unconfirmed":
      return {
        label: "Reviewing your answer",
        tone: "info",
        title: "Clinical progress",
        body: "We're still gathering key clinical details.",
        showClarificationHelper: false,
        elevateReportCta,
      };
    case "needs_clarification":
      return {
        label: "Needs a clearer answer",
        tone: "warning",
        title: "Please be more specific",
        body: "Your last reply may not have been specific enough to use safely. Please answer the latest question as directly as you can.",
        showClarificationHelper: true,
        elevateReportCta,
      };
    case "confirmed":
      return {
        label: "Ready to continue",
        tone: "success",
        title: "Clinical progress",
        body: "Enough information has been confirmed to move toward a report.",
        showClarificationHelper: false,
        elevateReportCta,
      };
    case "escalation":
      return {
        label: "Clinical review",
        tone: "warning",
        title: "Clinical progress",
        body: "We're still gathering key clinical details.",
        showClarificationHelper: false,
        elevateReportCta,
      };
    default: {
      const _exhaustive: never = conversationState;
      void _exhaustive;
      return {
        label: "In progress",
        tone: "info",
        title: "Clinical progress",
        body: "We're still gathering key clinical details.",
        showClarificationHelper: false,
        elevateReportCta: false,
      };
    }
  }
}
