import type { VetKnowledgeSource } from "./source-registry";

export const VET_KNOWLEDGE_SOURCES: VetKnowledgeSource[] = [
  {
    id: "merck-emergency-triage-xabcde",
    title: "Merck Veterinary Manual — Emergency Triage and XABCDE Assessment",
    publisher: "Merck",
    url: "https://www.merckvetmanual.com/special-pet-topics/emergency-and-first-aid/emergency-triage",
    topic: "Emergency triage framework using XABCDE (exsanguination, airway, breathing, circulation, disability, exposure) for rapid patient assessment in veterinary emergency settings.",
    complaintFamilies: ["emergency", "respiratory", "cardiovascular", "trauma"],
    redFlags: [
      "blue_gums",
      "pale_gums",
      "breathing_difficulty",
      "collapse",
      "unresponsive",
      "large_blood_volume",
    ],
    lastReviewedAt: "2026-04-15",
    licenseStatus: "link_only",
    allowedUse: "retrieval_summary_only",
  },
  {
    id: "aaha-pet-emergency-signs",
    title: "AAHA — Pet Emergency Signs Owners Should Recognize",
    publisher: "AAHA",
    url: "https://www.aaha.org/resources/pet-emergency-signs",
    topic: "Owner-facing guidance on recognizing emergency signs in dogs and cats including breathing difficulty, collapse, unproductive retching, and severe bleeding.",
    complaintFamilies: ["emergency", "gastrointestinal", "bleeding"],
    redFlags: [
      "unproductive_retching",
      "rapid_onset_distension",
      "collapse",
      "wound_deep_bleeding",
      "vomit_blood",
      "stool_blood_large",
    ],
    lastReviewedAt: "2026-04-10",
    licenseStatus: "summarized",
    allowedUse: "owner_visible_citation",
  },
  {
    id: "avma-teletriage-vcpr",
    title: "AVMA — Teletriage Guidelines and VCPR Framing",
    publisher: "AVMA",
    url: "https://www.avma.org/resources-tools/telehealth-telemedicine",
    topic: "American Veterinary Medical Association guidance on teletriage scope, Veterinarian-Client-Patient Relationship (VCPR) requirements, and boundaries for remote assessment.",
    complaintFamilies: ["emergency", "general", "telehealth"],
    redFlags: [],
    lastReviewedAt: "2026-04-12",
    licenseStatus: "summarized",
    allowedUse: "internal_reasoning",
  },
  {
    id: "cornell-bloat-gdv-owner",
    title: "Cornell University — Gastric Dilatation-Volvulus (GDV / Bloat) Owner Resource",
    publisher: "Cornell",
    url: "https://www.vet.cornell.edu/hospitals/companion-animal-hospital/soft-tissue-surgery/gdv",
    topic: "Owner-facing information on GDV (bloat) in dogs: pathophysiology summary, breed risk factors (deep-chested breeds), clinical signs including unproductive retching and abdominal distension, and the surgical emergency nature of the condition.",
    complaintFamilies: ["emergency", "gastrointestinal", "bloat"],
    redFlags: [
      "unproductive_retching",
      "rapid_onset_distension",
      "bloat_with_restlessness",
      "distended_abdomen_painful",
    ],
    lastReviewedAt: "2026-04-14",
    licenseStatus: "link_only",
    allowedUse: "owner_visible_citation",
  },
  {
    id: "internal-vet-reviewed-question-notes",
    title: "Internal Vet-Reviewed Question Notes — Symptom Assessment Framework",
    publisher: "InternalVetReviewed",
    topic: "Internally vet-reviewed notes mapping symptom question patterns to complaint families, red-flag awareness, and vet handoff triggers. Covers respiratory, gastrointestinal, dermatological, musculoskeletal, and neurological complaint families.",
    complaintFamilies: [
      "emergency",
      "respiratory",
      "gastrointestinal",
      "dermatological",
      "musculoskeletal",
      "neurological",
    ],
    redFlags: [
      "seizure_activity",
      "seizure_prolonged",
      "sudden_paralysis",
      "heatstroke_signs",
      "urinary_blockage",
      "dystocia_active",
    ],
    lastReviewedAt: "2026-04-20",
    licenseStatus: "internal_allowed",
    allowedUse: "internal_reasoning",
  },
];

export function getAllVetKnowledgeSummaries(): VetKnowledgeSource[] {
  return VET_KNOWLEDGE_SOURCES.map((s) => ({
    ...s,
    complaintFamilies: [...s.complaintFamilies],
    redFlags: [...s.redFlags],
  }));
}

export function getVetKnowledgeSummaryById(
  id: string
): VetKnowledgeSource | undefined {
  const source = VET_KNOWLEDGE_SOURCES.find((s) => s.id === id);
  return source
    ? {
        ...source,
        complaintFamilies: [...source.complaintFamilies],
        redFlags: [...source.redFlags],
      }
    : undefined;
}
