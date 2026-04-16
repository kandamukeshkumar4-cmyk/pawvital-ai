import type { TriageSession } from "@/lib/triage-engine";
import {
  buildTerminalOutcomeMessage,
  type AlternateObservableRecoveryOutcome,
  type UncertaintyTerminalOutcome,
} from "@/lib/clinical/uncertainty-routing";
import { recordConversationTelemetry } from "@/lib/symptom-memory";
import { sanitizeSessionForClient } from "./context-helpers";
import type { ImageGateWarning } from "@/lib/image-gate";

interface EmergencyResponseInput {
  petName: string;
  session: TriageSession;
}

interface VisionEmergencyResponseInput extends EmergencyResponseInput {
  flags: string[];
}

interface RedFlagEmergencyResponseInput extends EmergencyResponseInput {
  redFlags: string[];
}

interface CannotAssessResponseInput {
  outcome: UncertaintyTerminalOutcome;
  session: TriageSession;
}

function assertCannotAssessOutcome(outcome: UncertaintyTerminalOutcome) {
  if (
    outcome.type !== "cannot_assess" ||
    outcome.terminalState !== "cannot_assess"
  ) {
    throw new Error(
      "Cannot-assess response builder requires a cannot_assess terminal outcome"
    );
  }
}
interface OutOfScopeResponseInput {
  outcome: UncertaintyTerminalOutcome;
  session: TriageSession;
}

function assertOutOfScopeOutcome(outcome: UncertaintyTerminalOutcome) {
  if (
    outcome.type !== "out_of_scope" ||
    outcome.terminalState !== "out_of_scope"
  ) {
    throw new Error(
      "Out-of-scope response builder requires an out_of_scope terminal outcome"
    );
  }
}

function buildEmergencyResponse(message: string, session: TriageSession) {
  return {
    type: "emergency" as const,
    message,
    session: sanitizeSessionForClient(session),
    ready_for_report: true,
  };
}

export function buildVisionGuardrailEmergencyResponse(
  input: VisionEmergencyResponseInput
) {
  const bulletFlags = input.flags.map((flag) => `• ${flag}`).join("\n");

  return buildEmergencyResponse(
    `Based on my analysis of ${input.petName}'s photo, I've detected signs that require IMMEDIATE veterinary attention:\n\n${bulletFlags}\n\nPlease take ${input.petName} to the nearest emergency veterinary hospital NOW. Do not wait. Call ahead so they can prepare. I can generate a full report for the vet while you're on the way.`,
    input.session
  );
}

export function buildRedFlagEmergencyResponse(
  input: RedFlagEmergencyResponseInput
) {
  const flags = input.redFlags.join(", ");

  return buildEmergencyResponse(
    `I've detected potential emergency signs (${flags}). This could be life-threatening. Please take ${input.petName} to the nearest emergency veterinary hospital IMMEDIATELY. Do not wait. Call ahead so they can prepare. I can still generate a full analysis while you're on the way.`,
    input.session
  );
}

export function buildCannotAssessResponse(input: CannotAssessResponseInput) {
  assertCannotAssessOutcome(input.outcome);

  return {
    type: input.outcome.type,
    terminal_state: input.outcome.terminalState,
    reason_code: input.outcome.reasonCode,
    owner_message: input.outcome.ownerMessage,
    recommended_next_step: input.outcome.recommendedNextStep,
    message: buildTerminalOutcomeMessage(input.outcome),
    session: sanitizeSessionForClient(input.session),
    ready_for_report: false,
    conversationState: input.outcome.conversationState,
  };
}
export function buildOutOfScopeResponse(input: OutOfScopeResponseInput) {
  assertOutOfScopeOutcome(input.outcome);

  return {
    type: input.outcome.type,
    terminal_state: input.outcome.terminalState,
    reason_code: input.outcome.reasonCode,
    owner_message: input.outcome.ownerMessage,
    recommended_next_step: input.outcome.recommendedNextStep,
    message: buildTerminalOutcomeMessage(input.outcome),
    session: sanitizeSessionForClient(input.session),
    ready_for_report: false,
    conversationState: input.outcome.conversationState,
  };
}

export function buildTerminalOutcomeResponse(
  outcome: UncertaintyTerminalOutcome,
  session: TriageSession
) {
  if (outcome.type === "cannot_assess") {
    return buildCannotAssessResponse({ outcome, session });
  }

  return {
    type: outcome.type,
    terminal_state: outcome.terminalState,
    reason_code: outcome.reasonCode,
    owner_message: outcome.ownerMessage,
    recommended_next_step: outcome.recommendedNextStep,
    message: buildTerminalOutcomeMessage(outcome),
    session: sanitizeSessionForClient(session),
    ready_for_report: false,
    conversationState: outcome.conversationState,
  };
}

export function recordTerminalOutcomeTelemetry(
  session: TriageSession,
  outcome: UncertaintyTerminalOutcome,
  questionId?: string,
  turnNumberOverride?: number
) {
  const turnNumber =
    turnNumberOverride ?? (session.case_memory?.turn_count ?? 0);

  return recordConversationTelemetry(session, {
    event: "terminal_outcome",
    turn_count: turnNumber,
    question_id: questionId,
    outcome: "success",
    reason: outcome.reasonCode,
    terminal_outcome_metric: {
      terminal_state: outcome.terminalState,
      reason_code: outcome.reasonCode,
      conversation_state: outcome.conversationState,
      recommended_next_step: outcome.recommendedNextStep,
      turn_number: turnNumber,
      ...(questionId ? { question_id: questionId } : {}),
    },
  });
}

export function buildAlternateObservableRecoveryResponse(
  outcome: AlternateObservableRecoveryOutcome,
  session: TriageSession
) {
  return {
    type: "question",
    question_id: outcome.questionId,
    reason_code: outcome.reasonCode,
    message: outcome.message,
    session: sanitizeSessionForClient(session),
    ready_for_report: false,
    conversationState: outcome.conversationState,
  };
}

export function buildImageGateMessage(
  petName: string,
  gate: ImageGateWarning
): string {
  if (gate.reason === "blurry") {
    return `This photo is a little too blurry for me to reliably analyze ${petName}'s wound or skin issue. Please retake a clear, well-lit close-up of the affected area, or use Analyze Anyway if this is the best photo you have.`;
  }

  if (gate.reason === "low_resolution") {
    return `This photo looks too small or compressed for reliable wound analysis. Please retake a closer, sharper photo that fills most of the frame with the affected area, or use Analyze Anyway if needed.`;
  }

  const labelDetail = gate.topLabel
    ? ` The quick framing check matched "${gate.topLabel}".`
    : "";

  return `This looks more like a full-pet or unrelated photo than a close-up of the affected area.${labelDetail} Please upload a close, well-lit photo of the wound or skin issue, or use Analyze Anyway if this is the only image available.`;
}
