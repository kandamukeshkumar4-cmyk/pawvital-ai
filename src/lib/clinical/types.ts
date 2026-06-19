// Clinical data types and entry-builder factories.
// These are the authoritative interfaces used by SYMPTOM_MAP, DISEASE_DB, BREED_MODIFIERS, and FOLLOW_UP_QUESTIONS.
// Do NOT add runtime logic here — this file is pure schema.
// =============================================================================
// CLINICAL MATRIX — The hardcoded medical brain
// Maps: Symptoms → Linked Diseases → Required Follow-Up Questions → Breed Multipliers
// This is NOT AI-generated at runtime. It's the deterministic backbone.
// =============================================================================

export interface SymptomEntry {
  linked_diseases: string[];
  follow_up_questions: string[];
  red_flags: string[]; // If any of these are true → immediate emergency
  body_systems: string[];
}

export interface DiseaseEntry {
  name: string;
  medical_term: string;
  description: string;
  base_probability: number; // 0-1 baseline
  age_modifier: { puppy: number; adult: number; senior: number }; // multipliers
  urgency: "low" | "moderate" | "high" | "emergency";
  key_differentiators: string[]; // What makes this different from similar conditions
  typical_tests: string[];
  typical_home_care: string[];
}

export interface BreedModifiers {
  [disease: string]: number; // multiplier (1.0 = normal, 2.8 = 2.8x more likely)
}

export interface FollowUpQuestion {
  id: string;
  question_text: string; // Natural language for the LLM to rephrase
  data_type: "boolean" | "string" | "number" | "choice";
  choices?: string[];
  extraction_hint: string; // Helps LLM extract this from free text
  critical: boolean; // Must be answered before diagnosis
}

export const DEFAULT_AGE_MODIFIER: DiseaseEntry["age_modifier"] = {
  puppy: 0.8,
  adult: 1.0,
  senior: 1.2,
};

export function makeDiseaseEntry({
  name,
  medicalTerm,
  description,
  urgency,
  keyDifferentiators,
  typicalTests,
  typicalHomeCare,
  baseProbability = 0.08,
  ageModifier = DEFAULT_AGE_MODIFIER,
}: {
  name: string;
  medicalTerm: string;
  description: string;
  urgency: DiseaseEntry["urgency"];
  keyDifferentiators: string[];
  typicalTests: string[];
  typicalHomeCare: string[];
  baseProbability?: number;
  ageModifier?: DiseaseEntry["age_modifier"];
}): DiseaseEntry {
  return {
    name,
    medical_term: medicalTerm,
    description,
    base_probability: baseProbability,
    age_modifier: ageModifier,
    urgency,
    key_differentiators: keyDifferentiators,
    typical_tests: typicalTests,
    typical_home_care: typicalHomeCare,
  };
}

export function makeSystemicDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Physical exam plus CBC/chemistry and targeted diagnostics"],
    typicalHomeCare: ["Schedule prompt veterinary evaluation and monitor appetite, energy, hydration, and comfort"],
  });
}

export function makeRespiratoryDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Respiratory exam with pulse oximetry and thoracic imaging"],
    typicalHomeCare: ["Keep activity low, reduce stress, and seek urgent care if breathing worsens or gums change color"],
  });
}

export function makeDermDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Dermatologic exam with cytology, skin scrape, or otoscopic evaluation as indicated"],
    typicalHomeCare: ["Prevent self-trauma, keep the area clean, and avoid new topical products until examined"],
  });
}

export function makeNeuroOrOrthoDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Neurologic and orthopedic examination with imaging as needed"],
    typicalHomeCare: ["Restrict activity and seek veterinary care promptly if weakness, pain, or gait changes progress"],
  });
}

export function makeOphthalmicDisease(
  name: string,
  medicalTerm: string,
  description: string,
  urgency: DiseaseEntry["urgency"],
  baseProbability: number,
  ageModifier?: DiseaseEntry["age_modifier"]
): DiseaseEntry {
  return makeDiseaseEntry({
    name,
    medicalTerm,
    description,
    urgency,
    baseProbability,
    ageModifier,
    keyDifferentiators: [description],
    typicalTests: ["Ophthalmic examination with fluorescein stain and tonometry as needed"],
    typicalHomeCare: ["Prevent rubbing, avoid human eye medications, and seek urgent eye care if pain or vision loss is present"],
  });
}


