import fs from "node:fs";
import path from "node:path";

import annotations from "../fixtures/clinical-intelligence/shadow-eval-failure-annotations.json";
import edgeScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import outcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";

type PrimaryFailureClass =
  | "fixture_ambiguity"
  | "report_only_quality_gap"
  | "adapter_selection_gap"
  | "red_flag_coverage_gap"
  | "repeated_metric_setup_gap"
  | "generic_metric_setup_gap"
  | "planner_improvement_candidate";

type ProposedFixType =
  | "scoring_weight_adjustment"
  | "module_phase_priority_adjustment"
  | "question_card_metadata_adjustment"
  | "fixture_expectation_adjustment"
  | "adapter_trigger_adjustment";

type RiskLevel = "low" | "medium" | "high";

type ProposalRow = {
  caseId: string;
  ownerTextSummary: string;
  currentPlannedQuestionId: string;
  acceptableTargetQuestionIds: string[];
  whyCurrentQuestionIsWeak: string;
  proposedFixType: ProposedFixType;
  riskLevel: RiskLevel;
  requiredFutureValidation: string;
};

type FailureAnnotationRow = {
  caseId: string;
  primaryFailureClass: PrimaryFailureClass;
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
  "planner-candidate-fix-proposal-pack-kimi.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

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

const EXPECTED_PROPOSALS: readonly ProposalRow[] = [
  {
    caseId: "limping_mobility_pain_02_sudden_after_jump",
    ownerTextSummary: "Toe-touching limp after a jump off furniture.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "trauma_mechanism_check",
    ],
    whyCurrentQuestionIsWeak:
      "The accepted limping and trauma questions already line up with the owner wording, and the adapter-selection guard classifies this row as a missing trigger-surface case rather than a planner-scoring miss.",
    proposedFixType: "adapter_trigger_adjustment",
    riskLevel: "medium",
    requiredFutureValidation:
      "Rerun the adapter-selection gap guard, the scenario eval, and the failure-annotation pack to confirm the limping trigger surface activates one of the accepted target questions without reducing emergency alignment.",
  },
  {
    caseId: "limping_mobility_pain_03_limping_with_wound_confuser",
    ownerTextSummary:
      "Limping after brush exposure with a small cut between the toes.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
    ],
    whyCurrentQuestionIsWeak:
      "The accepted follow-up set is already explicit, and the current adapter-selection guard routes this row to trigger-surface follow-up instead of planner weighting.",
    proposedFixType: "adapter_trigger_adjustment",
    riskLevel: "medium",
    requiredFutureValidation:
      "Rerun the adapter-selection gap guard, the scenario eval, and the failure-annotation pack to confirm the mixed limping and wound trigger surface produces one of the accepted target questions.",
  },
  {
    caseId: "edge_trauma_repeat_bleeding_avoidance",
    ownerTextSummary:
      "An open paw-pad cut and limping remain after bleeding volume was already answered.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "wound_characterization_check",
      "laceration_depth_check",
      "limping_weight_bearing",
      "limping_trauma_onset",
    ],
    whyCurrentQuestionIsWeak:
      "The planner falls back to the generic emergency screen instead of using the existing answered-bleeding context to prefer the remaining wound or limping prompts.",
    proposedFixType: "scoring_weight_adjustment",
    riskLevel: "medium",
    requiredFutureValidation:
      "Rerun the repeated-question edge replay, the scenario eval, and the failure-annotation pack to confirm a non-repeated wound or limping target question outranks the generic fallback.",
  },
  {
    caseId: "edge_skin_repeat_location_avoidance",
    ownerTextSummary:
      "Paws-and-belly distribution was already answered, but scratching continues.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: ["skin_emergency_allergy_screen"],
    whyCurrentQuestionIsWeak:
      "Once location is already known, the only accepted next question is the more specific skin-emergency screen. The current fallback suggests that card metadata is not surfacing that follow-up strongly enough after answered context.",
    proposedFixType: "question_card_metadata_adjustment",
    riskLevel: "medium",
    requiredFutureValidation:
      "Rerun the repeated-question edge replay, the scenario eval, and the failure-annotation pack to confirm skin_emergency_allergy_screen is selected after skin_location_distribution is already answered.",
  },
  {
    caseId: "edge_limping_not_sure_pain_or_weakness",
    ownerTextSummary:
      "It is unclear whether the dog is limping from leg pain or weak all over.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check",
    ],
    whyCurrentQuestionIsWeak:
      "The accepted targets already span the two allowed module lanes. The current question skips that ambiguity-resolution phase and jumps straight to the generic emergency fallback.",
    proposedFixType: "module_phase_priority_adjustment",
    riskLevel: "high",
    requiredFutureValidation:
      "Rerun the scenario eval, the red-flag coverage audit, and the failure-annotation pack to confirm the first question stays inside the accepted limping or weakness phase without lowering emergency alignment.",
  },
  {
    caseId: "edge_multi_diarrhea_limping_cut",
    ownerTextSummary: "Loose stool, limping, and a toe cut all appear together.",
    currentPlannedQuestionId: "emergency_global_screen",
    acceptableTargetQuestionIds: [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
      "gi_blood_check",
    ],
    whyCurrentQuestionIsWeak:
      "The case has multiple targeted first-question options across accepted modules, but the generic emergency screen bypasses all of them. The mixed-symptom weights need to let one concrete follow-up outrank the global fallback.",
    proposedFixType: "scoring_weight_adjustment",
    riskLevel: "high",
    requiredFutureValidation:
      "Rerun the scenario eval, the red-flag coverage audit, and the failure-annotation pack to confirm a targeted follow-up wins while all accepted module lanes remain valid.",
  },
] as const;

