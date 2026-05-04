import {
  createInitialClinicalCaseState,
  type ClinicalCaseState,
  type ClinicalSignal as CaseStateClinicalSignal,
} from "./case-state";
import { detectSignals } from "./clinical-signal-detector";
import type { SelectedBecause } from "./next-question-planner";
import { getQuestionCardById } from "./question-card-registry";
import type { ClinicalQuestionCard } from "./question-card-types";
import { buildShadowPlannerComplaintIntegration } from "./shadow-planner-complaint-adapter";

export interface ShadowPlannerScenarioFixture {
  caseId: string;
  ownerText: string;
  expectedComplaintModuleId: string;
  acceptableFirstQuestionIds: string[];
  mustScreenRedFlags: string[];
  whyThisCaseMatters: string;
  shouldPreferEmergencyScreen: boolean;
  shouldAvoidGenericQuestion: boolean;
  isConfusingMultiSymptom: boolean;
}

export interface ShadowPlannerExpectedOutcomeFixture {
  caseId: string;
  expectedComplaintModuleId: string;
  acceptablePlannedQuestionIds: string[];
  expectedSelectedBecause: SelectedBecause[];
  mustScreenRedFlags: string[];
  shouldBeatGenericQuestion: boolean;
  shouldScreenEmergencyEarlier: boolean;
  shouldAvoidRepeatedQuestion: boolean;
  notes: string;
}

export interface ShadowPlannerScenarioEvalExpected {
  complaintModuleId: string;
  acceptableQuestionIds: string[];
  acceptableSelectedBecause: SelectedBecause[];
  mustScreenRedFlags: string[];
  shouldBeatGenericQuestion: boolean;
  shouldScreenEmergencyEarlier: boolean;
  shouldAvoidRepeatedQuestion: boolean;
}

export interface ShadowPlannerScenarioEvalActual {
  complaintModuleId: string | null;
  plannerComplaintFamily: string | null;
  plannedQuestionId: string | null;
  selectedBecause: SelectedBecause | null;
  screenedRedFlags: string[];
  fallbackType: string | null;
  comparisonReady: boolean;
  telemetryOwnerFacingImpact: "none";
  genericQuestion: boolean;
  emergencyScreenQuestion: boolean;
}

export interface ShadowPlannerScenarioEvalFailedCase {
  caseId: string;
  expected: ShadowPlannerScenarioEvalExpected;
  actual: ShadowPlannerScenarioEvalActual;
  reason: string;
}

export interface ShadowPlannerScenarioEvalCaseResult {
  caseId: string;
  expected: ShadowPlannerScenarioEvalExpected;
  actual: ShadowPlannerScenarioEvalActual;
  complaintModuleMatched: boolean;
  acceptableQuestionMatched: boolean;
  selectedBecauseMatched: boolean;
  emergencyScreenAligned: boolean;
  repeatedQuestionAvoided: boolean;
  genericQuestionAvoided: boolean;
  matchedRequiredRedFlags: string[];
  missingRequiredRedFlags: string[];
  requiredRedFlagCount: number;
  failures: string[];
  passed: boolean;
}

export interface ShadowPlannerScenarioEvalSummary {
  totalCases: number;
  complaintModuleMatchCount: number;
  complaintModuleMatchRate: number;
  acceptableQuestionCount: number;
  acceptableQuestionRate: number;
  emergencyScreenAlignmentCount: number;
  emergencyScreenAlignmentRelevantCases: number;
  emergencyScreenAlignmentRate: number;
  repeatedQuestionAvoidanceCount: number;
  repeatedQuestionAvoidanceRelevantCases: number;
  repeatedQuestionAvoidanceRate: number;
  genericQuestionAvoidanceCount: number;
  genericQuestionAvoidanceRelevantCases: number;
  genericQuestionAvoidanceRate: number;
  screenedRequiredRedFlagCount: number;
  totalRequiredRedFlagCount: number;
  redFlagScreenCoverageRate: number;
  failedCases: ShadowPlannerScenarioEvalFailedCase[];
}

