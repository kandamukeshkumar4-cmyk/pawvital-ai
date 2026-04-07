import type { Pet, SymptomCheck } from "@/types";

/** Fixed timestamps (avoid Date.now in server render / ESLint purity). */
const T0 = "2025-06-01T12:00:00.000Z";
const T1 = "2026-01-18T10:00:00.000Z";
const T2 = "2026-02-08T16:45:00.000Z";
const T3 = "2026-02-20T09:15:00.000Z";
const T4 = "2026-03-01T14:00:00.000Z";
const T5 = "2026-03-05T10:30:00.000Z";

export const DEMO_HOUSEHOLD_PETS: Pet[] = [
  {
    id: "demo_1",
    user_id: "demo_user",
    name: "Bailey",
    species: "dog",
    breed: "Golden Retriever",
    age_years: 4,
    age_months: 2,
    weight: 65,
    weight_unit: "lbs",
    gender: "male",
    is_neutered: true,
    existing_conditions: [],
    medications: [],
    created_at: T0,
    updated_at: T0,
  },
  {
    id: "demo_2",
    user_id: "demo_user",
    name: "Luna",
    species: "cat",
    breed: "Siamese",
    age_years: 2,
    age_months: 8,
    weight: 12,
    weight_unit: "lbs",
    gender: "female",
    is_neutered: true,
    existing_conditions: [],
    medications: [],
    created_at: T0,
    updated_at: T0,
  },
  {
    id: "demo_3",
    user_id: "demo_user",
    name: "Max",
    species: "dog",
    breed: "German Shepherd",
    age_years: 7,
    age_months: 0,
    weight: 85,
    weight_unit: "lbs",
    gender: "male",
    is_neutered: true,
    existing_conditions: ["Arthritis"],
    medications: ["Carprofen"],
    created_at: T0,
    updated_at: T0,
  },
];

const baileyReport = (partial: Record<string, unknown>) => JSON.stringify(partial);

export const DEMO_HOUSEHOLD_SYMPTOM_CHECKS: SymptomCheck[] = [
  {
    id: "chk_bailey_1",
    pet_id: "demo_1",
    symptoms: "Vomiting, lethargy, not eating",
    ai_response: baileyReport({
      severity: "high",
      recommendation: "vet_24h",
      title: "Vomiting and Lethargy",
      explanation:
        "These signs can indicate dehydration or a gastrointestinal issue that needs prompt veterinary assessment.",
      differential_diagnoses: [
        {
          condition: "Gastroenteritis",
          likelihood: "high" as const,
          description: "Inflammation of stomach and intestines; common with acute vomiting.",
        },
      ],
      actions: ["Offer small amounts of water frequently."],
      warning_signs: ["Repeated vomiting with inability to keep water down"],
      confidence: 0.82,
    }),
    severity: "high",
    recommendation: "vet_24h",
    created_at: T5,
  },
  {
    id: "chk_bailey_2",
    pet_id: "demo_1",
    symptoms: "Excessive scratching, red ears",
    ai_response: baileyReport({
      severity: "medium",
      recommendation: "vet_48h",
      title: "Excessive Scratching",
      explanation:
        "Scratching may reflect allergies, parasites, or infection. Monitoring and vet visit if worsening.",
      differential_diagnoses: [
        {
          condition: "Seasonal allergies",
          likelihood: "high" as const,
          description: "Environmental allergens often cause pruritus and ear inflammation.",
        },
      ],
      actions: ["Check for fleas; use vet-approved parasite control."],
      warning_signs: ["Open wounds or bleeding from scratching"],
      confidence: 0.71,
    }),
    severity: "medium",
    recommendation: "vet_48h",
    created_at: T4,
  },
  {
    id: "chk_bailey_3",
    pet_id: "demo_1",
    symptoms: "Slight limp after play",
    ai_response: baileyReport({
      severity: "low",
      recommendation: "monitor",
      title: "Mild Limp After Activity",
      explanation: "A brief mild limp after vigorous play often resolves with rest. Watch for persistence.",
      differential_diagnoses: [
        {
          condition: "Soft tissue strain",
          likelihood: "high" as const,
          description: "Common after exercise; improves over 24–48h with rest.",
        },
      ],
      actions: ["Strict rest from running and jumping for 24–48 hours."],
      warning_signs: ["Non-weight-bearing limb"],
      confidence: 0.68,
    }),
    severity: "low",
    recommendation: "monitor",
    created_at: T3,
  },
  {
    id: "chk_bailey_4",
    pet_id: "demo_1",
    symptoms: "Loose stool",
    ai_response: baileyReport({
      severity: "medium",
      recommendation: "vet_48h",
      title: "Loose Stool",
      explanation: "Intermittent soft stools — bland diet transition and watch for blood or dehydration.",
      differential_diagnoses: [
        {
          condition: "Dietary indiscretion",
          likelihood: "moderate" as const,
          description: "Often self-limited with dietary management.",
        },
      ],
      actions: ["Transition to a bland diet for 48 hours."],
      warning_signs: ["Blood in stool", "Lethargy"],
      confidence: 0.64,
    }),
    severity: "medium",
    recommendation: "vet_48h",
    created_at: T2,
  },
  {
    id: "chk_max_1",
    pet_id: "demo_3",
    symptoms: "Vomiting and lethargy",
    ai_response: "Needs vet",
    severity: "high",
    recommendation: "emergency_vet",
    created_at: T1,
  },
];
