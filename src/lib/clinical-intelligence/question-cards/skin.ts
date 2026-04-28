import type { ClinicalQuestionCard } from "../question-card-types";

export const skinLocationDistribution: ClinicalQuestionCard = {
  id: "skin_location_distribution",
  ownerText:
    "Where on your pet’s body are you noticing the skin or coat changes? (For example: ears, paws, belly, back, face, or all over.)",
  shortReason:
    "The location and pattern of skin changes help narrow possible causes and guide the next questions.",

  complaintFamilies: ["skin", "dermatology", "allergy"],
  bodySystems: ["integumentary"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 2,
  reportValue: 2,

  screensRedFlags: [],
  changesUrgencyIf: {},

  answerType: "free_text",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const skinChangesCheck: ClinicalQuestionCard = {
  id: "skin_changes_check",
  ownerText:
    "What do the affected areas look like? (For example: red, flaky, crusty, moist, hairless, bumpy, or have open sores.)",
  shortReason:
    "Describing the appearance of skin changes helps distinguish between different possible causes.",

  complaintFamilies: ["skin", "dermatology", "allergy"],
  bodySystems: ["integumentary"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 3,
  reportValue: 2,

  screensRedFlags: [],
  changesUrgencyIf: {},

  answerType: "free_text",

  skipIfAnswered: ["skin_location_distribution"],

  sourceIds: ["internal_pending_review"],
};

export const skinExposureCheck: ClinicalQuestionCard = {
  id: "skin_exposure_check",
  ownerText:
    "Has your pet had any recent changes that touch the skin, such as new shampoo, flea/tick products, bedding, plants, or time in a new environment?",
  shortReason:
    "Recent contact with new substances or environments is a common trigger for skin reactions.",

  complaintFamilies: ["skin", "dermatology", "allergy"],
  bodySystems: ["integumentary", "immune"],

  phase: "history",

  ownerAnswerability: 2,
  urgencyImpact: 1,
  discriminativeValue: 2,
  reportValue: 2,

  screensRedFlags: [],
  changesUrgencyIf: {},

  answerType: "boolean",

  skipIfAnswered: ["skin_location_distribution"],

  sourceIds: ["internal_pending_review"],
};
