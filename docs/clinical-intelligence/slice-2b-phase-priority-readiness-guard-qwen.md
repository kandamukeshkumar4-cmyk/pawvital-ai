# Slice 2B Phase-Priority Fix Readiness Guard (VET-1472Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/slice-2b-phase-priority-readiness-guard.test.ts`
- `docs/clinical-intelligence/slice-2b-phase-priority-readiness-guard-qwen.md`

No runtime files touched.

No planner logic changed.
No complaint adapter logic changed.
No question cards changed.
No complaint modules changed.

It does not touch symptom-chat, triage-engine, clinical-matrix, symptom-memory,
RAG, UI, env, infra, or workflows.

## Purpose

This guard documents and locks the current pre-fix behavior for the
`edge_limping_not_sure_pain_or_weakness` case so that the next implementation
slice (the phase-priority fix) can be applied safely by Codex without
regressing any existing Slice 2A wins or global guardrails.

This guard does not implement the fix. It only records the reviewed baseline
and confirms that all non-regression gates are clean before the implementation
PR is opened.

## Target Case

`edge_limping_not_sure_pain_or_weakness`

Owner text:
> "My dog is moving oddly and I am not sure if his leg hurts or he is weak all over."

## Current Selected Question/Card

- selected complaint module: `collapse_weakness`
- planned question: `emergency_global_screen`
- selected because: `emergency_screen`

The planner currently falls back to the global emergency screen instead of
choosing a discriminator from the acceptable question set.

## Accepted Target Question/Card from Slice 2B Proposal

- accepted target question card: `limping_weight_bearing`
- acceptable question set:
  - `limping_weight_bearing`
  - `collapse_weakness_check`
  - `limping_trauma_onset`
  - `gum_color_check`

The normalization row expects the first planned question to come from this
explicit set, with `question_match_required` emergency alignment disposition
and `complete` red-flag coverage expectation.

## Why This Is Phase-Priority, Not Fixture-Only

The case is classified as `planner_improvement_candidate` with `monitor`
safety impact and `planner` patch target. The secondary failure classes are:

- `generic_metric_setup_gap`
- `red_flag_coverage_gap`
- `fixture_ambiguity`

The normalization row sets:

- `ambiguityDisposition`: `allow_module_alternatives`
- `emergencyAlignmentDisposition`: `question_match_required`
- `redFlagCoverageExpectation`: `complete`
- `genericQuestionScoring`: `include`

This means the fix must adjust phase-priority scoring between
`limping_mobility_pain` and `collapse_weakness` so that the planner can
select `limping_weight_bearing` (or another acceptable discriminator) instead
of falling back to `emergency_global_screen`. This is not a fixture-only
issue because the generic-question scoring expectation is `include`, not
`exclude_for_now`, and the emergency alignment disposition requires an actual
question match rather than accepting the global screen as sufficient.

## Emergency Alignment

- emergency alignment: `39/39 = 100%`
- target case emergency aligned: `true`

No emergency alignment regression. The target case still aligns with the
emergency screen expectation even though the planned question is not the
preferred discriminator.

## Repeated Avoidance

- repeated avoidance: `6/6 = 100%`
- target case repeated avoided: `true`

No repeated-question regression. The target case has no repeated-question
setup and is correctly marked as avoided.

## Safety Blockers

- safety blockers: `0`
- target case safety impact: `monitor`

No safety blockers. The case is classified as `monitor` not `blocker`, and
the global triage reports zero safety blockers.

## Report-Only Rows Reclassified

- report-only rows reclassified: `0`

No `report_only_quality_gap` row has been silently reclassified as a safety
blocker or planner success.

## Slice 2A Locked Wins

- Slice 2A locked wins: `4/4`

All four Slice 2A generic-avoidance wins remain intact:

| Case ID | Module | Planned Question | Generic Avoided | Acceptable Matched |
| --- | --- | --- | --- | --- |
| `skin_itching_allergy_02_paws_belly_itching` | `skin_itching_allergy` | `skin_location_distribution` | yes | yes |
| `limping_mobility_pain_02_sudden_after_jump` | `limping_mobility_pain` | `limping_weight_bearing` | yes | yes |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `limping_mobility_pain` | `bleeding_volume_check` | yes | yes |
| `edge_trauma_small_scrape_vs_steady_bleed` | `trauma_bleeding_wound` | `bleeding_volume_check` | yes | yes |

