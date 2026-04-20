import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { LiveEvalScorecard } from "@/lib/benchmark-live-eval";
import {
  buildWave3FailureLedger,
  buildWave3ResidualBlockers,
  renderWave3FailureLedgerMarkdown,
  type Wave3FailureLedger,
} from "@/lib/wave3-root-cause-ledger";
import type {
  Wave3CanonicalCase,
  Wave3CanonicalManifest,
} from "@/lib/wave3-suite-manifest";

const manifest: Wave3CanonicalManifest = {
  suiteId: "wave3-freeze",
  suiteVersion: "wave3-freeze-v2",
  generatedAt: "2026-04-17T00:00:00.000Z",
  manifestHash: "test-manifest-hash",
  caseIds: [
    "emergency-breathing-labored",
    "emergency-hemorrhagic-diarrhea-shock",
    "emergency-hit-by-car",
  ],
  shardPaths: [],
  totalCases: 3,
  complaintFamilyCounts: {
    difficulty_breathing: 1,
    diarrhea: 1,
    trauma: 1,
  },
  riskTierCounts: {
    tier_1_emergency: 3,
  },
  modalityCounts: {},
};

const cases: Wave3CanonicalCase[] = [
  {
    id: "emergency-breathing-labored",
    complaint_family_tags: ["difficulty_breathing"],
    risk_tier: "tier_1_emergency",
    must_not_miss_marker: true,
    request: {
      messages: [
        {
          role: "user",
          content: "My dog is breathing with great effort using his belly muscles.",
        },
      ],
    },
  },
  {
    id: "emergency-hit-by-car",
    complaint_family_tags: ["trauma"],
    risk_tier: "tier_1_emergency",
    must_not_miss_marker: true,
    request: {
      messages: [
        {
          role: "user",
          content: "He was hit by a car and now he cannot stand up.",
        },
      ],
    },
  },
  {
    id: "emergency-hemorrhagic-diarrhea-shock",
    complaint_family_tags: ["diarrhea"],
    risk_tier: "tier_1_emergency",
    must_not_miss_marker: true,
    request: {
      messages: [
        {
          role: "user",
          content: "My dog has explosive bloody diarrhea and is weak with pale gums.",
        },
      ],
    },
  },
];

function buildScorecard(
  failures: LiveEvalScorecard["failures"]
): LiveEvalScorecard {
  return {
    runId: "test-run",
    generatedAt: "2026-04-17T00:00:00.000Z",
    executionMode: "live_route",
    suiteId: manifest.suiteId,
    suiteVersion: manifest.suiteVersion,
    manifestHash: manifest.manifestHash,
    suiteGeneratedAt: manifest.generatedAt,
    suiteTotalCases: manifest.totalCases,
    suiteCaseIds: manifest.caseIds,
    evaluatedCaseIds: manifest.caseIds,
    extraCaseIds: [],
    missingCaseIds: [],
    baseUrl: "http://localhost:3000",
    filters: {},
    totalCases: manifest.totalCases,
    passedCases: manifest.totalCases - failures.length,
    failedCases: failures.length,
    totalChecks: manifest.totalCases * 2,
    passedChecks: manifest.totalCases * 2 - failures.length,
    failedChecks: failures.length,
    expectationPassRate: 0,
    meanExpectationScore: 0,
    emergencyRecall: 0,
    emergencyCaseCount: 3,
    emergencyMissCount: failures.length,
    unsafeDowngradeRate: 0,
    blockingFailures: failures.length,
    passFail: "FAIL",
    preflight: null,
    byResponseType: {},
    byRiskTier: {},
    failures,
  };
}

function buildPreviousLedger(): Wave3FailureLedger {
  return buildWave3FailureLedger({
    manifest,
    cases,
    scorecard: buildScorecard([
      {
        caseId: "emergency-breathing-labored",
        severity: "CRITICAL",
        category: "missed_emergency",
        expected: "emergency",
        actual: "question",
        description:
          "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
      },
      {
        caseId: "emergency-hit-by-car",
        severity: "CRITICAL",
        category: "unsafe_downgrade",
        expected: "emergency",
        actual: "question",
        description: "Failed checks: responseType, readyForReport",
      },
    ]),
    previousLedger: null,
  });
}

