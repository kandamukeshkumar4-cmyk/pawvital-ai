# Shadow Planner Eval Failure Triage Pack (VET-1447C)

## Scope

This ticket adds analysis-only artifacts:

- `src/lib/clinical-intelligence/shadow-planner-eval-triage.ts`
- `tests/clinical-intelligence/shadow-planner-eval-triage.test.ts`
- `docs/clinical-intelligence/shadow-planner-eval-triage-codex.md`

It does not change planner behavior, adapter behavior, question cards, complaint modules, fixtures, routing, runtime wiring, UI, env, infra, or workflows.

## Purpose

The VET-1442C eval harness is intentionally report-only, but its raw output still needs structure before follow-up work starts.

This triage pack turns the current failure set into deterministic classifications so the next tickets target the real issue class:

- eval setup gaps
- fixture expectation gaps
- off-topic planner selections
- missing question-card coverage
- report-only red-flag coverage gaps

## Inputs

The triage utility consumes:

- the structured `ShadowPlannerScenarioEvalReport`
- `tests/fixtures/clinical-intelligence/shadow-planner-scenarios.json`
- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json`
- `tests/fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json`
- registry-backed acceptable question-card coverage from `question-card-registry.ts`

## Classification Rules

The buckets are intentionally non-exclusive. A case can contribute to more than one bucket when the report shows multiple distinct problems.

### `adapter_module_mismatch`

The adapter-selected complaint module does not match the expected module.

Current result:

- `0` cases

### `fixture_expectation_mismatch`

The expected outcome allows emergency-screen reasoning but omits the canonical global emergency screen from the acceptable question set.

Current result:

- `1` case

### `missing_question_card_coverage`

One or more required red flags are not covered by any registry-backed question in the case’s acceptable question set.

Current result:

- `2` cases
- confirmed example: `possible_trauma` is not covered by the acceptable question set for `trauma_bleeding_wound_01_hit_by_car_pale`

### `off_topic_question_selected`

The selected question is outside the acceptable set and is not explained away by a valid emergency-aligned fixture mismatch.

Current result:

- `4` cases
- these are the routine or non-emergency cases where `emergency_global_screen` still over-selected

### `emergency_alignment_ok_quality_gap`

The planner still chose an emergency-screen question for a case that expected early emergency screening, so the safety alignment is intact even though the case still failed on other report dimensions.

Current result:

- `23` cases

### `repeated_question_setup_gap`

The standard scenario pack asks the eval to score repeat avoidance, but it does not provide prior asked/answered state.

Current result:

- `33` cases
- standard scenario repeated-question setups: `0`
- edge-case scenario repeated-question setups: `6`

### `generic_question_metric_setup_gap`

The generic-question metric compares every case against the fixed baseline `emergency_global_screen`, so a safety-aligned global emergency screen is automatically penalized as “generic”.

Current result:

- `33` cases

### `red_flag_screen_coverage_gap`

The selected question failed to screen one or more required red flags for the case.

Current result:

- `31` cases

### `acceptable_report_only_failure`

The selected question is still in the acceptable set, the complaint module matches, and the `selectedBecause` value is acceptable, so the case failed for report-only reasons rather than a direct wrong-question selection.

Current result:

- `28` cases

## Current Separation

### Safety blockers

- `0`

The current report does not show missed emergency alignment or adapter complaint-module drift. That means the triage pack does **not** treat the current failures as a live safety-routing break.

### Quality / report-only gaps

- `33`

All current failures fall into quality/report-only buckets, led by:

- repeated-question metric setup
- generic-question metric setup
- red-flag coverage reporting
- a small routine-case emergency over-selection subset

## Top complaint modules affected

All current complaint modules tie at `3` failed cases each:

- `bloat_gdv`
- `collapse_weakness`
- `gi_vomiting_diarrhea`
- `heatstroke_heat_exposure`
- `limping_mobility_pain`
- `respiratory_distress`
- `seizure_collapse_neuro`
- `skin_itching_allergy`
- `toxin_poisoning_exposure`
- `trauma_bleeding_wound`
- `urinary_obstruction`

## Top under-screened red flags

Current top missing or under-screened red flags:

1. `persistent_vomiting` — `8`
2. `acute_weakness` — `5`
3. `heatstroke_signs` — `4`
4. `gastric_dilatation_volvulus` — `3`
5. `large_blood_volume` — `3`
6. `non_weight_bearing` — `3`
7. `suspected_toxin` — `3`
8. `urinary_obstruction` — `3`

## Recommended next tickets

Priority order from the deterministic triage pack:

1. `shadow-planner-repeated-question-eval-setup`
   Reason: the baseline scenario pack has no prior asked/answered state, so repeat-avoidance failures are currently harness-driven.
2. `shadow-planner-generic-question-metric-baseline`
   Reason: the fixed `emergency_global_screen` baseline makes safety-aligned global screening look like a generic failure.
3. `shadow-planner-red-flag-coverage-audit`
   Reason: several required red flags are either not covered by the selected question or not covered anywhere in the acceptable registry-backed set.
4. `shadow-planner-routine-emergency-overselection-triage`
   Reason: four routine/non-emergency cases still over-select the global emergency screen.
5. `shadow-planner-expected-outcome-normalization`
   Reason: one case allows emergency-screen reasoning but excludes the canonical global emergency screen from the acceptable question list.

## Interpretation

The current report should not be read as “33 planner failures”.

The deterministic triage says:

- no current safety blocker was confirmed
- most failures are caused by first-turn eval setup choices
- a smaller subset points to genuine quality work:
  - routine-case emergency over-selection
  - red-flag coverage auditing
  - acceptable-set normalization

That means the next lane should start with setup normalization and coverage auditing, not a broad planner rewrite.
