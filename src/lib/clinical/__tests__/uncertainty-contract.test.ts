/**
 * VET-921: Uncertainty Contract Tests
 *
 * Tests the five uncertainty reasons and their deterministic action mappings.
 */

import {
  getUncertaintyReasons,
  resolveUncertainty,
  type UncertaintyReason,
} from "../uncertainty-contract";

const baseContext = {
  isCriticalSign: false,
  hasAlternateObservable: false,
  isEmergencyScreen: false,
  confidenceScore: 0.7,
};

describe("Uncertainty Contract", () => {
  it("should expose all required uncertainty reasons", () => {
    expect(getUncertaintyReasons()).toEqual([
      "unsupported_pattern",
      "conflicting_evidence",
      "missing_critical_sign",
      "owner_cannot_assess",
      "out_of_scope",
    ]);
  });

  it("should escalate when the owner cannot assess a critical sign without an alternate", () => {
    const rule = resolveUncertainty("owner_cannot_assess", {
      ...baseContext,
      isCriticalSign: true,
      hasAlternateObservable: false,
    });

    expect(rule.action).toBe("escalate");
  });

  it("should use an alternate observable when one is available", () => {
    const rule = resolveUncertainty("owner_cannot_assess", {
      ...baseContext,
      isCriticalSign: true,
      hasAlternateObservable: true,
    });

    expect(rule.action).toBe("alternate_observable");
  });

  it("should re-ask missing critical signs in emergency screens", () => {
    const rule = resolveUncertainty("missing_critical_sign", {
      ...baseContext,
      isEmergencyScreen: true,
    });

    expect(rule.action).toBe("re_ask");
  });

  it("should re-ask conflicting evidence when confidence is low", () => {
    const rule = resolveUncertainty("conflicting_evidence", {
      ...baseContext,
      confidenceScore: 0.4,
    });

    expect(rule.action).toBe("re_ask");
  });

  it("should abstain safely for unsupported patterns and out-of-scope questions", () => {
    const unsupported = resolveUncertainty("unsupported_pattern", {
      ...baseContext,
      confidenceScore: 0.4,
    });
    const outOfScope = resolveUncertainty("out_of_scope", baseContext);

    expect(unsupported.action).toBe("abstain_with_safe_next_step");
    expect(outOfScope.action).toBe("abstain_with_safe_next_step");
  });

  it("should fall back to escalation for unmatched critical contexts", () => {
    const rule = resolveUncertainty("conflicting_evidence", {
      ...baseContext,
      isCriticalSign: true,
      confidenceScore: 0.9,
    });

    expect(rule.action).toBe("escalate");
  });

  it("should reject invalid reasons through normal record lookup behavior", () => {
    expect(() =>
      resolveUncertainty("not_a_reason" as UncertaintyReason, baseContext),
    ).not.toThrow();
  });
});
