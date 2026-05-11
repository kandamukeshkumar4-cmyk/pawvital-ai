# Shadow Eval Planner Improvement Candidate Guard (VET-1457Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/shadow-eval-planner-improvement-candidate-guard.test.ts`
- `docs/clinical-intelligence/shadow-eval-planner-improvement-candidate-guard-qwen.md`

No runtime files touched.

It does not change planner behavior, adapter behavior, scenario fixtures,
annotation fixtures, routing, UI, env, infra, or workflow behavior.

## Purpose

VET-1455K already packaged the current `57` shadow-eval cases into the
failure-annotation fixture. This guard narrows that package to the exact `7`
rows whose primary class is `planner_improvement_candidate` so future planner
work can stay targeted.

This ticket does not approve a planner fix. It only freezes the reviewed
candidate set and its current metric-class mix.

## Candidate Table

| Case ID | Current planned question | Acceptable planned question IDs | Selected complaint module | Failed metric classes | Suggested fix category |
| --- | --- | --- | --- | --- | --- |
| `gi_vomiting_diarrhea_03_water_comes_back_up` | `emergency_global_screen` | `gi_keep_water_down_check`, `gi_vomiting_frequency`, `gi_blood_check` | `gi_vomiting_diarrhea` | `repeated_metric_setup_gap`, `generic_metric_setup_gap`, `red_flag_coverage_gap` | `gi_targeted_discriminator` |
| `limping_mobility_pain_02_sudden_after_jump` | `limping_weight_bearing` | `limping_weight_bearing`, `limping_trauma_onset`, `trauma_mechanism_check` | `limping_mobility_pain` | `repeated_metric_setup_gap`, `red_flag_coverage_gap` | `limping_targeted_discriminator` |
| `limping_mobility_pain_03_limping_with_wound_confuser` | `bleeding_volume_check` | `limping_weight_bearing`, `limping_trauma_onset`, `wound_characterization_check`, `bleeding_volume_check` | `limping_mobility_pain` | `repeated_metric_setup_gap`, `red_flag_coverage_gap`, `fixture_ambiguity` | `multi_symptom_planner_choice` |
| `edge_trauma_repeat_bleeding_avoidance` | `emergency_global_screen` | `wound_characterization_check`, `laceration_depth_check`, `limping_weight_bearing`, `limping_trauma_onset` | `limping_mobility_pain` | `repeated_metric_setup_gap`, `generic_metric_setup_gap`, `red_flag_coverage_gap`, `fixture_ambiguity` | `trauma_targeted_discriminator` |
| `edge_skin_repeat_location_avoidance` | `emergency_global_screen` | `skin_emergency_allergy_screen` | `skin_itching_allergy` | `repeated_metric_setup_gap`, `generic_metric_setup_gap`, `red_flag_coverage_gap` | `skin_targeted_discriminator` |
| `edge_limping_not_sure_pain_or_weakness` | `emergency_global_screen` | `limping_weight_bearing`, `collapse_weakness_check`, `limping_trauma_onset`, `gum_color_check` | `collapse_weakness` | `generic_metric_setup_gap`, `red_flag_coverage_gap`, `fixture_ambiguity` | `multi_symptom_planner_choice` |
| `edge_multi_diarrhea_limping_cut` | `emergency_global_screen` | `limping_weight_bearing`, `limping_trauma_onset`, `wound_characterization_check`, `bleeding_volume_check`, `gi_blood_check` | `gi_vomiting_diarrhea` | `generic_metric_setup_gap`, `red_flag_coverage_gap`, `fixture_ambiguity` | `multi_symptom_planner_choice` |

## Suggested Fix Categories

These categories are review buckets only. They do not authorize runtime edits in
this ticket.

They do not rank severity, approve a runtime patch, or imply that a module swap
or question-card rewrite is already justified.

They are only a planner-review routing aid for a future ticket that stays
separate from this validation guard.

- `gi_targeted_discriminator`
  The accepted GI question set already exists, but the planner still stays on
  the global emergency screen instead of the GI-specific discriminator.

- `skin_targeted_discriminator`
  The accepted skin characterization or allergy-screen card already exists, but
  the planner still uses the global emergency screen.

- `limping_targeted_discriminator`
  The accepted lameness-specific weight-bearing or trauma-onset question already
  exists, but the planner still fails to move into that complaint-specific lane.

- `trauma_targeted_discriminator`
  The accepted wound and trauma characterization cards already exist, but the
  planner still does not leave the global emergency screen.

- `multi_symptom_planner_choice`
  The case intentionally allows overlapping complaint families, but the current
  selected module and planned question still need a future targeted planner
  review instead of being treated as pure report-only noise.

## Current Guard Findings

- planner candidates: `7`
- safety blockers: `0`
- report-only rows mislabeled as planner candidates: `0`

No candidate has `safetyImpact = blocker`.

No `report_only_quality_gap` row is mislabeled as a planner candidate.

The eval CLI still reports `57` total cases.

## Candidate-Only Top Failed Metric Classes

- `red_flag_coverage_gap`: `7`
- `generic_metric_setup_gap`: `5`
- `repeated_metric_setup_gap`: `5`
- `fixture_ambiguity`: `4`

## Guard Boundary

This guard does not:

- reclassify report-only rows into planner debt
- change the planner candidate list
- change adapter or planner logic
- change fixtures unless a separate ticket proves a real internal mismatch

## Notes

- Validation-only guard.
- No runtime files touched.
