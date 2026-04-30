import type { ComplaintModule } from "./types";

export const collapseWeaknessModule: ComplaintModule = {
  id: "collapse_weakness",
  displayNameForLogs: "Collapse / Weakness / Fainting",
  triggers: [
    "collapse",
    "collapsed",
    "fainted",
    "weak",
    "extreme weakness",
    "cannot stand",
    "unresponsive",
    "pale gums",
  ],
  aliases: [
    "syncope",
    "fainting episode",
    "severe weakness",
    "unable to walk",
  ],

  emergencyScreenQuestionIds: [
    "collapse_weakness_check",
    "emergency_global_screen",
    "gum_color_check",
    "breathing_difficulty_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "collapse_weakness_check",
        "emergency_global_screen",
        "gum_color_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "collapse_weakness_check",
        "emergency_global_screen",
        "gum_color_check",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "collapse_weakness_check",
        "emergency_global_screen",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "collapse_weakness_check",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "collapse_weakness_check",
        "emergency_global_screen",
        "breathing_difficulty_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["collapse_weakness_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "collapse_weakness_emergency",
      ifRedFlagPositive: [
        "collapse",
        "unresponsive",
        "pale_gums",
        "blue_gums",
        "breathing_difficulty",
      ],
      result: "emergency",
    },
    {
      id: "collapse_weakness_signal",
      ifAnySignalPresent: [
        "possible_collapse_or_weakness",
        "possible_pale_gums",
        "possible_blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "collapse_weakness_enough_for_report",
      ifEnoughInformation: [
        "collapse_weakness_check",
        "emergency_global_screen",
        "gum_color_check",
        "breathing_difficulty_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "collapse_weakness_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "collapse_weakness_check",
    "emergency_global_screen",
    "gum_color_check",
    "breathing_difficulty_check",
  ],

  safetyNotes: [
    "Collapse or unresponsiveness is a medical emergency; escalate immediately to a veterinary professional.",
    "Pale or blue gums indicate poor circulation or oxygenation; seek immediate veterinary attention.",
    "Difficulty breathing with weakness suggests severe compromise; escalate immediately to a veterinary clinic.",
    "Inability to stand or walk normally requires prompt veterinary evaluation.",
  ],
};
