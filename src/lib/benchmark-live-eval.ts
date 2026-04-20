export interface BenchmarkExpectationCheck {
  name: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
}

export interface BenchmarkExpectationEvaluation {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  score: number;
  pass: boolean;
  checks: BenchmarkExpectationCheck[];
}

export interface RouteBenchmarkCaseResult {
  id: string;
  description: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  httpStatus: number;
  actualType: string | null;
  tags?: string[];
  weight?: number;
  riskTier?: string | null;
  complaintFamilyTags?: string[];
  mustNotMissMarker?: boolean;
  evaluation: BenchmarkExpectationEvaluation;
  expectations: {
    responseType?: string;
    readyForReport?: boolean;
    [key: string]: unknown;
  };
}

export interface RouteBenchmarkPreflight {
  performedAt: string;
  routeUrl: string;
  ready: boolean;
  requiredServices: number;
  configuredCount: number;
  healthyCount: number;
  warmingCount?: number;
  stubCount: number;
  blockers: string[];
  readiness?: Record<string, unknown> | null;
}

export interface RouteBenchmarkReport {
  mode: "live" | "dry-run" | "blocked";
  generatedAt: string;
  suiteId: string;
  suiteVersion?: string;
  manifestHash?: string;
  suiteGeneratedAt?: string;
  suiteTotalCases?: number;
  suiteCaseIds?: string[];
  species: string;
  baseUrl?: string;
  preflight?: RouteBenchmarkPreflight | null;
  summary?: Record<string, unknown>;
  cases: RouteBenchmarkCaseResult[];
}

export interface LiveEvalFilter {
  caseId?: string;
  responseType?: string;
  riskTier?: string;
  tag?: string;
}

export interface LiveEvalFailure {
  caseId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  category: string;
  expected: string;
  actual: string;
  description: string;
}

export interface LiveEvalBucketSummary {
  cases: number;
  passedCases: number;
  failedCases: number;
  meanScore: number;
}

