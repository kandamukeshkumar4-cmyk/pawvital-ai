/**
 * VET-920: Question Selector Unit Tests
 *
 * Tests the deterministic question selector that reads protected state
 * but never modifies it. Ensures emergency → must-ask → unresolved priority.
 */

import { selectNextQuestion, type QuestionSelectorSession } from '../question-selector';
import { getOntologyForComplaint as getComplaintFamily } from '../complaint-ontology';

describe('Question Selector - Protected State Safety', () => {
  it('should never modify the input state', () => {
    const state: QuestionSelectorSession = {
      answered_questions: ['q1'],
      extracted_answers: { q1: 'yes' },
      unresolved_question_ids: ['q2'],
      known_symptoms: ["vomiting"],
      turn_count: 1,
    };
    const stateCopy = JSON.parse(JSON.stringify(state));
    const family = getComplaintFamily('vomiting')!;

    selectNextQuestion(state, family);

    // State must be unchanged
    expect(state).toEqual(stateCopy);
  });

  it('should handle empty state gracefully', () => {
    const state: QuestionSelectorSession = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
      known_symptoms: ["vomiting"],
      turn_count: 0,
    };
    const family = getComplaintFamily('vomiting')!;

    const next = selectNextQuestion(state, family);
    expect(next).toBeDefined();
  });

  it('should handle state with only answered questions', () => {
    const family = getComplaintFamily('vomiting')!;
    const allIds = [
      ...family.emergencyScreen,
      ...family.mustAskQuestions,
    ];
    const state: QuestionSelectorSession = {
      answered_questions: allIds,
      extracted_answers: allIds.reduce((acc, id) => ({ ...acc, [id]: 'answered' }), {} as Record<string, string>),
      unresolved_question_ids: [],
      known_symptoms: ["vomiting"],
      turn_count: allIds.length,
    };

    const next = selectNextQuestion(state, family);
    expect(next).toBeNull();
  });
});

describe('Question Selector - Priority Order', () => {
  const makeState = (answered: string[]): QuestionSelectorSession => ({
    answered_questions: answered,
    extracted_answers: answered.reduce((acc, id) => ({ ...acc, [id]: 'yes' }), {} as Record<string, string>),
    unresolved_question_ids: [],
    known_symptoms: ["vomiting"],
    turn_count: answered.length,
  });

  it('should select from emergency screen before must-ask', () => {
    const family = getComplaintFamily('vomiting')!;
    const state = makeState([]);

    const next = selectNextQuestion(state, family);
    expect(next).toBeDefined();
    expect(family.emergencyScreen.includes(next?.questionId ?? "")).toBe(true);
  });

  it('should skip answered emergency questions and move to next priority', () => {
    const family = getComplaintFamily('vomiting')!;
    const answeredEmergencyIds = family.emergencyScreen;
    const state = makeState(answeredEmergencyIds);

    const next = selectNextQuestion(state, family);
    // Should now be from must-ask or unresolved
    const isMustAsk = family.mustAskQuestions.includes(next?.questionId ?? "");
    expect(next === null || isMustAsk).toBe(true);
  });

  it('should handle partial emergency screen completion', () => {
    const family = getComplaintFamily('vomiting')!;
    const halfEmergency = family.emergencyScreen.slice(0, Math.ceil(family.emergencyScreen.length / 2));
    const state = makeState(halfEmergency);

    const next = selectNextQuestion(state, family);
    expect(next).toBeDefined();
    // Should still be from emergency (unanswered ones) or must-ask
    const isEmergency = family.emergencyScreen.includes(next?.questionId ?? "");
    const isMustAsk = family.mustAskQuestions.includes(next?.questionId ?? "");
    expect(isEmergency || isMustAsk).toBe(true);
  });
});

describe('Question Selector - Edge Cases', () => {
  it('should handle family with no emergency screen', () => {
    // Create a minimal family for testing
    const family = getComplaintFamily('vomiting')!;
    const familyNoEmergency = {
      ...family,
      emergencyScreen: [],
    };

    const state: QuestionSelectorSession = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
      known_symptoms: ["vomiting"],
      turn_count: 0,
    };

    const next = selectNextQuestion(state, familyNoEmergency);
    // Should fall back to must-ask questions
    expect(next === null || family.mustAskQuestions.includes(next.questionId)).toBe(true);
  });

  it('should handle family with no must-ask questions', () => {
    const family = getComplaintFamily('vomiting')!;
    const familyNoMustAsk = {
      ...family,
      mustAskQuestions: [],
    };

    const state: QuestionSelectorSession = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
      known_symptoms: ["vomiting"],
      turn_count: 0,
    };

    const next = selectNextQuestion(state, familyNoMustAsk);
    // Should select from emergency screen
    expect(next === null || family.emergencyScreen.includes(next.questionId)).toBe(true);
  });
});
