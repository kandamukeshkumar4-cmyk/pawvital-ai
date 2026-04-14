import type { TriageSession } from "@/lib/triage-engine";
import {
  buildTerminalOutcomeMessage,
  type UncertaintyTerminalOutcome,
} from "@/lib/clinical/uncertainty-routing";
import { sanitizeSessionForClient } from "./context-helpers";

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

type CannotAssessTerminalOutcome = UncertaintyTerminalOutcome & {
  type: "cannot_assess";
  terminalState: "cannot_assess";
};

interface CannotAssessResponseInput {
  outcome: CannotAssessTerminalOutcome;
  session: TriageSession;
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
