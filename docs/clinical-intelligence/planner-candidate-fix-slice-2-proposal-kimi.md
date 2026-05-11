# Planner Candidate Fix Slice 2 Proposal Pack (VET-1461K)

## Scope

Proposal pack only.

This ticket adds only:

- `docs/clinical-intelligence/planner-candidate-fix-slice-2-proposal-kimi.md`
- `tests/clinical-intelligence/planner-candidate-fix-slice-2-proposal-pack.test.ts`

No runtime files touched.

It does not change planner behavior, adapter behavior, question cards,
fixtures, routing, UI, env, infra, or workflows.

## Purpose

VET-1458K originally proposed follow-up owners for `7` candidate rows. This
slice narrows that pack to the next `5` implementation-ready rows that do not
need a repeated-context first move.

The goal is to keep the next runtime tickets split by the lowest-risk fix owner
instead of stacking unrelated planner, adapter, and fixture work together.

## Slice Boundary

- included candidate rows: `5`
- excluded repeated-context rows: `2`
- `edge_trauma_repeat_bleeding_avoidance`
- `edge_skin_repeat_location_avoidance`

VET-1469C normalized `gi_vomiting_diarrhea_03_water_comes_back_up` as
fixture-only outcome debt; this historical proposal keeps that row documented
as the completed fixture-owned lane.

## Owner Split

- `fixture`: `1`
- `adapter_trigger`: `2`
- `planner_scoring`: `1`
- `module_phase_priority`: `1`
- `question_card_metadata`: `0`

## Summary Table

| Case ID | Recommended fix owner | Minimal file scope | Regression risk |
| --- | --- | --- | --- |
| `gi_vomiting_diarrhea_03_water_comes_back_up` | `fixture` | `tests/fixtures/clinical-intelligence/shadow-planner-scenarios.json`, `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json`, `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json`, `tests/fixtures/clinical-intelligence/shadow-eval-failure-annotations.json` | `low` |
| `limping_mobility_pain_02_sudden_after_jump` | `adapter_trigger` | `src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts`, `src/lib/clinical-intelligence/complaint-modules/limping.ts` | `medium` |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `adapter_trigger` | `src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts`, `src/lib/clinical-intelligence/complaint-modules/limping.ts` | `medium` |
| `edge_limping_not_sure_pain_or_weakness` | `module_phase_priority` | `src/lib/clinical-intelligence/next-question-planner.ts`, `src/lib/clinical-intelligence/complaint-modules/limping.ts`, `src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts` | `high` |
| `edge_multi_diarrhea_limping_cut` | `planner_scoring` | `src/lib/clinical-intelligence/next-question-planner.ts` | `high` |

Detailed acceptable target questions, expected metric movement, and required
validation commands are locked in the structured proposal block below.

## Structured Proposal Data

