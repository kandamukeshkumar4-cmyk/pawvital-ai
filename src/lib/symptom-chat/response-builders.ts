import type { TriageSession } from "@/lib/triage-engine";
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
