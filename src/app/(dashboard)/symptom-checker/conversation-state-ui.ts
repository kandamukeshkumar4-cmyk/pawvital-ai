/**
 * VET-833: Pure presentational mapping from API conversationState → owner-facing UI copy.
 * No React imports — safe for unit tests and deterministic rendering.
 */

export type ConversationStateApi =
  | "idle"
  | "asking"
  | "answered_unconfirmed"
  | "confirmed"
  | "needs_clarification"
  | "escalation";

export type GuidanceTone = "muted" | "neutral" | "warning" | "success" | "attention";

const CLARIFICATION_COMPOSER_HINT =
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

export function isConversationStateApi(
  value: unknown
): value is ConversationStateApi {
  return (
    value === "idle" ||
    value === "asking" ||
    value === "answered_unconfirmed" ||
    value === "confirmed" ||
    value === "needs_clarification" ||
    value === "escalation"
  );
}

export function parseConversationStateApi(
  value: unknown
): ConversationStateApi | null {
  return isConversationStateApi(value) ? value : null;
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