export interface ShadowPlannerScenarioEvalReport {
  summary: ShadowPlannerScenarioEvalSummary;
  caseResults: ShadowPlannerScenarioEvalCaseResult[];
}

export interface EvaluateShadowPlannerScenarioCaseInput {
  scenario: ShadowPlannerScenarioFixture;
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture;
  existingQuestionId?: string | null;
  buildCaseState?: (
    scenario: ShadowPlannerScenarioFixture,
    expectedOutcome: ShadowPlannerExpectedOutcomeFixture
  ) => ClinicalCaseState;
}

export interface EvaluateShadowPlannerScenariosInput {
  scenarios: readonly ShadowPlannerScenarioFixture[];
  expectedOutcomes: readonly ShadowPlannerExpectedOutcomeFixture[];
  existingQuestionId?: string | null;
  buildCaseState?: (
    scenario: ShadowPlannerScenarioFixture,
    expectedOutcome: ShadowPlannerExpectedOutcomeFixture
  ) => ClinicalCaseState;
}

export const DEFAULT_EXISTING_GENERIC_QUESTION_ID = "emergency_global_screen";

function isPlannerFallbackResult(
  result: ReturnType<typeof buildShadowPlannerComplaintIntegration>["plannerResult"]
): result is Extract<
  ReturnType<typeof buildShadowPlannerComplaintIntegration>["plannerResult"],
  { type: string }
> {
  return "type" in result;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function assertUniqueCaseIds(
  rows: readonly { caseId: string }[],
  label: string
): void {
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row.caseId.trim()) {
      throw new Error(`${label} contains a blank caseId`);
    }

    if (seen.has(row.caseId)) {
      throw new Error(`${label} contains duplicate caseId "${row.caseId}"`);
    }

    seen.add(row.caseId);
  }
}

function isGenericQuestionCard(card: ClinicalQuestionCard | null): boolean {
  if (!card) {
    return false;
  }

  return (
    card.complaintFamilies.includes("general") ||
    card.complaintFamilies.includes("global") ||
    card.phase === "timeline" ||
    card.phase === "history" ||
    card.phase === "handoff_detail"
  );
}

function isEmergencyScreenQuestionCard(card: ClinicalQuestionCard | null): boolean {
  return card?.phase === "emergency_screen";
}

function mapDetectedSignalToCaseStateSignal(
  signal: ReturnType<typeof detectSignals>[number]
): CaseStateClinicalSignal {
  let severity: CaseStateClinicalSignal["severity"] = "medium";
  if (signal.confidence >= 0.9) {
    severity = "critical";
  } else if (signal.confidence >= 0.75) {
    severity = "high";
  }

  return {
    id: signal.id,
    type: "owner_language",
    severity,
    evidenceText: signal.evidenceText,
    turnDetected: 1,
  };
}

export function buildDefaultShadowPlannerScenarioCaseState(
  scenario: ShadowPlannerScenarioFixture
): ClinicalCaseState {
  const detectedSignals = detectSignals(scenario.ownerText).map(
    mapDetectedSignalToCaseStateSignal
  );

  return {
    ...createInitialClinicalCaseState(),
    clinicalSignals: detectedSignals,
  };
}

function cloneCaseState(state: ClinicalCaseState): ClinicalCaseState {
  return {
    ...state,
    explicitAnswers: { ...state.explicitAnswers },
    redFlagStatus: { ...state.redFlagStatus },
    clinicalSignals: state.clinicalSignals.map((signal) => ({ ...signal })),
    concernBuckets: state.concernBuckets.map((bucket) => ({
      ...bucket,
      evidence: [...bucket.evidence],
    })),
    missingCriticalSlots: [...state.missingCriticalSlots],
    askedQuestionIds: [...state.askedQuestionIds],
    answeredQuestionIds: [...state.answeredQuestionIds],
    skippedQuestionIds: [...state.skippedQuestionIds],
  };
}

