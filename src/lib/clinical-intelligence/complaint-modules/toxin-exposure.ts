import type { ComplaintModule } from "./types";

export const toxinPoisoningExposureModule: ComplaintModule = {
  id: "toxin_poisoning_exposure",
  displayNameForLogs: "Toxin / Poisoning / Exposure",
  triggers: [
    "ate chocolate",
    "ate grapes",
    "ate raisins",
    "ate onions",
    "ate garlic",
    "xylitol",
    "rat poison",
    "rodenticide",
    "antifreeze",
    "mushrooms",
    "cleaning products",
    "chemicals",
    "pills",
    "medication",
    "poison",
    "toxic",
    "toxin",
    "swallowed something",
    "got into",
    "ingested",
  ],
  aliases: [
    "poisoning",
    "toxic exposure",
    "bad food",
    "household chemical",
  ],

  emergencyScreenQuestionIds: [
    "toxin_exposure_check",
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
    "bloat_retching_abdomen_check",
  ],

  phases: [
    {
      id: "emergency_screen",
      questionIds: [
        "toxin_exposure_check",
        "emergency_global_screen",
        "gum_color_check",
        "collapse_weakness_check",
        "bloat_retching_abdomen_check",
      ],
      maxQuestionsFromPhase: 5,
    },
    {
      id: "characterize",
      questionIds: [
        "toxin_exposure_check",
        "gi_vomiting_frequency",
        "gi_blood_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 4,
    },
    {
      id: "discriminate",
      questionIds: [
        "toxin_exposure_check",
        "gi_blood_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 3,
    },
    {
      id: "timeline",
      questionIds: [
        "emergency_global_screen",
        "toxin_exposure_check",
        "gi_vomiting_frequency",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "history",
      questionIds: [
        "gum_color_check",
        "toxin_exposure_check",
        "gi_blood_check",
        "emergency_global_screen",
      ],
      maxQuestionsFromPhase: 2,
    },
    {
      id: "handoff",
      questionIds: ["toxin_exposure_check"],
      maxQuestionsFromPhase: 1,
    },
  ],

  stopConditions: [
    {
      id: "toxin_confirmed_or_symptoms",
      ifRedFlagPositive: [
        "toxin_confirmed",
        "rat_poison_confirmed",
        "toxin_with_symptoms",
        "collapse",
        "vomit_blood",
      ],
      result: "emergency",
    },
    {
      id: "toxin_exposure_signal",
      ifAnySignalPresent: ["toxin_exposure"],
      result: "emergency",
    },
    {
      id: "toxin_enough_for_report",
      ifEnoughInformation: [
        "toxin_exposure_check",
        "emergency_global_screen",
        "gum_color_check",
      ],
      result: "ready_for_report",
    },
    {
      id: "toxin_continue",
      result: "continue",
    },
  ],

  reportFields: [
    "toxin_exposure_check",
    "emergency_global_screen",
    "gum_color_check",
    "collapse_weakness_check",
    "bloat_retching_abdomen_check",
    "gi_vomiting_frequency",
    "gi_blood_check",
  ],

  safetyNotes: [
    "Known or suspected toxin exposure requires immediate veterinary attention regardless of current signs.",
    "Rat poison ingestion can cause delayed bleeding; escalate immediately to a veterinary professional.",
    "Collapse or pale gums after toxin exposure indicates severe systemic effects; escalate immediately to a veterinary clinic.",
    "Persistent vomiting or retching after suspected toxin ingestion warrants prompt veterinary evaluation.",
  ],
};
