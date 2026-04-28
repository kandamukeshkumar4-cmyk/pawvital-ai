import type { ClinicalQuestionCard } from "../question-card-types";

export const limpingWeightBearing: ClinicalQuestionCard = {
  id: "limping_weight_bearing",
  ownerText:
    "Is your pet putting any weight on the affected leg, or are they holding it completely off the ground?",
  shortReason:
    "Whether a pet bears weight on a limb helps distinguish minor strain from more significant injury.",

  complaintFamilies: ["limping", "lameness", "musculoskeletal"],
  bodySystems: ["musculoskeletal"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 3,
  reportValue: 2,

  screensRedFlags: ["non_weight_bearing"],
  changesUrgencyIf: {
    "completely_non_weight_bearing": "Increase urgency for same-day evaluation.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Bears full weight",
    "Bears partial weight",
    "Toe-touching only",
    "Completely non-weight-bearing",
    "Not sure",
  ],

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const limpingTraumaOnset: ClinicalQuestionCard = {
  id: "limping_trauma_onset",
  ownerText:
    "Did the limping start suddenly after a known jump, fall, or accident, or did it come on gradually over days or weeks?",
  shortReason:
    "Sudden onset after trauma suggests a different set of possible injuries than gradual onset.",

  complaintFamilies: ["limping", "lameness", "musculoskeletal", "trauma"],
  bodySystems: ["musculoskeletal"],

  phase: "timeline",

  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 2,
  reportValue: 2,

  screensRedFlags: ["post_trauma_lameness"],
  changesUrgencyIf: {
    sudden_trauma: "Consider same-day evaluation if non-weight-bearing or visibly deformed.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Sudden after trauma",
    "Sudden without trauma",
    "Gradual over days",
    "Gradual over weeks",
    "Not sure",
  ],

  skipIfAnswered: ["limping_weight_bearing"],

  sourceIds: ["internal_pending_review"],
};
