import type { ComplaintModule } from "./types";

export const seizureCollapseNeuroModule: ComplaintModule = {
  id: "seizure_collapse_neuro",
  displayNameForLogs: "Seizure / Collapse / Neurologic Emergency",
  triggers: [
    "seizure",
    "seizures",
    "convulsion",
    "convulsions",
    "twitching",
    "shaking",
    "fit",
    "fits",
    "collapse",
    "fainted",
    "passed out",
    "unconscious",
    "disoriented",
    "circling",
    "head tilt",
    "neurologic",
    "neurological",
    "tremor",
    "trembling",
  ],
  aliases: [
    "neuro emergency",
    "epileptic episode",
    "convulsive episode",
    "neurological event",
  ],

  emergencyScreenQuestionIds: [
    "seizure_neuro_check",
    "collapse_weakness_check",
    "gum_color_check",
    "emergency_global_screen",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "seizure_neuro_check",
        "collapse_weakness_check",
        "gum_color_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "seizure_neuro_check",
        "neuro_seizure_duration",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "seizure_neuro_check",
        "neuro_seizure_duration",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "seizure_neuro_check",
        "neuro_seizure_duration",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "seizure_neuro_check",
        "neuro_seizure_duration",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["seizure_neuro_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "seizure_prolonged_or_collapse",
      ifRedFlagPositive: [
        "seizure_activity",
        "seizure_prolonged",
        "collapse",
        "unresponsive",
      ],
      result: "emergency",
    },
    {
      id: "seizure_neuro_signal",
      ifAnySignalPresent: [
        "possible_neuro_emergency",
        "possible_collapse_or_weakness",
      ],
      result: "emergency",
    },
    {
      id: "seizure_enough_for_report",
      ifEnoughInformation: [
        "seizure_neuro_check",
        "neuro_seizure_duration",
        "collapse_weakness_check",
        "emergency_global_screen",
      ],
      result: "ready_for_report",
    },
    {
      id: "seizure_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "seizure_neuro_check",
    "neuro_seizure_duration",
    "collapse_weakness_check",
    "gum_color_check",
    "emergency_global_screen",
  ],

  safetyNotes: [
    "Prolonged seizures or cluster seizures are a medical emergency; escalate immediately to a veterinary professional.",
    "Collapse or unresponsiveness during a neurologic workup requires immediate emergency routing to a veterinarian.",
    "Pale or blue gums during a seizure workup indicate cardiovascular compromise; escalate immediately to a veterinary clinic.",
    "Repeated seizures without full recovery between episodes require urgent veterinary evaluation.",
  ],
};
