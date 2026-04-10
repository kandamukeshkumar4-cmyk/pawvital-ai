/**
 * Urgency Explanations for VET-924
 *
 * Plain-language explanations for each urgency level with evidence citations.
 * Uses provenance from VET-921 to reference specific rules.
 */

import type { EvidenceProvenance } from "./clinical-evidence";

export interface UrgencyExplanation {
  urgency_level: string;
  plain_language: string;
  evidence_citations: string[];
  safe_next_step: string;
  provenance: EvidenceProvenance | null;
}

const URGENCY_EXPLANATIONS: Record<string, Omit<UrgencyExplanation, "urgency_level" | "provenance">> = {
  emergency_vet_now: {
    plain_language: "Go to an emergency vet now because {red_flags}. These signs can indicate a life-threatening condition that needs immediate professional assessment.",
    evidence_citations: ["Red flags detected", "Emergency screen triggered"],
    safe_next_step: "Call your nearest emergency vet or animal hospital immediately. Keep your dog calm and transport carefully.",
  },
  same_day_vet: {
    plain_language: "See a vet today because {symptoms}. While not immediately life-threatening, these signs warrant same-day professional evaluation to prevent worsening.",
    evidence_citations: ["Symptom pattern detected", "Same-day criteria met"],
    safe_next_step: "Call your regular vet for a same-day appointment. Monitor closely and escalate to emergency if signs worsen.",
  },
  vet_within_48h: {
    plain_language: "Schedule a vet visit within 48 hours because {symptoms}. These signs suggest an issue that needs professional attention but isn't urgent.",
    evidence_citations: ["Must-ask questions completed", "48h criteria met"],
    safe_next_step: "Book an appointment with your vet. Keep monitoring and note any changes in symptoms.",
  },
  monitor_and_reassess: {
    plain_language: "Monitor at home because {symptoms}. Current signs don't indicate an urgent issue, but watch for changes.",
    evidence_citations: ["No red flags detected", "Low-risk pattern"],
    safe_next_step: "Monitor your dog closely. If symptoms persist beyond 24-48 hours or worsen, contact your vet.",
  },
  cannot_safely_assess: {
    plain_language: "I can't safely assess this situation because {missing_info}. More information is needed to provide appropriate guidance.",
    evidence_citations: ["Critical information missing", "Uncertainty too high"],
    safe_next_step: "Please provide more details about {missing_info}, or consult your vet for a professional assessment.",
  },
};

export function getUrgencyExplanation(
  urgency_level: string,
  red_flags: string[] = [],
  symptoms: string[] = [],
  missing_info: string[] = [],
  provenance: EvidenceProvenance | null = null
): UrgencyExplanation {
  const explanation = URGENCY_EXPLANATIONS[urgency_level];
  if (!explanation) {
    return {
      urgency_level,
      plain_language: "Please consult your veterinarian for guidance.",
      evidence_citations: [],
      safe_next_step: "Contact your vet",
      provenance: null,
    };
  }

  let plain_language = explanation.plain_language;
  plain_language = plain_language.replace("{red_flags}", red_flags.join(", ") || "the signs you've described");
  plain_language = plain_language.replace("{symptoms}", symptoms.join(", ") || "the symptoms you've described");
  plain_language = plain_language.replace("{missing_info}", missing_info.join(", ") || "missing information");

  return {
    urgency_level,
    plain_language,
    evidence_citations: explanation.evidence_citations,
    safe_next_step: explanation.safe_next_step,
    provenance,
  };
}

export function getAllUrgencyExplanations(): UrgencyExplanation[] {
  return Object.entries(URGENCY_EXPLANATIONS).map(([level, explanation]) => ({
    urgency_level: level,
    ...explanation,
    provenance: null,
  }));
}
