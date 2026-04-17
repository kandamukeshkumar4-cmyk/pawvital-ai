import {
  buildWave3CanonicalManifestFromLegacy,
  compareWave3SuiteIdentity,
  enrichLiveScorecardWithWave3Identity,
  evaluateWave3ReleaseGate,
  type Wave3CaseRecord,
  type Wave3LiveScorecard,
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

const canonicalManifest = buildWave3CanonicalManifestFromLegacy({
  legacyManifest: {
    version: "wave3-freeze-v2",
    generatedAt: "2026-04-17T00:00:00.000Z",
    uniqueCaseCount: 2,
    strata: [{ fileName: "emergency.json" }, { fileName: "common.json" }],
    multimodalSlices: [{ fileName: "skin-lesion.jsonl", modality: "skin_lesion", caseCount: 6 }],
  },
  cases: baseCases,
});

function buildScorecard(overrides: Partial<LiveEvalScorecard> = {}): LiveEvalScorecard {
  return {
    runId: "test",
    generatedAt: "2026-04-17T00:00:00.000Z",
    executionMode: "live_route",
    suiteId: canonicalManifest.suiteId,
    baseUrl: "http://localhost:3000",
    filters: {},
    totalCases: canonicalManifest.totalCases,
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

function buildAlignedScorecard(
  overrides: Partial<LiveEvalScorecard> = {},
  observedCaseIds = baseCases.map((caseRecord) => caseRecord.id)
): Wave3LiveScorecard {
  return enrichLiveScorecardWithWave3Identity({
    manifest: canonicalManifest,
    scorecard: buildScorecard(overrides),
    observedSuiteId: canonicalManifest.suiteId,
    observedCaseIds,
  });
}

describe("Wave 3 release gate", () => {
  it("passes when metrics, provenance, and high-risk failures are clean", () => {
    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      modalities: [{ modality: "skin_lesion", caseCount: 6 }],
      scorecard: buildAlignedScorecard(),
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.manifestHash).toBe(canonicalManifest.manifestHash);
  });

  it("fails when required provenance is missing", () => {
    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard: buildAlignedScorecard(),
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
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard: buildAlignedScorecard({
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
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("Emergency recall"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("Unsafe downgrade rate"))).toBe(true);
    expect(result.blockingHighRiskFailures).toHaveLength(1);
  });

  it("fails when the scorecard is missing canonical case IDs", () => {
    const scorecard = buildAlignedScorecard({}, [baseCases[0].id]);

    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(scorecard.passFail).toBe("BLOCKED");
    expect(scorecard.missingCaseIds).toEqual([baseCases[1].id]);
    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("missing 1 canonical case ID"))).toBe(true);
  });

  it("fails when the scorecard contains extra case IDs", () => {
    const scorecard = buildAlignedScorecard({}, [
      ...baseCases.map((caseRecord) => caseRecord.id),
      "extra-case-id",
    ]);

    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(scorecard.extraCaseIds).toEqual(["extra-case-id"]);
    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("extra case ID"))).toBe(true);
  });

  it("fails loudly on stale scorecard suite identity", () => {
    const staleScorecard: Wave3LiveScorecard = {
      ...buildScorecard(),
      suiteId: "wave3-stale",
      manifestHash: "stale-manifest-hash",
      extraCaseIds: [],
      missingCaseIds: [],
      duplicateCaseIds: [],
      suiteIdentityFailures: [],
      suiteIdentityAligned: true,
      observedSuiteId: "wave3-stale",
      observedManifestHash: "stale-manifest-hash",
    };

    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard: staleScorecard,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("suiteId"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("manifestHash"))).toBe(true);
  });

  it("fails on dedupe mismatch and duplicate scorecard case IDs", () => {
    const identity = compareWave3SuiteIdentity({
      manifest: canonicalManifest,
      observedSuiteId: canonicalManifest.suiteId,
      observedManifestHash: canonicalManifest.manifestHash,
      observedCaseIds: [baseCases[0].id, baseCases[0].id],
      observedTotalCases: canonicalManifest.totalCases,
      observedLabel: "Live scorecard",
    });
    const scorecard = buildAlignedScorecard({}, [baseCases[0].id, baseCases[0].id]);

    const result = evaluateWave3ReleaseGate({
      manifest: canonicalManifest,
      cases: baseCases,
      scorecard,
      requiredHighStakesRuleIds: getRequiredHighStakesRuleIds(),
      provenanceEntries: getAllProvenanceEntries(),
    });

    expect(identity.aligned).toBe(false);
    expect(identity.duplicateCaseIds).toEqual([baseCases[0].id]);
    expect(scorecard.duplicateCaseIds).toEqual([baseCases[0].id]);
    expect(result.pass).toBe(false);
    expect(result.failures.some((failure) => failure.includes("duplicate case IDs"))).toBe(true);
    expect(result.failures.some((failure) => failure.includes("missing 1 canonical case ID"))).toBe(true);
  });
});
