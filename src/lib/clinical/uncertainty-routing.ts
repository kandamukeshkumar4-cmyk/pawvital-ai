import type { ConversationState } from "@/lib/conversation-state/types";
import type { PetProfile, TriageSession } from "@/lib/triage-engine";
import { resolveUncertainty } from "./uncertainty-contract";

export type UncertaintyTerminalState = "cannot_assess" | "out_of_scope";

export interface UncertaintyTerminalOutcome {
  type: UncertaintyTerminalState;
  terminalState: UncertaintyTerminalState;
  reasonCode: string;
  ownerMessage: string;
  recommendedNextStep: string;
  conversationState: ConversationState;
}

interface OutOfScopePattern {
  reasonCode: string;
  ownerMessage: string;
  recommendedNextStep: string;
  regex: RegExp;
}

const OUT_OF_SCOPE_PATTERNS: OutOfScopePattern[] = [
  {
    reasonCode: "educational_hypothetical",
    ownerMessage:
      "I can't safely triage a hypothetical or educational scenario as if it were a live medical case.",
    recommendedNextStep:
      "If this is happening to your dog right now, describe the actual symptoms you're seeing or contact your veterinarian directly.",
    regex:
      /\b(what if my dog|hypothetical|hypothetically|in theory|just wondering if|for future reference)\b/i,
  },
  {
    reasonCode: "medication_dosing_request",
    ownerMessage:
      "I can't provide medication dosing or home-treatment instructions safely through this symptom triage flow.",
    recommendedNextStep:
      "Please contact your veterinarian or an emergency clinic before giving medication. If your dog is currently sick, tell me the symptoms you're seeing.",
    regex:
      /\b(dose|dosage|how much|mg\b|milligrams?\b|can i give|should i give|benadryl|diphenhydramine|ibuprofen|advil|tylenol|acetaminophen|pepto|melatonin)\b/i,
  },
  {
    reasonCode: "procedure_guidance_request",
    ownerMessage:
      "I can't safely advise on surgery, procedures, sedation, or post-procedure management in this triage flow.",
    recommendedNextStep:
      "Please speak with your veterinarian for procedure-specific guidance. If your dog has current symptoms, tell me what you're noticing.",
    regex:
      /\b(surgery|surgical|procedure|sedation|anesthesia|spay|neuter|stitches|staples|suture removal|drain removal)\b/i,
  },
  {
    reasonCode: "non_triage_topic",
    ownerMessage:
      "That request is outside the symptom-assessment scope of this tool.",
    recommendedNextStep:
      "If you need symptom triage, describe what your dog is doing right now. For everything else, please speak with your veterinarian.",
    regex:
      /\b(insurance|billing|claim|coverage|obedience training|behavior training|diet plan|nutrition plan|raw diet|home cooked diet|breeding advice|stud service|whelping advice)\b/i,
  },
];

function normalizeSpecies(species: string | undefined): string {
  return String(species ?? "").trim().toLowerCase();
}

function shouldEvaluateOutOfScope(
  session: TriageSession,
  message: string
): boolean {
  if (!message.trim()) {
    return false;
  }

  if (session.last_question_asked && session.known_symptoms.length > 0) {
    return false;
  }

  return true;
}

function getOutOfScopeNextStep(
  recommendedNextStep: string
): string {
  const rule = resolveUncertainty("out_of_scope", {
    isCriticalSign: false,
    hasAlternateObservable: false,
    isEmergencyScreen: false,
    confidenceScore: 0.1,
  });

  return recommendedNextStep || rule.safeNextStep || "Please contact your veterinarian for direct guidance.";
}

function formatCriticalQuestion(questionText: string | null | undefined): string {
  const trimmed = String(questionText ?? "").trim();
  return trimmed ? `The missing sign is: ${trimmed}` : "A critical sign is still unconfirmed.";
}

export function detectOutOfScopeTurn(input: {
  pet: PetProfile;
  session: TriageSession;
  message: string;
}): UncertaintyTerminalOutcome | null {
  const { pet, session, message } = input;

  if (normalizeSpecies(pet.species) !== "dog") {
    return {
      type: "out_of_scope",
      terminalState: "out_of_scope",
      reasonCode: "species_not_supported",
      ownerMessage:
        "I can only assess dog symptom cases in this workflow right now.",
      recommendedNextStep:
        "Please contact a veterinarian for help with this species.",
      conversationState: "idle",
    };
  }

  if (!shouldEvaluateOutOfScope(session, message)) {
    return null;
  }

  const matchedPattern = OUT_OF_SCOPE_PATTERNS.find(({ regex }) =>
    regex.test(message)
  );
  if (!matchedPattern) {
    return null;
  }

  return {
    type: "out_of_scope",
    terminalState: "out_of_scope",
    reasonCode: matchedPattern.reasonCode,
    ownerMessage: matchedPattern.ownerMessage,
    recommendedNextStep: getOutOfScopeNextStep(
      matchedPattern.recommendedNextStep
    ),
    conversationState: "idle",
  };
}

export function buildCannotAssessOutcome(input: {
  petName: string;
  questionId: string;
  questionText?: string | null;
}): UncertaintyTerminalOutcome {
  const { petName, questionId, questionText } = input;
  const rule = resolveUncertainty("owner_cannot_assess", {
    isCriticalSign: true,
    hasAlternateObservable: false,
    isEmergencyScreen: true,
    confidenceScore: 0.1,
  });

  return {
    type: "cannot_assess",
    terminalState: "cannot_assess",
    reasonCode: `owner_cannot_assess_${questionId}`,
    ownerMessage: `I can't safely continue without confirming this critical sign for ${petName}. ${formatCriticalQuestion(
      questionText
    )}`,
    recommendedNextStep:
      rule.safeNextStep ||
      "Please seek veterinary assessment rather than guessing at home.",
    conversationState: "escalation",
  };
}

export function buildTerminalOutcomeMessage(
  outcome: UncertaintyTerminalOutcome
): string {
  return `${outcome.ownerMessage}\n\nRecommended next step: ${outcome.recommendedNextStep}`;
}