export interface LiveEvalScorecard {
  runId: string;
  generatedAt: string;
  executionMode: "live_route";
  suiteId: string;
  suiteVersion: string | null;
  manifestHash: string | null;
  suiteGeneratedAt: string | null;
  suiteTotalCases: number | null;
  suiteCaseIds: string[];
  evaluatedCaseIds: string[];
  extraCaseIds: string[];
  missingCaseIds: string[];
  baseUrl: string | null;
  filters: LiveEvalFilter;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  expectationPassRate: number;
  meanExpectationScore: number;
  emergencyRecall: number;
  emergencyCaseCount: number;
  emergencyMissCount: number;
  unsafeDowngradeRate: number;
  blockingFailures: number;
  passFail: "PASS" | "FAIL" | "BLOCKED";
  preflight: RouteBenchmarkPreflight | null;
  byResponseType: Record<string, LiveEvalBucketSummary>;
  byRiskTier: Record<string, LiveEvalBucketSummary>;
  failures: LiveEvalFailure[];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function responseTypeKey(result: RouteBenchmarkCaseResult): string {
  return String(result.expectations?.responseType || "missing").trim() || "missing";
}

function riskTierKey(result: RouteBenchmarkCaseResult): string {
  return String(result.riskTier || "unclassified").trim() || "unclassified";
}

function matchesFilter(
  result: RouteBenchmarkCaseResult,
  filter: LiveEvalFilter
): boolean {
  if (filter.caseId && result.id !== filter.caseId) return false;
  if (filter.responseType && responseTypeKey(result) !== filter.responseType) {
    return false;
  }
  if (filter.riskTier && riskTierKey(result) !== filter.riskTier) {
    return false;
  }
  if (filter.tag) {
    const tags = Array.isArray(result.tags) ? result.tags : [];
    if (!tags.includes(filter.tag)) return false;
  }
  return true;
}

function isEmergencyExpectation(result: RouteBenchmarkCaseResult): boolean {
  return responseTypeKey(result) === "emergency";
}

function isMissedEmergency(result: RouteBenchmarkCaseResult): boolean {
  return isEmergencyExpectation(result) && result.actualType !== "emergency";
}

function isUnsafeDowngrade(result: RouteBenchmarkCaseResult): boolean {
  const tier = riskTierKey(result);
  return (
    (result.mustNotMissMarker === true || tier === "tier_1_emergency") &&
    result.actualType !== "emergency"
  );
}

function classifySeverity(
  result: RouteBenchmarkCaseResult
): LiveEvalFailure["severity"] {
  if (isMissedEmergency(result) || isUnsafeDowngrade(result)) {
    return "CRITICAL";
  }

  const tier = riskTierKey(result);
  if (tier.startsWith("tier_2")) {
    return "HIGH";
  }
  return "MEDIUM";
}

function firstFailedChecks(result: RouteBenchmarkCaseResult): string[] {
  return (result.evaluation.checks || [])
    .filter((check) => !check.pass)
    .map((check) => check.name);
}

function buildFailures(results: RouteBenchmarkCaseResult[]): LiveEvalFailure[] {
  return results.flatMap((result) => {
    if (result.evaluation.pass) return [];

    const failedChecks = firstFailedChecks(result);
    const checkSummary = failedChecks.length > 0 ? failedChecks.join(", ") : "failed expectations";
    const expected = responseTypeKey(result);
    const actual = String(result.actualType || "missing");
    const severity = classifySeverity(result);

    const failures: LiveEvalFailure[] = [
      {
        caseId: result.id,
        severity,
        category: isUnsafeDowngrade(result)
          ? "unsafe_downgrade"
          : isMissedEmergency(result)
            ? "missed_emergency"
            : "expectation_mismatch",
        expected,
        actual,
        description: `Failed checks: ${checkSummary}`,
      },
    ];

    if (result.httpStatus >= 500) {
      failures.unshift({
        caseId: result.id,
        severity,
        category: "route_error",
        expected: "2xx response",
        actual: String(result.httpStatus),
        description: `Symptom-chat route returned ${result.httpStatus}`,
      });
    }

    return failures;
  });
}

function compareFailureSeverity(
  left: LiveEvalFailure,
  right: LiveEvalFailure
): number {
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  const severityDelta = order[left.severity] - order[right.severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  return left.caseId.localeCompare(right.caseId);
}

function summarizeBucket(
  results: RouteBenchmarkCaseResult[]
): LiveEvalBucketSummary {
  return {
    cases: results.length,
    passedCases: results.filter((result) => result.evaluation.pass).length,
    failedCases: results.filter((result) => !result.evaluation.pass).length,
    meanScore: round(average(results.map((result) => result.evaluation.score))),
  };
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }

  return ordered;
}

function compareCaseIds(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  return {
    extraCaseIds: actual.filter((caseId) => !expectedSet.has(caseId)),
    missingCaseIds: expected.filter((caseId) => !actualSet.has(caseId)),
  };
}

function buildSuiteAlignmentFailures(input: {
  suiteTotalCases: number | null;
  actualCaseIds: string[];
  extraCaseIds: string[];
  missingCaseIds: string[];
}): LiveEvalFailure[] {
  const failures: LiveEvalFailure[] = [];

  if (
    input.suiteTotalCases !== null &&
    input.actualCaseIds.length !== input.suiteTotalCases
  ) {
    failures.push({
      caseId: "__suite__",
      severity: "CRITICAL",
      category: "suite_alignment",
      expected: String(input.suiteTotalCases),
      actual: String(input.actualCaseIds.length),
      description:
        "Canonical suite totalCases does not match the artifact case count.",
    });
  }

  if (input.extraCaseIds.length > 0 || input.missingCaseIds.length > 0) {
    failures.push({
      caseId: "__suite__",
      severity: "CRITICAL",
      category: "suite_alignment",
      expected: "canonical manifest case IDs",
      actual: "artifact case IDs",
      description: [
        input.extraCaseIds.length > 0
          ? `extra=${input.extraCaseIds.join(", ")}`
          : null,
        input.missingCaseIds.length > 0
          ? `missing=${input.missingCaseIds.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("; "),
    });
  }

  return failures;
}

export function scoreLiveBenchmarkReport(
  report: RouteBenchmarkReport,
  filter: LiveEvalFilter = {}
): LiveEvalScorecard {
  const suiteCaseIds = uniqueOrdered(
    report.suiteCaseIds ?? report.cases.map((result) => result.id)
  );
  const actualCaseIds = uniqueOrdered(report.cases.map((result) => result.id));
  const { extraCaseIds, missingCaseIds } = compareCaseIds(
    suiteCaseIds,
    actualCaseIds
  );
  const suiteAlignmentFailures = buildSuiteAlignmentFailures({
    suiteTotalCases:
      typeof report.suiteTotalCases === "number" ? report.suiteTotalCases : null,
    actualCaseIds,
    extraCaseIds,
    missingCaseIds,
  });

  if (report.mode === "blocked") {
    return {
      runId: `LIVE-EVAL-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      generatedAt: new Date().toISOString(),
      executionMode: "live_route",
      suiteId: report.suiteId,
      suiteVersion: report.suiteVersion || null,
      manifestHash: report.manifestHash || null,
      suiteGeneratedAt: report.suiteGeneratedAt || null,
      suiteTotalCases:
        typeof report.suiteTotalCases === "number" ? report.suiteTotalCases : null,
      suiteCaseIds,
      evaluatedCaseIds: [],
      extraCaseIds,
      missingCaseIds,
      baseUrl: report.baseUrl || null,
      filters: filter,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      expectationPassRate: 0,
      meanExpectationScore: 0,
      emergencyRecall: 0,
      emergencyCaseCount: 0,
      emergencyMissCount: 0,
      unsafeDowngradeRate: 0,
      blockingFailures: 0,
      passFail: "BLOCKED",
      preflight: report.preflight || null,
      byResponseType: {},
      byRiskTier: {},
      failures: suiteAlignmentFailures,
    };
  }

  const filtered = report.cases.filter((result) => matchesFilter(result, filter));
  const evaluatedCaseIds = uniqueOrdered(filtered.map((result) => result.id));
  const totalCases = filtered.length;
  const passedCases = filtered.filter((result) => result.evaluation.pass).length;
  const failedCases = totalCases - passedCases;
  const totalChecks = filtered.reduce(
    (sum, result) => sum + result.evaluation.totalChecks,
    0
  );
  const passedChecks = filtered.reduce(
    (sum, result) => sum + result.evaluation.passedChecks,
    0
  );
  const failedChecks = filtered.reduce(
    (sum, result) => sum + result.evaluation.failedChecks,
    0
  );
  const expectationPassRate = totalCases > 0 ? passedCases / totalCases : 0;
  const meanExpectationScore = average(
    filtered.map((result) => result.evaluation.score)
  );

  const emergencyCases = filtered.filter((result) => isEmergencyExpectation(result));
  const emergencyMissCount = emergencyCases.filter(
    (result) => result.actualType !== "emergency"
  ).length;
  const emergencyRecall =
    emergencyCases.length > 0
      ? (emergencyCases.length - emergencyMissCount) / emergencyCases.length
      : 1;

  const unsafeDowngradeCount = filtered.filter((result) =>
    isUnsafeDowngrade(result)
  ).length;
  const unsafeDowngradeRate =
    totalCases > 0 ? unsafeDowngradeCount / totalCases : 0;

  const byResponseTypeEntries = new Map<string, RouteBenchmarkCaseResult[]>();
  const byRiskTierEntries = new Map<string, RouteBenchmarkCaseResult[]>();

  for (const result of filtered) {
    const responseType = responseTypeKey(result);
    const riskTier = riskTierKey(result);

    if (!byResponseTypeEntries.has(responseType)) {
      byResponseTypeEntries.set(responseType, []);
    }
    byResponseTypeEntries.get(responseType)?.push(result);

    if (!byRiskTierEntries.has(riskTier)) {
      byRiskTierEntries.set(riskTier, []);
    }
    byRiskTierEntries.get(riskTier)?.push(result);
  }

  const byResponseType = Object.fromEntries(
    [...byResponseTypeEntries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, results]) => [key, summarizeBucket(results)])
  );
  const byRiskTier = Object.fromEntries(
    [...byRiskTierEntries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, results]) => [key, summarizeBucket(results)])
  );

  const failures = [...suiteAlignmentFailures, ...buildFailures(filtered)].sort(
    compareFailureSeverity
  );
  const blockingFailures = failures.filter(
    (failure) => failure.severity === "CRITICAL"
  ).length;

  const passFail: "PASS" | "FAIL" =
    emergencyRecall >= 0.98 &&
    unsafeDowngradeRate < 0.01 &&
    blockingFailures === 0
      ? "PASS"
      : "FAIL";

  return {
    runId: `LIVE-EVAL-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    generatedAt: new Date().toISOString(),
    executionMode: "live_route",
    suiteId: report.suiteId,
    suiteVersion: report.suiteVersion || null,
    manifestHash: report.manifestHash || null,
    suiteGeneratedAt: report.suiteGeneratedAt || null,
    suiteTotalCases:
      typeof report.suiteTotalCases === "number" ? report.suiteTotalCases : null,
    suiteCaseIds,
    evaluatedCaseIds,
    extraCaseIds,
    missingCaseIds,
    baseUrl: report.baseUrl || null,
    filters: filter,
    totalCases,
    passedCases,
    failedCases,
    totalChecks,
    passedChecks,
    failedChecks,
    expectationPassRate: round(expectationPassRate),
    meanExpectationScore: round(meanExpectationScore),
    emergencyRecall: round(emergencyRecall),
    emergencyCaseCount: emergencyCases.length,
    emergencyMissCount,
    unsafeDowngradeRate: round(unsafeDowngradeRate),
    blockingFailures,
    passFail,
    preflight: report.preflight || null,
    byResponseType,
    byRiskTier,
    failures,
  };
}

function renderBucketSection(
  title: string,
  buckets: Record<string, LiveEvalBucketSummary>
): string {
  const keys = Object.keys(buckets);
  if (keys.length === 0) {
    return `## ${title}\n\n_No matching cases._`;
  }

  const rows = keys.map((key) => {
    const bucket = buckets[key];
    return `| ${key} | ${bucket.cases} | ${bucket.passedCases} | ${bucket.failedCases} | ${(bucket.meanScore * 100).toFixed(1)}% |`;
  });

  return [
    `## ${title}`,
    "",
    "| Bucket | Cases | Passed | Failed | Mean score |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...rows,
  ].join("\n");
}

