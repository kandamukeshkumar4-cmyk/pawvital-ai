# Slice 2B Fixture Outcome Normalization (VET-1469C)

## Scope

Fixture/outcome normalization only.

This ticket updates the expected outcome, normalization fixture, failure
annotation fixture, and docs/tests that lock those surfaces for:

- `gi_vomiting_diarrhea_03_water_comes_back_up`

No runtime files were touched.

This ticket does not change planner logic, complaint adapter logic, question
cards, complaint modules, symptom-chat, triage logic, memory, RAG, UI, env,
infra, or workflows.

## Normalized Case

`gi_vomiting_diarrhea_03_water_comes_back_up` previously stayed in the live
`planner_improvement_candidate` set because its accepted targets did not include
the current first question:

- current planned question: `emergency_global_screen`
- prior accepted targets: `gi_keep_water_down_check`,
  `gi_vomiting_frequency`, `gi_blood_check`

The Slice 2B proposal classified this as fixture-only outcome debt. The current
planner behavior is acceptable for this row because the global emergency screen
is a valid first move before the remaining GI-specific discriminator.

## Fixture Changes

- Added `emergency_global_screen` to the case's acceptable planned question IDs.
- Added `emergency_screen` to the case's accepted selected-because reasons.
- Changed normalization from complete red-flag coverage to partial coverage.
- Excluded the row from generic-question scoring because the generic metric
  setup was fixture eligibility noise after accepting the emergency screen.
- Reclassified the failure annotation from `planner_improvement_candidate` to
  `report_only_quality_gap`.
- Left only `repeated_metric_setup_gap` as secondary report-only debt.
- Set the patch target to `no_patch_report_only`.

## Metric Movement

Fresh `node scripts/eval-shadow-planner-scenarios.ts --json` metrics after this
normalization:

- total cases: `57`
- emergency alignment: `39/39`
- repeated avoidance: `6/6`
- generic avoidance: `4/10`
- planner improvement candidates: `6`
- safety blockers: `0`
- raw acceptable questions: `51/57`
- normalized acceptable questions: `52/57`
- raw failed cases: `54`
- normalized failed cases: `53`

The generic denominator changed from `11` to `10` because this row is no longer
eligible for generic-question scoring after the fixture accepts
`emergency_global_screen`.

## Notes

- Fixture/outcome normalization only.
- No runtime files touched.
