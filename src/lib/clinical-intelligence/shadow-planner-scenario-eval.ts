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

export type ShadowPlannerScenarioEvalAmbiguityDisposition =
  | "strict_primary"
  | "same_module_only"
  | "allow_module_alternatives";

export type ShadowPlannerScenarioEvalEmergencyAlignmentDisposition =
  | "question_match_required"
  | "alignment_only_ok";

export type ShadowPlannerScenarioEvalRedFlagCoverageExpectation =
  | "complete"
  | "partial";

export type ShadowPlannerScenarioEvalGenericQuestionScoring =
  | "include"
  | "exclude_for_now";

export interface ShadowPlannerExpectedOutcomeNormalizationFixture {
  caseId: string;
  acceptableModuleIds: string[];
  ambiguityDisposition: ShadowPlannerScenarioEvalAmbiguityDisposition;
  emergencyAlignmentDisposition: ShadowPlannerScenarioEvalEmergencyAlignmentDisposition;
  redFlagCoverageExpectation: ShadowPlannerScenarioEvalRedFlagCoverageExpectation;
  genericQuestionScoring: ShadowPlannerScenarioEvalGenericQuestionScoring;
  notes: string;
}

export interface ShadowPlannerScenarioEvalNormalizedExpected
  extends ShadowPlannerScenarioEvalExpected {
  ambiguityDisposition: ShadowPlannerScenarioEvalAmbiguityDisposition;
  emergencyAlignmentDisposition: ShadowPlannerScenarioEvalEmergencyAlignmentDisposition;
  redFlagCoverageExpectation: ShadowPlannerScenarioEvalRedFlagCoverageExpectation;
  genericQuestionScoring: ShadowPlannerScenarioEvalGenericQuestionScoring;
  notes: string;
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
  rawReason?: string;
  normalizedReason?: string;
}

export interface ShadowPlannerScenarioEvalCaseResult {
  caseId: string;
  fixtureKind: ShadowPlannerScenarioFixtureKind;
  expected: ShadowPlannerScenarioEvalExpected;
  normalizedExpected?: ShadowPlannerScenarioEvalNormalizedExpected;
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
  normalizedComplaintModuleMatched?: boolean;
  normalizedAcceptableQuestionMatched?: boolean;
  normalizedSelectedBecauseMatched?: boolean;
  normalizedEmergencyScreenAligned?: boolean;
  normalizedRepeatedQuestionAvoided?: boolean;
  normalizedGenericQuestionAvoided?: boolean;
  normalizedMatchedRequiredRedFlags?: string[];
  normalizedMissingRequiredRedFlags?: string[];
  normalizedRequiredRedFlagCount?: number;
  normalizedFailures?: string[];
  normalizedPassed?: boolean;
  rawReason?: string;
  normalizedReason?: string;
}

export interface ShadowPlannerScenarioEvalMetricSet {
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
}

export interface ShadowPlannerScenarioEvalSummary
  extends ShadowPlannerScenarioEvalMetricSet {
  totalCases: number;
  baseCaseCount: number;
  edgeCaseCount: number;
  failedCases: ShadowPlannerScenarioEvalFailedCase[];
  rawMetrics?: ShadowPlannerScenarioEvalMetricSet;
  normalizedMetrics?: ShadowPlannerScenarioEvalMetricSet;
  rawFailedCaseCount?: number;
  normalizedFailedCaseCount?: number;
}

export interface ShadowPlannerScenarioEvalReport {
  summary: ShadowPlannerScenarioEvalSummary;
  caseResults: ShadowPlannerScenarioEvalCaseResult[];
}

