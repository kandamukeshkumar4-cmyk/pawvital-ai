import { getQuestionCardById } from "./question-card-registry";
import type { ClinicalQuestionCard } from "./question-card-types";
import {
  DEFAULT_EXISTING_GENERIC_QUESTION_ID,
  type ShadowPlannerExpectedOutcomeFixture,
  type ShadowPlannerScenarioEvalCaseResult,
  type ShadowPlannerScenarioEvalReport,
  type ShadowPlannerScenarioFixture,
} from "./shadow-planner-scenario-eval";

export type ShadowPlannerEvalFailureClassification =
  | "adapter_module_mismatch"
  | "fixture_expectation_mismatch"
  | "missing_question_card_coverage"
  | "off_topic_question_selected"
  | "emergency_alignment_ok_quality_gap"
  | "repeated_question_setup_gap"
  | "generic_question_metric_setup_gap"
  | "red_flag_screen_coverage_gap"
  | "acceptable_report_only_failure";

export type ShadowPlannerEvalFailureTier =
  | "safety_blocker"
  | "quality_report_only_gap";

export interface ShadowPlannerEdgeCaseRepeatedQuestionSetup {
  askedQuestionIds: string[];
  answeredQuestionIds: string[];
}

export interface ShadowPlannerEdgeCaseScenarioFixture {
  caseId: string;
  repeatedQuestionSetup?: ShadowPlannerEdgeCaseRepeatedQuestionSetup | null;
}

export interface ShadowPlannerEvalTriageInput {
  report: ShadowPlannerScenarioEvalReport;
  scenarios: readonly ShadowPlannerScenarioFixture[];
  expectedOutcomes: readonly ShadowPlannerExpectedOutcomeFixture[];
  edgeCaseScenarios: readonly ShadowPlannerEdgeCaseScenarioFixture[];
}

export interface ShadowPlannerEvalTriageCase {
  caseId: string;
  complaintModuleId: string;
  plannedQuestionId: string | null;
  selectedBecause: string | null;
  classifications: ShadowPlannerEvalFailureClassification[];
  primaryClassification: ShadowPlannerEvalFailureClassification;
  tier: ShadowPlannerEvalFailureTier;
  missingRequiredRedFlags: string[];
  uncoveredByAcceptableCards: string[];
  reason: string;
}

export interface ShadowPlannerEvalTriageCount {
  id: string;
  count: number;
}

export interface ShadowPlannerEvalRecommendedNextTicket {
  id: string;
  title: string;
  category: ShadowPlannerEvalFailureTier;
  triggeredBy: ShadowPlannerEvalFailureClassification[];
  rationale: string;
}

export interface ShadowPlannerEvalTriageContext {
  standardScenarioRepeatedSetupCount: number;
  edgeCaseScenarioRepeatedSetupCount: number;
}

export interface ShadowPlannerEvalTriageSummary {
  totalFailedCases: number;
  countByClassification: Record<ShadowPlannerEvalFailureClassification, number>;
  safetyBlockers: ShadowPlannerEvalTriageCase[];
  qualityReportOnlyGaps: ShadowPlannerEvalTriageCase[];
  topComplaintModulesAffected: ShadowPlannerEvalTriageCount[];
  topUnderScreenedRedFlags: ShadowPlannerEvalTriageCount[];
  recommendedNextTickets: ShadowPlannerEvalRecommendedNextTicket[];
  context: ShadowPlannerEvalTriageContext;
}

export interface ShadowPlannerEvalTriagePack extends ShadowPlannerEvalTriageSummary {
  failedCaseTriage: ShadowPlannerEvalTriageCase[];
}

const CLASSIFICATION_PRIORITY: readonly ShadowPlannerEvalFailureClassification[] = [
  "adapter_module_mismatch",
  "fixture_expectation_mismatch",
  "missing_question_card_coverage",
  "off_topic_question_selected",
  "emergency_alignment_ok_quality_gap",
  "repeated_question_setup_gap",
  "generic_question_metric_setup_gap",
  "red_flag_screen_coverage_gap",
  "acceptable_report_only_failure",
];

function buildEmptyClassificationCounts(): Record<
  ShadowPlannerEvalFailureClassification,
  number
> {
  return {
    adapter_module_mismatch: 0,
    fixture_expectation_mismatch: 0,
    missing_question_card_coverage: 0,
    off_topic_question_selected: 0,
    emergency_alignment_ok_quality_gap: 0,
    repeated_question_setup_gap: 0,
    generic_question_metric_setup_gap: 0,
    red_flag_screen_coverage_gap: 0,
    acceptable_report_only_failure: 0,
  };
}

