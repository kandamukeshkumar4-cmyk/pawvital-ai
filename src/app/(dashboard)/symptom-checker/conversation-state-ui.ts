import { inferConversationState } from "@/lib/conversation-state/transitions";
import type { ConversationAnswerValue } from "@/lib/conversation-state/types";
import {
  CONVERSATION_STATE_VALUES,
  type ConversationControlStateSnapshot,
  type ConversationState,
} from "@/lib/conversation-state/types";

const CONVERSATION_STATE_SET = new Set<string>(CONVERSATION_STATE_VALUES);

export type ConversationStateApi = ConversationState;
export type ConversationStateUiTone =
  | "neutral"
  | "info"
  | "warning"
  | "success"
  | "danger";
export type GuidanceTone =
  | "muted"
  | "neutral"
  | "warning"
  | "success"
  | "attention";

export interface ClientConversationSession {
  answered_questions?: unknown;
  extracted_answers?: unknown;
  last_question_asked?: unknown;
  case_memory?: {
    unresolved_question_ids?: unknown;
    clarification_reasons?: unknown;
  } | null;
}

export interface ConversationStateUi {
  badgeLabel: string;
  title: string;
  description: string;
  tone: ConversationStateUiTone;
  showClarificationComposerHint: boolean;
  emphasizeReportCta: boolean;
}

export interface SymptomCheckerConversationUiConfig {
  badgeLabel: string;
  tone: GuidanceTone;
  railHeadline: string;
  railBody: string;
  showClarificationComposerHelper: boolean;
  clarificationComposerHelperText: string;
  elevateReportCta: boolean;
  reportCtaHeading: string;
  reportCtaSubcopy: string;
}

export const CLARIFICATION_COMPOSER_HINT =
  "Please answer the current question as directly as you can. If you are unsure, say that and add any detail you do know.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asAnswerMap(
  value: unknown
): Record<string, ConversationAnswerValue> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entryValue]) =>
        key.length > 0 &&
        (typeof entryValue === "string" ||
          typeof entryValue === "boolean" ||
          typeof entryValue === "number")
    )
  ) as Record<string, ConversationAnswerValue>;
}

function asReasonMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, entryValue]) => key.length > 0 && typeof entryValue === "string"
    )
  ) as Record<string, string>;
}

function isConversationStateValue(value: unknown): value is ConversationState {
  return typeof value === "string" && CONVERSATION_STATE_SET.has(value);
}

export function parseConversationStateApi(
  value: unknown
): ConversationStateApi | null {
  return isConversationStateValue(value) ? value : null;
}

export function clientSessionToControlSnapshot(
  session: unknown
): ConversationControlStateSnapshot {
  const sessionRecord = isRecord(session) ? session : {};
  const caseMemory = isRecord(sessionRecord.case_memory)
    ? sessionRecord.case_memory
    : {};

  return {
    answeredQuestionIds: asStringArray(sessionRecord.answered_questions),
    extractedAnswers: asAnswerMap(sessionRecord.extracted_answers),
    unresolvedQuestionIds: asStringArray(caseMemory.unresolved_question_ids),
    clarificationReasons: asReasonMap(caseMemory.clarification_reasons),
    lastQuestionAsked: asOptionalString(sessionRecord.last_question_asked),
  };
}

export function resolveConversationStateFromSession(
  session: unknown,
  apiConversationState: unknown
): ConversationState {
  if (isConversationStateValue(apiConversationState)) {
    return apiConversationState;
  }

  return inferConversationState(clientSessionToControlSnapshot(session));
}