export interface EvaluateShadowPlannerScenarioCaseInput {
  scenario: ShadowPlannerScenarioFixture;
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture;
  normalizationRow?: ShadowPlannerExpectedOutcomeNormalizationFixture;
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
  normalizationRows?: readonly ShadowPlannerExpectedOutcomeNormalizationFixture[];
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

function buildNormalizedExpectedDescriptor(
  expected: ShadowPlannerScenarioEvalExpected,
  normalizationRow?: ShadowPlannerExpectedOutcomeNormalizationFixture
): ShadowPlannerScenarioEvalNormalizedExpected {
  return {
    acceptableComplaintModuleIds: normalizationRow
      ? [...normalizationRow.acceptableModuleIds]
      : [...expected.acceptableComplaintModuleIds],
    acceptableQuestionIds: [...expected.acceptableQuestionIds],
    acceptableSelectedBecause: [...expected.acceptableSelectedBecause],
    mustScreenRedFlags: [...expected.mustScreenRedFlags],
    shouldBeatGenericQuestion:
      normalizationRow?.genericQuestionScoring === "exclude_for_now"
        ? false
        : expected.shouldBeatGenericQuestion,
    shouldScreenEmergencyEarlier: expected.shouldScreenEmergencyEarlier,
    shouldAvoidRepeatedQuestion: expected.shouldAvoidRepeatedQuestion,
    ambiguityDisposition:
      normalizationRow?.ambiguityDisposition ?? "strict_primary",
    emergencyAlignmentDisposition:
      normalizationRow?.emergencyAlignmentDisposition ?? "question_match_required",
    redFlagCoverageExpectation:
      normalizationRow?.redFlagCoverageExpectation ?? "complete",
    genericQuestionScoring: normalizationRow?.genericQuestionScoring ?? "include",
    notes: normalizationRow?.notes ?? "",
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
  existingQuestionId: string,
  includeGenericBaselineRepeat: boolean
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

  if (includeGenericBaselineRepeat && plannedQuestionId === existingQuestionId) {
    failures.push(
      `Planned question repeated the generic baseline "${existingQuestionId}"`
    );
  }

  return failures;
}

function buildNormalizationMap(
  normalizationRows: readonly ShadowPlannerExpectedOutcomeNormalizationFixture[]
): Map<string, ShadowPlannerExpectedOutcomeNormalizationFixture> {
  assertUniqueCaseIds(normalizationRows, "Normalization rows");

  return new Map(
    normalizationRows.map((normalizationRow) => [
      normalizationRow.caseId,
      normalizationRow,
    ])
  );
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
  normalizedExpected: ShadowPlannerScenarioEvalNormalizedExpected;
  existingQuestionId: string;
  caseState: ClinicalCaseState;
}

interface ShadowPlannerScenarioEvalModeResult {
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

interface EvaluateExpectationModeInput {
  expected:
    | ShadowPlannerScenarioEvalExpected
    | ShadowPlannerScenarioEvalNormalizedExpected;
  actual: ShadowPlannerScenarioEvalActual;
  existingQuestionId: string;
  repeatedQuestionAvoidedSignal: boolean;
  includeGenericBaselineRepeat: boolean;
  allowEmergencyAlignmentQuestionMatch: boolean;
  redFlagCoverageExpectation: ShadowPlannerScenarioEvalRedFlagCoverageExpectation;
}

function evaluateExpectationMode(
  input: EvaluateExpectationModeInput
): ShadowPlannerScenarioEvalModeResult {
  const complaintModuleMatched =
    input.actual.complaintModuleId !== null &&
    input.expected.acceptableComplaintModuleIds.includes(
      input.actual.complaintModuleId
    );
  const selectedBecauseMatched =
    input.actual.selectedBecause !== null &&
    input.expected.acceptableSelectedBecause.includes(
      input.actual.selectedBecause
    );
  const emergencyScreenAligned =
    !input.expected.shouldScreenEmergencyEarlier ||
    input.actual.emergencyScreenQuestion;
  const exactQuestionMatched =
    input.actual.plannedQuestionId !== null &&
    input.expected.acceptableQuestionIds.includes(input.actual.plannedQuestionId);
  const acceptableQuestionMatched =
    exactQuestionMatched ||
    (input.allowEmergencyAlignmentQuestionMatch &&
      input.expected.shouldScreenEmergencyEarlier &&
      emergencyScreenAligned &&
      input.actual.emergencyScreenQuestion);
  const repeatedQuestionAvoided =
    !input.expected.shouldAvoidRepeatedQuestion ||
    input.repeatedQuestionAvoidedSignal;
  const genericQuestionAvoided =
    !input.expected.shouldBeatGenericQuestion ||
    (input.actual.plannedQuestionId !== null &&
      input.actual.plannedQuestionId !== input.existingQuestionId &&
      !input.actual.genericQuestion);
  const failures = formatFailure(
    input.actual.plannedQuestionId,
    input.actual.selectedBecause,
    input.redFlagCoverageExpectation === "partial"
      ? []
      : input.expected.mustScreenRedFlags.filter(
          (flagId) => !input.actual.screenedRedFlags.includes(flagId)
        ),
    input.existingQuestionId,
    input.includeGenericBaselineRepeat
  );
  const matchedRequiredRedFlags =
    input.redFlagCoverageExpectation === "partial"
      ? []
      : input.expected.mustScreenRedFlags.filter((flagId) =>
          input.actual.screenedRedFlags.includes(flagId)
        );
  const missingRequiredRedFlags =
    input.redFlagCoverageExpectation === "partial"
      ? []
      : input.expected.mustScreenRedFlags.filter(
          (flagId) => !matchedRequiredRedFlags.includes(flagId)
        );

  if (!complaintModuleMatched) {
    failures.push(
      `Complaint module mismatch: expected one of "${input.expected.acceptableComplaintModuleIds.join(", ")}", got "${input.actual.complaintModuleId ?? "none"}"`
    );
  }

  if (!acceptableQuestionMatched) {
    failures.push(
      `Planned question "${input.actual.plannedQuestionId ?? input.actual.fallbackType ?? "none"}" is outside the acceptable set`
    );
  }

  if (!selectedBecauseMatched) {
    failures.push(
      `selectedBecause "${input.actual.selectedBecause ?? "none"}" is outside the acceptable set`
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

  if (input.actual.fallbackType !== null) {
    failures.push(
      `Adapter returned fallback "${input.actual.fallbackType}" instead of a planned question`
    );
  }

  return {
    complaintModuleMatched,
    acceptableQuestionMatched,
    selectedBecauseMatched,
    emergencyScreenAligned,
    repeatedQuestionAvoided,
    genericQuestionAvoided,
    matchedRequiredRedFlags,
    missingRequiredRedFlags,
    requiredRedFlagCount:
      input.redFlagCoverageExpectation === "partial"
        ? 0
        : input.expected.mustScreenRedFlags.length,
    failures,
    passed: failures.length === 0,
  };
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
  const repeatedQuestionAvoidedSignal = integration.comparison.repeatedQuestionAvoided;

  const rawEvaluation = evaluateExpectationMode({
    expected: input.expected,
    actual,
    existingQuestionId: input.existingQuestionId,
    repeatedQuestionAvoidedSignal,
    includeGenericBaselineRepeat: true,
    allowEmergencyAlignmentQuestionMatch: false,
    redFlagCoverageExpectation: "complete",
  });
  const normalizedEvaluation = evaluateExpectationMode({
    expected: input.normalizedExpected,
    actual,
    existingQuestionId: input.existingQuestionId,
    repeatedQuestionAvoidedSignal,
    includeGenericBaselineRepeat:
      input.normalizedExpected.shouldAvoidRepeatedQuestion ||
      input.normalizedExpected.shouldBeatGenericQuestion,
    allowEmergencyAlignmentQuestionMatch:
      input.normalizedExpected.emergencyAlignmentDisposition ===
      "alignment_only_ok",
    redFlagCoverageExpectation:
      input.normalizedExpected.redFlagCoverageExpectation,
  });

  return {
    caseId: input.caseId,
    fixtureKind: input.fixtureKind,
    expected: input.expected,
    normalizedExpected: input.normalizedExpected,
    actual,
    complaintModuleMatched: rawEvaluation.complaintModuleMatched,
    acceptableQuestionMatched: rawEvaluation.acceptableQuestionMatched,
    selectedBecauseMatched: rawEvaluation.selectedBecauseMatched,
    emergencyScreenAligned: rawEvaluation.emergencyScreenAligned,
    repeatedQuestionAvoided: rawEvaluation.repeatedQuestionAvoided,
    genericQuestionAvoided: rawEvaluation.genericQuestionAvoided,
    matchedRequiredRedFlags: rawEvaluation.matchedRequiredRedFlags,
    missingRequiredRedFlags: rawEvaluation.missingRequiredRedFlags,
    requiredRedFlagCount: rawEvaluation.requiredRedFlagCount,
    failures: rawEvaluation.failures,
    passed: rawEvaluation.passed,
    normalizedComplaintModuleMatched:
      normalizedEvaluation.complaintModuleMatched,
    normalizedAcceptableQuestionMatched:
      normalizedEvaluation.acceptableQuestionMatched,
    normalizedSelectedBecauseMatched:
      normalizedEvaluation.selectedBecauseMatched,
    normalizedEmergencyScreenAligned:
      normalizedEvaluation.emergencyScreenAligned,
    normalizedRepeatedQuestionAvoided:
      normalizedEvaluation.repeatedQuestionAvoided,
    normalizedGenericQuestionAvoided:
      normalizedEvaluation.genericQuestionAvoided,
    normalizedMatchedRequiredRedFlags:
      normalizedEvaluation.matchedRequiredRedFlags,
    normalizedMissingRequiredRedFlags:
      normalizedEvaluation.missingRequiredRedFlags,
    normalizedRequiredRedFlagCount:
      normalizedEvaluation.requiredRedFlagCount,
    normalizedFailures: normalizedEvaluation.failures,
    normalizedPassed: normalizedEvaluation.passed,
    rawReason: rawEvaluation.failures.join("; "),
    normalizedReason: normalizedEvaluation.failures.join("; "),
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
  const expected = buildExpectedDescriptorFromOutcome(input.expectedOutcome);

  return evaluateNormalizedShadowPlannerScenario({
    caseId: input.scenario.caseId,
    fixtureKind: "base",
    ownerText: input.scenario.ownerText,
    expected,
    normalizedExpected: buildNormalizedExpectedDescriptor(
      expected,
      input.normalizationRow
    ),
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
  const expected = buildExpectedDescriptorFromEdgeScenario(input.scenario);

  return evaluateNormalizedShadowPlannerScenario({
    caseId: input.scenario.caseId,
    fixtureKind: "edge",
    ownerText: input.scenario.ownerText,
    expected,
    normalizedExpected: buildNormalizedExpectedDescriptor(expected),
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

function buildMetricSet(
  caseResults: readonly ShadowPlannerScenarioEvalCaseResult[],
  mode: "raw" | "normalized"
): ShadowPlannerScenarioEvalMetricSet {
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
    const expected =
      mode === "normalized"
        ? caseResult.normalizedExpected ?? buildNormalizedExpectedDescriptor(caseResult.expected)
        : caseResult.expected;
    const complaintModuleMatched =
      mode === "normalized"
        ? caseResult.normalizedComplaintModuleMatched ?? caseResult.complaintModuleMatched
        : caseResult.complaintModuleMatched;
    const acceptableQuestionMatched =
      mode === "normalized"
        ? caseResult.normalizedAcceptableQuestionMatched ??
          caseResult.acceptableQuestionMatched
        : caseResult.acceptableQuestionMatched;
    const emergencyScreenAligned =
      mode === "normalized"
        ? caseResult.normalizedEmergencyScreenAligned ??
          caseResult.emergencyScreenAligned
        : caseResult.emergencyScreenAligned;
    const repeatedQuestionAvoided =
      mode === "normalized"
        ? caseResult.normalizedRepeatedQuestionAvoided ??
          caseResult.repeatedQuestionAvoided
        : caseResult.repeatedQuestionAvoided;
    const genericQuestionAvoided =
      mode === "normalized"
        ? caseResult.normalizedGenericQuestionAvoided ??
          caseResult.genericQuestionAvoided
        : caseResult.genericQuestionAvoided;
    const matchedRequiredRedFlags =
      mode === "normalized"
        ? caseResult.normalizedMatchedRequiredRedFlags ??
          caseResult.matchedRequiredRedFlags
        : caseResult.matchedRequiredRedFlags;
    const requiredRedFlagCount =
      mode === "normalized"
        ? caseResult.normalizedRequiredRedFlagCount ?? caseResult.requiredRedFlagCount
        : caseResult.requiredRedFlagCount;

    if (complaintModuleMatched) {
      complaintModuleMatchCount += 1;
    }

    if (acceptableQuestionMatched) {
      acceptableQuestionCount += 1;
    }

    if (expected.shouldScreenEmergencyEarlier) {
      emergencyScreenAlignmentRelevantCases += 1;
      if (emergencyScreenAligned) {
        emergencyScreenAlignmentCount += 1;
      }
    }

    if (expected.shouldAvoidRepeatedQuestion) {
      repeatedQuestionAvoidanceRelevantCases += 1;
      if (repeatedQuestionAvoided) {
        repeatedQuestionAvoidanceCount += 1;
      }
    }

    if (expected.shouldBeatGenericQuestion) {
      genericQuestionAvoidanceRelevantCases += 1;
      if (genericQuestionAvoided) {
        genericQuestionAvoidanceCount += 1;
      }
    }

    screenedRequiredRedFlagCount += matchedRequiredRedFlags.length;
    totalRequiredRedFlagCount += requiredRedFlagCount;
  }

  return {
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
  };
}

function buildSummary(
  caseResults: readonly ShadowPlannerScenarioEvalCaseResult[]
): ShadowPlannerScenarioEvalSummary {
  let baseCaseCount = 0;
  let edgeCaseCount = 0;

  for (const caseResult of caseResults) {
    if (caseResult.fixtureKind === "base") {
      baseCaseCount += 1;
    } else {
      edgeCaseCount += 1;
    }
  }

  const rawMetrics = buildMetricSet(caseResults, "raw");
  const normalizedMetrics = buildMetricSet(caseResults, "normalized");
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
      reason: caseResult.rawReason ?? caseResult.failures.join("; "),
      rawReason: caseResult.rawReason ?? caseResult.failures.join("; "),
      normalizedReason:
        caseResult.normalizedReason ??
        caseResult.normalizedFailures?.join("; ") ??
        "",
    }));

  return {
    totalCases: caseResults.length,
    baseCaseCount,
    edgeCaseCount,
    complaintModuleMatchCount: rawMetrics.complaintModuleMatchCount,
    complaintModuleMatchRate: rawMetrics.complaintModuleMatchRate,
    acceptableQuestionCount: rawMetrics.acceptableQuestionCount,
    acceptableQuestionRate: rawMetrics.acceptableQuestionRate,
    emergencyScreenAlignmentCount: rawMetrics.emergencyScreenAlignmentCount,
    emergencyScreenAlignmentRelevantCases:
      rawMetrics.emergencyScreenAlignmentRelevantCases,
    emergencyScreenAlignmentRate: rawMetrics.emergencyScreenAlignmentRate,
    repeatedQuestionAvoidanceCount:
      rawMetrics.repeatedQuestionAvoidanceCount,
    repeatedQuestionAvoidanceRelevantCases:
      rawMetrics.repeatedQuestionAvoidanceRelevantCases,
    repeatedQuestionAvoidanceRate: rawMetrics.repeatedQuestionAvoidanceRate,
    genericQuestionAvoidanceCount: rawMetrics.genericQuestionAvoidanceCount,
    genericQuestionAvoidanceRelevantCases:
      rawMetrics.genericQuestionAvoidanceRelevantCases,
    genericQuestionAvoidanceRate: rawMetrics.genericQuestionAvoidanceRate,
    screenedRequiredRedFlagCount:
      rawMetrics.screenedRequiredRedFlagCount,
    totalRequiredRedFlagCount: rawMetrics.totalRequiredRedFlagCount,
    redFlagScreenCoverageRate: rawMetrics.redFlagScreenCoverageRate,
    failedCases,
    rawMetrics,
    normalizedMetrics,
    rawFailedCaseCount: failedCases.length,
    normalizedFailedCaseCount: caseResults.filter(
      (caseResult) => !(caseResult.normalizedPassed ?? caseResult.passed)
    ).length,
  };
}

export function evaluateShadowPlannerScenarios(
  input: EvaluateShadowPlannerScenariosInput
): ShadowPlannerScenarioEvalReport {
  assertUniqueCaseIds(input.scenarios, "Scenarios");
  const edgeScenarios = input.edgeScenarios ?? [];
  assertUniqueCaseIds(edgeScenarios, "Edge scenarios");
  assertNoOverlappingCaseIds(input.scenarios, edgeScenarios);
  const normalizationRows = input.normalizationRows ?? [];
  const normalizationMap =
    normalizationRows.length > 0 ? buildNormalizationMap(normalizationRows) : null;

  const expectedOutcomeMap = buildExpectedOutcomeMap(input.expectedOutcomes);
  const baseCaseResults = input.scenarios.map((scenario) => {
    const expectedOutcome = expectedOutcomeMap.get(scenario.caseId);
    if (!expectedOutcome) {
      throw new Error(`Missing expected outcome for case "${scenario.caseId}"`);
    }
    const normalizationRow =
      normalizationMap?.get(scenario.caseId) ?? undefined;

    if (normalizationMap && !normalizationRow) {
      throw new Error(
        `Missing normalization row for base scenario "${scenario.caseId}"`
      );
    }

    return evaluateShadowPlannerScenarioCase({
      scenario,
      expectedOutcome,
      normalizationRow,
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
  const rawMetrics = summary.rawMetrics ?? {
    complaintModuleMatchCount: summary.complaintModuleMatchCount,
    complaintModuleMatchRate: summary.complaintModuleMatchRate,
    acceptableQuestionCount: summary.acceptableQuestionCount,
    acceptableQuestionRate: summary.acceptableQuestionRate,
    emergencyScreenAlignmentCount: summary.emergencyScreenAlignmentCount,
    emergencyScreenAlignmentRelevantCases:
      summary.emergencyScreenAlignmentRelevantCases,
    emergencyScreenAlignmentRate: summary.emergencyScreenAlignmentRate,
    repeatedQuestionAvoidanceCount: summary.repeatedQuestionAvoidanceCount,
    repeatedQuestionAvoidanceRelevantCases:
      summary.repeatedQuestionAvoidanceRelevantCases,
    repeatedQuestionAvoidanceRate: summary.repeatedQuestionAvoidanceRate,
    genericQuestionAvoidanceCount: summary.genericQuestionAvoidanceCount,
    genericQuestionAvoidanceRelevantCases:
      summary.genericQuestionAvoidanceRelevantCases,
    genericQuestionAvoidanceRate: summary.genericQuestionAvoidanceRate,
    screenedRequiredRedFlagCount: summary.screenedRequiredRedFlagCount,
    totalRequiredRedFlagCount: summary.totalRequiredRedFlagCount,
    redFlagScreenCoverageRate: summary.redFlagScreenCoverageRate,
  };
  const normalizedMetrics = summary.normalizedMetrics ?? rawMetrics;
  const lines = [
    "Shadow Planner Scenario Eval",
    `Total cases: ${summary.totalCases}`,
    `Base cases: ${summary.baseCaseCount}`,
    `Edge cases: ${summary.edgeCaseCount}`,
    "Raw metrics",
    formatCountLine(
      "Complaint module match rate",
      rawMetrics.complaintModuleMatchCount,
      summary.totalCases,
      rawMetrics.complaintModuleMatchRate
    ),
    formatCountLine(
      "Acceptable question rate",
      rawMetrics.acceptableQuestionCount,
      summary.totalCases,
      rawMetrics.acceptableQuestionRate
    ),
    formatCountLine(
      "Emergency screen alignment rate",
      rawMetrics.emergencyScreenAlignmentCount,
      rawMetrics.emergencyScreenAlignmentRelevantCases,
      rawMetrics.emergencyScreenAlignmentRate
    ),
    formatCountLine(
      "Repeated question avoidance rate",
      rawMetrics.repeatedQuestionAvoidanceCount,
      rawMetrics.repeatedQuestionAvoidanceRelevantCases,
      rawMetrics.repeatedQuestionAvoidanceRate
    ),
    formatCountLine(
      "Generic question avoidance rate",
      rawMetrics.genericQuestionAvoidanceCount,
      rawMetrics.genericQuestionAvoidanceRelevantCases,
      rawMetrics.genericQuestionAvoidanceRate
    ),
    formatCountLine(
      "Red flag screen coverage rate",
      rawMetrics.screenedRequiredRedFlagCount,
      rawMetrics.totalRequiredRedFlagCount,
      rawMetrics.redFlagScreenCoverageRate
    ),
    `Raw failed cases: ${summary.rawFailedCaseCount ?? summary.failedCases.length}`,
    "Normalized metrics",
    formatCountLine(
      "Complaint module match rate",
      normalizedMetrics.complaintModuleMatchCount,
      summary.totalCases,
      normalizedMetrics.complaintModuleMatchRate
    ),
    formatCountLine(
      "Acceptable question rate",
      normalizedMetrics.acceptableQuestionCount,
      summary.totalCases,
      normalizedMetrics.acceptableQuestionRate
    ),
    formatCountLine(
      "Emergency screen alignment rate",
      normalizedMetrics.emergencyScreenAlignmentCount,
      normalizedMetrics.emergencyScreenAlignmentRelevantCases,
      normalizedMetrics.emergencyScreenAlignmentRate
    ),
    formatCountLine(
      "Repeated question avoidance rate",
      normalizedMetrics.repeatedQuestionAvoidanceCount,
      normalizedMetrics.repeatedQuestionAvoidanceRelevantCases,
      normalizedMetrics.repeatedQuestionAvoidanceRate
    ),
    formatCountLine(
      "Generic question avoidance rate",
      normalizedMetrics.genericQuestionAvoidanceCount,
      normalizedMetrics.genericQuestionAvoidanceRelevantCases,
      normalizedMetrics.genericQuestionAvoidanceRate
    ),
    formatCountLine(
      "Red flag screen coverage rate",
      normalizedMetrics.screenedRequiredRedFlagCount,
      normalizedMetrics.totalRequiredRedFlagCount,
      normalizedMetrics.redFlagScreenCoverageRate
    ),
    `Normalized failed cases: ${summary.normalizedFailedCaseCount ?? summary.failedCases.length}`,
  ];

  if (summary.failedCases.length === 0) {
    lines.push("Failed cases: none");
    return lines.join("\n");
  }

  lines.push(`Failed cases: ${summary.failedCases.length}`);
  for (const failedCase of summary.failedCases) {
    lines.push(
      `- [${failedCase.fixtureKind}] ${failedCase.caseId}: raw=${failedCase.rawReason ?? failedCase.reason}; normalized=${failedCase.normalizedReason ?? ""}`
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