function buildExpectedDescriptor(
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture
): ShadowPlannerScenarioEvalExpected {
  return {
    complaintModuleId: expectedOutcome.expectedComplaintModuleId,
    acceptableQuestionIds: [...expectedOutcome.acceptablePlannedQuestionIds],
    acceptableSelectedBecause: [...expectedOutcome.expectedSelectedBecause],
    mustScreenRedFlags: [...expectedOutcome.mustScreenRedFlags],
    shouldBeatGenericQuestion: expectedOutcome.shouldBeatGenericQuestion,
    shouldScreenEmergencyEarlier: expectedOutcome.shouldScreenEmergencyEarlier,
    shouldAvoidRepeatedQuestion: expectedOutcome.shouldAvoidRepeatedQuestion,
  };
}

function assertExistingQuestionIsGeneric(existingQuestionId: string): void {
  const existingQuestionCard = getQuestionCardById(existingQuestionId);
  if (!existingQuestionCard) {
    throw new Error(
      `Existing comparison question "${existingQuestionId}" is not registered`
    );
  }

  if (!isGenericQuestionCard(existingQuestionCard)) {
    throw new Error(
      `Existing comparison question "${existingQuestionId}" must be generic`
    );
  }
}

function assertScenarioMatchesExpectedOutcome(
  scenario: ShadowPlannerScenarioFixture,
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture
): void {
  if (scenario.caseId !== expectedOutcome.caseId) {
    throw new Error(
      `Scenario/outcome mismatch: scenario "${scenario.caseId}" does not match outcome "${expectedOutcome.caseId}"`
    );
  }

  if (
    scenario.expectedComplaintModuleId !== expectedOutcome.expectedComplaintModuleId
  ) {
    throw new Error(
      `Scenario/outcome module mismatch for "${scenario.caseId}": "${scenario.expectedComplaintModuleId}" !== "${expectedOutcome.expectedComplaintModuleId}"`
    );
  }
}

function formatFailure(
  plannedQuestionId: string | null,
  selectedBecause: SelectedBecause | null,
  missingRequiredRedFlags: readonly string[],
  existingQuestionId: string
): string[] {
  const failures: string[] = [];

  if (!plannedQuestionId) {
    failures.push("No planned question was returned");
  }

  if (selectedBecause === null) {
    failures.push("Planner did not return selectedBecause");
  }

  if (missingRequiredRedFlags.length > 0) {
    failures.push(
      `Missing required screened red flags: ${missingRequiredRedFlags.join(", ")}`
    );
  }

  if (plannedQuestionId === existingQuestionId) {
    failures.push(
      `Planned question repeated the generic baseline "${existingQuestionId}"`
    );
  }

  return failures;
}

