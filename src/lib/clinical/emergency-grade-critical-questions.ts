export const EMERGENCY_GRADE_CRITICAL_QUESTIONS = [
  "breathing_onset",
  "consciousness_level",
  "gum_color",
  "breathing_status",
  "seizure_duration",
] as const;

export type EmergencyGradeCriticalQuestionId =
  (typeof EMERGENCY_GRADE_CRITICAL_QUESTIONS)[number];

const EMERGENCY_GRADE_CRITICAL_QUESTION_SET = new Set<string>(
  EMERGENCY_GRADE_CRITICAL_QUESTIONS
);

export function isEmergencyGradeCriticalQuestionId(
  questionId: string
): questionId is EmergencyGradeCriticalQuestionId {
  return EMERGENCY_GRADE_CRITICAL_QUESTION_SET.has(questionId);
}
