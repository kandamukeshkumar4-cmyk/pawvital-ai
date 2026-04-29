import type { ComplaintModule } from "./types";

export const skinItchingAllergyModule: ComplaintModule = {
  id: "skin_itching_allergy",
  displayNameForLogs: "Skin Itching / Allergy",
  triggers: [
    "itching",
    "scratching",
    "itchy",
    "skin",
    "rash",
    "allergy",
    "allergic",
    "hives",
    " bumps",
    "red skin",
    "chewing paws",
    "licking paws",
    "hair loss",
    "flaky skin",
    "hot spot",
  ],
  aliases: [
    "skin problem",
    "allergic reaction",
    "dermatitis",
    "pruritus",
    "atopy",
    "skin irritation",
  ],

  emergencyScreenQuestionIds: [
    "skin_emergency_allergy_screen",
    "breathing_difficulty_check",
    "collapse_weakness_check",
    "gum_color_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "skin_emergency_allergy_screen",
        "breathing_difficulty_check",
        "collapse_weakness_check",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
        "skin_emergency_allergy_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
        "skin_emergency_allergy_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "skin_emergency_allergy_screen",
        "skin_location_distribution",
        "skin_changes_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "skin_exposure_check",
        "skin_location_distribution",
        "skin_changes_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["skin_location_distribution"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "skin_facial_swelling_or_breathing",
      ifRedFlagPositive: [
        "facial_swelling",
        "breathing_difficulty",
        "collapse",
        "pale_gums",
        "blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "skin_repeated_vomiting_with_itching",
      ifAnySignalPresent: [
        "possible_nonproductive_retching",
        "possible_bloody_vomit",
        "toxin_exposure",
      ],
      result: "emergency",
    },
    {
      id: "skin_enough_for_report",
      ifEnoughInformation: [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check",
        "skin_emergency_allergy_screen",
      ],
      result: "ready_for_report",
    },
    {
      id: "skin_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "skin_location_distribution",
    "skin_changes_check",
    "skin_exposure_check",
    "skin_emergency_allergy_screen",
    "breathing_difficulty_check",
    "collapse_weakness_check",
    "gum_color_check",
  ],

  safetyNotes: [
    "Facial swelling with itching may indicate anaphylaxis; escalate immediately to a veterinary professional.",
    "Breathing difficulty concurrent with skin signs is an emergency requiring immediate veterinary care.",
    "Collapse or pale gums during a skin workup requires immediate emergency routing to a veterinarian.",
    "Repeated vomiting alongside skin changes suggests systemic reaction or toxin exposure; seek veterinary evaluation.",
  ],
};