export function evaluateShadowPlannerScenarioCase(
  input: EvaluateShadowPlannerScenarioCaseInput
): ShadowPlannerScenarioEvalCaseResult {
  const existingQuestionId =
    input.existingQuestionId ?? DEFAULT_EXISTING_GENERIC_QUESTION_ID;
  assertExistingQuestionIsGeneric(existingQuestionId);
  assertScenarioMatchesExpectedOutcome(input.scenario, input.expectedOutcome);

  const buildCaseState =
    input.buildCaseState ?? buildDefaultShadowPlannerScenarioCaseState;
  const caseState = cloneCaseState(
    buildCaseState(input.scenario, input.expectedOutcome)
  );
  const integration = buildShadowPlannerComplaintIntegration({
    ownerText: input.scenario.ownerText,
    existingQuestionId,
    caseState,
  });

  if (integration.telemetry.ownerFacingImpact !== "none") {
    throw new Error(
      `Shadow telemetry ownerFacingImpact must remain "none" for "${input.scenario.caseId}"`
    );
  }

  const plannerResult = integration.plannerResult;
  const isFallback = isPlannerFallbackResult(plannerResult);
  const plannedQuestionId = isFallback
    ? null
    : plannerResult.questionId;
  const selectedBecause = isFallback
    ? null
    : plannerResult.selectedBecause;
  const plannedQuestionCard =
    plannedQuestionId !== null
      ? getQuestionCardById(plannedQuestionId) ?? null
      : null;

  if (plannedQuestionId && !plannedQuestionCard) {
    throw new Error(
      `Planner returned unregistered question "${plannedQuestionId}" for "${input.scenario.caseId}"`
    );
  }

  const expected = buildExpectedDescriptor(input.expectedOutcome);
  const actual: ShadowPlannerScenarioEvalActual = {
    complaintModuleId: integration.activeComplaintModuleId,
    plannerComplaintFamily: integration.plannerActiveComplaintModule,
    plannedQuestionId,
    selectedBecause,
    screenedRedFlags: [...integration.comparison.screenedRedFlags],
    fallbackType: isFallback ? plannerResult.type : null,
    comparisonReady: integration.telemetry.comparisonReady,
    telemetryOwnerFacingImpact: integration.telemetry.ownerFacingImpact,
    genericQuestion: isGenericQuestionCard(plannedQuestionCard),
    emergencyScreenQuestion:
      isEmergencyScreenQuestionCard(plannedQuestionCard) ||
      selectedBecause === "emergency_screen",
  };

  const complaintModuleMatched =
    actual.complaintModuleId === expected.complaintModuleId;
  const acceptableQuestionMatched =
    actual.plannedQuestionId !== null &&
    expected.acceptableQuestionIds.includes(actual.plannedQuestionId);
  const selectedBecauseMatched =
    actual.selectedBecause !== null &&
    expected.acceptableSelectedBecause.includes(actual.selectedBecause);
  const emergencyScreenAligned =
    !expected.shouldScreenEmergencyEarlier || actual.emergencyScreenQuestion;
  const repeatedQuestionAvoided =
    !expected.shouldAvoidRepeatedQuestion ||
    integration.comparison.repeatedQuestionAvoided;
  const genericQuestionAvoided =
    !expected.shouldBeatGenericQuestion ||
    (actual.plannedQuestionId !== null &&
      actual.plannedQuestionId !== existingQuestionId &&
      !actual.genericQuestion);

  const matchedRequiredRedFlags = expected.mustScreenRedFlags.filter((flagId) =>
    actual.screenedRedFlags.includes(flagId)
  );
  const missingRequiredRedFlags = expected.mustScreenRedFlags.filter(
    (flagId) => !matchedRequiredRedFlags.includes(flagId)
  );

  const failures = formatFailure(
    actual.plannedQuestionId,
    actual.selectedBecause,
    missingRequiredRedFlags,
    existingQuestionId
  );

  if (!complaintModuleMatched) {
    failures.push(
      `Complaint module mismatch: expected "${expected.complaintModuleId}", got "${actual.complaintModuleId ?? "none"}"`
    );
  }

  if (!acceptableQuestionMatched) {
    failures.push(
      `Planned question "${actual.plannedQuestionId ?? actual.fallbackType ?? "none"}" is outside the acceptable set`
    );
  }

  if (!selectedBecauseMatched) {
    failures.push(
      `selectedBecause "${actual.selectedBecause ?? "none"}" is outside the acceptable set`
    );
  }

  if (!emergencyScreenAligned && expected.shouldScreenEmergencyEarlier) {
    failures.push("Emergency-screen alignment expectation was not met");
  }

  if (!repeatedQuestionAvoided && expected.shouldAvoidRepeatedQuestion) {
    failures.push("Repeated-question avoidance expectation was not met");
  }

  if (!genericQuestionAvoided && expected.shouldBeatGenericQuestion) {
    failures.push("Generic-question avoidance expectation was not met");
  }

  if (actual.fallbackType !== null) {
    failures.push(
      `Adapter returned fallback "${actual.fallbackType}" instead of a planned question`
    );
  }

  return {
    caseId: input.scenario.caseId,
    expected,
    actual,
    complaintModuleMatched,
    acceptableQuestionMatched,
    selectedBecauseMatched,
    emergencyScreenAligned,
    repeatedQuestionAvoided,
    genericQuestionAvoided,
    matchedRequiredRedFlags,
    missingRequiredRedFlags,
    requiredRedFlagCount: expected.mustScreenRedFlags.length,
    failures,
    passed: failures.length === 0,
  };
}

