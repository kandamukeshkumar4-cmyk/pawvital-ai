# Planner Candidate Fix Slice 1 Guard (VET-1460Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/planner-candidate-fix-slice-1-guard.test.ts`
- `docs/clinical-intelligence/planner-candidate-fix-slice-1-guard-qwen.md`

No runtime files touched.

It does not change planner behavior, eval behavior, fixtures, routing, UI, env,
infra, or workflow behavior.

## Purpose

VET-1458K split the `planner_improvement_candidate` rows into planner-owned and
non-planner follow-up lanes. This guard freezes the repeated-question planner
slice so a future planner fix cannot claim wins outside the intended repeated
candidate rows.

This guard does not approve a runtime fix. It only records the reviewed scope
and the current non-regression baseline.

## Intended Slice

The planner-owned repeated-question slice currently contains exactly `1` row:

- `edge_trauma_repeat_bleeding_avoidance` stays on
  `scoring_weight_adjustment`

This is the only repeated-question planner-candidate row that stays in the
planner-owned follow-up lanes from VET-1458K.

## Explicit Exclusions

The other repeated planner-candidate rows are intentionally outside slice 1:

- `limping_mobility_pain_02_sudden_after_jump` stays on
  `adapter_trigger_adjustment`
- `limping_mobility_pain_03_limping_with_wound_confuser` stays on
  `adapter_trigger_adjustment`
- `edge_skin_repeat_location_avoidance` stays on
  `question_card_metadata_adjustment`

## Global Guardrails

- `repeatedQuestionEligibleCases`: `6`
- `actual_repeated_question_failure`: `0`
- emergency alignment: `39/39 = 100%`
- safety blockers: `0`
- non-repeated report-only rows reclassified as planner successes: `0`

The current `actual_repeated_question_failure` rows are now empty. The current
eval reports full repeated-question avoidance across all `6` eligible repeated
setups, and slice 1 still does not widen to non-planner rows or reclassify
report-only rows as planner successes.

## Structured Guard Data

```json
{
  "intendedRepeatedCandidateRows": [
    {
      "caseId": "edge_trauma_repeat_bleeding_avoidance",
      "proposedFixType": "scoring_weight_adjustment",
      "currentPlannedQuestionId": "emergency_global_screen",
      "selectedComplaintModule": "limping_mobility_pain",
      "acceptableTargetQuestionIds": [
        "wound_characterization_check",
        "laceration_depth_check",
        "limping_weight_bearing",
        "limping_trauma_onset"
      ]
    }
  ],
  "excludedRepeatedCandidateRows": [
    {
      "caseId": "limping_mobility_pain_02_sudden_after_jump",
      "redirectedFixType": "adapter_trigger_adjustment"
    },
    {
      "caseId": "limping_mobility_pain_03_limping_with_wound_confuser",
      "redirectedFixType": "adapter_trigger_adjustment"
    },
    {
      "caseId": "edge_skin_repeat_location_avoidance",
      "redirectedFixType": "question_card_metadata_adjustment"
    }
  ],
  "globalGuardrails": {
    "repeatedQuestionEligibleCases": 6,
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
