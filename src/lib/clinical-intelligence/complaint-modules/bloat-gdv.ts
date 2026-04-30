import type { ComplaintModule } from "./types";

export const bloatGdvModule: ComplaintModule = {
  id: "bloat_gdv",
  displayNameForLogs: "Bloat / GDV / Abdominal Distension",
  triggers: [
    "bloat",
    "swollen belly",
    "swollen abdomen",
    "hard abdomen",
    "retching",
    "trying to vomit",
    "nothing comes up",
    "restless",
    "distended belly",
  ],
  aliases: [
    "gastric dilatation",
    "gdv",
    "stomach bloat",
    "tight belly",
    "abdominal distension",
  ],

  emergencyScreenQuestionIds: [
    "bloat_retching_abdomen_check",
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "bloat_retching_abdomen_check",
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "bloat_retching_abdomen_check",
        "gi_vomiting_frequency",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "bloat_retching_abdomen_check",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "bloat_retching_abdomen_check",
        "gi_vomiting_frequency",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "bloat_retching_abdomen_check",
        "emergency_global_screen",
        "gi_vomiting_frequency",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["bloat_retching_abdomen_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "bloat_gdv_emergency",
      ifRedFlagPositive: [
        "gastric_dilatation_volvulus",
        "unproductive_retching",
        "rapid_onset_distension",
        "bloat_with_restlessness",
        "distended_abdomen_painful",
        "collapse",
        "pale_gums",
      ],
      result: "emergency",
    },
    {
      id: "bloat_gdv_signal",
      ifAnySignalPresent: [
        "possible_bloat_gdv",
        "possible_nonproductive_retching",
      ],
      result: "emergency",
    },
    {
      id: "bloat_gdv_enough_for_report",
      ifEnoughInformation: [
        "bloat_retching_abdomen_check",
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "bloat_gdv_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "bloat_retching_abdomen_check",
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
    "gi_vomiting_frequency",
  ],

  safetyNotes: [
    "A swollen or hard abdomen with unproductive retching is an emergency; escalate immediately to a veterinary professional.",
    "Rapid onset of abdominal distension requires immediate veterinary attention.",
    "Collapse or pale gums during a bloat workup indicate severe compromise; escalate immediately to a veterinary clinic.",
    "Restlessness with a distended abdomen suggests a life-threatening situation; seek emergency veterinary care.",
  ],
};