function buildExpectedOutcomeMap(
  expectedOutcomes: readonly ShadowPlannerExpectedOutcomeFixture[]
): Map<string, ShadowPlannerExpectedOutcomeFixture> {
  assertUniqueCaseIds(expectedOutcomes, "Expected outcomes");

  return new Map(
    expectedOutcomes.map((expectedOutcome) => [
      expectedOutcome.caseId,
      expectedOutcome,
    ])
  );
}

function buildSummary(
  caseResults: readonly ShadowPlannerScenarioEvalCaseResult[]
): ShadowPlannerScenarioEvalSummary {
  let complaintModuleMatchCount = 0;
  let acceptableQuestionCount = 0;
  let emergencyScreenAlignmentCount = 0;
  let emergencyScreenAlignmentRelevantCases = 0;
  let repeatedQuestionAvoidanceCount = 0;
  let repeatedQuestionAvoidanceRelevantCases = 0;
  let genericQuestionAvoidanceCount = 0;
  let genericQuestionAvoidanceRelevantCases = 0;
  let screenedRequiredRedFlagCount = 0;
  let totalRequiredRedFlagCount = 0;

  for (const caseResult of caseResults) {
    if (caseResult.complaintModuleMatched) {
      complaintModuleMatchCount += 1;
    }

    if (caseResult.acceptableQuestionMatched) {
      acceptableQuestionCount += 1;
    }

    if (caseResult.expected.shouldScreenEmergencyEarlier) {
      emergencyScreenAlignmentRelevantCases += 1;
      if (caseResult.emergencyScreenAligned) {
        emergencyScreenAlignmentCount += 1;
      }
    }

    if (caseResult.expected.shouldAvoidRepeatedQuestion) {
      repeatedQuestionAvoidanceRelevantCases += 1;
      if (caseResult.repeatedQuestionAvoided) {
        repeatedQuestionAvoidanceCount += 1;
      }
    }

    if (caseResult.expected.shouldBeatGenericQuestion) {
      genericQuestionAvoidanceRelevantCases += 1;
      if (caseResult.genericQuestionAvoided) {
        genericQuestionAvoidanceCount += 1;
      }
    }

    screenedRequiredRedFlagCount += caseResult.matchedRequiredRedFlags.length;
    totalRequiredRedFlagCount += caseResult.requiredRedFlagCount;
  }

  const failedCases: ShadowPlannerScenarioEvalFailedCase[] = caseResults
    .filter((caseResult) => !caseResult.passed)
    .map((caseResult) => ({
      caseId: caseResult.caseId,
      expected: {
        ...caseResult.expected,
        acceptableQuestionIds: [...caseResult.expected.acceptableQuestionIds],
        acceptableSelectedBecause: [
          ...caseResult.expected.acceptableSelectedBecause,
        ],
        mustScreenRedFlags: [...caseResult.expected.mustScreenRedFlags],
      },
      actual: {
        ...caseResult.actual,
        screenedRedFlags: [...caseResult.actual.screenedRedFlags],
      },
      reason: caseResult.failures.join("; "),
    }));

  return {
    totalCases: caseResults.length,
    complaintModuleMatchCount,
    complaintModuleMatchRate: safeRate(
      complaintModuleMatchCount,
      caseResults.length
    ),
    acceptableQuestionCount,
    acceptableQuestionRate: safeRate(acceptableQuestionCount, caseResults.length),
    emergencyScreenAlignmentCount,
    emergencyScreenAlignmentRelevantCases,
    emergencyScreenAlignmentRate: safeRate(
      emergencyScreenAlignmentCount,
      emergencyScreenAlignmentRelevantCases
    ),
    repeatedQuestionAvoidanceCount,
    repeatedQuestionAvoidanceRelevantCases,
    repeatedQuestionAvoidanceRate: safeRate(
      repeatedQuestionAvoidanceCount,
      repeatedQuestionAvoidanceRelevantCases
    ),
    genericQuestionAvoidanceCount,
    genericQuestionAvoidanceRelevantCases,
    genericQuestionAvoidanceRate: safeRate(
      genericQuestionAvoidanceCount,
      genericQuestionAvoidanceRelevantCases
    ),
    screenedRequiredRedFlagCount,
    totalRequiredRedFlagCount,
    redFlagScreenCoverageRate: safeRate(
      screenedRequiredRedFlagCount,
      totalRequiredRedFlagCount
    ),
    failedCases,
  };
}