function writeJsonArtifact(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("Wave 3 root-cause ledger deltas", () => {
  it("tracks root-cause bucket improvements, regressions, and stable rows", () => {
    const previousLedger = buildPreviousLedger();
    const currentLedger = buildWave3FailureLedger({
      manifest,
      cases,
      scorecard: buildScorecard([
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "missed_emergency",
          expected: "emergency",
          actual: "question",
          description:
            "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
        },
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "route_error",
          expected: "2xx response",
          actual: "500",
          description: "Symptom-chat route returned 500",
        },
        {
          caseId: "emergency-hemorrhagic-diarrhea-shock",
          severity: "CRITICAL",
          category: "unsafe_downgrade",
          expected: "emergency",
          actual: "question",
          description: "Failed checks: responseType, readyForReport",
        },
      ]),
      previousLedger,
    });

    expect(currentLedger.delta.previousTotalFailures).toBe(2);
    expect(currentLedger.delta.totalFailureDelta).toBe(1);
    expect(currentLedger.delta.countsByStatus.regressed).toBe(2);
    expect(currentLedger.delta.countsByStatus.improved).toBe(1);
    expect(currentLedger.delta.countsByStatus.unchanged).toBe(1);

    const questionBucket = currentLedger.delta.rootCauseChanges.find(
      (change) =>
        change.rootCauseBucket === "question orchestration overriding emergency"
    );
    expect(questionBucket?.status).toBe("improved");
    expect(questionBucket?.resolvedCaseIds).toEqual(["emergency-hit-by-car"]);

    const redFlagBucket = currentLedger.delta.rootCauseChanges.find(
      (change) => change.rootCauseBucket === "missing red flag linkage"
    );
    expect(redFlagBucket?.status).toBe("regressed");
    expect(redFlagBucket?.newCaseIds).toEqual([
      "emergency-hemorrhagic-diarrhea-shock",
    ]);
  });

  it("builds severity-first residual blocker deltas with stable change labels", () => {
    const previousLedger = buildPreviousLedger();
    const previousBlockers = buildWave3ResidualBlockers(previousLedger, null);
    const currentLedger = buildWave3FailureLedger({
      manifest,
      cases,
      scorecard: buildScorecard([
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "missed_emergency",
          expected: "emergency",
          actual: "question",
          description:
            "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
        },
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "route_error",
          expected: "2xx response",
          actual: "500",
          description: "Symptom-chat route returned 500",
        },
        {
          caseId: "emergency-hemorrhagic-diarrhea-shock",
          severity: "CRITICAL",
          category: "unsafe_downgrade",
          expected: "emergency",
          actual: "question",
          description: "Failed checks: responseType, readyForReport",
        },
      ]),
      previousLedger,
    });
    const currentBlockers = buildWave3ResidualBlockers(
      currentLedger,
      previousBlockers
    );

    expect(currentBlockers.delta.previousTotalBlockers).toBe(2);
    expect(currentBlockers.delta.blockerDelta).toBe(0);
    expect(currentBlockers.delta.countsByStatus.regressed).toBe(1);
    expect(currentBlockers.delta.countsByStatus.new).toBe(1);
    expect(currentBlockers.delta.countsByStatus.resolved).toBe(1);
    expect(currentBlockers.delta.countsByStatus.unchanged).toBe(0);
    expect(currentBlockers.summary.severityBands.criticalReleaseBlockers.total).toBe(
      2
    );
    expect(
      currentBlockers.delta.bandDeltas.criticalReleaseBlockers.previousTotal
    ).toBe(2);
    expect(currentBlockers.delta.bandDeltas.highNonBlockingFailures.delta).toBe(
      0
    );

    expect(currentBlockers.delta.changes[0].caseId).toBe(
      "emergency-breathing-labored"
    );
    expect(currentBlockers.delta.changes[0].status).toBe("regressed");

    const resolved = currentBlockers.delta.changes.find(
      (change) => change.caseId === "emergency-hit-by-car"
    );
    expect(resolved?.status).toBe("resolved");
  });

  it("treats critical bucket changes as severity-first even when high counts grow", () => {
    const previousLedger = buildWave3FailureLedger({
      manifest,
      cases,
      scorecard: buildScorecard([
        {
          caseId: "emergency-hit-by-car",
          severity: "CRITICAL",
          category: "unsafe_downgrade",
          expected: "emergency",
          actual: "question",
          description: "Failed checks: responseType",
        },
      ]),
      previousLedger: null,
    });
    const currentLedger = buildWave3FailureLedger({
      manifest,
      cases,
      scorecard: buildScorecard(
        Array.from({ length: 100 }, () => ({
          caseId: "emergency-hit-by-car",
          severity: "HIGH" as const,
          category: "unsafe_downgrade" as const,
          expected: "emergency",
          actual: "question",
          description: "Failed checks: responseType",
        }))
      ),
      previousLedger,
    });

    const bucket = currentLedger.delta.rootCauseChanges.find(
      (change) =>
        change.rootCauseBucket === "question orchestration overriding emergency"
    );

    expect(bucket?.status).toBe("improved");
    expect(bucket?.previousSeverityCounts).toEqual({
      CRITICAL: 1,
      HIGH: 0,
      MEDIUM: 0,
    });
    expect(bucket?.currentSeverityCounts).toEqual({
      CRITICAL: 0,
      HIGH: 100,
      MEDIUM: 0,
    });
  });

  it("loads the latest benchmark artifacts by default and allows explicit opt-out", () => {
    const previousLedger = buildPreviousLedger();
    const previousBlockers = buildWave3ResidualBlockers(previousLedger, null);
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pawvital-wave3-ledger-baseline-")
    );
    const originalCwd = process.cwd();

    try {
      const benchmarkDir = path.join(
        tempDir,
        "data",
        "benchmarks",
        "dog-triage"
      );
      fs.mkdirSync(benchmarkDir, { recursive: true });
      const previousLedgerPath = path.join(
        benchmarkDir,
        "wave3-emergency-root-cause-ledger.json"
      );
      const previousBlockersPath = path.join(
        benchmarkDir,
        "wave3-residual-blockers.json"
      );
      writeJsonArtifact(previousLedgerPath, previousLedger);
      writeJsonArtifact(previousBlockersPath, previousBlockers);
      process.chdir(tempDir);

      const currentLedgerWithDefaultBaseline = buildWave3FailureLedger({
        manifest,
        cases,
        scorecard: buildScorecard([
          {
            caseId: "emergency-breathing-labored",
            severity: "CRITICAL",
            category: "missed_emergency",
            expected: "emergency",
            actual: "question",
            description:
              "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
          },
        ]),
      });
      const currentLedgerWithoutBaseline = buildWave3FailureLedger({
        manifest,
        cases,
        scorecard: buildScorecard([
          {
            caseId: "emergency-breathing-labored",
            severity: "CRITICAL",
            category: "missed_emergency",
            expected: "emergency",
            actual: "question",
            description:
              "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
          },
        ]),
        previousLedgerPath: null,
      });

      expect(currentLedgerWithDefaultBaseline.delta.previousTotalFailures).toBe(
        previousLedger.totalFailures
      );
      expect(currentLedgerWithoutBaseline.delta.previousTotalFailures).toBeNull();

      const blockersWithDefaultBaseline = buildWave3ResidualBlockers(
        currentLedgerWithDefaultBaseline
      );
      const blockersWithoutBaseline = buildWave3ResidualBlockers(
        currentLedgerWithDefaultBaseline,
        undefined,
        { previousBlockersPath: null }
      );

      expect(blockersWithDefaultBaseline.delta.previousTotalBlockers).toBe(
        previousBlockers.blockers.length
      );
      expect(blockersWithoutBaseline.delta.previousTotalBlockers).toBeNull();
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("suppresses historical deltas when the live scorecard is missing", () => {
    const previousLedger = buildPreviousLedger();
    const previousBlockers = buildWave3ResidualBlockers(previousLedger, null);
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "pawvital-wave3-ledger-missing-scorecard-")
    );

    try {
      const previousLedgerPath = path.join(tempDir, "previous-ledger.json");
      const previousBlockersPath = path.join(
        tempDir,
        "previous-blockers.json"
      );
      writeJsonArtifact(previousLedgerPath, previousLedger);
      writeJsonArtifact(previousBlockersPath, previousBlockers);

      const ledger = buildWave3FailureLedger({
        manifest,
        cases,
        scorecard: null,
        previousLedgerPath,
      });
      const blockers = buildWave3ResidualBlockers(ledger, undefined, {
        previousBlockersPath,
      });

      expect(ledger.hasScorecard).toBe(false);
      expect(ledger.totalFailures).toBe(0);
      expect(ledger.delta.previousTotalFailures).toBeNull();
      expect(ledger.delta.rootCauseChanges).toEqual([]);
      expect(blockers.delta.previousTotalBlockers).toBeNull();
      expect(blockers.delta.changes).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("renders markdown with burn-down and delta sections", () => {
    const previousLedger = buildPreviousLedger();
    const previousBlockers = buildWave3ResidualBlockers(previousLedger, null);
    const currentLedger = buildWave3FailureLedger({
      manifest,
      cases,
      scorecard: buildScorecard([
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "missed_emergency",
          expected: "emergency",
          actual: "question",
          description:
            "Failed checks: responseType, readyForReport, knownSymptomsInclude:difficulty_breathing",
        },
        {
          caseId: "emergency-breathing-labored",
          severity: "CRITICAL",
          category: "route_error",
          expected: "2xx response",
          actual: "500",
          description: "Symptom-chat route returned 500",
        },
        {
          caseId: "emergency-hemorrhagic-diarrhea-shock",
          severity: "CRITICAL",
          category: "unsafe_downgrade",
          expected: "emergency",
          actual: "question",
          description: "Failed checks: responseType, readyForReport",
        },
      ]),
      previousLedger,
    });
    const currentBlockers = buildWave3ResidualBlockers(
      currentLedger,
      previousBlockers
    );
    const markdown = renderWave3FailureLedgerMarkdown(
      currentLedger,
      currentBlockers
    );

    expect(markdown).toContain("## Burn-Down Snapshot");
    expect(markdown).toContain("## Root Cause Delta");
    expect(markdown).toContain("## Residual Blocker Delta");
    expect(markdown).toContain("## Critical Release Blockers");
    expect(markdown).toContain("## Root Cause Bucket Counts");
    expect(markdown).toContain("emergency-breathing-labored");
    expect(markdown).toContain("emergency-hit-by-car");
  });
});