export function renderLiveScorecardMarkdown(
  scorecard: LiveEvalScorecard
): string {
  const filterParts = Object.entries(scorecard.filters)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}=${value}`);

  const blockerLines =
    scorecard.preflight?.blockers?.length
      ? scorecard.preflight.blockers.map((blocker) => `- ${blocker}`)
      : ["- none"];

  const failureLines =
    scorecard.failures.length > 0
      ? scorecard.failures.slice(0, 10).map((failure) => {
          return `- [${failure.severity}] ${failure.caseId} — ${failure.category}: ${failure.description}`;
        })
      : ["- none"];
  const p0Blockers = scorecard.failures.filter(
    (failure) => failure.severity === "CRITICAL"
  );
  const p0BlockerLines =
    p0Blockers.length > 0
      ? [
          `- ${p0Blockers.length} critical blocker(s) require VET-1207 follow-up before the sidecar stack can be considered clinically safe.`,
          ...p0Blockers.slice(0, 10).map((failure) => {
            return `- [${failure.severity}] ${failure.caseId} — ${failure.category}: ${failure.description}`;
          }),
        ]
      : ["- none"];

  return [
    "# VET-1206 Live Eval Baseline",
    "",
    `- Generated at: ${scorecard.generatedAt}`,
    `- Suite: ${scorecard.suiteId}`,
    `- Suite version: ${scorecard.suiteVersion || "unknown"}`,
    `- Manifest hash: ${scorecard.manifestHash || "unknown"}`,
    `- Suite generated at: ${scorecard.suiteGeneratedAt || "unknown"}`,
    `- Base URL: ${scorecard.baseUrl || "unknown"}`,
    `- Filters: ${filterParts.length > 0 ? filterParts.join(", ") : "none"}`,
    `- Result: ${scorecard.passFail}`,
    "",
    "## Primary Metrics",
    "",
    `- Cases: ${scorecard.totalCases}`,
    `- Canonical suite cases: ${scorecard.suiteTotalCases ?? scorecard.suiteCaseIds.length}`,
    `- Expectation pass rate: ${(scorecard.expectationPassRate * 100).toFixed(1)}%`,
    `- Mean expectation score: ${(scorecard.meanExpectationScore * 100).toFixed(1)}%`,
    `- Emergency recall: ${(scorecard.emergencyRecall * 100).toFixed(1)}% (${scorecard.emergencyCaseCount} cases)`,
    `- Unsafe downgrade rate: ${(scorecard.unsafeDowngradeRate * 100).toFixed(2)}%`,
    `- Blocking failures: ${scorecard.blockingFailures}`,
    `- Extra case IDs: ${scorecard.extraCaseIds.length > 0 ? scorecard.extraCaseIds.join(", ") : "none"}`,
    `- Missing case IDs: ${scorecard.missingCaseIds.length > 0 ? scorecard.missingCaseIds.join(", ") : "none"}`,
    "",
    "## Sidecar Preflight",
    "",
    `- Ready: ${scorecard.preflight?.ready ? "yes" : "no"}`,
    `- Configured services: ${scorecard.preflight?.configuredCount ?? 0}/${scorecard.preflight?.requiredServices ?? 0}`,
    `- Healthy services: ${scorecard.preflight?.healthyCount ?? 0}/${scorecard.preflight?.requiredServices ?? 0}`,
    `- Warming services: ${scorecard.preflight?.warmingCount ?? 0}`,
    `- Stub services: ${scorecard.preflight?.stubCount ?? 0}`,
    "",
    ...blockerLines,
    "",
    renderBucketSection("By Response Type", scorecard.byResponseType),
    "",
    renderBucketSection("By Risk Tier", scorecard.byRiskTier),
    "",
    "## P0 Blockers for VET-1207",
    "",
    ...p0BlockerLines,
    "",
    "## Top Failures",
    "",
    ...failureLines,
    "",
  ].join("\n");
}
