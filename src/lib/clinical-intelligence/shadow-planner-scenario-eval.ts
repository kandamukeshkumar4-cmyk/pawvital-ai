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

export interface ShadowPlannerEdgeCaseRepeatedQuestionSetup {
  askedQuestionIds: string[];
  answeredQuestionIds: string[];
}

export interface ShadowPlannerEdgeCaseScenarioFixture {
  caseId: string;
  ownerText: string;
  expectedPrimaryComplaintModuleIds: string[];
  acceptablePlannedQuestionIds: string[];
  mustScreenRedFlags: string[];
  shouldPreferEmergencyScreen: boolean;
  shouldAvoidGenericQuestion: boolean;
  repeatedQuestionSetup: ShadowPlannerEdgeCaseRepeatedQuestionSetup | null;
  isConfusingMultiSymptom: boolean;
  isEmergencyVsMildContrast: boolean;
  hasAmbiguousOwnerAnswer: boolean;
  whyThisCaseMatters: string;
}

export type ShadowPlannerScenarioFixtureKind = "base" | "edge";

export interface ShadowPlannerScenarioEvalExpected {
  acceptableComplaintModuleIds: string[];
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
  fixtureKind: ShadowPlannerScenarioFixtureKind;
  expected: ShadowPlannerScenarioEvalExpected;
  actual: ShadowPlannerScenarioEvalActual;
  reason: string;
}

