import type { ComplaintModule } from "./types";

export const urinaryObstructionModule: ComplaintModule = {
  id: "urinary_obstruction",
  displayNameForLogs: "Urinary Obstruction / Urination Problems",
  triggers: [
    "can't pee",
    "not peeing",
    "straining to pee",
    "straining to urinate",
    "blood in urine",
    "frequent urination",
    "peeing a lot",
    "accident in house",
    "incontinence",
    "leaking urine",
    "urinary tract",
    "painful urination",
    "crying when peeing",
    "blocked",
    "urinary obstruction",
    "difficulty urinating",
    "urination problems",
  ],
  aliases: [
    "urinary issue",
    "urination problem",
    "bladder concern",
    "uti",
  ],

  emergencyScreenQuestionIds: [
    "urinary_blockage_check",
    "gum_color_check",
    "collapse_weakness_check",
    "emergency_global_screen",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "urinary_blockage_check",
        "gum_color_check",
        "collapse_weakness_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "characterize",
      questionIds: [
        "urinary_blockage_check",
        "urinary_straining_output",
        "emergency_global_screen",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "urinary_blockage_check",
        "urinary_straining_output",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "urinary_blockage_check",
        "urinary_straining_output",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "urinary_blockage_check",
        "urinary_straining_output",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["urinary_blockage_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "urinary_blockage_or_no_urine",
      ifRedFlagPositive: ["urinary_blockage", "no_urine_24h"],
      result: "emergency",
    },
    {
      id: "urinary_obstruction_signal",
      ifAnySignalPresent: ["possible_urinary_obstruction"],
      result: "emergency",
    },
    {
      id: "urinary_enough_for_report",
      ifEnoughInformation: [
        "urinary_blockage_check",
        "urinary_straining_output",
        "emergency_global_screen",
        "gum_color_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "urinary_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "urinary_blockage_check",
    "urinary_straining_output",
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
  ],

  safetyNotes: [
    "Inability to pass urine can become life-threatening within hours; escalate immediately to a veterinary professional.",
    "Straining to urinate with little or no output is an emergency requiring immediate veterinary attention.",
    "Collapse during a urinary workup indicates severe systemic compromise; escalate immediately to a veterinary clinic.",
    "Blood in urine with straining suggests obstruction or serious urinary tract injury; seek prompt veterinary evaluation.",
  ],
};