function hasRepeatedQuestionSetup(
  row:
    | ShadowPlannerScenarioFixture
    | ShadowPlannerEdgeCaseScenarioFixture
    | undefined
): boolean {
  if (!row || !("repeatedQuestionSetup" in row)) {
    return false;
  }

  const setup = row.repeatedQuestionSetup;
  if (!setup) {
    return false;
  }

  return (
    Array.isArray(setup.askedQuestionIds) &&
    setup.askedQuestionIds.length > 0 &&
    Array.isArray(setup.answeredQuestionIds) &&
    setup.answeredQuestionIds.length > 0
  );
}

function buildScenarioMap(
  scenarios: readonly ShadowPlannerScenarioFixture[]
): Map<string, ShadowPlannerScenarioFixture> {
  return new Map(scenarios.map((scenario) => [scenario.caseId, scenario]));
}

function buildExpectedOutcomeMap(
  expectedOutcomes: readonly ShadowPlannerExpectedOutcomeFixture[]
): Map<string, ShadowPlannerExpectedOutcomeFixture> {
  return new Map(
    expectedOutcomes.map((expectedOutcome) => [
      expectedOutcome.caseId,
      expectedOutcome,
    ])
  );
}

function getAcceptableQuestionCards(
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture
): ClinicalQuestionCard[] {
  return expectedOutcome.acceptablePlannedQuestionIds
    .map((questionId) => getQuestionCardById(questionId))
    .filter((card): card is ClinicalQuestionCard => Boolean(card));
}

function getUncoveredExpectedRedFlags(
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture
): string[] {
  const acceptableCardCoverage = new Set(
    getAcceptableQuestionCards(expectedOutcome).flatMap(
      (card) => card.screensRedFlags
    )
  );

  return expectedOutcome.mustScreenRedFlags.filter(
    (redFlagId) => !acceptableCardCoverage.has(redFlagId)
  );
}

function isFixtureExpectationMismatch(
  caseResult: ShadowPlannerScenarioEvalCaseResult
): boolean {
  return (
    !caseResult.acceptableQuestionMatched &&
    caseResult.expected.shouldScreenEmergencyEarlier &&
    caseResult.actual.emergencyScreenQuestion &&
    caseResult.selectedBecauseMatched &&
    caseResult.actual.plannedQuestionId === DEFAULT_EXISTING_GENERIC_QUESTION_ID &&
    !caseResult.expected.acceptableQuestionIds.includes(
      DEFAULT_EXISTING_GENERIC_QUESTION_ID
    ) &&
    caseResult.expected.acceptableSelectedBecause.includes("emergency_screen")
  );
}

function determineTier(
  caseResult: ShadowPlannerScenarioEvalCaseResult,
  classifications: readonly ShadowPlannerEvalFailureClassification[]
): ShadowPlannerEvalFailureTier {
  if (classifications.includes("adapter_module_mismatch")) {
    return "safety_blocker";
  }

  if (
    !caseResult.emergencyScreenAligned ||
    (!caseResult.acceptableQuestionMatched &&
      caseResult.expected.shouldScreenEmergencyEarlier &&
      !caseResult.actual.emergencyScreenQuestion)
  ) {
    return "safety_blocker";
  }

  return "quality_report_only_gap";
}

function determinePrimaryClassification(
  classifications: readonly ShadowPlannerEvalFailureClassification[]
): ShadowPlannerEvalFailureClassification {
  for (const candidate of CLASSIFICATION_PRIORITY) {
    if (classifications.includes(candidate)) {
      return candidate;
    }
  }

  return "acceptable_report_only_failure";
}

