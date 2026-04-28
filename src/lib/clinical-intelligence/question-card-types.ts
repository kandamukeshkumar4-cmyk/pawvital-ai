export interface ClinicalQuestionCard {
  id: string;
  ownerText: string;
  shortReason: string;

  complaintFamilies: string[];
  bodySystems: string[];

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

  answerType: "boolean" | "choice" | "free_text" | "duration" | "number";
  allowedAnswers?: string[];

  skipIfAnswered: string[];
  askIfAny?: string[];
  askIfAll?: string[];

  sourceIds: string[];
  safetyNotes?: string[];
}
