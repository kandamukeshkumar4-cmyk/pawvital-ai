import fs from "node:fs";
import path from "node:path";

import edgeCaseScenarios from "../fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json";
import expectedOutcomes from "../fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json";
import scenarios from "../fixtures/clinical-intelligence/shadow-planner-scenarios.json";

import { evaluateShadowPlannerScenarios } from "@/lib/clinical-intelligence/shadow-planner-scenario-eval";
import { triageShadowPlannerEvalFailures } from "@/lib/clinical-intelligence/shadow-planner-eval-triage";

type AuditClassification =
  | "fixture_expectation_gap"
  | "registered_question_card_gap"
  | "adapter_selection_gap"
  | "acceptable_report_only_gap";

type AuditRow = {
  redFlagId: string;
  totalCases: number;
  dominantClassification: AuditClassification;
  classificationCounts: Record<AuditClassification, number>;
};

const DOC_PATH = path.join(
  process.cwd(),
  "docs",
  "clinical-intelligence",
  "shadow-eval-red-flag-coverage-audit-qwen.md"
);
const DOC = fs.readFileSync(DOC_PATH, "utf8");

const TARGET_RED_FLAGS = [
  "persistent_vomiting",
  "acute_weakness",
  "heatstroke_signs",
  "gastric_dilatation_volvulus",
  "large_blood_volume",
  "non_weight_bearing",
  "suspected_toxin",
  "urinary_obstruction",
] as const;
const TARGET_RED_FLAG_SET = new Set<string>(TARGET_RED_FLAGS);

const CATEGORY_PRIORITY: readonly AuditClassification[] = [
  "registered_question_card_gap",
  "fixture_expectation_gap",
  "adapter_selection_gap",
  "acceptable_report_only_gap",
];

const EXPECTED_AUDIT_ROWS: readonly AuditRow[] = [
  {
    redFlagId: "persistent_vomiting",
    totalCases: 8,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 1,
      acceptable_report_only_gap: 7,
    },
  },
  {
    redFlagId: "acute_weakness",
    totalCases: 5,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 5,
    },
  },
  {
    redFlagId: "heatstroke_signs",
    totalCases: 4,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 1,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 3,
    },
  },
  {
    redFlagId: "gastric_dilatation_volvulus",
    totalCases: 3,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 3,
    },
  },
  {
    redFlagId: "large_blood_volume",
    totalCases: 3,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 3,
    },
  },
  {
    redFlagId: "non_weight_bearing",
    totalCases: 3,
    dominantClassification: "adapter_selection_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 2,
      acceptable_report_only_gap: 1,
    },
  },
  {
    redFlagId: "suspected_toxin",
    totalCases: 3,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 3,
    },
  },
  {
    redFlagId: "urinary_obstruction",
    totalCases: 3,
    dominantClassification: "acceptable_report_only_gap",
    classificationCounts: {
      fixture_expectation_gap: 0,
      registered_question_card_gap: 0,
      adapter_selection_gap: 0,
      acceptable_report_only_gap: 3,
    },
  },
] as const;

function createEmptyCounts(): Record<AuditClassification, number> {
  return {
    fixture_expectation_gap: 0,
    registered_question_card_gap: 0,
    adapter_selection_gap: 0,
    acceptable_report_only_gap: 0,
  };
}

function determineCaseClassification(
  caseTriage: ReturnType<typeof triageShadowPlannerEvalFailures>["failedCaseTriage"][number],
  redFlagId: string
): AuditClassification {
  if (caseTriage.uncoveredByAcceptableCards.includes(redFlagId)) {
    return "registered_question_card_gap";
  }

  if (caseTriage.classifications.includes("fixture_expectation_mismatch")) {
    return "fixture_expectation_gap";
  }

  if (caseTriage.classifications.includes("off_topic_question_selected")) {
    return "adapter_selection_gap";
  }

  return "acceptable_report_only_gap";
}

function determineDominantClassification(
  counts: Record<AuditClassification, number>
): AuditClassification {
  return [...CATEGORY_PRIORITY].sort((left, right) => {
    if (counts[right] !== counts[left]) {
      return counts[right] - counts[left];
    }

    return CATEGORY_PRIORITY.indexOf(left) - CATEGORY_PRIORITY.indexOf(right);
  })[0];
}

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

function getAuditedSafetyBlockers(
  triage: ReturnType<typeof triageShadowPlannerEvalFailures>
) {
  return triage.safetyBlockers.filter((caseTriage) =>
    caseTriage.missingRequiredRedFlags.some((redFlagId) =>
      TARGET_RED_FLAG_SET.has(redFlagId)
    )
  );
}

function buildAuditRows(): AuditRow[] {
  const { triage } = buildAuditTriage();

  return TARGET_RED_FLAGS.map((redFlagId) => {
    const affectedCases = triage.failedCaseTriage.filter((caseTriage) =>
      caseTriage.missingRequiredRedFlags.includes(redFlagId)
    );
    const classificationCounts = createEmptyCounts();

    for (const caseTriage of affectedCases) {
      classificationCounts[
        determineCaseClassification(caseTriage, redFlagId)
      ] += 1;
    }

    return {
      redFlagId,
      totalCases: affectedCases.length,
      dominantClassification: determineDominantClassification(
        classificationCounts
      ),
      classificationCounts,
    };
  });
}

describe("shadow eval red-flag coverage audit", () => {
  it("classifies the VET-1447C top under-screened red flags into the required audit buckets", () => {
    expect(buildAuditRows()).toEqual(EXPECTED_AUDIT_ROWS);
  });

  it("confirms the target red flags do not introduce safety blockers or question-card coverage blockers", () => {
    const { triage } = buildAuditTriage();

    expect(getAuditedSafetyBlockers(triage)).toHaveLength(0);
    expect(
      buildAuditRows().every(
        (row) => row.classificationCounts.registered_question_card_gap === 0
      )
    ).toBe(true);
  });

  it("keeps emergency alignment at 100 percent in the current scenario eval", () => {
    const report = evaluateShadowPlannerScenarios({
      scenarios,
      expectedOutcomes,
    });

    expect(report.summary.emergencyScreenAlignmentRelevantCases).toBe(23);
    expect(report.summary.emergencyScreenAlignmentCount).toBe(23);
    expect(report.summary.emergencyScreenAlignmentRate).toBe(1);
  });

  it("locks the audit doc to the reviewed red flags, classifications, and no-runtime scope", () => {
    for (const redFlagId of TARGET_RED_FLAGS) {
      expect(DOC).toContain(`\`${redFlagId}\``);
    }

    for (const classification of CATEGORY_PRIORITY) {
      expect(DOC).toContain(`\`${classification}\``);
    }

    expect(DOC).toContain(
      "No safety blockers are introduced within the audited red-flag cases."
    );
    expect(DOC).toContain("Emergency alignment remains 100% in the current eval.");
    expect(DOC).toContain("Validation-only audit.");
    expect(DOC).toContain("No runtime files touched.");
  });
});
