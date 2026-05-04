# VET-1450K Shadow Eval Expected Outcome Normalization Pack

## Scope

This package adds fixture, test, and documentation coverage only:

- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json`
- `tests/clinical-intelligence/shadow-planner-expected-outcome-normalization-pack.test.ts`
- `docs/clinical-intelligence/shadow-planner-expected-outcome-normalization-kimi.md`

It does not change eval code, planner behavior, complaint adapter behavior, question cards, complaint modules, runtime routes, UI, infrastructure, or workflow files.

## Purpose

The normalization pack adds a reviewable layer on top of the merged shadow-planner eval surface so future report-only evaluation can separate true quality misses from clinically acceptable ambiguity.

The pack now covers both:

- `shadow-planner-expected-outcomes.json` for the 33 base cases
- `shadow-planner-edge-case-scenarios.json` for the 24 edge cases introduced into the combined eval run after VET-1444C

Each normalization row records:

- accepted complaint-module alternatives for ambiguous wording
- whether ambiguity stays strict, same-module-only, or allows module alternatives
- whether emergency-screen alignment alone is enough
- whether red-flag coverage should be interpreted as complete or partial
- whether the row should count toward generic-question scoring yet
- evaluator notes that explain the normalization decision without diagnosis or treatment instructions

## Normalization Rules

The pack stays fully derived from the merged source fixtures:

- `caseId` matches either one expected-outcome row or one edge-case scenario row exactly
- base rows always include the primary expected complaint module from `shadow-planner-expected-outcomes.json`
- edge rows mirror the accepted complaint-module set already carried by `expectedPrimaryComplaintModuleIds`
- confusing multi-symptom rows may add registry-backed module alternatives
- emergency alignment uses `alignment_only_ok` only when the source fixture already expects earlier emergency screening
- red-flag coverage is `partial` when `emergency_global_screen` is already an accepted planned question
- generic-question scoring is `exclude_for_now` on the same `emergency_global_screen` rows so future quality reports do not over-penalize emergency-first cases

This keeps the pack report-only. It does not alter evaluator logic or authorize planner runtime changes.

## Coverage Summary

- cases covered: 57
- ambiguity cases: 31
- emergency-alignment-only cases: 39
- partial red-flag coverage cases: 46
- generic-metric excluded cases: 46

The ambiguity split is intentional:

- `strict_primary` for rows that still keep one module only
- `same_module_only` for mixed wording that should still stay inside the primary module
- `allow_module_alternatives` for rows where a different registry-backed module remains clinically acceptable

## Ambiguity Guidance

The pack explicitly opens alternate complaint modules only where the merged fixture wording supports real overlap, for example:

- heat plus breathing ambiguity can keep both `heatstroke_heat_exposure` and `respiratory_distress` acceptable
- trauma plus limping can keep both `trauma_bleeding_wound` and `limping_mobility_pain` acceptable
- collapse and seizure uncertainty can keep both `collapse_weakness` and `seizure_collapse_neuro` acceptable
- multi-symptom emergency blends can keep toxin, collapse, heat, and GI module matches simultaneously acceptable

Most ambiguity cases are the 31 rows marked `isConfusingMultiSymptom` across the base and edge packs. One additional edge row, `edge_limping_sore_vs_no_weight`, stays non-confuser by fixture label but still allows both `limping_mobility_pain` and `trauma_bleeding_wound` because the merged edge-case pack already treats either framing as acceptable.

Rows that stay `same_module_only` still acknowledge mixed symptom language, but they do not yet justify a different module expectation.

## Emergency And Red-Flag Interpretation

Some rows should not require the exact same planned question to count as a good result. When the merged source already expects earlier emergency screening, `alignment_only_ok` means any accepted emergency-first path is sufficient even if the chosen question card differs.

Rows that already accept `emergency_global_screen` are normalized as:

- `redFlagCoverageExpectation = partial`
- `genericQuestionScoring = exclude_for_now`

That combination is deliberate. A global emergency screen can preserve safe red-flag coverage without giving enough signal to score generic-question avoidance fairly. Those rows should stay visible in reports, but they should not yet be treated as clean generic-question comparisons.

## Guardrails

The normalization pack test verifies that:

- the fixture stays 1:1 with the 33 base expected-outcome rows plus the 24 edge-case scenario rows
- every accepted module exists in the complaint-module registry
- ambiguity counts and spot-check alternatives remain stable across the combined 57-case surface
- emergency-alignment-only rows track the existing emergency expectation exactly
- partial red-flag coverage and generic-metric exclusion stay tied to `emergency_global_screen`
- notes stay free of diagnosis or treatment instructions

## Intended Evaluation Use

Future report-only eval work can combine this pack with the existing base and edge fixture packs to:

- distinguish acceptable module ambiguity from true module misses
- avoid over-counting exact-question misses when emergency alignment is clinically enough
- separate partial emergency-screen coverage from complete direct-comparison coverage
- defer generic-question scoring on rows where the accepted answer is already a broad emergency screen

This package is fixture normalization only. No runtime files are touched.
