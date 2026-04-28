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
        "skin_location",
        "skin_changes",
        "skin_exposure",
        "skin_itch_severity",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "skin_duration",
        "skin_seasonal_pattern",
        "skin_diet_change",
        "skin_new_products",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "skin_onset",
        "skin_progression",
        "skin_previous_episodes",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "skin_prior_conditions",
        "skin_medications",
        "skin_parasite_prevention",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["skin_summary"],
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
        "skin_location",
        "skin_changes",
        "skin_duration",
        "skin_onset",
      ],
      result: "ready_for_report",
    },
    {
      id: "skin_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "skin_location",
    "skin_changes_description",
    "skin_duration",
    "skin_onset",
    "skin_severity",
    "skin_exposure_history",
    "skin_prior_episodes",
    "skin_medications",
  ],

  safetyNotes: [
    "Facial swelling with itching may indicate anaphylaxis; escalate immediately to a veterinary professional.",
    "Breathing difficulty concurrent with skin signs is an emergency requiring immediate veterinary care.",
    "Collapse or pale gums during a skin workup requires immediate emergency routing to a veterinarian.",
    "Repeated vomiting alongside skin changes suggests systemic reaction or toxin exposure; seek veterinary evaluation.",
  ],
};