export function evaluateShadowPlannerScenarios(
  input: EvaluateShadowPlannerScenariosInput
): ShadowPlannerScenarioEvalReport {
  assertUniqueCaseIds(input.scenarios, "Scenarios");

  const expectedOutcomeMap = buildExpectedOutcomeMap(input.expectedOutcomes);
  const caseResults = input.scenarios.map((scenario) => {
    const expectedOutcome = expectedOutcomeMap.get(scenario.caseId);
    if (!expectedOutcome) {
      throw new Error(`Missing expected outcome for case "${scenario.caseId}"`);
    }

    return evaluateShadowPlannerScenarioCase({
      scenario,
      expectedOutcome,
      existingQuestionId: input.existingQuestionId,
      buildCaseState: input.buildCaseState,
    });
  });

  if (caseResults.length !== input.expectedOutcomes.length) {
    throw new Error(
      `Scenario/outcome size mismatch: ${caseResults.length} scenarios vs ${input.expectedOutcomes.length} expected outcomes`
    );
  }

  return {
    summary: buildSummary(caseResults),
    caseResults,
  };
}

function formatPercentage(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatCountLine(
  label: string,
  count: number,
  denominator: number,
  rate: number
): string {
  return `${label}: ${count}/${denominator} (${formatPercentage(rate)})`;
}

export function renderShadowPlannerScenarioEvalSummary(
  summary: ShadowPlannerScenarioEvalSummary
): string {
  const lines = [
    "Shadow Planner Scenario Eval",
    `Total cases: ${summary.totalCases}`,
    formatCountLine(
      "Complaint module match rate",
      summary.complaintModuleMatchCount,
      summary.totalCases,
      summary.complaintModuleMatchRate
    ),
    formatCountLine(
      "Acceptable question rate",
      summary.acceptableQuestionCount,
      summary.totalCases,
      summary.acceptableQuestionRate
    ),
    formatCountLine(
      "Emergency screen alignment rate",
      summary.emergencyScreenAlignmentCount,
      summary.emergencyScreenAlignmentRelevantCases,
      summary.emergencyScreenAlignmentRate
    ),
    formatCountLine(
      "Repeated question avoidance rate",
      summary.repeatedQuestionAvoidanceCount,
      summary.repeatedQuestionAvoidanceRelevantCases,
      summary.repeatedQuestionAvoidanceRate
    ),
    formatCountLine(
      "Generic question avoidance rate",
      summary.genericQuestionAvoidanceCount,
      summary.genericQuestionAvoidanceRelevantCases,
      summary.genericQuestionAvoidanceRate
    ),
    formatCountLine(
      "Red flag screen coverage rate",
      summary.screenedRequiredRedFlagCount,
      summary.totalRequiredRedFlagCount,
      summary.redFlagScreenCoverageRate
    ),
  ];

  if (summary.failedCases.length === 0) {
    lines.push("Failed cases: none");
    return lines.join("\n");
  }

  lines.push(`Failed cases: ${summary.failedCases.length}`);
  for (const failedCase of summary.failedCases) {
    lines.push(`- ${failedCase.caseId}: ${failedCase.reason}`);
    lines.push(
      `  expected: module=${failedCase.expected.complaintModuleId}; questions=${failedCase.expected.acceptableQuestionIds.join(", ")}`
    );
    lines.push(
      `  actual: module=${failedCase.actual.complaintModuleId ?? "none"}; question=${failedCase.actual.plannedQuestionId ?? failedCase.actual.fallbackType ?? "none"}; selectedBecause=${failedCase.actual.selectedBecause ?? "none"}`
    );
  }

  return lines.join("\n");
}
