import fs from "node:fs";
import path from "node:path";

import edgeScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";

type RecommendedFixOwner =
  | "fixture"
  | "adapter_trigger"
  | "planner_scoring"
  | "module_phase_priority"
  | "question_card_metadata";

type RegressionRisk = "low" | "medium" | "high";

type SliceTwoProposalRow = {
  caseId: string;
  selectedComplaintModule: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  recommendedFixOwner: RecommendedFixOwner;
  lowestRiskRationale: string;
  minimalFileScope: string[];
  expectedMetricMovement: string[];
  regressionRisk: RegressionRisk;
  requiredValidationCommands: string[];
};

type PriorProposalFixType =
  | "scoring_weight_adjustment"
  | "module_phase_priority_adjustment"
  | "question_card_metadata_adjustment"
  | "fixture_expectation_adjustment"
  | "adapter_trigger_adjustment";

type PriorProposalRow = {
  caseId: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  proposedFixType: PriorProposalFixType;
  riskLevel: RegressionRisk;
};

type BaseOutcomeRow = {
  caseId: string;
  acceptablePlannedQuestionIds: string[];
};

type EdgeScenarioRow = {
  caseId: string;
  acceptablePlannedQuestionIds: string[];
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-slice-2-proposal-kimi.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const PRIOR_DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "planner-candidate-fix-proposal-pack-kimi.md"
);
const PRIOR_DOC = fs.readFileSync(PRIOR_DOC_PATH, "utf8");

const OWNER_FACING_CLAIM_PATTERNS = [
  /\bdiagnos(?:e|is|ed|ing)\b/i,
  /\btreat(?:ment|ed|ing|s)?\b/i,
  /\bcure(?:d|s)?\b/i,
  /\bprescri(?:be|bed|ption)\b/i,
  /\bantibiotic\b/i,
  /\bsteroid\b/i,
  /\bsurgery\b/i,
  /\bdos(?:e|age)\b/i,
];

const EXPECTED_CASE_IDS = [
  "gi_vomiting_diarrhea_03_water_comes_back_up",
  "skin_itching_allergy_02_paws_belly_itching",
  "limping_mobility_pain_02_sudden_after_jump",
  "limping_mobility_pain_03_limping_with_wound_confuser",
  "edge_trauma_small_scrape_vs_steady_bleed",
  "edge_limping_not_sure_pain_or_weakness",
  "edge_multi_diarrhea_limping_cut",
] as const;

const EXCLUDED_REPEATED_CONTEXT_CASE_IDS = [
  "edge_trauma_repeat_bleeding_avoidance",
  "edge_skin_repeat_location_avoidance",
] as const;

const EXPECTED_OWNER_COUNTS: Record<RecommendedFixOwner, number> = {
  fixture: 1,
  adapter_trigger: 2,
  planner_scoring: 2,
  module_phase_priority: 2,
  question_card_metadata: 0,
};

const ALLOWED_VALIDATION_COMMANDS = new Set([
  "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
  "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
  "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
  "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
  "node scripts/eval-shadow-planner-scenarios.ts --json",
  "npm run build",
]);

