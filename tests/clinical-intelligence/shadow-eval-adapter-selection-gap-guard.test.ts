import fs from "node:fs";
import path from "node:path";

import edgeCaseScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";
import { triageShadowPlannerEvalFailures } from "@/lib/clinical-intelligence/shadow-planner-eval-triage";

type GapClassification =
  | "missing_module_trigger"
  | "fixture_text_mismatch"
  | "adapter_family_mapping_gap"
  | "acceptable_ambiguity";

type RecommendedFixOwner =
  | "adapter_trigger_surface"
  | "expected_outcome_fixture";

interface AdapterSelectionGapGuardRow {
  caseId: string;
  auditedRedFlagId: "persistent_vomiting" | "non_weight_bearing";
  expectedComplaintModuleId: string;
  actualComplaintModuleId: string | null;
  actualPlannedQuestionId: string | null;
  selectedBecause: string | null;
  ownerPhraseTrigger: string;
  classification: GapClassification;
  recommendedFixOwner: RecommendedFixOwner;
  noSafetyBlocker: boolean;
  noQuestionCardGap: boolean;
}

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "shadow-eval-adapter-selection-gap-guard-qwen.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const EXPECTED_GAP_ROWS: readonly AdapterSelectionGapGuardRow[] = [
  {
    caseId: "gi_vomiting_diarrhea_03_water_comes_back_up",
    auditedRedFlagId: "persistent_vomiting",
    expectedComplaintModuleId: "gi_vomiting_diarrhea",
    actualComplaintModuleId: "gi_vomiting_diarrhea",
    actualPlannedQuestionId: "emergency_global_screen",
    selectedBecause: "emergency_screen",
    ownerPhraseTrigger: "comes back up soon after",
    classification: "fixture_text_mismatch",
    recommendedFixOwner: "expected_outcome_fixture",
    noSafetyBlocker: true,
    noQuestionCardGap: true,
  },
  {
    caseId: "limping_mobility_pain_02_sudden_after_jump",
    auditedRedFlagId: "non_weight_bearing",
    expectedComplaintModuleId: "limping_mobility_pain",
    actualComplaintModuleId: "limping_mobility_pain",
    actualPlannedQuestionId: "emergency_global_screen",
    selectedBecause: "emergency_screen",
    ownerPhraseTrigger: "toe-touching",
    classification: "missing_module_trigger",
    recommendedFixOwner: "adapter_trigger_surface",
    noSafetyBlocker: true,
    noQuestionCardGap: true,
  },
  {
    caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
    auditedRedFlagId: "non_weight_bearing",
    expectedComplaintModuleId: "limping_mobility_pain",
    actualComplaintModuleId: "limping_mobility_pain",
    actualPlannedQuestionId: "emergency_global_screen",
    selectedBecause: "emergency_screen",
    ownerPhraseTrigger: "small cut between the toes",
    classification: "missing_module_trigger",
    recommendedFixOwner: "adapter_trigger_surface",
    noSafetyBlocker: true,
    noQuestionCardGap: true,
  },
] as const;

const EXPECTED_CLASSIFICATION_COUNTS: Record<GapClassification, number> = {
  missing_module_trigger: 2,
  fixture_text_mismatch: 1,
  adapter_family_mapping_gap: 0,
  acceptable_ambiguity: 0,
};

function buildAuditTriage() {
  const report = evaluateShadowPlannerScenarios({
    scenarios,
    expectedOutcomes,
  });
  const triage = triageShadowPlannerEvalFailures({
    report,
    scenarios,
    expectedOutcomes,
    edgeCaseScenarios,
  });

  return {
    report,
    triage,
  };
}

function determineGapClassification(
  caseId: string
): GapClassification {
  switch (caseId) {
    case "gi_vomiting_diarrhea_03_water_comes_back_up":
      return "fixture_text_mismatch";
    case "limping_mobility_pain_02_sudden_after_jump":
    case "limping_mobility_pain_03_limping_with_wound_confuser":
      return "missing_module_trigger";
    default:
      throw new Error(`Unexpected audited case "${caseId}"`);
  }
}

function determineRecommendedFixOwner(
  classification: GapClassification
): RecommendedFixOwner {
  switch (classification) {
    case "fixture_text_mismatch":
      return "expected_outcome_fixture";
    case "missing_module_trigger":
    case "adapter_family_mapping_gap":
    case "acceptable_ambiguity":
      return "adapter_trigger_surface";
    default:
      throw new Error(`Unexpected classification "${classification}"`);
  }
}

function determineAuditedRedFlagId(
  caseId: string
): AdapterSelectionGapGuardRow["auditedRedFlagId"] {
  switch (caseId) {
    case "gi_vomiting_diarrhea_03_water_comes_back_up":
      return "persistent_vomiting";
    case "limping_mobility_pain_02_sudden_after_jump":
    case "limping_mobility_pain_03_limping_with_wound_confuser":
      return "non_weight_bearing";
    default:
      throw new Error(`Unexpected audited case "${caseId}"`);
  }
}

