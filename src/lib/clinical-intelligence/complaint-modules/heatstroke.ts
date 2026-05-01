import type { ComplaintModule } from "./types";

export const heatstrokeHeatExposureModule: ComplaintModule = {
  id: "heatstroke_heat_exposure",
  displayNameForLogs: "Heatstroke / Heat Exposure",
  triggers: [
    "heat stroke",
    "heatstroke",
    "overheating",
    "hot car",
    "heavy panting",
    "too hot",
    "collapsed in heat",
    "overheated",
  ],
  aliases: [
    "heat exhaustion",
    "heat injury",
    "brachycephalic heat",
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
      id: "heatstroke_emergency",
      ifRedFlagPositive: [
        "heatstroke_signs",
        "brachycephalic_heat",
        "collapse",
        "breathing_difficulty",
        "pale_gums",
        "blue_gums",
      ],
      result: "emergency",
    },
    {
      id: "heatstroke_signal",
      ifAnySignalPresent: [
        "possible_heat_stroke",
        "possible_collapse_or_weakness",
        "possible_breathing_difficulty",
      ],
      result: "emergency",
    },
    {
      id: "heatstroke_enough_for_report",
      ifEnoughInformation: [
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
        "breathing_difficulty_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "heatstroke_continue",
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
    "Heat exposure with heavy panting or collapse can become life-threatening quickly; escalate immediately to a veterinary professional.",
    "Pale or blue gums during heat exposure indicate severe compromise; seek immediate veterinary attention.",
    "Pets left in hot cars can deteriorate within minutes; escalate immediately to a veterinary clinic.",
    "Difficulty breathing with overheating requires emergency veterinary evaluation.",
  ],
};
