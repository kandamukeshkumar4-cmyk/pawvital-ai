import type { ClinicalQuestionCard } from "../question-card-types";

export const neuroSeizureDuration: ClinicalQuestionCard = {
  id: "neuro_seizure_duration",
  ownerText:
    "How long did the seizure or episode last, and how many episodes have occurred in the last 24 hours?",
  shortReason:
    "Seizure duration and clustering are key factors in determining urgency and next steps.",

  complaintFamilies: ["neurological", "seizure", "collapse"],
  bodySystems: ["neurological"],

  phase: "characterize",

  ownerAnswerability: 2,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["status_epilepticus", "cluster_seizures"],
  changesUrgencyIf: {
    "longer_than_5_minutes": "Escalate to immediate emergency evaluation.",
    "more_than_2_in_24h": "Escalate to immediate emergency evaluation.",
  },

  answerType: "free_text",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};
