import type { ClinicalQuestionCard } from "../question-card-types";

export const urinaryStrainingOutput: ClinicalQuestionCard = {
  id: "urinary_straining_output",
  ownerText:
    "Is your pet straining to urinate, producing only small drops, having accidents in the house, or is the urine a different color than usual?",
  shortReason:
    "Changes in urination effort, volume, or color can signal a urinary tract issue and help determine how quickly care is needed.",

  complaintFamilies: ["urinary", "urological", "incontinence"],
  bodySystems: ["urinary", "renal"],

  phase: "characterize",

  ownerAnswerability: 3,
  urgencyImpact: 2,
  discriminativeValue: 3,
  reportValue: 3,

  screensRedFlags: ["stranguria", "hematuria", "pollakiuria"],
  changesUrgencyIf: {
    "straining_with_no_output": "Escalate to urgent evaluation due to obstruction risk.",
  },

  answerType: "free_text",

  skipIfAnswered: [],

  sourceIds: ["internal_pending_review"],
};
