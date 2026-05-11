# Planner Candidate Fix Slice 2A (VET-1462C)

## Scope

This slice stays inside planner and shadow-eval surfaces only:

- `src/lib/clinical-intelligence/next-question-planner.ts`
- `src/lib/clinical-intelligence/shadow-planner-complaint-adapter.ts`
- `tests/clinical-intelligence/next-question-planner.test.ts`
- `tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts`
- `tests/clinical-intelligence/shadow-eval-failure-annotation-pack.test.ts`
- `tests/fixtures/clinical-intelligence/shadow-eval-failure-annotations.json`
- `docs/clinical-intelligence/planner-candidate-fix-slice-2a-codex.md`

It does not touch `symptom-chat` routing, `triage-engine`, `clinical-matrix`,
`symptom-memory`, question-card inventory, red flags, clinical signals, or
owner-facing production behavior.

## Goal

Move the safest implementation-ready planner candidates away from
`emergency_global_screen` and toward existing accepted symptom-specific question
cards for four medium-risk generic-avoidance cases:

- `skin_itching_allergy_02_paws_belly_itching`
- `limping_mobility_pain_02_sudden_after_jump`
- `limping_mobility_pain_03_limping_with_wound_confuser`
- `edge_trauma_small_scrape_vs_steady_bleed`

## What Changed

- The planner now accepts optional preferred and discouraged question IDs and
  applies explicit score adjustments in the ranking breakdown.
- The shadow complaint adapter adds narrow routing hints for the target skin,
  limping, and trauma phrasing so the planner can prefer existing accepted
  symptom-specific cards and de-prioritize generic emergency-screen cards.
- The skin routing was intentionally kept narrow to the locked paws-plus-belly
  itching profile so hives and repeat-location emergency cases stay unchanged.
- Planner and scenario tests now lock the new score fields, the target-case
  planner choices, and the expected post-fix failure population.
- Failure-annotation fixtures were updated only where the target cases changed
  state after the planner improvement.

## Outcome

- `skin_itching_allergy_02_paws_belly_itching` now selects an accepted
  symptom-specific skin follow-up instead of `emergency_global_screen`.
- `edge_trauma_small_scrape_vs_steady_bleed` now selects an accepted
  trauma/wound-specific follow-up instead of `emergency_global_screen`.
- `limping_mobility_pain_02_sudden_after_jump` and
  `limping_mobility_pain_03_limping_with_wound_confuser` no longer fail generic
  avoidance, but they still remain reportable for red-flag coverage gaps.

Fresh `node scripts/eval-shadow-planner-scenarios.ts --json` metrics:

- acceptable question rate: `50/57` (`0.8771929824561403`)
- generic avoidance: `4/11` (`0.36363636363636365`)
- repeated avoidance: `6/6` (`1`)
- emergency alignment: `39/39` (`1`)
- red-flag coverage: `42/170` (`0.24705882352941178`)
- raw failed cases: `54`
- normalized failed cases: `53`

## Notes

- Planner/shadow fix only.
- No `symptom-chat` or deterministic clinical core files were touched.