## Structured Guard Data

```json
{
  "targetCase": {
    "caseId": "edge_limping_not_sure_pain_or_weakness",
    "currentSelectedComplaintModule": "collapse_weakness",
    "currentPlannedQuestionId": "emergency_global_screen",
    "currentSelectedBecause": "emergency_screen",
    "acceptableTargetQuestionIds": [
      "limping_weight_bearing",
      "collapse_weakness_check",
      "limping_trauma_onset",
      "gum_color_check"
    ],
    "mustScreenRedFlags": [
      "non_weight_bearing",
      "acute_weakness",
      "pale_gums",
      "post_trauma_lameness"
    ],
    "shouldPreferEmergencyScreen": false,
    "shouldAvoidGenericQuestion": true,
    "isConfusingMultiSymptom": true,
    "hasAmbiguousOwnerAnswer": true
  },
  "currentEvalState": {
    "primaryFailureClass": "planner_improvement_candidate",
    "secondaryFailureClasses": [
      "generic_metric_setup_gap",
      "red_flag_coverage_gap",
      "fixture_ambiguity"
    ],
    "safetyImpact": "monitor",
    "actualPlannedQuestionId": "emergency_global_screen",
    "actualComplaintModuleId": "collapse_weakness",
    "acceptableQuestionMatched": false,
    "genericQuestionAvoided": false,
    "repeatedQuestionAvoided": true,
    "emergencyScreenAligned": true,
    "missingRequiredRedFlags": [
      "non_weight_bearing",
      "acute_weakness",
      "pale_gums",
      "post_trauma_lameness"
    ]
  },
  "acceptedTargetQuestionCard": "limping_weight_bearing",
  "phasePriorityReason": "The case `edge_limping_not_sure_pain_or_weakness` is a phase-priority fix because the owner's ambiguous wording (\"not sure if his leg hurts or he is weak all over\") creates a module-phase ambiguity between `limping_mobility_pain` and `collapse_weakness`. The planner currently selects `collapse_weakness` and falls back to `emergency_global_screen`, but the acceptable question set includes `limping_weight_bearing` as the preferred discriminator. This is not a fixture-only issue: the normalization row expects `question_match_required` with `complete` red-flag coverage and `include` for generic-question scoring, meaning the fix must adjust phase-priority scoring between the two modules rather than merely updating fixture expectations.",
  "globalGuardrails": {
    "emergencyScreenAlignmentCount": 39,
    "emergencyScreenAlignmentRelevantCases": 39,
    "emergencyScreenAlignmentRate": 1,
    "repeatedQuestionAvoidanceCount": 6,
    "repeatedQuestionAvoidanceRelevantCases": 6,
    "repeatedQuestionAvoidanceRate": 1,
    "safetyBlockerCount": 0,
    "reportOnlyRowsReclassified": [],
    "slice2ALockedWins": [
      {
        "caseId": "skin_itching_allergy_02_paws_belly_itching",
        "selectedComplaintModule": "skin_itching_allergy",
        "plannedQuestionId": "skin_location_distribution",
        "genericQuestionAvoided": true,
        "acceptableQuestionMatched": true
      },
      {
        "caseId": "limping_mobility_pain_02_sudden_after_jump",
        "selectedComplaintModule": "limping_mobility_pain",
        "plannedQuestionId": "limping_weight_bearing",
        "genericQuestionAvoided": true,
        "acceptableQuestionMatched": true
      },
      {
        "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
        "selectedComplaintModule": "limping_mobility_pain",
        "plannedQuestionId": "bleeding_volume_check",
        "genericQuestionAvoided": true,
        "acceptableQuestionMatched": true
      },
      {
        "caseId": "edge_trauma_small_scrape_vs_steady_bleed",
        "selectedComplaintModule": "trauma_bleeding_wound",
        "plannedQuestionId": "bleeding_volume_check",
        "genericQuestionAvoided": true,
        "acceptableQuestionMatched": true
      }
    ]
  }
}
```

## Notes

- Validation-only readiness guard.
- No runtime files touched.
- No planner logic changed.
- No complaint adapter logic changed.
- No question cards changed.
- No complaint modules changed.