export interface ShadowPlannerScenarioEvalCaseResult {
  caseId: string;
  fixtureKind: ShadowPlannerScenarioFixtureKind;
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
  baseCaseCount: number;
  edgeCaseCount: number;
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
  edgeScenarios?: readonly ShadowPlannerEdgeCaseScenarioFixture[];
  existingQuestionId?: string | null;
  buildCaseState?: (
    scenario: ShadowPlannerScenarioFixture,
    expectedOutcome: ShadowPlannerExpectedOutcomeFixture
  ) => ClinicalCaseState;
  buildEdgeCaseState?: (
    scenario: ShadowPlannerEdgeCaseScenarioFixture
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

function buildCaseStateFromOwnerText(
  ownerText: string,
  activeComplaintModule: string | null = null
): ClinicalCaseState {
  const detectedSignals = detectSignals(ownerText).map(
    mapDetectedSignalToCaseStateSignal
  );

  return {
    ...createInitialClinicalCaseState(activeComplaintModule),
    clinicalSignals: detectedSignals,
  };
}

export function buildDefaultShadowPlannerScenarioCaseState(
  scenario: ShadowPlannerScenarioFixture
): ClinicalCaseState {
  return buildCaseStateFromOwnerText(scenario.ownerText);
}

export function buildDefaultShadowPlannerEdgeCaseState(
  scenario: ShadowPlannerEdgeCaseScenarioFixture
): ClinicalCaseState {
  const repeatedQuestionSetup = scenario.repeatedQuestionSetup;

  return {
    ...buildCaseStateFromOwnerText(
      scenario.ownerText,
      scenario.expectedPrimaryComplaintModuleIds[0] ?? null
    ),
    askedQuestionIds: [...(repeatedQuestionSetup?.askedQuestionIds ?? [])],
    answeredQuestionIds: [...(repeatedQuestionSetup?.answeredQuestionIds ?? [])],
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

function deriveExpectedSelectedBecause(
  questionIds: readonly string[]
): SelectedBecause[] {
  let hasEmergencyScreenQuestion = false;
  let hasNonEmergencyQuestion = false;

  for (const questionId of questionIds) {
    const questionCard = getQuestionCardById(questionId);
    if (!questionCard) {
      throw new Error(
        `Expected descriptor references unregistered question "${questionId}"`
      );
    }

    if (questionCard.phase === "emergency_screen") {
      hasEmergencyScreenQuestion = true;
    } else {
      hasNonEmergencyQuestion = true;
    }
  }

  const acceptableSelectedBecause: SelectedBecause[] = [];

  if (hasEmergencyScreenQuestion) {
    acceptableSelectedBecause.push("emergency_screen");
  }

  if (hasNonEmergencyQuestion) {
    acceptableSelectedBecause.push("highest_information_gain");
  }

  return acceptableSelectedBecause;
}

function buildExpectedDescriptorFromOutcome(
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture
): ShadowPlannerScenarioEvalExpected {
  return {
    acceptableComplaintModuleIds: [expectedOutcome.expectedComplaintModuleId],
    acceptableQuestionIds: [...expectedOutcome.acceptablePlannedQuestionIds],
    acceptableSelectedBecause: [...expectedOutcome.expectedSelectedBecause],
    mustScreenRedFlags: [...expectedOutcome.mustScreenRedFlags],
    shouldBeatGenericQuestion: expectedOutcome.shouldBeatGenericQuestion,
    shouldScreenEmergencyEarlier: expectedOutcome.shouldScreenEmergencyEarlier,
    shouldAvoidRepeatedQuestion: expectedOutcome.shouldAvoidRepeatedQuestion,
  };
}

function buildExpectedDescriptorFromEdgeScenario(
  scenario: ShadowPlannerEdgeCaseScenarioFixture
): ShadowPlannerScenarioEvalExpected {
  return {
    acceptableComplaintModuleIds: [...scenario.expectedPrimaryComplaintModuleIds],
    acceptableQuestionIds: [...scenario.acceptablePlannedQuestionIds],
    acceptableSelectedBecause: deriveExpectedSelectedBecause(
      scenario.acceptablePlannedQuestionIds
    ),
    mustScreenRedFlags: [...scenario.mustScreenRedFlags],
    shouldBeatGenericQuestion: scenario.shouldAvoidGenericQuestion,
    shouldScreenEmergencyEarlier: scenario.shouldPreferEmergencyScreen,
    shouldAvoidRepeatedQuestion: scenario.repeatedQuestionSetup !== null,
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

function assertNoOverlappingCaseIds(
  scenarios: readonly ShadowPlannerScenarioFixture[],
  edgeScenarios: readonly ShadowPlannerEdgeCaseScenarioFixture[]
): void {
  const baseCaseIds = new Set(scenarios.map((scenario) => scenario.caseId));

  for (const edgeScenario of edgeScenarios) {
    if (baseCaseIds.has(edgeScenario.caseId)) {
      throw new Error(
        `Edge scenarios reuse base scenario caseId "${edgeScenario.caseId}"`
      );
    }
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

function buildActualDescriptor(
  caseId: string,
  integration: ReturnType<typeof buildShadowPlannerComplaintIntegration>
): ShadowPlannerScenarioEvalActual {
  if (integration.telemetry.ownerFacingImpact !== "none") {
    throw new Error(
      `Shadow telemetry ownerFacingImpact must remain "none" for "${caseId}"`
    );
  }

  const plannerResult = integration.plannerResult;
  const isFallback = isPlannerFallbackResult(plannerResult);
  const plannedQuestionId = isFallback ? null : plannerResult.questionId;
  const selectedBecause = isFallback ? null : plannerResult.selectedBecause;
  const plannedQuestionCard =
    plannedQuestionId !== null
      ? getQuestionCardById(plannedQuestionId) ?? null
      : null;

  if (plannedQuestionId && !plannedQuestionCard) {
    throw new Error(
      `Planner returned unregistered question "${plannedQuestionId}" for "${caseId}"`
    );
  }

  return {
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
}

interface EvaluateNormalizedShadowPlannerScenarioInput {
  caseId: string;
  fixtureKind: ShadowPlannerScenarioFixtureKind;
  ownerText: string;
  expected: ShadowPlannerScenarioEvalExpected;
  existingQuestionId: string;
  caseState: ClinicalCaseState;
}

function evaluateNormalizedShadowPlannerScenario(
  input: EvaluateNormalizedShadowPlannerScenarioInput
): ShadowPlannerScenarioEvalCaseResult {
  const integration = buildShadowPlannerComplaintIntegration({
    ownerText: input.ownerText,
    existingQuestionId: input.existingQuestionId,
    caseState: input.caseState,
  });
  const actual = buildActualDescriptor(input.caseId, integration);

  const complaintModuleMatched =
    actual.complaintModuleId !== null &&
    input.expected.acceptableComplaintModuleIds.includes(actual.complaintModuleId);
  const acceptableQuestionMatched =
    actual.plannedQuestionId !== null &&
    input.expected.acceptableQuestionIds.includes(actual.plannedQuestionId);
  const selectedBecauseMatched =
    actual.selectedBecause !== null &&
    input.expected.acceptableSelectedBecause.includes(actual.selectedBecause);
  const emergencyScreenAligned =
    !input.expected.shouldScreenEmergencyEarlier || actual.emergencyScreenQuestion;
  const repeatedQuestionAvoided =
    !input.expected.shouldAvoidRepeatedQuestion ||
    integration.comparison.repeatedQuestionAvoided;
  const genericQuestionAvoided =
    !input.expected.shouldBeatGenericQuestion ||
    (actual.plannedQuestionId !== null &&
      actual.plannedQuestionId !== input.existingQuestionId &&
      !actual.genericQuestion);

  const matchedRequiredRedFlags = input.expected.mustScreenRedFlags.filter(
    (flagId) => actual.screenedRedFlags.includes(flagId)
  );
  const missingRequiredRedFlags = input.expected.mustScreenRedFlags.filter(
    (flagId) => !matchedRequiredRedFlags.includes(flagId)
  );

  const failures = formatFailure(
    actual.plannedQuestionId,
    actual.selectedBecause,
    missingRequiredRedFlags,
    input.existingQuestionId
  );

  if (!complaintModuleMatched) {
    failures.push(
      `Complaint module mismatch: expected one of "${input.expected.acceptableComplaintModuleIds.join(", ")}", got "${actual.complaintModuleId ?? "none"}"`
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

  if (!emergencyScreenAligned && input.expected.shouldScreenEmergencyEarlier) {
    failures.push("Emergency-screen alignment expectation was not met");
  }

  if (!repeatedQuestionAvoided && input.expected.shouldAvoidRepeatedQuestion) {
    failures.push("Repeated-question avoidance expectation was not met");
  }

  if (!genericQuestionAvoided && input.expected.shouldBeatGenericQuestion) {
    failures.push("Generic-question avoidance expectation was not met");
  }

  if (actual.fallbackType !== null) {
    failures.push(
      `Adapter returned fallback "${actual.fallbackType}" instead of a planned question`
    );
  }

  return {
    caseId: input.caseId,
    fixtureKind: input.fixtureKind,
    expected: input.expected,
    actual,
    complaintModuleMatched,
    acceptableQuestionMatched,
    selectedBecauseMatched,
    emergencyScreenAligned,
    repeatedQuestionAvoided,
    genericQuestionAvoided,
    matchedRequiredRedFlags,
    missingRequiredRedFlags,
    requiredRedFlagCount: input.expected.mustScreenRedFlags.length,
    failures,
    passed: failures.length === 0,
  };
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
  const caseState = cloneCaseState(buildCaseState(input.scenario, input.expectedOutcome));

  return evaluateNormalizedShadowPlannerScenario({
    caseId: input.scenario.caseId,
    fixtureKind: "base",
    ownerText: input.scenario.ownerText,
    expected: buildExpectedDescriptorFromOutcome(input.expectedOutcome),
    existingQuestionId,
    caseState,
  });
}

function evaluateShadowPlannerEdgeScenarioCase(input: {
  scenario: ShadowPlannerEdgeCaseScenarioFixture;
  existingQuestionId?: string | null;
  buildCaseState?: (scenario: ShadowPlannerEdgeCaseScenarioFixture) => ClinicalCaseState;
}): ShadowPlannerScenarioEvalCaseResult {
  const existingQuestionId =
    input.existingQuestionId ?? DEFAULT_EXISTING_GENERIC_QUESTION_ID;
  assertExistingQuestionIsGeneric(existingQuestionId);

  const buildCaseState =
    input.buildCaseState ?? buildDefaultShadowPlannerEdgeCaseState;
  const caseState = cloneCaseState(buildCaseState(input.scenario));

  return evaluateNormalizedShadowPlannerScenario({
    caseId: input.scenario.caseId,
    fixtureKind: "edge",
    ownerText: input.scenario.ownerText,
    expected: buildExpectedDescriptorFromEdgeScenario(input.scenario),
    existingQuestionId,
    caseState,
  });
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
  let baseCaseCount = 0;
  let edgeCaseCount = 0;
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
    if (caseResult.fixtureKind === "base") {
      baseCaseCount += 1;
    } else {
      edgeCaseCount += 1;
    }

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
      fixtureKind: caseResult.fixtureKind,
      expected: {
        ...caseResult.expected,
        acceptableComplaintModuleIds: [
          ...caseResult.expected.acceptableComplaintModuleIds,
        ],
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
    baseCaseCount,
    edgeCaseCount,
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
  const edgeScenarios = input.edgeScenarios ?? [];
  assertUniqueCaseIds(edgeScenarios, "Edge scenarios");
  assertNoOverlappingCaseIds(input.scenarios, edgeScenarios);

  const expectedOutcomeMap = buildExpectedOutcomeMap(input.expectedOutcomes);
  const baseCaseResults = input.scenarios.map((scenario) => {
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

  if (baseCaseResults.length !== input.expectedOutcomes.length) {
    throw new Error(
      `Scenario/outcome size mismatch: ${baseCaseResults.length} scenarios vs ${input.expectedOutcomes.length} expected outcomes`
    );
  }

  const edgeCaseResults = edgeScenarios.map((scenario) =>
    evaluateShadowPlannerEdgeScenarioCase({
      scenario,
      existingQuestionId: input.existingQuestionId,
      buildCaseState: input.buildEdgeCaseState,
    })
  );

  const caseResults = [...baseCaseResults, ...edgeCaseResults];

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
    `Base cases: ${summary.baseCaseCount}`,
    `Edge cases: ${summary.edgeCaseCount}`,
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
    lines.push(
      `- [${failedCase.fixtureKind}] ${failedCase.caseId}: ${failedCase.reason}`
    );
    lines.push(
      `  expected: modules=${failedCase.expected.acceptableComplaintModuleIds.join(", ")}; questions=${failedCase.expected.acceptableQuestionIds.join(", ")}`
    );
    lines.push(
      `  actual: module=${failedCase.actual.complaintModuleId ?? "none"}; question=${failedCase.actual.plannedQuestionId ?? failedCase.actual.fallbackType ?? "none"}; selectedBecause=${failedCase.actual.selectedBecause ?? "none"}`
    );
  }

  return lines.join("\n");
}