function determineOwnerPhraseTrigger(caseId: string): string {
  switch (caseId) {
    case "gi_vomiting_diarrhea_03_water_comes_back_up":
      return "comes back up soon after";
    case "limping_mobility_pain_02_sudden_after_jump":
      return "toe-touching";
    case "limping_mobility_pain_03_limping_with_wound_confuser":
      return "small cut between the toes";
    default:
      throw new Error(`Unexpected audited case "${caseId}"`);
  }
}

function buildGapRows(): AdapterSelectionGapGuardRow[] {
  const { report, triage } = buildAuditTriage();
  const scenarioMap = new Map(scenarios.map((scenario) => [scenario.caseId, scenario]));
  const caseResultMap = new Map(report.caseResults.map((result) => [result.caseId, result]));
  const triageMap = new Map(
    triage.failedCaseTriage.map((caseTriage) => [caseTriage.caseId, caseTriage])
  );
  const safetyBlockerIds = new Set(
    triage.safetyBlockers.map((caseTriage) => caseTriage.caseId)
  );

  return EXPECTED_GAP_ROWS.map((row) => {
    const scenario = scenarioMap.get(row.caseId);
    const caseResult = caseResultMap.get(row.caseId);
    const caseTriage = triageMap.get(row.caseId);

    if (!scenario || !caseResult || !caseTriage) {
      throw new Error(`Missing audited data for "${row.caseId}"`);
    }

    const classification = determineGapClassification(row.caseId);

    return {
      caseId: row.caseId,
      auditedRedFlagId: determineAuditedRedFlagId(row.caseId),
      expectedComplaintModuleId: scenario.expectedComplaintModuleId,
      actualComplaintModuleId: caseResult.actual.complaintModuleId,
      actualPlannedQuestionId: caseResult.actual.plannedQuestionId,
      selectedBecause: caseResult.actual.selectedBecause,
      ownerPhraseTrigger: determineOwnerPhraseTrigger(row.caseId),
      classification,
      recommendedFixOwner: determineRecommendedFixOwner(classification),
      noSafetyBlocker: !safetyBlockerIds.has(row.caseId),
      noQuestionCardGap: caseTriage.uncoveredByAcceptableCards.length === 0,
    };
  });
}

function countByClassification(
  rows: readonly AdapterSelectionGapGuardRow[]
): Record<GapClassification, number> {
  const counts: Record<GapClassification, number> = {
    missing_module_trigger: 0,
    fixture_text_mismatch: 0,
    adapter_family_mapping_gap: 0,
    acceptable_ambiguity: 0,
  };

  for (const row of rows) {
    counts[row.classification] += 1;
  }

  return counts;
}

describe("shadow eval adapter-selection gap guard", () => {
  it("locks the audited adapter-selection gap cases, reviewed classifications, and fix owners", () => {
    expect(buildGapRows()).toEqual(EXPECTED_GAP_ROWS);
    expect(countByClassification(buildGapRows())).toEqual(
      EXPECTED_CLASSIFICATION_COUNTS
    );
  });

  it("confirms the audited cases have no safety blockers, no question-card gaps, and no family remap drift", () => {
    const rows = buildGapRows();

    expect(
      rows.filter((row) => row.auditedRedFlagId === "persistent_vomiting")
    ).toHaveLength(1);
    expect(
      rows.filter((row) => row.auditedRedFlagId === "non_weight_bearing")
    ).toHaveLength(2);
    expect(rows.every((row) => row.noSafetyBlocker)).toBe(true);
    expect(rows.every((row) => row.noQuestionCardGap)).toBe(true);
    expect(
      rows.every(
        (row) => row.expectedComplaintModuleId === row.actualComplaintModuleId
      )
    ).toBe(true);
    expect(
      rows.every(
        (row) => row.classification !== "adapter_family_mapping_gap"
      )
    ).toBe(true);
  });

  it("keeps the guard doc aligned to the audited cases, report-only scope, and no-blocker findings", () => {
    for (const row of EXPECTED_GAP_ROWS) {
      expect(DOC).toContain(`\`${row.caseId}\``);
      expect(DOC).toContain(`\`${row.auditedRedFlagId}\``);
      expect(DOC).toContain(`\`${row.expectedComplaintModuleId}\``);
      expect(DOC).toContain(`\`${row.actualComplaintModuleId}\``);
      expect(DOC).toContain(`\`${row.ownerPhraseTrigger}\``);
      expect(DOC).toContain(`\`${row.classification}\``);
      expect(DOC).toContain(`\`${row.recommendedFixOwner}\``);
    }

    expect(DOC).toContain(
      "No safety blockers are confirmed for these audited cases."
    );
    expect(DOC).toContain(
      "No question-card gaps are confirmed for these audited cases."
    );
    expect(DOC).toContain("Validation-only guard.");
    expect(DOC).toContain("No runtime files touched.");
    expect(DOC).toContain("`missing_module_trigger`: 2");
    expect(DOC).toContain("`fixture_text_mismatch`: 1");
    expect(DOC).toContain("`adapter_family_mapping_gap`: 0");
    expect(DOC).toContain("`acceptable_ambiguity`: 0");
  });
});
