/**
 * Question Selector for VET-920
 *
 * Ontology-driven question selection that respects protected state.
 * Reads but NEVER modifies: answered_questions, extracted_answers, unresolved_question_ids
 */

import type { ComplaintFamilyContract } from "./complaint-ontology";
import { getOntologyForComplaint } from "./complaint-ontology";

export interface QuestionSelectorSession {
  answered_questions: string[];
  extracted_answers: Record<string, unknown>;
  unresolved_question_ids: string[];
  known_symptoms: string[];
  turn_count: number;
}

export interface SelectedQuestion {
  questionId: string;
  reason: "emergency_screen" | "must_ask" | "unresolved" | "nice_to_ask";
  familyKey: string;
}

/**
 * Selects the next question based on ontology and session state.
 * Protected state is read-only - never modified.
 */
export function selectNextQuestion(
  session: QuestionSelectorSession,
  ontology?: ComplaintFamilyContract
): SelectedQuestion | null {
  const { answered_questions, known_symptoms, unresolved_question_ids } = session;

  // Determine current complaint families
  const families = known_symptoms.length > 0 ? known_symptoms : ["unknown_concern"];

  for (const familyKey of families) {
    const contract = ontology || getOntologyForComplaint(familyKey);
    if (!contract) continue;

    // 1. Check emergency screen first
    const emergencyQuestion = checkEmergencyScreen(contract, answered_questions);
    if (emergencyQuestion) {
      return { questionId: emergencyQuestion, reason: "emergency_screen", familyKey };
    }

    // 2. Must-ask questions in order
    const mustAskQuestion = getNextMustAskQuestion(contract, answered_questions);
    if (mustAskQuestion) {
      return { questionId: mustAskQuestion, reason: "must_ask", familyKey };
    }

    // 3. Unresolved questions
    const unresolvedQuestion = getNextUnresolvedQuestion(unresolved_question_ids, answered_questions);
    if (unresolvedQuestion) {
      return { questionId: unresolvedQuestion, reason: "unresolved", familyKey };
    }

    // 4. Check stop rule
    if (shouldStopQuestioning(contract, session)) {
      return null;
    }
  }

  return null;
}

function checkEmergencyScreen(
  contract: ComplaintFamilyContract,
  answeredQuestions: string[]
): string | null {
  // If emergency screen flags are present, ask those questions first
  for (const questionId of contract.emergencyScreen) {
    if (!answeredQuestions.includes(questionId)) {
      return questionId;
    }
  }
  return null;
}

function getNextMustAskQuestion(
  contract: ComplaintFamilyContract,
  answeredQuestions: string[]
): string | null {
  for (const questionId of contract.mustAskQuestions) {
    if (!answeredQuestions.includes(questionId)) {
      return questionId;
    }
  }
  return null;
}

function getNextUnresolvedQuestion(
  unresolvedIds: string[],
  answeredQuestions: string[]
): string | null {
  for (const questionId of unresolvedIds) {
    if (!answeredQuestions.includes(questionId)) {
      return questionId;
    }
  }
  return null;
}

function shouldStopQuestioning(
  contract: ComplaintFamilyContract,
  session: QuestionSelectorSession
): boolean {
  const { answered_questions, turn_count } = session;

  switch (contract.stopRule.condition) {
    case "emergency_triggered":
      // Don't stop - let emergency logic handle it
      return false;

    case "all_must_ask_answered": {
      const allMustAskAnswered = contract.mustAskQuestions.every((q) =>
        answered_questions.includes(q)
      );
      if (allMustAskAnswered) return true;

      const maxQuestions = contract.stopRule.maxQuestions || 10;
      return turn_count >= maxQuestions;
    }

    case "max_questions_reached": {
      const maxQuestions = contract.stopRule.maxQuestions || 10;
      return turn_count >= maxQuestions;
    }

    default:
      return false;
  }
}

/**
 * Returns which must-ask questions have been asked and which remain.
 * For frontend to show progress to user.
 */
export function getMustAskContinuity(
  session: QuestionSelectorSession,
  familyKey: string
): { asked: string[]; remaining: string[]; total: number } | null {
  const contract = getOntologyForComplaint(familyKey);
  if (!contract) return null;

  const asked = contract.mustAskQuestions.filter((q) =>
    session.answered_questions.includes(q)
  );
  const remaining = contract.mustAskQuestions.filter(
    (q) => !session.answered_questions.includes(q)
  );

  return {
    asked,
    remaining,
    total: contract.mustAskQuestions.length,
  };
}
