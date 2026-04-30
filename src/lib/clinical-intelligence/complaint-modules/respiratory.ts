import type { ComplaintModule } from "./types";

export const respiratoryDistressModule: ComplaintModule = {
  id: "respiratory_distress",
  displayNameForLogs: "Respiratory Distress / Coughing / Breathing Difficulty",
  triggers: [
    "coughing",
    "cough",
    "hacking",
    "wheezing",
    "sneezing",
    "breathing difficulty",
    "trouble breathing",
    "short of breath",
    "panting excessively",
    "noisy breathing",
    "choking",
    "respiratory distress",
    "labored breathing",
    "difficulty breathing",
    "gasping",
  ],
  aliases: [
    "respiratory issue",
    "breathing problem",
    "airway concern",
    "upper respiratory infection",
  ],

  emergencyScreenQuestionIds: [
    "breathing_difficulty_check",
    "gum_color_check",
    "collapse_weakness_check",
    "emergency_global_screen",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "breathing_difficulty_check",
        "gum_color_check",
        "collapse_weakness_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "breathing_difficulty_check",
        "toxin_exposure_check",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "breathing_difficulty_check",
        "toxin_exposure_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "breathing_difficulty_check",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "breathing_difficulty_check",
        "toxin_exposure_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["breathing_difficulty_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "respiratory_breathing_difficulty_or_collapse",
      ifRedFlagPositive: [
        "breathing_difficulty",
        "collapse",
        "pale_gums",
        "blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "respiratory_breathing_signal",
      ifAnySignalPresent: ["possible_breathing_difficulty"],
      result: "emergency",
    },
    {
      id: "respiratory_enough_for_report",
      ifEnoughInformation: [
        "breathing_difficulty_check",
        "gum_color_check",
        "collapse_weakness_check",
        "emergency_global_screen",
      ],
      result: "ready_for_report",
    },
    {
      id: "respiratory_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "breathing_difficulty_check",
    "gum_color_check",
    "collapse_weakness_check",
    "emergency_global_screen",
    "toxin_exposure_check",
  ],

  safetyNotes: [
    "Difficulty breathing or blue gums indicates a life-threatening emergency; escalate immediately to a veterinary professional.",
    "Sudden onset of severe breathing difficulty requires immediate veterinary attention.",
    "Collapse during a respiratory workup indicates severe compromise; escalate immediately to a veterinary clinic.",
    "Known toxin exposure with breathing difficulty is an emergency regardless of severity; seek veterinary care.",
  ],
};
