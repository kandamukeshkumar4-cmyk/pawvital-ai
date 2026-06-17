interface BaseClinicalQuestionCard {
  id: string;
  ownerText: string;
  shortReason: string;

  complaintFamilies: string[];
  bodySystems: string[];

  /**
   * Optional breed keywords this card targets (case-insensitive substring
   * match against the pet's breed), e.g. ["dachshund"] or
   * ["deep_chested", "german shepherd", "great dane"]. When the pet's breed
   * matches one of these keywords, the planner applies a small deterministic
   * relevance boost so the card surfaces earlier. Purely additive: it never
   * affects urgency, red-flag, or emergency-screen logic.
   */
  breedFamilies?: string[];

  phase:
    | "emergency_screen"
    | "characterize"
    | "discriminate"
    | "timeline"
    | "history"
    | "handoff_detail";

  ownerAnswerability: 0 | 1 | 2 | 3;
  urgencyImpact: 0 | 1 | 2 | 3;
  discriminativeValue: 0 | 1 | 2 | 3;
  reportValue: 0 | 1 | 2 | 3;

  screensRedFlags: string[];
  changesUrgencyIf: Record<string, string>;

  skipIfAnswered: string[];
  askIfAny?: string[];
  askIfAll?: string[];

  sourceIds: string[];
  safetyNotes?: string[];
}

export type ChoiceClinicalQuestionCard = BaseClinicalQuestionCard & {
  answerType: "choice";
  allowedAnswers: [string, ...string[]];
};

export type NonChoiceClinicalQuestionCard = BaseClinicalQuestionCard & {
  answerType: "boolean" | "free_text" | "duration" | "number";
  allowedAnswers?: never;
};

export type ClinicalQuestionCard =
  | ChoiceClinicalQuestionCard
  | NonChoiceClinicalQuestionCard;
