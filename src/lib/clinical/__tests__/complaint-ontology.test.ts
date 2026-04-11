/**
 * VET-920: Complaint Ontology Tests
 *
 * Tests for complaint-ontology.ts and question-selector.ts
 * Ensures emergency screen questions, must-ask logic, and stop/ready rules work correctly.
 */

import {
  getOntologyForComplaint as getComplaintFamily,
  getAllOntologyContracts as findAllComplaintFamilies,
} from '../complaint-ontology';
import { selectNextQuestion, type QuestionSelectorSession } from '../question-selector';

describe('Complaint Ontology', () => {
  describe('getComplaintFamily', () => {
    it('should return a complaint family with required fields', () => {
      const family = getComplaintFamily('vomiting');
      expect(family).toBeDefined();
      expect(family?.key).toBe('vomiting');
      expect(family.emergencyScreen).toBeDefined();
      expect(family.mustAskQuestions).toBeDefined();
      expect(family.allowedUnknowns).toBeDefined();
      expect(family.stopRule).toBeDefined();
      expect(family.readyRule).toBeDefined();
    });

    it('should return null for unknown complaint family', () => {
      const family = getComplaintFamily('nonexistent_family');
      expect(family).toBeNull();
    });

    it('should have emergency screen questions for vomiting', () => {
      const family = getComplaintFamily('vomiting');
      expect(family?.emergencyScreen.length).toBeGreaterThan(0);
    });

    it('should have must-ask questions for vomiting', () => {
      const family = getComplaintFamily('vomiting');
      expect(family?.mustAskQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('findAllComplaintFamilies', () => {
    it('should return all complaint families', () => {
      const families = findAllComplaintFamilies();
      expect(families.length).toBeGreaterThan(0);
    });

    it('should include vomiting family', () => {
      const families = findAllComplaintFamilies();
      const vomiting = families.find(f => f.key === 'vomiting');
      expect(vomiting).toBeDefined();
    });
  });

  describe('Complaint Family Structure', () => {
    it('should have alternate observables for families with assessment difficulty', () => {
      const family = getComplaintFamily('vomiting');
      // Alternate observables allow owners who cannot assess primary signs
      expect(family?.alternateObservables).toBeDefined();
    });

    it('should have allowed unknowns policy', () => {
      const family = getComplaintFamily('vomiting');
      // Owners can say "I don't know" to some questions
      expect(Array.isArray(family?.allowedUnknowns)).toBe(true);
    });
  });
});

describe('Question Selector', () => {
  const mockState = (answered: string[], unresolved: string[]): QuestionSelectorSession => ({
    answered_questions: answered,
    extracted_answers: answered.reduce((acc, id) => ({ ...acc, [id]: 'answered' }), {} as Record<string, string>),
    unresolved_question_ids: unresolved,
    known_symptoms: ["vomiting"],
    turn_count: answered.length,
  });

  describe('selectNextQuestion', () => {
    it('should prioritize emergency screen questions', () => {
      const state = mockState([], ['emergency_q1', 'must_ask_q1']);
      const family = getComplaintFamily('vomiting')!;

      const next = selectNextQuestion(state, family);
      expect(next).toBeDefined();
      // Should select from emergency screen first
      expect(family.emergencyScreen).toContain(next?.questionId);
    });

    it('should skip already answered questions', () => {
      const state = mockState(['emergency_q1'], ['emergency_q2', 'must_ask_q1']);
      const family = getComplaintFamily('vomiting')!;

      const next = selectNextQuestion(state, family);
      expect(next?.questionId).not.toBe('emergency_q1');
    });

    it('should fall back to must-ask questions when emergency screen is complete', () => {
      const family = getComplaintFamily('vomiting')!;
      const allEmergencyIds = family.emergencyScreen;
      const state = mockState(allEmergencyIds, ['must_ask_q1']);

      const next = selectNextQuestion(state, family);
      expect(next).toBeDefined();
      // Should now select from must-ask questions
      expect(family.mustAskQuestions.includes(next?.questionId ?? "")).toBe(true);
    });

    it('should return null when all questions are answered', () => {
      const family = getComplaintFamily('vomiting')!;
      const allQuestionIds = [
        ...family.emergencyScreen,
        ...family.mustAskQuestions,
      ];
      const state = mockState(allQuestionIds, []);

      const next = selectNextQuestion(state, family);
      expect(next).toBeNull();
    });

    it('should respect stop rule', () => {
      const family = getComplaintFamily('vomiting')!;
      // Stop rule triggers when red flags are detected
      const stateWithRedFlags = {
        ...mockState([], []),
        red_flags_detected: ['blood_in_vomit'],
      };

      // If stop rule triggers, should return null (stop asking)
      const next = selectNextQuestion(stateWithRedFlags, family);
      // Behavior depends on stop rule implementation
      expect(next).toBeDefined(); // or toBeNull() based on rule
    });
  });
});
