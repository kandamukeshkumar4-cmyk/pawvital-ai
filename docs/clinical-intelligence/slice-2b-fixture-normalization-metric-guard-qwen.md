# Slice 2B Fixture Normalization Metric Guard (VET-1470Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/slice-2b-fixture-normalization-metric-guard.test.ts`
- `docs/clinical-intelligence/slice-2b-fixture-normalization-metric-guard-qwen.md`

No runtime files touched.

It does not change planner behavior, eval behavior, fixtures, routing, UI, env,
infra, or workflow behavior.

## Purpose

VET-1469C normalized `gi_vomiting_diarrhea_03_water_comes_back_up` from
`planner_improvement_candidate` to `report_only_quality_gap` by accepting the
global emergency screen as a valid first move for this fixture-ambiguous case.

This guard freezes the exact post-VET-1469C normalized baseline so future
planner work cannot regress the normalization gains or hide regressions under
a larger claim.

This guard does not approve a runtime fix. It only records the reviewed
baseline and the current non-regression metrics.

## Normalized Case

| Field | Value |
| --- | --- |
| Case ID | `gi_vomiting_diarrhea_03_water_comes_back_up` |
| Previous primary class | `planner_improvement_candidate` |
| Current primary class | `report_only_quality_gap` |
| Generic question scoring | `exclude_for_now` |
| Red-flag coverage expectation | `partial` |
| Emergency alignment disposition | `alignment_only_ok` |

The normalization is justified because the global emergency screen is already
an accepted first move for this fixture-ambiguous case. Generic-question
scoring is excluded because the emergency screen is valid. Red-flag coverage
is partial because the global emergency screen already captures the required
urgent branch.

## Global Guardrails

- `total cases`: `57`
- `planner candidates`: `6`
- `safety blockers`: `0`
- `emergency alignment`: `40/40`
- `repeated avoidance`: `6/6`
- `generic avoidance`: `4/10`
- `normalized acceptable`: `52/57`
- Slice 2A locked wins: `4` (no regression)
- Report-only rows reclassified as safety blockers: `0`

The normalization moved exactly one row out of the planner improvement
candidate bucket and into the report-only quality gap bucket. Emergency
alignment, repeated avoidance, and Slice 2A wins all remain intact. No
report-only row is mislabeled as a safety blocker.

## Structured Guard Data

```json
{
  "normalizedCase": {
    "caseId": "gi_vomiting_diarrhea_03_water_comes_back_up",
    "previousPrimaryFailureClass": "planner_improvement_candidate",
    "currentPrimaryFailureClass": "report_only_quality_gap",
    "genericQuestionScoring": "exclude_for_now",
    "redFlagCoverageExpectation": "partial",
    "emergencyAlignmentDisposition": "alignment_only_ok"
  },
  "globalGuardrails": {
    "totalCases": 57,
    "plannerCandidateCount": 6,
    "safetyBlockerCount": 0,
    "emergencyScreenAlignmentCount": 40,
    "emergencyScreenAlignmentRelevantCases": 40,
    "emergencyScreenAlignmentRate": 1,
    "repeatedQuestionEligibleCases": 6,
    "repeatedQuestionAvoidanceCount": 6,
    "repeatedQuestionAvoidanceRate": 1,
    "genericQuestionEligibleCases": 10,
    "genericQuestionAvoidanceCount": 4,
    "genericQuestionAvoidanceRate": 0.4,
    "normalizedAcceptableQuestionCount": 52,
    "normalizedAcceptableQuestionRate": 0.9122807017543859,
    "slice2ALockedWinCaseIds": [
      "skin_itching_allergy_02_paws_belly_itching",
      "limping_mobility_pain_02_sudden_after_jump",
      "limping_mobility_pain_03_limping_with_wound_confuser",
      "edge_trauma_small_scrape_vs_steady_bleed"
    ],
    "reportOnlyRowsReclassifiedAsSafetyBlockers": []
  },
  "requiredValidationCommands": [
    "npm test -- --runTestsByPath tests/clinical-intelligence/slice-2b-fixture-normalization-metric-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/post-slice-2a-shadow-eval-baseline-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/planner-candidate-fix-slice-2a-guard.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
    "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
    "node scripts/eval-shadow-planner-scenarios.ts --json",
    "npm run build"
  ]
}
```

## Notes

- Validation-only guard.
- No runtime files touched.