function classifyFailedCase(
  caseResult: ShadowPlannerScenarioEvalCaseResult,
  scenario: ShadowPlannerScenarioFixture | undefined,
  expectedOutcome: ShadowPlannerExpectedOutcomeFixture | undefined,
  context: ShadowPlannerEvalTriageContext
): ShadowPlannerEvalTriageCase {
  const classifications = new Set<ShadowPlannerEvalFailureClassification>();

  if (!caseResult.complaintModuleMatched) {
    classifications.add("adapter_module_mismatch");
  }

  if (caseResult.missingRequiredRedFlags.length > 0) {
    classifications.add("red_flag_screen_coverage_gap");
  }

  const uncoveredByAcceptableCards = expectedOutcome
    ? getUncoveredExpectedRedFlags(expectedOutcome)
    : [];

  if (uncoveredByAcceptableCards.length > 0) {
    classifications.add("missing_question_card_coverage");
  }

  if (
    !caseResult.repeatedQuestionAvoided &&
    caseResult.expected.shouldAvoidRepeatedQuestion &&
    context.standardScenarioRepeatedSetupCount === 0 &&
    context.edgeCaseScenarioRepeatedSetupCount > 0 &&
    !hasRepeatedQuestionSetup(scenario)
  ) {
    classifications.add("repeated_question_setup_gap");
  }

  if (
    !caseResult.genericQuestionAvoided &&
    caseResult.expected.shouldBeatGenericQuestion &&
    caseResult.actual.plannedQuestionId === DEFAULT_EXISTING_GENERIC_QUESTION_ID
  ) {
    classifications.add("generic_question_metric_setup_gap");
  }

  if (
    caseResult.expected.shouldScreenEmergencyEarlier &&
    caseResult.actual.emergencyScreenQuestion &&
    caseResult.complaintModuleMatched
  ) {
    classifications.add("emergency_alignment_ok_quality_gap");
  }

  if (!caseResult.acceptableQuestionMatched) {
    if (isFixtureExpectationMismatch(caseResult)) {
      classifications.add("fixture_expectation_mismatch");
    } else {
      classifications.add("off_topic_question_selected");
    }
  }

  if (
    caseResult.acceptableQuestionMatched &&
    caseResult.selectedBecauseMatched &&
    caseResult.complaintModuleMatched
  ) {
    classifications.add("acceptable_report_only_failure");
  }

  const classificationsList = [...classifications].sort(
    (left, right) =>
      CLASSIFICATION_PRIORITY.indexOf(left) - CLASSIFICATION_PRIORITY.indexOf(right)
  );

  return {
    caseId: caseResult.caseId,
    complaintModuleId:
      caseResult.actual.complaintModuleId ??
      caseResult.expected.acceptableComplaintModuleIds[0] ??
      "unknown_complaint_module",
    plannedQuestionId: caseResult.actual.plannedQuestionId,
    selectedBecause: caseResult.actual.selectedBecause,
    classifications: classificationsList,
    primaryClassification: determinePrimaryClassification(classificationsList),
    tier: determineTier(caseResult, classificationsList),
    missingRequiredRedFlags: [...caseResult.missingRequiredRedFlags],
    uncoveredByAcceptableCards,
    reason: caseResult.failures.join("; "),
  };
}

function buildContext(
  scenarios: readonly ShadowPlannerScenarioFixture[],
  edgeCaseScenarios: readonly ShadowPlannerEdgeCaseScenarioFixture[]
): ShadowPlannerEvalTriageContext {
  return {
    standardScenarioRepeatedSetupCount: scenarios.filter((scenario) =>
      hasRepeatedQuestionSetup(scenario)
    ).length,
    edgeCaseScenarioRepeatedSetupCount: edgeCaseScenarios.filter((scenario) =>
      hasRepeatedQuestionSetup(scenario)
    ).length,
  };
}

function sortCounts(entries: ShadowPlannerEvalTriageCount[]): ShadowPlannerEvalTriageCount[] {
  return [...entries].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.id.localeCompare(right.id);
  });
}

function countTopComplaintModules(
  failedCaseTriage: readonly ShadowPlannerEvalTriageCase[]
): ShadowPlannerEvalTriageCount[] {
  const counts = new Map<string, number>();

  for (const caseTriage of failedCaseTriage) {
    counts.set(
      caseTriage.complaintModuleId,
      (counts.get(caseTriage.complaintModuleId) ?? 0) + 1
    );
  }

  return sortCounts(
    [...counts.entries()].map(([id, count]) => ({
      id,
      count,
    }))
  );
}

function countUnderScreenedRedFlags(
  failedCaseTriage: readonly ShadowPlannerEvalTriageCase[]
): ShadowPlannerEvalTriageCount[] {
  const counts = new Map<string, number>();

  for (const caseTriage of failedCaseTriage) {
    for (const redFlagId of caseTriage.missingRequiredRedFlags) {
      counts.set(redFlagId, (counts.get(redFlagId) ?? 0) + 1);
    }
  }

  return sortCounts(
    [...counts.entries()].map(([id, count]) => ({
      id,
      count,
    }))
  );
}

