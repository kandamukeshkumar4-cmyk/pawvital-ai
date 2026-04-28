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
        "gi_characterize_vomit_diarrhea",
        "gi_frequency",
        "gi_consistency",
        "gi_color",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "gi_appetite_change",
        "gi_water_intake",
        "gi_abdominal_pain",
        "gi_foreign_body_suspicion",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "gi_onset",
        "gi_progression",
        "gi_last_normal_stool",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gi_prior_episodes",
        "gi_diet_change",
        "gi_medications",
        "gi_parasite_prevention",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["gi_summary"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "gi_blood_or_bloat",
      ifRedFlagPositive: [
        "bloody_vomit",
        "bloody_diarrhea",
        "bloat",
        "nonproductive_retching",
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
        "possible_foreign_body",
        "possible_abdominal_pain",
      ],
      result: "emergency",
    },
    {
      id: "gi_severe_dehydration",
      ifRedFlagPositive: ["unable_to_keep_water_down", "repeated_vomiting"],
      result: "emergency",
    },
    {
      id: "gi_enough_for_report",
      ifEnoughInformation: [
        "gi_characterize_vomit_diarrhea",
        "gi_frequency",
        "gi_onset",
        "gi_appetite_change",
      ],
      result: "ready_for_report",
    },
    {
      id: "gi_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "gi_vomit_diarrhea_character",
    "gi_frequency",
    "gi_consistency",
    "gi_color",
    "gi_blood_present",
    "gi_onset",
    "gi_appetite_change",
    "gi_water_intake",
    "gi_abdominal_pain",
    "gi_toxin_exposure",
    "gi_diet_change",
    "gi_prior_episodes",
  ],

  safetyNotes: [
    "Bloody vomit or diarrhea requires emergency escalation to a veterinary professional.",
    "Nonproductive retching with abdominal distension suggests bloat/GDV; escalate immediately to a veterinarian.",
    "Known or suspected toxin exposure is an emergency regardless of GI signs; seek veterinary care.",
    "Inability to keep water down with repeated vomiting risks dehydration; escalate promptly to a veterinarian.",
    "Pale or blue gums during GI workup indicate cardiovascular compromise; escalate immediately to a veterinary clinic.",
  ],
};
