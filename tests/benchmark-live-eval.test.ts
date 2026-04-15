import {
  renderLiveScorecardMarkdown,
  scoreLiveBenchmarkReport,
  type RouteBenchmarkReport,
} from "@/lib/benchmark-live-eval";
import { summarizeBenchmarkCoverage } from "@/lib/benchmark-coverage";

function makeReport(): RouteBenchmarkReport {
  return {
    mode: "live",
    generatedAt: "2026-04-14T12:00:00.000Z",
    suiteId: "dog-triage-gold-candidate-merged",
    species: "dog",
    baseUrl: "https://pawvital.example.com",
    preflight: {
      performedAt: "2026-04-14T12:00:00.000Z",
      routeUrl: "https://pawvital.example.com/api/ai/sidecar-readiness",
      ready: true,
      requiredServices: 5,
      configuredCount: 5,
      healthyCount: 5,
      stubCount: 0,
      blockers: [],
      readiness: { healthyCount: 5 },
    },
    cases: [
      {
        id: "emergency-hit",
        description: "Emergency case handled correctly",
        httpStatus: 200,
        actualType: "emergency",
        riskTier: "tier_1_emergency",
        mustNotMissMarker: true,
        tags: ["emergency"],
        evaluation: {
          totalChecks: 2,
          passedChecks: 2,
          failedChecks: 0,
          score: 1,
          pass: true,
          checks: [],
        },
        expectations: { responseType: "emergency", readyForReport: true },
      },
      {
        id: "emergency-miss",
        description: "Emergency case downgraded",
        httpStatus: 200,
        actualType: "question",
        riskTier: "tier_1_emergency",
        mustNotMissMarker: true,
        tags: ["emergency", "abdomen"],
        evaluation: {
          totalChecks: 2,
          passedChecks: 1,
          failedChecks: 1,
          score: 0.5,
          pass: false,
          checks: [
            {
              name: "responseType",
              pass: false,
              expected: "emergency",
              actual: "question",
            },
          ],
        },
        expectations: { responseType: "emergency", readyForReport: true },
      },
      {
        id: "question-pass",
        description: "Question flow case passes",
        httpStatus: 200,
        actualType: "question",
        riskTier: "tier_3_routine",
        mustNotMissMarker: false,
        tags: ["question-flow"],
        evaluation: {
          totalChecks: 3,
          passedChecks: 3,
          failedChecks: 0,
          score: 1,
          pass: true,
          checks: [],
        },
        expectations: { responseType: "question", readyForReport: false },
      },
    ],
  };
}

describe("benchmark live eval scoring", () => {
  it("scores live benchmark artifacts and surfaces critical failures", () => {
    const scorecard = scoreLiveBenchmarkReport(makeReport());

    expect(scorecard.totalCases).toBe(3);
    expect(scorecard.passedCases).toBe(2);
    expect(scorecard.failedCases).toBe(1);
    expect(scorecard.emergencyCaseCount).toBe(2);
    expect(scorecard.emergencyMissCount).toBe(1);
    expect(scorecard.emergencyRecall).toBe(0.5);
    expect(scorecard.unsafeDowngradeRate).toBeCloseTo(1 / 3, 4);
    expect(scorecard.blockingFailures).toBeGreaterThan(0);
    expect(scorecard.passFail).toBe("FAIL");
    expect(scorecard.failures[0]?.severity).toBe("CRITICAL");
  });

  it("supports case filters and markdown rendering", () => {
    const scorecard = scoreLiveBenchmarkReport(makeReport(), {
      caseId: "question-pass",
    });
    const markdown = renderLiveScorecardMarkdown(scorecard);

    expect(scorecard.totalCases).toBe(1);
    expect(scorecard.passFail).toBe("PASS");
    expect(markdown).toContain("VET-1206 Live Eval Baseline");
    expect(markdown).toContain("question");
  });
});

describe("benchmark coverage summary", () => {
  it("summarizes suite coverage from merged shards", () => {
    const summary = summarizeBenchmarkCoverage([
      {
        suite_id: "shard-a",
        version: "2026-04-14",
        species: "dog",
        description: "A",
        cases: [
          {
            id: "case-1",
            weight: 3,
            tags: ["emergency"],
            risk_tier: "tier_1_emergency",
            complaint_family_tags: ["swollen_abdomen"],
            must_not_miss_marker: true,
            expectations: { responseType: "emergency" },
          },
        ],
      },
      {
        suite_id: "shard-b",
        version: "2026-04-14",
        species: "dog",
        description: "B",
        cases: [
          {
            id: "case-2",
            weight: 1,
            tags: ["question-flow"],
            risk_tier: "tier_3_routine",
            complaint_family_tags: ["limping"],
            expectations: { responseType: "question" },
          },
        ],
      },
    ]);

    expect(summary.totalCases).toBe(2);
    expect(summary.totalWeightedCases).toBe(4);
    expect(summary.mustNotMissCount).toBe(1);
    expect(summary.uniqueComplaintFamilies).toBe(2);
    expect(summary.byResponseType.emergency).toBe(1);
    expect(summary.byRiskTier.tier_1_emergency).toBe(1);
    expect(summary.byTag["question-flow"]).toBe(1);
  });
});