function buildRecommendedNextTickets(
  countByClassification: Record<ShadowPlannerEvalFailureClassification, number>
): ShadowPlannerEvalRecommendedNextTicket[] {
  const tickets: ShadowPlannerEvalRecommendedNextTicket[] = [];

  if (countByClassification.repeated_question_setup_gap > 0) {
    tickets.push({
      id: "shadow-planner-repeated-question-eval-setup",
      title: "Add real repeated-question setup to the baseline scenario pack",
      category: "quality_report_only_gap",
      triggeredBy: ["repeated_question_setup_gap"],
      rationale:
        "The baseline scenario pack does not contain prior asked/answered question state, so repeated-question failures currently reflect harness setup rather than planner behavior.",
    });
  }

  if (countByClassification.generic_question_metric_setup_gap > 0) {
    tickets.push({
      id: "shadow-planner-generic-question-metric-baseline",
      title: "Split generic-question scoring from the fixed emergency baseline",
      category: "quality_report_only_gap",
      triggeredBy: ["generic_question_metric_setup_gap"],
      rationale:
        "The eval compares every first turn against the same generic emergency baseline, which penalizes safety-aligned global emergency screening even when it is still an acceptable first question.",
    });
  }

  if (
    countByClassification.red_flag_screen_coverage_gap > 0 ||
    countByClassification.missing_question_card_coverage > 0
  ) {
    tickets.push({
      id: "shadow-planner-red-flag-coverage-audit",
      title: "Audit missing red-flag coverage across acceptable question sets",
      category: "quality_report_only_gap",
      triggeredBy: [
        "red_flag_screen_coverage_gap",
        "missing_question_card_coverage",
      ],
      rationale:
        "Several must-screen red flags are either not captured by the selected question or not represented anywhere in the acceptable registry-backed question set for the case.",
    });
  }

  if (countByClassification.off_topic_question_selected > 0) {
    tickets.push({
      id: "shadow-planner-routine-emergency-overselection-triage",
      title: "Triage routine-case emergency over-selection after setup gaps are removed",
      category: "quality_report_only_gap",
      triggeredBy: ["off_topic_question_selected"],
      rationale:
        "A small subset of routine or non-emergency cases still lands on the global emergency screen even when the acceptable set expects a more specific discriminator.",
    });
  }

  if (countByClassification.fixture_expectation_mismatch > 0) {
    tickets.push({
      id: "shadow-planner-expected-outcome-normalization",
      title: "Normalize expected-outcome fixtures for emergency-aligned global screens",
      category: "quality_report_only_gap",
      triggeredBy: ["fixture_expectation_mismatch"],
      rationale:
        "At least one case allows emergency-screen reasoning but does not include the canonical global emergency screen in its acceptable question set, which makes the report harder to interpret.",
    });
  }

  return tickets;
}

export function triageShadowPlannerEvalFailures(
  input: ShadowPlannerEvalTriageInput
): ShadowPlannerEvalTriagePack {
  const context = buildContext(input.scenarios, input.edgeCaseScenarios);
  const scenarioMap = buildScenarioMap(input.scenarios);
  const expectedOutcomeMap = buildExpectedOutcomeMap(input.expectedOutcomes);
  const countByClassification = buildEmptyClassificationCounts();

  const failedCaseTriage = input.report.caseResults
    .filter((caseResult) => !caseResult.passed)
    .map((caseResult) =>
      classifyFailedCase(
        caseResult,
        scenarioMap.get(caseResult.caseId),
        expectedOutcomeMap.get(caseResult.caseId),
        context
      )
    );

  for (const caseTriage of failedCaseTriage) {
    for (const classification of caseTriage.classifications) {
      countByClassification[classification] += 1;
    }
  }

  const safetyBlockers = failedCaseTriage.filter(
    (caseTriage) => caseTriage.tier === "safety_blocker"
  );
  const qualityReportOnlyGaps = failedCaseTriage.filter(
    (caseTriage) => caseTriage.tier === "quality_report_only_gap"
  );

  return {
    totalFailedCases: failedCaseTriage.length,
    countByClassification,
    safetyBlockers,
    qualityReportOnlyGaps,
    topComplaintModulesAffected: countTopComplaintModules(failedCaseTriage),
    topUnderScreenedRedFlags: countUnderScreenedRedFlags(failedCaseTriage),
    recommendedNextTickets: buildRecommendedNextTickets(countByClassification),
    context,
    failedCaseTriage,
  };
}
