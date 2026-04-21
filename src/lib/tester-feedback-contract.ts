export const TESTER_FEEDBACK_HELPFULNESS_VALUES = [
  "yes",
  "somewhat",
  "no",
] as const;

export const TESTER_FEEDBACK_CONFUSING_AREA_VALUES = [
  "questions",
  "result",
  "wording",
  "next_steps",
  "report",
  "other",
] as const;

export const TESTER_FEEDBACK_TRUST_VALUES = [
  "yes",
  "not_sure",
  "no",
] as const;

export const TESTER_FEEDBACK_SURFACE_VALUES = [
  "result_page",
  "history_page",
] as const;

export const TESTER_FEEDBACK_STATUS_VALUES = [
  "pending",
  "submitted",
  "flagged",
] as const;

export const TESTER_FEEDBACK_FLAG_VALUES = [
  "helpfulness_no",
  "trust_not_sure",
  "trust_no",
  "confusing_questions",
  "confusing_result",
  "confusing_wording",
  "confusing_next_steps",
  "confusing_report",
  "confusing_other",
  "emergency_result",
  "report_failed",
  "question_flow_issue",
  "cannot_assess_state",
  "notes_concern_language",
] as const;

export const TESTER_FEEDBACK_NEGATIVE_FLAG_VALUES = [
  "helpfulness_no",
  "trust_not_sure",
  "trust_no",
  "confusing_questions",
  "confusing_result",
  "confusing_wording",
  "confusing_next_steps",
  "confusing_report",
  "confusing_other",
  "report_failed",
  "question_flow_issue",
  "cannot_assess_state",
  "notes_concern_language",
] as const;

export type TesterFeedbackHelpfulness =
  (typeof TESTER_FEEDBACK_HELPFULNESS_VALUES)[number];
export type TesterFeedbackConfusingArea =
  (typeof TESTER_FEEDBACK_CONFUSING_AREA_VALUES)[number];
export type TesterFeedbackTrustLevel =
  (typeof TESTER_FEEDBACK_TRUST_VALUES)[number];
export type TesterFeedbackSurface =
  (typeof TESTER_FEEDBACK_SURFACE_VALUES)[number];
export type TesterFeedbackStatus =
  (typeof TESTER_FEEDBACK_STATUS_VALUES)[number];
export type TesterFeedbackFlag =
  (typeof TESTER_FEEDBACK_FLAG_VALUES)[number];

export interface TesterFeedbackAskedQuestion {
  id: string;
  prompt: string;
}

export interface TesterFeedbackCaseLedger {
  symptom_check_id: string;
  report_id: string;
  tester_user_id: string | null;
  pet_id: string | null;
  symptom_input: string;
  known_symptoms: string[];
  questions_asked: TesterFeedbackAskedQuestion[];
  answers_given: Record<string, string | boolean | number>;
  urgency_result: string;
  created_at: string;
  feedback_status: TesterFeedbackStatus;
  negative_feedback_flag: boolean;
  case_flags: TesterFeedbackFlag[];
  repeated_question_state: boolean;
  cannot_assess_state: boolean;
  report_failed: boolean;
  feedback_submitted_at?: string;
}

export interface TesterFeedbackRecord {
  symptom_check_id: string;
  helpfulness: TesterFeedbackHelpfulness;
  confusing_areas: TesterFeedbackConfusingArea[];
  trust_level: TesterFeedbackTrustLevel;
  notes: string | null;
  surface: TesterFeedbackSurface;
  flags: TesterFeedbackFlag[];
  submitted_at: string;
  updated_at: string;
}

export interface TesterFeedbackCaseSummary {
  symptomCheckId: string;
  reportId: string;
  testerUserId: string | null;
  petId: string | null;
  reportTitle: string | null;
  symptomInput: string;
  knownSymptoms: string[];
  urgencyResult: string;
  createdAt: string;
  feedbackStatus: TesterFeedbackStatus;
  flagged: boolean;
  negativeFeedbackFlag: boolean;
  emergencyCase: boolean;
  reportFailed: boolean;
  flagReasons: TesterFeedbackFlag[];
  helpfulness: TesterFeedbackHelpfulness | null;
  confusingAreas: TesterFeedbackConfusingArea[];
  trustLevel: TesterFeedbackTrustLevel | null;
  notes: string | null;
  submittedAt: string | null;
  questionCount: number;
  answerCount: number;
  questionsAsked: TesterFeedbackAskedQuestion[];
  answersGiven: Record<string, string | boolean | number>;
}

export interface TesterFeedbackSubmissionInput {
  symptomCheckId: string;
  helpfulness: TesterFeedbackHelpfulness;
  confusingAreas: TesterFeedbackConfusingArea[];
  trustLevel: TesterFeedbackTrustLevel;
  notes?: string | null;
  surface?: TesterFeedbackSurface;
}
