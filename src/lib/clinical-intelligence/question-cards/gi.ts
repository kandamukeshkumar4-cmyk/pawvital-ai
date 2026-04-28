import type { ClinicalQuestionCard } from "../question-card-types";

export const giVomitingFrequency: ClinicalQuestionCard = {
  id: "gi_vomiting_frequency",
  ownerText:
    "How many times has your pet vomited in the last 24 hours, and when did it start?",
  shortReason:
    "Frequency and timing of vomiting help assess severity and whether dehydration or another complication may be developing.",

  complaintFamilies: ["gastrointestinal", "vomiting", "gi"],
  bodySystems: ["gastrointestinal"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["persistent_vomiting"],
  changesUrgencyIf: {
    "more_than_3_times_24h": "Increase urgency and evaluate for dehydration.",
  },

  answerType: "free_text",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const giBloodCheck: ClinicalQuestionCard = {
  id: "gi_blood_check",
  ownerText:
    "Have you seen any blood in the vomit or stool, or has the vomit looked like coffee grounds or the stool looked black and tarry?",
  shortReason:
    "Blood in vomit or stool can indicate a more serious issue in the digestive tract and may change how quickly your pet needs to be seen.",

  complaintFamilies: ["gastrointestinal", "vomiting", "diarrhea", "gi"],
  bodySystems: ["gastrointestinal"],

  phase: "discriminate",

  ownerAnswerability: 2,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["hematemesis", "melena", "hematochezia"],
  changesUrgencyIf: {
    yes: "Increase urgency for in-person evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["gi_vomiting_frequency"],

  sourceIds: ["internal_pending_review"],
};

export const giKeepWaterDownCheck: ClinicalQuestionCard = {
  id: "gi_keep_water_down_check",
  ownerText:
    "Is your pet able to keep small amounts of water down, or does water come back up shortly after drinking?",
  shortReason:
    "The ability to retain water is an important indicator of how stable your pet is and whether dehydration is a concern.",

  complaintFamilies: ["gastrointestinal", "vomiting", "gi"],
  bodySystems: ["gastrointestinal"],

  phase: "discriminate",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 2,
  reportValue: 2,

  screensRedFlags: ["unable_to_retain_water"],
  changesUrgencyIf: {
    no: "Increase urgency for in-person evaluation due to dehydration risk.",
  },

  answerType: "boolean",

  skipIfAnswered: ["gi_vomiting_frequency"],

  sourceIds: ["internal_pending_review"],
};
