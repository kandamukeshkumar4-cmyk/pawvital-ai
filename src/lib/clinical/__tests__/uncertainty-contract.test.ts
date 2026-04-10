/**
 * VET-921: Uncertainty Contract Tests
 *
 * Tests the 5 uncertainty reasons and their deterministic action mappings:
 * 1. unsupported_pattern
 * 2. conflicting_evidence
 * 3. missing_critical_sign
 * 4. owner_cannot_assess
 * 5. out_of_scope
 */

import {
  UncertaintyReason,
  resolveUncertaintyAction,
  isSafetyCritical,
} from '../src/lib/clinical/uncertainty-contract';

describe('Uncertainty Contract', () => {
  describe('Uncertainty Reason Mapping', () => {
    it('should map unsupported_pattern to appropriate action', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.UnsupportedPattern);
      expect(action).toBeDefined();
      expect(action.severity).toBe('medium');
    });

    it('should map conflicting_evidence to appropriate action', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.ConflictingEvidence);
      expect(action).toBeDefined();
      expect(action.severity).toBe('medium');
    });

    it('should map missing_critical_sign to high severity', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.MissingCriticalSign);
      expect(action).toBeDefined();
      expect(action.severity).toBe('high');
    });

    it('should map owner_cannot_assess to appropriate action', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.OwnerCannotAssess);
      expect(action).toBeDefined();
    });

    it('should map out_of_scope to abstain action', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.OutOfScope);
      expect(action).toBeDefined();
      expect(action.action).toBe('abstain');
    });
  });

  describe('Safety Critical Detection', () => {
    it('should identify missing_critical_sign as safety critical', () => {
      expect(isSafetyCritical(UncertaintyReason.MissingCriticalSign)).toBe(true);
    });

    it('should identify out_of_scope as safety critical', () => {
      expect(isSafetyCritical(UncertaintyReason.OutOfScope)).toBe(true);
    });

    it('should not identify unsupported_pattern as safety critical', () => {
      expect(isSafetyCritical(UncertaintyReason.UnsupportedPattern)).toBe(false);
    });

    it('should not identify conflicting_evidence as safety critical', () => {
      expect(isSafetyCritical(UncertaintyReason.ConflictingEvidence)).toBe(false);
    });

    it('should not identify owner_cannot_assess as safety critical', () => {
      expect(isSafetyCritical(UncertaintyReason.OwnerCannotAssess)).toBe(false);
    });
  });

  describe('Uncertainty Actions', () => {
    it('should include escalation guidance for high severity', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.MissingCriticalSign);
      expect(action.escalation).toBeDefined();
    });

    it('should include owner-facing explanation', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.OwnerCannotAssess);
      expect(action.ownerExplanation).toBeDefined();
      expect(action.ownerExplanation.length).toBeGreaterThan(0);
    });

    it('should include alternate questions for owner_cannot_assess', () => {
      const action = resolveUncertaintyAction(UncertaintyReason.OwnerCannotAssess);
      expect(action.alternateQuestions).toBeDefined();
      expect(action.alternateQuestions.length).toBeGreaterThan(0);
    });
  });

  describe('Invalid Inputs', () => {
    it('should handle null reason gracefully', () => {
      expect(() => resolveUncertaintyAction(null as any)).toThrow();
    });

    it('should handle undefined reason gracefully', () => {
      expect(() => resolveUncertaintyAction(undefined as any)).toThrow();
    });
  });
});