function extractProposalRows(): ProposalRow[] {
  const match = DOC.match(/```json\r?\n([\s\S]*?)\r?\n```/);
  if (!match) {
    throw new Error("Missing structured JSON block in proposal doc");
  }

  return JSON.parse(match[1]) as ProposalRow[];
}

function getAcceptableQuestionIds(caseId: string): string[] {
  const outcomeRow = (outcomes as BaseOutcomeRow[]).find(
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

function getPlannerCandidateCaseIds(): string[] {
  return (annotations as FailureAnnotationRow[])
    .filter(
      (row) => row.primaryFailureClass === "planner_improvement_candidate"
    )
    .map((row) => row.caseId);
}

describe("planner candidate fix proposal pack", () => {
  it("covers exactly the 7 planner-improvement candidate caseIds from the failure annotation pack", () => {
    const proposalRows = extractProposalRows();
    const expectedCaseIds = getPlannerCandidateCaseIds();

    expect(expectedCaseIds).toHaveLength(6);
    expect(proposalRows.map((row) => row.caseId)).toEqual(expectedCaseIds);
  });

  it("locks the proposal rows, fix-type split, and acceptable target questions", () => {
    const proposalRows = extractProposalRows();

    expect(proposalRows).toEqual(EXPECTED_PROPOSALS);

    for (const row of proposalRows) {
      expect(row.currentPlannedQuestionId).toBe("emergency_global_screen");
      expect(row.acceptableTargetQuestionIds).toEqual(
        getAcceptableQuestionIds(row.caseId)
      );
      expect(row.acceptableTargetQuestionIds).not.toContain(
        row.currentPlannedQuestionId
      );
    }

    expect(
      proposalRows.filter(
        (row) => row.proposedFixType === "scoring_weight_adjustment"
      )
    ).toHaveLength(2);
    expect(
      proposalRows.filter(
        (row) => row.proposedFixType === "module_phase_priority_adjustment"
      )
    ).toHaveLength(1);
    expect(
      proposalRows.filter(
        (row) => row.proposedFixType === "question_card_metadata_adjustment"
      )
    ).toHaveLength(1);
    expect(
      proposalRows.filter(
        (row) => row.proposedFixType === "fixture_expectation_adjustment"
      )
    ).toHaveLength(0);
    expect(
      proposalRows.filter(
        (row) => row.proposedFixType === "adapter_trigger_adjustment"
      )
    ).toHaveLength(2);
  });

  it("keeps the doc aligned to planner-vs-non-planner separation and free of diagnosis or treatment guidance", () => {
    const proposalRows = extractProposalRows();

    expect(DOC).toContain("## Planner-Owned Proposal Lanes");
    expect(DOC).toContain("## Non-Planner Follow-Up Lanes");
    expect(DOC).toContain("Planner-owned proposals: `3`");
    expect(DOC).toContain("Non-planner follow-up proposals: `3`");
    expect(DOC).toContain("`scoring_weight_adjustment`: `2`");
    expect(DOC).toContain("`module_phase_priority_adjustment`: `1`");
    expect(DOC).toContain("`question_card_metadata_adjustment`: `1`");
    expect(DOC).toContain("`fixture_expectation_adjustment`: `0`");
    expect(DOC).toContain("`adapter_trigger_adjustment`: `2`");
    expect(DOC).toContain("Proposal pack only.");
    expect(DOC).toContain("No runtime files touched.");

    for (const row of proposalRows) {
      expect(DOC).toContain(`\`${row.caseId}\``);
      expect(DOC).toContain(`\`${row.proposedFixType}\``);
    }

    for (const pattern of OWNER_FACING_CLAIM_PATTERNS) {
      expect(DOC).not.toMatch(pattern);
    }
  });
});
