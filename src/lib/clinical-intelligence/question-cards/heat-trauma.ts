import type { ClinicalQuestionCard } from "../question-card-types";

export const heatExposureCheck: ClinicalQuestionCard = {
  id: "heat_exposure_check",
  ownerText:
    "Was your pet in a hot car, outside in high heat, or exercising strenuously in warm weather within the last few hours?",
  shortReason:
    "Heat exposure history is the critical discriminating factor that separates heat-related distress from other causes of collapse or panting.",

  complaintFamilies: ["emergency", "heat", "respiratory"],
  bodySystems: ["respiratory", "cardiovascular"],

  phase: "history",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    yes: "Increase urgency if panting, collapse, or altered responsiveness is present.",
  },

  answerType: "boolean",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const brachycephalicBreedCheck: ClinicalQuestionCard = {
  id: "brachycephalic_breed_check",
  ownerText:
    "Is your pet a brachycephalic breed — for example, a Bulldog, Pug, Boxer, Persian cat, or similar short-nosed breed?",
  shortReason:
    "Brachycephalic animals are at significantly higher risk for heat-related respiratory compromise.",

  complaintFamilies: ["emergency", "heat", "respiratory"],
  bodySystems: ["respiratory", "cardiovascular"],

  phase: "history",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 2,

  screensRedFlags: ["brachycephalic_heat"],
  changesUrgencyIf: {
    yes: "Lower threshold for urgent evaluation if any heat exposure or breathing difficulty is reported.",
  },

  answerType: "boolean",

  skipIfAnswered: ["heat_exposure_check"],

  sourceIds: ["internal_pending_review"],
};

export const pantingExcessCheck: ClinicalQuestionCard = {
  id: "panting_excess_check",
  ownerText:
    "Is your pet panting heavily or drooling excessively while at rest in a cool environment, or does the panting not settle after 10–15 minutes in the shade?",
  shortReason:
    "Excessive panting that does not resolve with rest and cooling is a hallmark owner-observable sign of heat-related distress.",

  complaintFamilies: ["emergency", "heat", "respiratory"],
  bodySystems: ["respiratory", "cardiovascular"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["heatstroke_signs"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen", "breathing_difficulty_check"],

  sourceIds: ["internal_pending_review"],
};

export const traumaMechanismCheck: ClinicalQuestionCard = {
  id: "trauma_mechanism_check",
  ownerText:
    "What happened — was your pet hit by a vehicle, did they fall from a height, were they bitten by another animal, or was there another type of accident?",
  shortReason:
    "Mechanism of injury helps triage the likelihood of internal damage, fractures, or penetrating wounds.",

  complaintFamilies: ["emergency", "trauma", "musculoskeletal"],
  bodySystems: ["musculoskeletal", "cardiovascular", "respiratory"],

  phase: "history",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    "hit by vehicle": "Escalate to immediate emergency evaluation even if the pet appears stable.",
    "fall from height": "Increase urgency; internal injuries may not be visible immediately.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Hit by vehicle",
    "Fall from height",
    "Bite / attack",
    "Crush injury",
    "Unknown / not witnessed",
    "Other",
  ],

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const woundCharacterizationCheck: ClinicalQuestionCard = {
  id: "wound_characterization_check",
  ownerText:
    "What type of wound do you see — a cut, puncture, scrape, or bite? Is there dirt or debris inside it?",
  shortReason:
    "Wound type and contamination status determine urgency and whether the pet needs wound care versus emergency stabilization.",

  complaintFamilies: ["emergency", "trauma", "skin", "wound"],
  bodySystems: ["integumentary", "musculoskeletal"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    puncture: "Increase urgency; puncture wounds can trap bacteria deep in tissue.",
    "foreign body visible": "Escalate to urgent evaluation; do not remove deep foreign bodies at home.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Cut / laceration",
    "Puncture",
    "Scrape / abrasion",
    "Bite wound",
    "Foreign body visible",
    "Not sure",
  ],

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
  safetyNotes: [
    "Do not advise removal of deeply embedded objects; stabilize and transport.",
  ],
};

export const bleedingVolumeCheck: ClinicalQuestionCard = {
  id: "bleeding_volume_check",
  ownerText:
    "How much is the wound bleeding — is it a small smear, a steady drip, or enough to soak through a cloth or bandage within minutes?",
  shortReason:
    "Bleeding rate and volume are the primary owner-observable factors that distinguish minor wounds from hemorrhage emergencies.",

  complaintFamilies: ["emergency", "trauma", "wound"],
  bodySystems: ["cardiovascular", "integumentary"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["large_blood_volume", "wound_deep_bleeding"],
  changesUrgencyIf: {
    "soaking through cloth": "Escalate to immediate emergency evaluation.",
    "spraying / pulsing": "Escalate to immediate emergency evaluation; apply firm pressure if safe and transport immediately.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Small smear / spot",
    "Steady drip",
    "Soaking through cloth",
    "Spraying / pulsing",
    "Bleeding has stopped",
    "Not sure",
  ],

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
  safetyNotes: [
    "If bleeding is severe, advise firm direct pressure and immediate transport without attempting home treatment.",
  ],
};

export const lacerationDepthCheck: ClinicalQuestionCard = {
  id: "laceration_depth_check",
  ownerText:
    "Does the wound appear to go only through the skin, or do you see fat, muscle, or bone underneath?",
  shortReason:
    "Depth of a laceration determines whether the wound can be managed conservatively or needs surgical closure.",

  complaintFamilies: ["emergency", "trauma", "wound"],
  bodySystems: ["integumentary", "musculoskeletal"],

  phase: "discriminate",

  ownerAnswerability: 2,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [],
  changesUrgencyIf: {
    "into muscle": "Increase urgency; deep lacerations often need surgical assessment.",
    "bone visible": "Escalate to immediate emergency evaluation.",
  },

  answerType: "choice",
  allowedAnswers: [
    "Skin only",
    "Through skin into fat",
    "Into muscle",
    "Bone visible",
    "Not sure",
  ],

  skipIfAnswered: ["wound_characterization_check"],

  sourceIds: ["internal_pending_review"],
  safetyNotes: [
    "Owners may misjudge depth; this is a screening question only.",
  ],
};
