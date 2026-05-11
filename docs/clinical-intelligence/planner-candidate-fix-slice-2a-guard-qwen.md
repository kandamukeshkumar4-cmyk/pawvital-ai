# Planner Candidate Fix Slice 2A Guard (VET-1463Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/planner-candidate-fix-slice-2a-guard.test.ts`
- `docs/clinical-intelligence/planner-candidate-fix-slice-2a-guard-qwen.md`

No runtime files touched.

It does not change planner behavior, eval behavior, fixtures, routing, UI, env,
infra, or workflow behavior.

## Purpose

VET-1462C moved four medium-risk generic-avoidance candidates away from
`emergency_global_screen` and onto existing accepted symptom-specific question
cards.

This guard freezes that exact slice boundary so future generic-avoidance gains
cannot hide emergency regressions, repeated-question regressions, or
report-only quality gaps under a larger planner win claim.

This guard does not approve a new runtime fix. It only records the reviewed
slice and the current non-regression baseline.

## Intended Slice

The merged slice still drives setup-aware generic avoidance on exactly `4`
rows.

Only `2` slice rows still appear in the live planner-candidate proposal lane:

- `limping_mobility_pain_02_sudden_after_jump` stays on `adapter_trigger`
- `limping_mobility_pain_03_limping_with_wound_confuser` stays on
  `adapter_trigger`

These rows still remain planner-candidate follow-ups because the generic
question is gone but red-flag coverage is still incomplete:

- `limping_mobility_pain_02_sudden_after_jump` still fails only for
  `post_trauma_lameness` red-flag coverage after moving to
  `limping_weight_bearing`.
- `limping_mobility_pain_03_limping_with_wound_confuser` still fails only for
  `post_trauma_lameness` and `non_weight_bearing` red-flag coverage after
  moving to `bleeding_volume_check`.

Two slice rows have already exited the proposal lane and now pass on accepted
non-generic follow-ups:

- `skin_itching_allergy_02_paws_belly_itching` now passes on an accepted
  non-generic skin follow-up and no longer remains in the proposal pack.
- `edge_trauma_small_scrape_vs_steady_bleed` now passes on an accepted
  non-generic trauma follow-up and no longer remains in the proposal pack.

## Explicit Exclusions

The other non-repeated generic candidates still stay outside slice 2A:

- `gi_vomiting_diarrhea_03_water_comes_back_up` stays on `fixture` with
  `low` regression risk
- `edge_limping_not_sure_pain_or_weakness` stays on
  `module_phase_priority` with `high` regression risk
- `edge_multi_diarrhea_limping_cut` stays on `planner_scoring` with `high`
  regression risk

These rows remain outside the slice until a separate reviewed follow-up moves
them off `emergency_global_screen`.

## Global Guardrails

- `genericQuestionEligibleCases`: `10`
- `genericQuestionAvoidanceCount`: `4`
- `actual_repeated_question_failure`: `0`
- emergency alignment: `39/39 = 100%`
- repeated avoidance: `6/6 = 100%`
- safety blockers: `0`
- report-only rows reclassified as planner successes: `0`

The setup-aware generic-avoidance wins are still exactly the four intended
slice rows, repeated-question avoidance stays flat across all `6` eligible
setups, emergency alignment remains perfect, and no existing
`report_only_quality_gap` row silently disappears from the live failed-case
pack.

## Structured Guard Data

```json
{
  "intendedSliceCaseRows": [
    {
      "caseId": "skin_itching_allergy_02_paws_belly_itching",
      "recommendedFixOwner": "module_phase_priority",
      "selectedComplaintModule": "skin_itching_allergy",
      "acceptableTargetQuestionIds": [
        "skin_location_distribution",
        "skin_changes_check",
        "skin_exposure_check"
      ],
      "currentGuardStatus": "completed_out_of_proposal_lane",
      "expectedOutcome": "passed_on_accepted_non_generic_question",
      "remainingMissingRedFlags": []
    },
    {
      "caseId": "limping_mobility_pain_02_sudden_after_jump",
      "recommendedFixOwner": "adapter_trigger",
      "selectedComplaintModule": "limping_mobility_pain",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "trauma_mechanism_check"
      ],
      "currentGuardStatus": "still_in_proposal_lane",
      "expectedOutcome": "red_flag_coverage_gap_after_generic_avoidance",
      "remainingMissingRedFlags": [
        "post_trauma_lameness"
      ],
      "expectedPlannedQuestionId": "limping_weight_bearing"
    },
    {
      "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
      "recommendedFixOwner": "adapter_trigger",
      "selectedComplaintModule": "limping_mobility_pain",
      "acceptableTargetQuestionIds": [
        "limping_weight_bearing",
        "limping_trauma_onset",
        "wound_characterization_check",
        "bleeding_volume_check"
      ],
      "currentGuardStatus": "still_in_proposal_lane",
      "expectedOutcome": "red_flag_coverage_gap_after_generic_avoidance",
      "remainingMissingRedFlags": [
        "post_trauma_lameness",
        "non_weight_bearing"
      ],
      "expectedPlannedQuestionId": "bleeding_volume_check"
    },
    {
      "caseId": "edge_trauma_small_scrape_vs_steady_bleed",
      "recommendedFixOwner": "planner_scoring",
      "selectedComplaintModule": "trauma_bleeding_wound",
      "acceptableTargetQuestionIds": [
        "bleeding_volume_check",
        "wound_characterization_check",
        "laceration_depth_check",
        "trauma_mechanism_check"
      ],
      "currentGuardStatus": "completed_out_of_proposal_lane",
      "expectedOutcome": "passed_on_accepted_non_generic_question",
      "remainingMissingRedFlags": []
    }
  ],
  "excludedGenericCandidateRows": [
    {
      "caseId": "gi_vomiting_diarrhea_03_water_comes_back_up",
      "recommendedFixOwner": "fixture",
      "regressionRisk": "low",
      "currentPlannedQuestionId": "emergency_global_screen"
    },
    {
      "caseId": "edge_limping_not_sure_pain_or_weakness",
      "recommendedFixOwner": "module_phase_priority",
      "regressionRisk": "high",
      "currentPlannedQuestionId": "emergency_global_screen"
    },
    {
      "caseId": "edge_multi_diarrhea_limping_cut",
      "recommendedFixOwner": "planner_scoring",
      "regressionRisk": "high",
      "currentPlannedQuestionId": "emergency_global_screen"
    }
  ],
  "globalGuardrails": {
    "genericQuestionEligibleCases": 10,
    "genericQuestionAvoidanceCount": 4,
    "genericQuestionAvoidanceCaseIds": [
      "skin_itching_allergy_02_paws_belly_itching",
      "limping_mobility_pain_02_sudden_after_jump",
      "limping_mobility_pain_03_limping_with_wound_confuser",
      "edge_trauma_small_scrape_vs_steady_bleed"
    ],
    "repeatedQuestionEligibleCases": 6,
    "repeatedQuestionAvoidanceCount": 6,
    "repeatedQuestionAvoidanceRate": 1,
    "actualRepeatedQuestionFailureCount": 0,
    "actualRepeatedQuestionFailureCaseIds": [],
    "emergencyScreenAlignmentCount": 39,
    "emergencyScreenAlignmentRelevantCases": 39,
    "emergencyScreenAlignmentRate": 1,
    "safetyBlockerCount": 0,
    "reportOnlyRowsReclassifiedAsPlannerSuccesses": []
  }
}
```

## Notes

- Validation-only guard.
- No runtime files touched.