const EXPECTED_SLICE_TWO_PROPOSALS: readonly SliceTwoProposalRow[] = [
  {
    caseId: "gi_vomiting_diarrhea_03_water_comes_back_up",
    selectedComplaintModule: "gi_vomiting_diarrhea",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "gi_keep_water_down_check",
      "gi_vomiting_frequency",
      "gi_blood_check",
    ],
    recommendedFixOwner: "fixture",
    lowestRiskRationale:
      "The adapter-selection gap guard already classifies this row as `fixture_text_mismatch`, so the narrowest first move is to reconcile the accepted fixture text before changing runtime scoring or trigger behavior.",
    minimalFileScope: [
      "tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json",
      "tests/fixtures/clinical-intelligence/shadow-eval-failure-annotations.json",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: may improve if the accepted target set is reconciled to the audited owner phrase.",
      "complaintModuleMatchRate: should stay unchanged because the selected complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because this proposal does not rely on downgrading emergency behavior.",
      "genericQuestionAvoidanceRate: no direct runtime movement is expected from the fixture-only follow-up.",
    ],
    regressionRisk: "low",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "skin_itching_allergy_02_paws_belly_itching",
    selectedComplaintModule: "skin_itching_allergy",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "skin_location_distribution",
      "skin_changes_check",
      "skin_exposure_check",
    ],
    recommendedFixOwner: "module_phase_priority",
    lowestRiskRationale:
      "The complaint module already matches, the accepted skin cards already exist, and this row does not need repeated-answer carryover. The narrowest next move is to raise the skin characterization phase ahead of the generic fallback.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/next-question-planner.ts",
      "src/lib/clinical-intelligence/complaint-modules/skin.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if a skin-specific first-turn question replaces emergency_global_screen.",
      "genericQuestionAvoidanceRate: should improve because this row currently over-selects the generic fallback.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because this row is not proposing a weaker emergency path.",
    ],
    regressionRisk: "medium",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "limping_mobility_pain_02_sudden_after_jump",
    selectedComplaintModule: "limping_mobility_pain",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "trauma_mechanism_check",
    ],
    recommendedFixOwner: "adapter_trigger",
    lowestRiskRationale:
      "The adapter-selection gap guard already classifies this row as `missing_module_trigger`, so the lowest-risk first move is to strengthen the limping trigger surface instead of rewriting planner weights.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if the limping trigger surface routes this row to an accepted target question.",
      "genericQuestionAvoidanceRate: should improve if emergency_global_screen stops winning first turn.",
      "redFlagScreenCoverageRate: may improve if the selected limping-specific question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because the fix owner is trigger-surface narrowing, not emergency downgrading.",
    ],
    regressionRisk: "medium",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
    selectedComplaintModule: "limping_mobility_pain",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
    ],
    recommendedFixOwner: "adapter_trigger",
    lowestRiskRationale:
      "The adapter-selection gap guard already routes this row to the trigger-surface lane, so the next move should tighten how mixed limping-plus-wound phrasing activates accepted questions rather than broaden planner scoring.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if mixed limping and wound wording routes this row to an accepted target question.",
      "genericQuestionAvoidanceRate: should improve if emergency_global_screen stops winning first turn.",
      "redFlagScreenCoverageRate: may improve if the chosen limping or wound follow-up carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because the trigger fix should not weaken emergency handling.",
    ],
    regressionRisk: "medium",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "edge_trauma_small_scrape_vs_steady_bleed",
    selectedComplaintModule: "trauma_bleeding_wound",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "bleeding_volume_check",
      "wound_characterization_check",
      "laceration_depth_check",
      "trauma_mechanism_check",
    ],
    recommendedFixOwner: "planner_scoring",
    lowestRiskRationale:
      "The accepted trauma questions already exist and the module match is already correct, so the narrowest runtime move is to rebalance scoring until a bleeding or wound card outranks the generic fallback.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/next-question-planner.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if a trauma-specific first-turn question replaces emergency_global_screen.",
      "genericQuestionAvoidanceRate: should improve because this row currently over-selects the generic fallback.",
      "redFlagScreenCoverageRate: may improve if bleeding-specific screening outranks the blanket fallback.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because the scoring fix should not weaken emergency behavior.",
    ],
    regressionRisk: "medium",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "edge_limping_not_sure_pain_or_weakness",
    selectedComplaintModule: "collapse_weakness",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check",
    ],
    recommendedFixOwner: "module_phase_priority",
    lowestRiskRationale:
      "The accepted target set already permits both limping and collapse/weakness lanes. The lowest-risk next move is to prefer that ambiguity-resolution phase before the generic fallback rather than add new triggers or rewrite fixtures.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/next-question-planner.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts",
      "src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if the first turn stays inside an accepted limping or weakness lane.",
      "genericQuestionAvoidanceRate: should improve if emergency_global_screen stops winning first turn.",
      "redFlagScreenCoverageRate: may improve if the ambiguity-resolving question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the current module is already inside the accepted module set.",
      "emergencyScreenAlignmentRate: should stay unchanged because the proposal does not relax emergency routing.",
    ],
    regressionRisk: "high",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
  {
    caseId: "edge_multi_diarrhea_limping_cut",
    selectedComplaintModule: "gi_vomiting_diarrhea",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
      "gi_blood_check",
    ],
    recommendedFixOwner: "planner_scoring",
    lowestRiskRationale:
      "The accepted question set already spans GI, limping, and wound lanes, so the narrowest runtime move is to rebalance multi-signal scoring rather than add triggers or rewrite fixtures.",
    minimalFileScope: [
      "src/lib/clinical-intelligence/next-question-planner.ts",
    ],
    expectedMetricMovement: [
      "acceptableQuestionRate: should improve if a targeted mixed-symptom follow-up replaces emergency_global_screen.",
      "genericQuestionAvoidanceRate: should improve because this row currently over-selects the generic fallback.",
      "redFlagScreenCoverageRate: may improve if a targeted GI, wound, or limping question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the current module is already inside the accepted module set.",
      "emergencyScreenAlignmentRate: should stay unchanged because the scoring fix should not lower emergency behavior.",
    ],
    regressionRisk: "high",
    requiredValidationCommands: [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build",
    ],
  },
] as const;

function extractJsonBlock<T>(doc: string): T {
  const match = doc.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block");
  }

  return JSON.parse(match[1]) as T;
}

function getAcceptableQuestionIds(caseId: string): string[] {
  const outcomeRow = (expectedOutcomes as BaseOutcomeRow[]).find(
    (row) => row.caseId === caseId
  );
  if (outcomeRow) {
    return outcomeRow.acceptablePlannedQuestionIds;
  }

  const edgeRow = (edgeScenarios as EdgeScenarioRow[]).find(
    (row) => row.caseId === caseId
  );
  if (edgeRow) {
    return edgeRow.acceptablePlannedQuestionIds;
  }

  throw new Error(`Missing source fixture row for ${caseId}`);
}

