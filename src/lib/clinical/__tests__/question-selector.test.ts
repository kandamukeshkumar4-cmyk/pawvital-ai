/**
 * VET-920: Question Selector Unit Tests
 *
 * Tests the deterministic question selector that reads protected state
 * but never modifies it. Ensures emergency → must-ask → unresolved priority.
 */

import { selectNextQuestion, QuestionSelectorState } from '../src/lib/clinical/question-selector';
import { getComplaintFamily } from '../src/lib/clinical/complaint-ontology';

describe('Question Selector - Protected State Safety', () => {
  it('should never modify the input state', () => {
    const state: QuestionSelectorState = {
      answered_questions: ['q1'],
      extracted_answers: { q1: 'yes' },
      unresolved_question_ids: ['q2'],
    };
    const stateCopy = JSON.parse(JSON.stringify(state));
    const family = getComplaintFamily('vomiting')!;

    selectNextQuestion(family, state);

    // State must be unchanged
    expect(state).toEqual(stateCopy);
  });

  it('should handle empty state gracefully', () => {
    const state: QuestionSelectorState = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
    };
    const family = getComplaintFamily('vomiting')!;

    const next = selectNextQuestion(family, state);
    expect(next).toBeDefined();
  });

  it('should handle state with only answered questions', () => {
    const family = getComplaintFamily('vomiting')!;
    const allIds = [
      ...family.emergencyScreen.map(q => q.id),
      ...family.mustAskQuestions.map(q => q.id),
    ];
    const state: QuestionSelectorState = {
      answered_questions: allIds,
      extracted_answers: allIds.reduce((acc, id) => ({ ...acc, [id]: 'answered' }), {} as Record<string, string>),
      unresolved_question_ids: [],
    };

    const next = selectNextQuestion(family, state);
    expect(next).toBeNull();
  });
});

describe('Question Selector - Priority Order', () => {
  const makeState = (answered: string[]): QuestionSelectorState => ({
    answered_questions: answered,
    extracted_answers: answered.reduce((acc, id) => ({ ...acc, [id]: 'yes' }), {} as Record<string, string>),
    unresolved_question_ids: [],
  });

  it('should select from emergency screen before must-ask', () => {
    const family = getComplaintFamily('vomiting')!;
    const state = makeState([]);

    const next = selectNextQuestion(family, state);
    expect(next).toBeDefined();
    expect(family.emergencyScreen.some(q => q.id === next?.id)).toBe(true);
  });

  it('should skip answered emergency questions and move to next priority', () => {
    const family = getComplaintFamily('vomiting')!;
    const answeredEmergencyIds = family.emergencyScreen.map(q => q.id);
    const state = makeState(answeredEmergencyIds);

    const next = selectNextQuestion(family, state);
    // Should now be from must-ask or unresolved
    const isMustAsk = family.mustAskQuestions.some(q => q.id === next?.id);
    expect(next === null || isMustAsk).toBe(true);
  });

  it('should handle partial emergency screen completion', () => {
    const family = getComplaintFamily('vomiting')!;
    const halfEmergency = family.emergencyScreen.slice(0, Math.ceil(family.emergencyScreen.length / 2)).map(q => q.id);
    const state = makeState(halfEmergency);

    const next = selectNextQuestion(family, state);
    expect(next).toBeDefined();
    // Should still be from emergency (unanswered ones) or must-ask
    const isEmergency = family.emergencyScreen.some(q => q.id === next?.id);
    const isMustAsk = family.mustAskQuestions.some(q => q.id === next?.id);
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

    const state: QuestionSelectorState = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
    };

    const next = selectNextQuestion(familyNoEmergency, state);
    // Should fall back to must-ask questions
    expect(next === null || family.mustAskQuestions.some(q => q.id === next?.id)).toBe(true);
  });

  it('should handle family with no must-ask questions', () => {
    const family = getComplaintFamily('vomiting')!;
    const familyNoMustAsk = {
      ...family,
      mustAskQuestions: [],
    };

    const state: QuestionSelectorState = {
      answered_questions: [],
      extracted_answers: {},
      unresolved_question_ids: [],
    };

    const next = selectNextQuestion(familyNoMustAsk, state);
    // Should select from emergency screen
    expect(next === null || family.emergencyScreen.some(q => q.id === next?.id)).toBe(true);
  });
});
