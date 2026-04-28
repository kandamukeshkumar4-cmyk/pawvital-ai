import type { ClinicalQuestionCard } from "../question-card-types";

export const emergencyGlobalScreen: ClinicalQuestionCard = {
  id: "emergency_global_screen",
  ownerText:
    "Is your pet showing any of the following right now: trouble breathing, collapsed or unable to stand, repeated vomiting with retching, a very swollen or hard belly, seizures, or blue/pale gums?",
  shortReason:
    "These signs can indicate a life-threatening problem that needs immediate veterinary attention.",

  complaintFamilies: ["emergency", "global"],
  bodySystems: ["cardiovascular", "respiratory", "neurological", "gastrointestinal"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: [
    "dyspnea",
    "collapse",
    "retching",
    "abdominal_distension",
    "seizure",
    "cyanosis",
  ],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};

export const gumColorCheck: ClinicalQuestionCard = {
  id: "gum_color_check",
  ownerText:
    "If you gently lift your pet’s lip, are the gums pale, white, blue, or gray instead of their normal pink color?",
  shortReason:
    "Changes in gum color can signal poor circulation or oxygenation and may indicate a serious underlying issue.",

  complaintFamilies: ["emergency", "collapse", "weakness", "trauma"],
  bodySystems: ["cardiovascular", "respiratory"],

  phase: "emergency_screen",

  ownerAnswerability: 2,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["pale_gums", "cyanosis", "gray_gums"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const breathingDifficultyCheck: ClinicalQuestionCard = {
  id: "breathing_difficulty_check",
  ownerText:
    "Is your pet struggling to breathe, breathing with an open mouth, making loud noises with each breath, or breathing very fast while at rest?",
  shortReason:
    "Difficulty breathing can progress rapidly and may indicate a severe respiratory or cardiac problem.",

  complaintFamilies: ["emergency", "respiratory", "collapse"],
  bodySystems: ["respiratory", "cardiovascular"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["dyspnea", "tachypnea", "open_mouth_breathing"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const collapseWeaknessCheck: ClinicalQuestionCard = {
  id: "collapse_weakness_check",
  ownerText:
    "Has your pet collapsed, fainted, or become unable to stand or walk normally in the last few hours?",
  shortReason:
    "Sudden collapse or profound weakness can be a sign of a critical condition requiring rapid assessment.",

  complaintFamilies: ["emergency", "collapse", "weakness", "neurological"],
  bodySystems: ["cardiovascular", "neurological", "musculoskeletal"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["collapse", "syncope", "acute_weakness"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const toxinExposureCheck: ClinicalQuestionCard = {
  id: "toxin_exposure_check",
  ownerText:
    "Do you think your pet may have eaten or been exposed to something toxic in the last few hours (for example, pills, chocolate, xylitol, plants, chemicals, or rodent bait)?",
  shortReason:
    "Toxin exposure can cause hidden internal damage and may worsen quickly even if your pet looks okay now.",

  complaintFamilies: ["emergency", "toxicity", "gastrointestinal"],
  bodySystems: ["gastrointestinal", "hepatic", "renal", "neurological"],

  phase: "emergency_screen",

  ownerAnswerability: 2,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["known_toxin_ingestion", "suspected_toxin"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation; contact poison control if available.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const bloatRetchingAbdomenCheck: ClinicalQuestionCard = {
  id: "bloat_retching_abdomen_check",
  ownerText:
    "Is your pet’s belly visibly swollen or tight, and are they retching or trying to vomit without bringing anything up?",
  shortReason:
    "A swollen, hard abdomen with unproductive retching can indicate a dangerous condition that progresses quickly.",

  complaintFamilies: ["emergency", "gastrointestinal", "bloat"],
  bodySystems: ["gastrointestinal"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["gastric_dilatation_volvulus", "unproductive_retching", "abdominal_distension"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const urinaryBlockageCheck: ClinicalQuestionCard = {
  id: "urinary_blockage_check",
  ownerText:
    "Is your pet straining to urinate but producing little or no urine, or crying out when trying to go?",
  shortReason:
    "Inability to pass urine can become life-threatening within hours and should be assessed urgently.",

  complaintFamilies: ["emergency", "urinary", "urological"],
  bodySystems: ["urinary", "renal"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["urinary_obstruction", "anuria", "stranguria"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const seizureNeuroCheck: ClinicalQuestionCard = {
  id: "seizure_neuro_check",
  ownerText:
    "Has your pet had a seizure, convulsion, or episode of uncontrolled shaking or twitching lasting more than a few seconds?",
  shortReason:
    "Seizures can indicate serious neurological or metabolic problems and may cluster or worsen without care.",

  complaintFamilies: ["emergency", "neurological", "seizure"],
  bodySystems: ["neurological"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["seizure", "status_epilepticus", "cluster_seizures"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};

export const skinEmergencyAllergyScreen: ClinicalQuestionCard = {
  id: "skin_emergency_allergy_screen",
  ownerText:
    "Is your pet’s face, lips, or eyelids swelling, or are there raised welts (hives) spreading over the body, especially after a sting, vaccine, or new food?",
  shortReason:
    "Rapid swelling or hives can signal a body-wide reaction that may affect breathing or circulation.",

  complaintFamilies: ["emergency", "skin", "allergy"],
  bodySystems: ["integumentary", "immune", "respiratory"],

  phase: "emergency_screen",

  ownerAnswerability: 3,
  urgencyImpact: 3,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["angioedema", "urticaria", "anaphylaxis"],
  changesUrgencyIf: {
    yes: "Escalate to immediate emergency evaluation.",
  },

  answerType: "boolean",

  skipIfAnswered: ["emergency_global_screen"],

  sourceIds: ["internal_pending_review"],
};