function mapPriorFixTypeToOwner(
  fixType: PriorProposalFixType
): RecommendedFixOwner {
  switch (fixType) {
    case "fixture_expectation_adjustment":
      return "fixture";
    case "adapter_trigger_adjustment":
      return "adapter_trigger";
    case "scoring_weight_adjustment":
      return "planner_scoring";
    case "module_phase_priority_adjustment":
      return "module_phase_priority";
    case "question_card_metadata_adjustment":
      return "question_card_metadata";
    default:
      throw new Error(`Unexpected prior fix type "${fixType}"`);
  }
}

function countByOwner(
  rows: readonly SliceTwoProposalRow[]
): Record<RecommendedFixOwner, number> {
  const counts: Record<RecommendedFixOwner, number> = {
    fixture: 0,
    adapter_trigger: 0,
    planner_scoring: 0,
    module_phase_priority: 0,
    question_card_metadata: 0,
  };

  for (const row of rows) {
    counts[row.recommendedFixOwner] += 1;
  }

  return counts;
}

describe("planner candidate fix slice 2 proposal pack", () => {
  it("covers exactly the requested seven VET-1458K candidates and excludes the repeated-context rows", () => {
    const proposalRows = extractJsonBlock<SliceTwoProposalRow[]>(DOC);
    const priorRows = extractJsonBlock<PriorProposalRow[]>(PRIOR_DOC);
    const priorSubsetCaseIds = priorRows
      .map((row) => row.caseId)
      .filter(
        (caseId) =>
          !EXCLUDED_REPEATED_CONTEXT_CASE_IDS.includes(
            caseId as (typeof EXCLUDED_REPEATED_CONTEXT_CASE_IDS)[number]
          )
      );

    expect(proposalRows.map((row) => row.caseId)).toEqual(EXPECTED_CASE_IDS);
    expect(priorSubsetCaseIds).toEqual(EXPECTED_CASE_IDS);

    for (const excludedCaseId of EXCLUDED_REPEATED_CONTEXT_CASE_IDS) {
      expect(proposalRows.map((row) => row.caseId)).not.toContain(excludedCaseId);
    }
  });

  it("locks the slice-2 owner split, minimal file scope, metric movement, and validation commands", () => {
    const proposalRows = extractJsonBlock<SliceTwoProposalRow[]>(DOC);

    expect(proposalRows).toEqual(EXPECTED_SLICE_TWO_PROPOSALS);
    expect(countByOwner(proposalRows)).toEqual(EXPECTED_OWNER_COUNTS);

    for (const row of proposalRows) {
      expect(row.currentPlannedQuestionId).toBe("emergency_global_screen");
      expect(row.acceptableTargetQuestionIds).toEqual(
        getAcceptableQuestionIds(row.caseId)
      );

      for (const relativePath of row.minimalFileScope) {
        expect(
          fs.existsSync(path.join(process.cwd(), relativePath))
        ).toBe(true);
      }

      for (const command of row.requiredValidationCommands) {
        expect(ALLOWED_VALIDATION_COMMANDS.has(command)).toBe(true);
      }

      expect(row.requiredValidationCommands).toContain("npm run build");
      expect(row.expectedMetricMovement.join(" ")).toContain(
        "emergencyScreenAlignmentRate: should stay unchanged"
      );
    }
  });

  it("stays aligned with the prior VET-1458K proposal pack and keeps the doc in proposal-only scope", () => {
    const proposalRows = extractJsonBlock<SliceTwoProposalRow[]>(DOC);
    const priorRows = extractJsonBlock<PriorProposalRow[]>(PRIOR_DOC);
    const priorRowMap = new Map(priorRows.map((row) => [row.caseId, row]));

    for (const row of proposalRows) {
      const priorRow = priorRowMap.get(row.caseId);

      if (!priorRow) {
        throw new Error(`Missing prior proposal row for ${row.caseId}`);
      }

      expect(row.recommendedFixOwner).toBe(
        mapPriorFixTypeToOwner(priorRow.proposedFixType)
      );
      expect(row.regressionRisk).toBe(priorRow.riskLevel);
      expect(row.acceptableTargetQuestionIds).toEqual(
        priorRow.acceptableTargetQuestionIds
      );
      expect(DOC).toContain(`\`${row.caseId}\``);
      expect(DOC).toContain(`\`${row.recommendedFixOwner}\``);
      expect(DOC).toContain(`\`${row.regressionRisk}\``);
    }

    expect(DOC).toContain("included candidate rows: `7`");
    expect(DOC).toContain("excluded repeated-context rows: `2`");
    expect(DOC).toContain("`fixture`: `1`");
    expect(DOC).toContain("`adapter_trigger`: `2`");
    expect(DOC).toContain("`planner_scoring`: `2`");
    expect(DOC).toContain("`module_phase_priority`: `2`");
    expect(DOC).toContain("`question_card_metadata`: `0`");
    expect(DOC).toContain("Proposal pack only.");
    expect(DOC).toContain("No runtime files touched.");

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(DOC).not.toMatch(pattern);
    }
  });
});
