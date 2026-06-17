import type { ClinicalQuestionCard } from "../question-card-types";

/**
 * Breed-targeted, NON-emergency screening cards.
 *
 * These cards are surfaced earlier (via a small deterministic relevance boost
 * in the planner) when the pet's breed matches one of the keywords listed in
 * `breedFamilies`. They do NOT change urgency, red-flag, or emergency-screen
 * logic — they simply prompt an owner-observable question that is especially
 * worth asking for breeds with a known predisposition.
 */

export const longBackBreedSpinalCheck: ClinicalQuestionCard = {
  id: "long_back_breed_spinal_check",
  ownerText:
    "Has your dog seemed reluctant to jump up or use stairs, yelped when picked up or touched along the back, or shown wobbly, weak, or dragging back legs?",
  shortReason:
    "Long-backed breeds such as Dachshunds and Corgis are prone to back and spinal problems, so back pain or weak hind legs is especially worth checking in these dogs.",

  complaintFamilies: ["musculoskeletal", "neuro", "mobility"],
  bodySystems: ["musculoskeletal", "neurological"],

  breedFamilies: [
    "dachshund",
    "corgi",
    "basset",
    "shih tzu",
    "pekingese",
    "beagle",
    "long_back",
  ],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 1,
  discriminativeValue: 2,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    "dragging back legs":
      "Increase urgency for same-day evaluation if the back legs are weak, wobbly, or dragging.",
  },

  answerType: "boolean",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const deepChestedBreedAbdomenCheck: ClinicalQuestionCard = {
  id: "deep_chested_breed_abdomen_check",
  ownerText:
    "Does your dog's belly look bloated, swollen, or tight, and are they trying to be sick or retching without bringing anything up?",
  shortReason:
    "Deep-chested breeds such as German Shepherds, Great Danes, and Weimaraners are prone to sudden bloating of the belly, so a distended abdomen with unproductive retching is especially important to flag in these dogs.",

  complaintFamilies: ["gastrointestinal", "gi", "abdominal"],
  bodySystems: ["gastrointestinal"],

  breedFamilies: [
    "deep_chested",
    "german shepherd",
    "great dane",
    "weimaraner",
    "standard poodle",
    "doberman",
    "boxer",
    "setter",
  ],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    "bloated abdomen with retching":
      "Escalate to immediate emergency evaluation if the belly is swollen and the dog is retching without bringing anything up.",
  },

  answerType: "boolean",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};
