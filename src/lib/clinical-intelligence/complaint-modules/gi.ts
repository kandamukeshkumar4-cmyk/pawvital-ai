import type { ComplaintModule } from "./types";

export const giVomitingDiarrheaModule: ComplaintModule = {
  id: "gi_vomiting_diarrhea",
  displayNameForLogs: "GI Vomiting / Diarrhea",
  triggers: [
    "vomiting",
    "vomit",
    "threw up",
    "puking",
    "diarrhea",
    "loose stool",
    "watery stool",
    "bloody stool",
    "constipated",
    "can't poop",
    "not eating",
    "off food",
    "nausea",
    "upset stomach",
    "gagging",
    "retching",
  ],
  aliases: [
    "gastroenteritis",
    "gi upset",
    "stomach bug",
    "digestive issue",
    "regurgitation",
    "bowel issue",
  ],

  emergencyScreenQuestionIds: [
    "gi_blood_check",
    "gi_keep_water_down_check",
    "bloat_retching_abdomen_check",
    "toxin_exposure_check",
    "collapse_weakness_check",
    "gum_color_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "gi_blood_check",
        "gi_keep_water_down_check",
        "bloat_retching_abdomen_check",
        "toxin_exposure_check",
        "collapse_weakness_check",
        "gum_color_check",
      ],
      maxQuestionsFromPhase: 6,
    },
    {
      id: "characterize",
      questionIds: [
        "gi_vomiting_frequency",
        "gi_blood_check",
        "gi_keep_water_down_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "gi_vomiting_frequency",
        "gi_blood_check",
        "gi_keep_water_down_check",
        "toxin_exposure_check",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "gi_vomiting_frequency",
        "gi_blood_check",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gi_keep_water_down_check",
        "gi_vomiting_frequency",
        "gi_blood_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["gi_vomiting_frequency"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "gi_blood_or_bloat",
      ifRedFlagPositive: [
        "hematemesis",
        "melena",
        "hematochezia",
        "gastric_dilatation_volvulus",
        "unproductive_retching",
        "pale_gums",
        "blue_gums",
        "collapse",
      ],
      result: "emergency",
    },
    {
      id: "gi_toxin_or_foreign_body",
      ifAnySignalPresent: [
        "toxin_exposure",
        "possible_abdominal_pain",
      ],
      result: "emergency",
    },
    {
      id: "gi_severe_dehydration",
      ifRedFlagPositive: ["unable_to_retain_water", "persistent_vomiting"],
      result: "emergency",
    },
    {
      id: "gi_enough_for_report",
      ifEnoughInformation: [
        "gi_vomiting_frequency",
        "gi_blood_check",
        "gi_keep_water_down_check",
        "emergency_global_screen",
      ],
      result: "ready_for_report",
    },
    {
      id: "gi_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "gi_vomiting_frequency",
    "gi_blood_check",
    "gi_keep_water_down_check",
    "emergency_global_screen",
    "toxin_exposure_check",
    "collapse_weakness_check",
    "bloat_retching_abdomen_check",
    "gum_color_check",
  ],

  safetyNotes: [
    "Bloody vomit or diarrhea requires emergency escalation to a veterinary professional.",
    "Nonproductive retching with abdominal distension suggests bloat/GDV; escalate immediately to a veterinarian.",
    "Known or suspected toxin exposure is an emergency regardless of GI signs; seek veterinary care.",
    "Inability to retain water with persistent vomiting risks dehydration; escalate promptly to a veterinarian.",
    "Pale or blue gums during GI workup indicate cardiovascular compromise; escalate immediately to a veterinary clinic.",
  ],
};
