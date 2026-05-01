import type { ComplaintModule } from "./types";

export const traumaBleedingWoundModule: ComplaintModule = {
  id: "trauma_bleeding_wound",
  displayNameForLogs: "Trauma / Bleeding / Wound",
  triggers: [
    "bleeding",
    "bleed",
    "wound",
    "cut",
    "laceration",
    "injury",
    "trauma",
    "hit by car",
    "car accident",
    "fight wound",
    "bite wound",
    "scratch",
    "abrasion",
    "blood",
  ],
  aliases: [
    "hemorrhage",
    "penetrating wound",
    "open wound",
    "external injury",
  ],

  emergencyScreenQuestionIds: [
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
    "breathing_difficulty_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "emergency_global_screen",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "emergency_global_screen",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["emergency_global_screen"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "trauma_emergency",
      ifRedFlagPositive: [
        "large_blood_volume",
        "wound_deep_bleeding",
        "collapse",
        "unresponsive",
        "pale_gums",
        "blue_gums",
        "breathing_difficulty",
      ],
      result: "emergency",
    },
    {
      id: "trauma_signal",
      ifAnySignalPresent: [
        "possible_trauma",
        "possible_collapse_or_weakness",
        "possible_pale_gums",
        "possible_blue_gums",
        "possible_breathing_difficulty",
      ],
      result: "emergency",
    },
    {
      id: "trauma_enough_for_report",
      ifEnoughInformation: [
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "trauma_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
    "breathing_difficulty_check",
  ],

  safetyNotes: [
    "Large-volume or spurting bleeding is an emergency; apply firm pressure and seek immediate veterinary care.",
    "Deep or penetrating wounds may involve hidden internal injury; escalate to a veterinary professional promptly.",
    "Collapse or pale gums after trauma indicate severe blood loss or shock; seek emergency veterinary attention immediately.",
    "Unresponsiveness after an accident requires immediate emergency veterinary evaluation.",
  ],
};