```json
[
  {
    "caseId": "gi_vomiting_diarrhea_03_water_comes_back_up",
    "selectedComplaintModule": "gi_vomiting_diarrhea",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "gi_keep_water_down_check",
      "gi_vomiting_frequency",
      "gi_blood_check",
      "emergency_global_screen"
    ],
    "recommendedFixOwner": "fixture",
    "lowestRiskRationale": "VET-1469C normalized this as fixture-only outcome debt by accepting the current emergency screen before the remaining GI-specific discriminator.",
    "minimalFileScope": [
      "tests/fixtures/clinical-intelligence/shadow-planner-scenarios.json",
      "tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json",
      "tests/fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json",
      "tests/fixtures/clinical-intelligence/shadow-eval-failure-annotations.json"
    ],
    "expectedMetricMovement": [
      "acceptableQuestionRate: improves because the accepted target set now includes the audited emergency screen first move.",
      "complaintModuleMatchRate: stays unchanged because the selected complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because this normalization does not downgrade emergency behavior.",
      "genericQuestionAvoidanceRate: denominator narrows because the fixture-only row is excluded from generic scoring."
    ],
    "regressionRisk": "low",
    "requiredValidationCommands": [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build"
    ]
  },
  {
    "caseId": "limping_mobility_pain_02_sudden_after_jump",
    "selectedComplaintModule": "limping_mobility_pain",
    "currentPlannedQuestionId": "limping_weight_bearing",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "trauma_mechanism_check"
    ],
    "recommendedFixOwner": "adapter_trigger",
    "lowestRiskRationale": "The adapter-selection gap guard already classifies this row as `missing_module_trigger`, so the lowest-risk first move is to strengthen the limping trigger surface instead of rewriting planner weights.",
    "minimalFileScope": [
      "src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts"
    ],
    "expectedMetricMovement": [
      "acceptableQuestionRate: should stay unchanged because the current first turn already lands inside the accepted target set.",
      "genericQuestionAvoidanceRate: should stay unchanged because this row no longer selects emergency_global_screen.",
      "redFlagScreenCoverageRate: may improve if the selected limping-specific question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because the fix owner is trigger-surface narrowing, not emergency downgrading."
    ],
    "regressionRisk": "medium",
    "requiredValidationCommands": [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build"
    ]
  },
  {
    "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
    "selectedComplaintModule": "limping_mobility_pain",
    "currentPlannedQuestionId": "bleeding_volume_check",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check"
    ],
    "recommendedFixOwner": "adapter_trigger",
    "lowestRiskRationale": "The adapter-selection gap guard already routes this row to the trigger-surface lane, so the next move should tighten how mixed limping-plus-wound phrasing activates accepted questions rather than broaden planner scoring.",
    "minimalFileScope": [
      "src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts"
    ],
    "expectedMetricMovement": [
      "acceptableQuestionRate: should stay unchanged because the current first turn already lands inside the accepted target set.",
      "genericQuestionAvoidanceRate: should stay unchanged because this row no longer selects emergency_global_screen.",
      "redFlagScreenCoverageRate: may improve if the chosen limping or wound follow-up carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the complaint module already matches.",
      "emergencyScreenAlignmentRate: should stay unchanged because the trigger fix should not weaken emergency handling."
    ],
    "regressionRisk": "medium",
    "requiredValidationCommands": [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-adapter-selection-gap-guard.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build"
    ]
  },
  {
    "caseId": "edge_limping_not_sure_pain_or_weakness",
    "selectedComplaintModule": "collapse_weakness",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check"
    ],
    "recommendedFixOwner": "module_phase_priority",
    "lowestRiskRationale": "The accepted target set already permits both limping and collapse/weakness lanes. The lowest-risk next move is to prefer that ambiguity-resolution phase before the generic fallback rather than add new triggers or rewrite fixtures.",
    "minimalFileScope": [
      "src/lib/clinical-intelligence/next-question-planner.ts",
      "src/lib/clinical-intelligence/complaint-modules/limping.ts",
      "src/lib/clinical-intelligence/complaint-modules/collapse-weakness.ts"
    ],
    "expectedMetricMovement": [
      "acceptableQuestionRate: should improve if the first turn stays inside an accepted limping or weakness lane.",
      "genericQuestionAvoidanceRate: should improve if emergency_global_screen stops winning first turn.",
      "redFlagScreenCoverageRate: may improve if the ambiguity-resolving question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the current module is already inside the accepted module set.",
      "emergencyScreenAlignmentRate: should stay unchanged because the proposal does not relax emergency routing."
    ],
    "regressionRisk": "high",
    "requiredValidationCommands": [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build"
    ]
  },
  {
    "caseId": "edge_multi_diarrhea_limping_cut",
    "selectedComplaintModule": "gi_vomiting_diarrhea",
    "currentPlannedQuestionId": "emergency_global_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "limping_trauma_onset",
      "wound_characterization_check",
      "bleeding_volume_check",
      "gi_blood_check"
    ],
    "recommendedFixOwner": "planner_scoring",
    "lowestRiskRationale": "The accepted question set already spans GI, limping, and wound lanes, so the narrowest runtime move is to rebalance multi-signal scoring rather than add triggers or rewrite fixtures.",
    "minimalFileScope": [
      "src/lib/clinical-intelligence/next-question-planner.ts"
    ],
    "expectedMetricMovement": [
      "acceptableQuestionRate: should improve if a targeted mixed-symptom follow-up replaces emergency_global_screen.",
      "genericQuestionAvoidanceRate: should improve because this row currently over-selects the generic fallback.",
      "redFlagScreenCoverageRate: may improve if a targeted GI, wound, or limping question carries the missing case red-flag screens.",
      "complaintModuleMatchRate: should stay unchanged because the current module is already inside the accepted module set.",
      "emergencyScreenAlignmentRate: should stay unchanged because the scoring fix should not lower emergency behavior."
    ],
    "regressionRisk": "high",
    "requiredValidationCommands": [
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-red-flag-coverage-audit.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts",
      "npm test -- --runTestsByPath tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts",
      "node scripts/eval-shadow-planner-scenarios.ts --json",
      "npm run build"
    ]
  }
]
```

## Notes

- Proposal pack only.
- No runtime files touched.
