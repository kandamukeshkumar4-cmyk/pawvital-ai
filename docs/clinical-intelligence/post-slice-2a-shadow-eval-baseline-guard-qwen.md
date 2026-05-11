# Post-Slice 2A Shadow Eval Baseline Guard (VET-1468Q)

## Scope

Validation-only guard.

This ticket adds only:

- `tests/clinical-intelligence/post-slice-2a-shadow-eval-baseline-guard.test.ts`
- `docs/clinical-intelligence/post-slice-2a-shadow-eval-baseline-guard-qwen.md`

No runtime files touched.

It does not change planner behavior, eval behavior, fixtures, routing, UI, env,
infra, or workflow behavior.

## Purpose

After VET-1462C and VET-1463C merged the Slice 2A generic-avoidance fixes,
the shadow-eval scenario harness settled on a stable baseline. This guard
freezes that exact baseline so the next Slice 2B work cannot accidentally
move the known metrics without an explicit implementation ticket.

This guard does not approve a new runtime fix. It only records the reviewed
baseline and the current non-regression contract.

## Locked Baseline

The following metrics are locked at their post-Slice 2A values:

- `total cases`: `57`
- `emergency alignment`: `40/40`
- `repeated avoidance`: `6/6`
- `generic avoidance`: `4/11`
- `safety blockers`: `0`
- `Slice 2A locked wins`: `4`
- `report-only rows reclassified`: `0`

## Slice 2A Locked Wins

The four Slice 2A wins that must remain on accepted non-generic questions:

- `skin_itching_allergy_02_paws_belly_itching`
- `limping_mobility_pain_02_sudden_after_jump`
- `limping_mobility_pain_03_limping_with_wound_confuser`
- `edge_trauma_small_scrape_vs_steady_bleed`

None of these rows may regress back to `emergency_global_screen`.

## Guard Assertions

The test file asserts:

1. Total cases remain exactly 57 (33 base + 24 edge).
2. Emergency screen alignment remains 40/40 = 100%.
3. Setup-aware repeated question avoidance remains 6/6 = 100%.
4. Setup-aware generic question avoidance remains 4/11.
5. Safety blockers remain 0.
6. All four Slice 2A win cases avoid the generic question and match acceptable questions.
7. No report-only quality gap rows are reclassified as safety blockers.
8. No report-only quality gap rows silently disappear from the failed-case pack.

## Notes

- Validation-only guard.
- No runtime files touched.
- Do not edit planner logic.
- Do not edit complaint adapter logic.
- Do not edit question cards.
- Do not edit fixtures unless the guard proves the fixture itself is stale, and then stop/report first.
- Do not touch symptom-chat, triage-engine, clinical-matrix, symptom-memory, RAG, UI, env, infra, or workflows.
- Do not depend on VET-1467C or the Slice 2B proposal branch.