export function getConversationStateUi(
  conversationState: ConversationState,
  readyForReport: boolean
): ConversationStateUi {
  switch (conversationState) {
    case "asking":
      return {
        badgeLabel: "Gathering details",
        title: "Please answer the current clinical question",
        description:
          "Short, direct answers work well here. If you do not know, it is helpful to say that instead of guessing.",
        tone: "info",
        showClarificationComposerHint: false,
        emphasizeReportCta: false,
      };

    case "answered_unconfirmed":
      return {
        badgeLabel: "Reviewing detail",
        title: "Checking the latest answer",
        description:
          "The intake is matching your last message to the current question before moving on.",
        tone: "warning",
        showClarificationComposerHint: false,
        emphasizeReportCta: false,
      };

    case "needs_clarification":
      return {
        badgeLabel: "Need one more detail",
        title: "One answer needs a clearer detail",
        description:
          "A direct reply to the current question will help the intake continue. If you are unsure, say that and include anything you have noticed.",
        tone: "warning",
        showClarificationComposerHint: true,
        emphasizeReportCta: false,
      };

    case "confirmed":
      if (readyForReport) {
        return {
          badgeLabel: "Ready for report",
          title: "We have enough information to prepare the report",
          description:
            "You can generate the veterinary report now, or add one more relevant detail first if something important is missing.",
          tone: "success",
          showClarificationComposerHint: false,
          emphasizeReportCta: true,
        };
      }

      return {
        badgeLabel: "Detail recorded",
        title: "The latest detail has been captured",
        description:
          "The intake can continue with the next clinical question as needed.",
        tone: "success",
        showClarificationComposerHint: false,
        emphasizeReportCta: false,
      };

    case "escalation":
      return {
        badgeLabel: "Urgent next step",
        title: "Immediate veterinary care is the safest next step",
        description:
          "Please contact an emergency or urgent-care veterinarian now. You can still generate the report to take with you.",
        tone: "danger",
        showClarificationComposerHint: false,
        emphasizeReportCta: false,
      };

    case "idle":
    default:
      return {
        badgeLabel: "Ready",
        title: "Start the clinical intake",
        description:
          "Describe what you are seeing in your own words. The triage will guide you through the next useful question.",
        tone: "neutral",
        showClarificationComposerHint: false,
        emphasizeReportCta: false,
      };
  }
}

export function getSymptomCheckerConversationUiConfig(
  conversationState: ConversationState | null | unknown,
  readyForReport: boolean
): SymptomCheckerConversationUiConfig {
  const state = parseConversationStateApi(conversationState) ?? "idle";

  switch (state) {
    case "asking":
      return {
        badgeLabel: "Gathering details",
        tone: "neutral",
        railHeadline: "",
        railBody: "We’re still gathering key clinical details before the report.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta: false,
        reportCtaHeading: "Generate your clinical report",
        reportCtaSubcopy:
          "When you’re ready, we’ll compile the details from this chat into a structured summary.",
      };

    case "answered_unconfirmed":
      return {
        badgeLabel: "Reviewing detail",
        tone: "neutral",
        railHeadline: "",
        railBody:
          "Your latest answer is being checked before the next clinical question.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta: false,
        reportCtaHeading: "Generate your clinical report",
        reportCtaSubcopy:
          "When you’re ready, we’ll compile the details from this chat into a structured summary.",
      };

    case "needs_clarification":
      return {
        badgeLabel: "Need one more detail",
        tone: "warning",
        railHeadline: "We need a clearer answer",
        railBody:
          "Your last reply may not have been specific enough to use safely. Please answer the latest question as directly as you can.",
        showClarificationComposerHelper: true,
        clarificationComposerHelperText: CLARIFICATION_COMPOSER_HINT,
        elevateReportCta: false,
        reportCtaHeading: "Generate your clinical report",
        reportCtaSubcopy:
          "When you’re ready, we’ll compile the details from this chat into a structured summary.",
      };

    case "confirmed":
      return {
        badgeLabel: readyForReport ? "Ready for report" : "Detail recorded",
        tone: "success",
        railHeadline: "",
        railBody: readyForReport
          ? "Enough information has been confirmed to prepare the report."
          : "The latest detail has been confirmed and the intake can continue.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta: readyForReport,
        reportCtaHeading: readyForReport
          ? "Ready for your full veterinary report"
          : "Generate your clinical report",
        reportCtaSubcopy: readyForReport
          ? "Enough detail is in place to produce differentials, tests, and home-care guidance tailored to this conversation."
          : "When you’re ready, we’ll compile the details from this chat into a structured summary.",
      };

    case "escalation":
      return {
        badgeLabel: "Urgent next step",
        tone: "attention",
        railHeadline: "",
        railBody:
          "This conversation may need urgent or in-person veterinary care. Follow the emergency guidance you’ve been given.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta: false,
        reportCtaHeading: "Generate your clinical report",
        reportCtaSubcopy:
          "You can still generate the report to bring with you for urgent care.",
      };

    case "idle":
    default:
      return {
        badgeLabel: "Ready",
        tone: "muted",
        railHeadline: "",
        railBody: "Waiting to start a triage conversation.",
        showClarificationComposerHelper: false,
        clarificationComposerHelperText: "",
        elevateReportCta: false,
        reportCtaHeading: "Generate your clinical report",
        reportCtaSubcopy:
          "When you’re ready, we’ll compile the details from this chat into a structured summary.",
      };
  }
}
