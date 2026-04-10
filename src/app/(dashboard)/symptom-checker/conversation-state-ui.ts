/**
 * VET-833: Pure presentational mapping from API conversationState → owner-facing UI copy.
 * No React imports — safe for unit tests and deterministic rendering.
 */

import {
  CONVERSATION_STATE_VALUES,
  type ConversationControlStateSnapshot,
  type ConversationState,
} from "@/lib/conversation-state/types";
import { inferConversationState } from "@/lib/conversation-state/transitions";

export type ConversationStateApi = ConversationState;

export type GuidanceTone = "muted" | "neutral" | "warning" | "success" | "attention";

export const CLARIFICATION_COMPOSER_HINT =
  'Try answering the last question directly, even if the answer is "not sure."';

export interface SymptomCheckerConversationUiConfig {
  /** Short label for compact badges */
  badgeLabel: string;
  tone: GuidanceTone;
  /** Optional second line under the “Clinical progress” label (e.g. clarification headline) */
  railHeadline: string;
  /** Clinical progress rail — main owner-facing message */
  railBody: string;
  showClarificationComposerHelper: boolean;
  clarificationComposerHelperText: string;
  /** Stronger visual treatment for the manual report CTA */
  elevateReportCta: boolean;
  reportCtaHeading: string;
  reportCtaSubcopy: string;
}

export function isConversationStateApi(value: unknown): value is ConversationStateApi {
  return (
    typeof value === "string" &&
    (CONVERSATION_STATE_VALUES as readonly string[]).includes(value)
  );
}

export function parseConversationStateApi(
  value: unknown
): ConversationStateApi | null {
  return isConversationStateApi(value) ? value : null;
}

/**
 * Builds the same control snapshot shape the backend uses for inference from a
 * client-held session payload.
 */
export function clientSessionToControlSnapshot(
  session: unknown
): ConversationControlStateSnapshot | null {
  if (!session || typeof session !== "object") return null;

  const triageSession = session as Record<string, unknown>;
  const caseMemory =
    (triageSession.case_memory as Record<string, unknown> | undefined) ?? {};
  const answeredQuestions = triageSession.answered_questions;
  const extractedAnswers = triageSession.extracted_answers;
  const unresolvedQuestionIds = caseMemory.unresolved_question_ids;
  const clarificationReasons = caseMemory.clarification_reasons;
  const lastQuestionAsked = triageSession.last_question_asked;

  return {
    answeredQuestionIds: Array.isArray(answeredQuestions)
      ? answeredQuestions.filter((id): id is string => typeof id === "string")
      : [],
    extractedAnswers:
      extractedAnswers &&
      typeof extractedAnswers === "object" &&
      !Array.isArray(extractedAnswers)
        ? { ...(extractedAnswers as Record<string, string | boolean | number>) }
        : {},
    unresolvedQuestionIds: Array.isArray(unresolvedQuestionIds)
      ? unresolvedQuestionIds.filter((id): id is string => typeof id === "string")
      : [],
    clarificationReasons:
      clarificationReasons &&
      typeof clarificationReasons === "object" &&
      !Array.isArray(clarificationReasons)
        ? Object.fromEntries(
            Object.entries(clarificationReasons).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === "string" && typeof entry[1] === "string"
            )
          )
        : {},
    lastQuestionAsked:
      typeof lastQuestionAsked === "string" && lastQuestionAsked.length > 0
        ? lastQuestionAsked
        : undefined,
  };
}

/**
 * Prefer the explicit API state when present; otherwise infer from session so
 * UI state stays aligned with the backend state-machine rules.
 */
export function resolveConversationStateFromSession(
  session: unknown,
  apiConversationState: unknown
): ConversationState {
  const parsedApiState = parseConversationStateApi(apiConversationState);
  if (parsedApiState) {
    return parsedApiState;
  }

  const snapshot = clientSessionToControlSnapshot(session);
  if (!snapshot) {
    return "idle";
  }

  return inferConversationState(snapshot);
}

/**
 * Maps API `conversationState` and `readyForReport` to UI copy and flags.
 * When `conversationState` is null (e.g. before first server response), treats as idle.
 */
export function getSymptomCheckerConversationUiConfig(
  conversationState: ConversationStateApi | null | unknown,
  readyForReport: boolean
): SymptomCheckerConversationUiConfig {
  const state: ConversationStateApi =
    parseConversationStateApi(conversationState) ?? "idle";

  const elevateReportCta = readyForReport && state === "confirmed";

  const reportCtaHeading = elevateReportCta
    ? "Ready for your full veterinary report"
    : "Generate your clinical report";

  const reportCtaSubcopy = elevateReportCta
    ? "Enough detail is in place to produce differentials, tests, and home-care guidance tailored to this conversation."
    : "When you’re ready, we’ll compile everything from this chat into a structured summary.";

  switch (state) {
    case "needs_clarification":
      return {
        badgeLabel: "Clarify",
        tone: "warning",
        railHeadline: "We need a clearer answer",
        railBody:
          "Your last reply may not have been specific enough to use safely. Please answer the latest question as directly as you can.",
        showClarificationComposerHelper: true,
        clarificationComposerHelperText: CLARIFICATION_COMPOSER_HINT,
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };

    case "confirmed":
      return {
        badgeLabel: "Confirmed",
        tone: "success",
        railHeadline: "",
        railBody:
          "Enough information has been confirmed to move toward a report.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };

    case "asking":
      return {
        badgeLabel: "In progress",
        tone: "neutral",
        railHeadline: "",
        railBody: "We’re still gathering key clinical details.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };

    case "answered_unconfirmed":
      return {
        badgeLabel: "In progress",
        tone: "neutral",
        railHeadline: "",
        railBody:
          "Your latest answer is in. We may ask another short question before wrapping up.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };

    case "escalation":
      return {
        badgeLabel: "Priority",
        tone: "attention",
        railHeadline: "",
        railBody:
          "This conversation may need urgent or in-person care. Follow any emergency guidance you’ve been given and contact a veterinarian if you’re unsure.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };

    case "idle":
      return {
        badgeLabel: "Not started",
        tone: "muted",
        railHeadline: "",
        railBody: "Waiting to start a triage conversation.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta,
        reportCtaHeading,
        reportCtaSubcopy,
      };
  }
}
