# Shadow Eval Failure Annotation Pack (VET-1455K)

## Scope

This ticket adds packaging-only artifacts:

- `tests/fixtures/clinical-intelligence/shadow-eval-failure-annotations.json`
- `tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts`
- `docs/clinical-intelligence/shadow-eval-failure-annotation-pack-kimi.md`

It does not change eval code, planner behavior, adapter behavior, question cards,
complaint modules, routing, runtime wiring, UI, env, infra, or workflows.

## Purpose

The normalized shadow eval summary still reports `57` failed cases. That raw list
is too noisy to review directly because most rows share the same owner-facing
result:

- adapter complaint-module detection still lands inside the accepted module set
- emergency alignment still stays intact
- the planner still picks `emergency_global_screen`
- the failure often comes from report-only scoring, missing edge normalization
  application, or a narrow acceptable-question expectation

This pack turns the current failed-case list into a reviewer-friendly annotation
fixture so the next fix ticket can be targeted instead of inferred from raw
metrics alone.

## Annotation Shape

Each row maps one failed eval case to:

- `caseId`
- `primaryFailureClass`
- `secondaryFailureClasses`
- `patchTarget`
- `reviewerAction`
- `safetyImpact`
- `notes`

The allowed primary classes stay intentionally narrow:

- `fixture_ambiguity`
- `report_only_quality_gap`
- `adapter_selection_gap`
- `red_flag_coverage_gap`
- `repeated_metric_setup_gap`
- `generic_metric_setup_gap`
- `planner_improvement_candidate`

In the current pack, the primary split is:

- `report_only_quality_gap`: `46`
- `planner_improvement_candidate`: `9`
- `red_flag_coverage_gap`: `1`
- `fixture_ambiguity`: `1`
- `adapter_selection_gap`: `0`
- `safetyImpact = blocker`: `0`

## What The Split Means

### Report-only quality gaps

These rows should not drive immediate runtime work.

They are dominated by two secondary tags:

- `repeated_metric_setup_gap`: `39` rows
- `generic_metric_setup_gap`: `29` rows

That means the annotation pack is explicitly preserving the same conclusion from
the earlier triage lane: the eval still over-penalizes the global emergency
screen before repeat-state and edge normalization are fully honored.

### Planner improvement candidates

These are the rows where the planner still needs a real follow-up review because
the global emergency screen is outside the explicit acceptable question set or
the `selectedBecause` value is outside the accepted reasoning lane.

Current planner-review rows:

- `gi_vomiting_diarrhea_03_water_comes_back_up`
- `skin_itching_allergy_02_paws_belly_itching`
- `limping_mobility_pain_02_sudden_after_jump`
- `limping_mobility_pain_03_limping_with_wound_confuser`
- `edge_trauma_small_scrape_vs_steady_bleed`
- `edge_trauma_repeat_bleeding_avoidance`
- `edge_skin_repeat_location_avoidance`
- `edge_limping_not_sure_pain_or_weakness`
- `edge_multi_diarrhea_limping_cut`

### Red-flag coverage gap

Only one row is packaged as a direct red-flag coverage follow-up:

- `heatstroke_heat_exposure_02_brachy_panting_after_walk`

That row keeps emergency alignment, but the accepted emergency-first path still
leaves `heatstroke_signs` and `brachycephalic_heat` under-screened.

### Fixture ambiguity

Only one row is packaged as a primary fixture-normalization ambiguity:

- `edge_heat_mild_after_walk_vs_hard_panting`

That row already has acceptable emergency alignment, but the explicit question
set is still narrower than the live behavior the edge normalization note already
describes.

## Reviewer Guidance

Use the annotation pack in this order:

1. Start with any `planner_improvement_candidate` or `red_flag_coverage_gap`
   rows. Those are the only rows that currently justify a concrete future planner
   review.
2. Keep `report_only_quality_gap` rows out of runtime queues unless the future
   normalization or metric lane proves the same case still fails afterward.
3. Treat `fixture_ambiguity` rows as expectation-shaping work first, not planner
   regression proof.
4. Ignore `adapter_selection_gap` for now because the live normalized summary
   still shows `57/57` complaint-module matches.

## Notes

- The annotation pack is deterministic against the current `node
  scripts/eval-shadow-planner-scenarios.ts --json` output.
- The annotation pack is packaging-only and does not alter the eval harness.
- The annotation pack keeps secondary setup-gap tags visible even when the
  primary class is `report_only_quality_gap`.
