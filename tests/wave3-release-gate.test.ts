import {
  evaluateWave3ReleaseGate,
  type Wave3CanonicalSuiteSummary,
  type Wave3CaseRecord,
} from "@/lib/wave3-release-gate";
import type { LiveEvalScorecard } from "@/lib/benchmark-live-eval";
import { getAllProvenanceEntries, getRequiredHighStakesRuleIds } from "@/lib/provenance-registry";

const baseCases: Wave3CaseRecord[] = [
  {
    id: "emergency-blue-gums-breathing",
    complaint_family_tags: ["difficulty_breathing"],
    risk_tier: "tier_1_emergency",
    wave3_strata: ["emergency", "rare-but-critical"],
    must_not_miss_marker: true,
  },
  {
    id: "common-vomiting-case",
    complaint_family_tags: ["vomiting"],
    risk_tier: "tier_3_48h_monitor",
    wave3_strata: ["common"],
    must_not_miss_marker: false,
  },
];

function buildScorecard(overrides: Partial<LiveEvalScorecard> = {}): LiveEvalScorecard {
  return {
    runId: "test",
    generatedAt: "2026-04-17T00:00:00.000Z",
    executionMode: "live_route",
    suiteId: "wave3-freeze",
    suiteVersion: "wave3-freeze-v2",
    manifestHash: "canonical-hash",
    suiteGeneratedAt: "2026-04-17T00:00:00.000Z",
    suiteTotalCases: 2,
    suiteCaseIds: baseCases.map((caseRecord) => caseRecord.id),
    evaluatedCaseIds: baseCases.map((caseRecord) => caseRecord.id),
    extraCaseIds: [],
    missingCaseIds: [],
    baseUrl: "http://localhost:3000",
    filters: {},
    totalCases: 2,
    passedCases: 2,
    failedCases: 0,
    totalChecks: 4,
    passedChecks: 4,
    failedChecks: 0,
    expectationPassRate: 1,
    meanExpectationScore: 1,
    emergencyRecall: 1,
    emergencyCaseCount: 1,
    emergencyMissCount: 0,
    unsafeDowngradeRate: 0,
    blockingFailures: 0,
    passFail: "PASS",
    preflight: null,
    byResponseType: {},
    byRiskTier: {},
    failures: [],
    ...overrides,
  };
}

const canonicalSuite: Wave3CanonicalSuiteSummary = {
  suiteId: "wave3-freeze",
  suiteVersion: "wave3-freeze-v2",
  generatedAt: "2026-04-17T00:00:00.000Z",
  manifestHash: "canonical-hash",
  totalCases: 2,
  caseIds: baseCases.map((caseRecord) => caseRecord.id),
};

describe("Wave 3 release gate", () => {
  it("passes when metrics, provenance, and high-risk failures are clean", () => {
    const result = evaluateWave3ReleaseGate({
      cases: baseCases,
      modalities: [{ modality: "skin_lesion", caseCount: 6 }],
      scorecard: buildScorecard(),
      canonicalSuite,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when required provenance is missing", () => {
    const result = evaluateWave3ReleaseGate({
      cases: baseCases,
      scorecard: buildScorecard(),
      canonicalSuite,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries().filter(
        (entry) => entry.rule_id !== "red_flag.blue_gums"
      ),
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("required high-stakes provenance"))).toBe(true);
  });

  it("fails when the live scorecard misses the emergency gate", () => {
    const result = evaluateWave3ReleaseGate({
      cases: baseCases,
      scorecard: buildScorecard({
        emergencyRecall: 0.75,
        unsafeDowngradeRate: 0.02,
        failures: [
          {
            caseId: "emergency-blue-gums-breathing",
            severity: "CRITICAL",
            category: "missed_emergency",
            expected: "emergency",
            actual: "question",
            description: "Failed checks: responseType",
          },
        ],
      }),
      canonicalSuite,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("Emergency recall"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("Unsafe downgrade rate"))).toBe(true);
    expect(result.blockingHighRiskFailures).toHaveLength(1);
  });

  it("fails when the scorecard suite identity or case IDs diverge from the canonical manifest", () => {
    const result = evaluateWave3ReleaseGate({
      cases: baseCases,
      scorecard: buildScorecard({
        suiteId: "wave3-freeze-merged",
        manifestHash: "stale-hash",
        suiteCaseIds: ["emergency-blue-gums-breathing", "extra-case"],
        evaluatedCaseIds: ["emergency-blue-gums-breathing", "extra-case"],
        extraCaseIds: ["extra-case"],
        missingCaseIds: ["common-vomiting-case"],
      }),
      canonicalSuite,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(false);
    expect(
      result.failures.some((failure) => failure.includes("suite identity"))
    ).toBe(true);
    expect(
      result.failures.some((failure) => failure.includes("extra case IDs"))
    ).toBe(true);
    expect(
      result.failures.some((failure) =>
        failure.includes("missing canonical case IDs")
      )
    ).toBe(true);
  });
});
