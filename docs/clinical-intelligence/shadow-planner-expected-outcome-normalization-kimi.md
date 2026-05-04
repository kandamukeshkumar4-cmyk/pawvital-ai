# VET-1450K Shadow Eval Expected Outcome Normalization Pack

## Scope

This package adds fixture, test, and documentation coverage only:

- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcome-normalization.json`
- `tests/clinical-intelligence/shadow-planner-expected-outcome-normalization-pack.test.ts`
- `docs/clinical-intelligence/shadow-planner-expected-outcome-normalization-kimi.md`

It does not change eval code, planner behavior, complaint adapter behavior, question cards, complaint modules, runtime routes, UI, infrastructure, or workflow files.

## Purpose

The normalization pack adds a reviewable layer on top of `shadow-planner-expected-outcomes.json` so future eval reporting can separate true quality misses from clinically acceptable ambiguity.

Each normalization row records:

- accepted complaint-module alternatives for ambiguous wording
- whether ambiguity stays strict, same-module-only, or allows module alternatives
- whether emergency-screen alignment alone is enough
- whether red-flag coverage should be interpreted as complete or partial
- whether the row should count toward generic-question scoring yet
- evaluator notes that explain the normalization decision without diagnosis or treatment instructions

## Normalization Rules

The pack stays fully derived from the merged expected-outcome fixture:

- `caseId` matches one expected-outcome row exactly
- `acceptableModuleIds` always includes the primary expected complaint module
- confusing multi-symptom rows may add registry-backed module alternatives
- emergency alignment uses `alignment_only_ok` only when the outcome fixture already marks `shouldScreenEmergencyEarlier = true`
- red-flag coverage is `partial` when `emergency_global_screen` is already an accepted planned question
- generic-question scoring is `exclude_for_now` on the same `emergency_global_screen` rows so future quality reports do not over-penalize emergency-first cases

This keeps the pack report-only. It does not alter evaluator logic or authorize planner runtime changes.

## Coverage Summary

- cases covered: 33
- ambiguity cases: 15
- emergency-alignment-only cases: 23
- partial red-flag coverage cases: 28
- generic-metric excluded cases: 28

The ambiguity split is intentional:

- `strict_primary` for non-confuser rows
- `same_module_only` for mixed wording that should still stay inside the primary module
- `allow_module_alternatives` for mixed symptom rows where a different registry-backed module remains clinically acceptable

## Ambiguity Guidance

The pack explicitly opens alternate complaint modules only where the merged fixture wording supports real overlap, for example:

- heat plus vomiting can remain heat-first while still accepting `gi_vomiting_diarrhea`
- trauma plus limping can remain trauma-first while still accepting `limping_mobility_pain`
- facial swelling plus vomiting can remain skin-first while still accepting respiratory or GI module matches
- collapse or seizure wording can accept either neuro-first or collapse-first framing

Rows that stay `same_module_only` still acknowledge mixed symptom language, but they do not yet justify a different module expectation.

## Emergency And Red-Flag Interpretation

Some rows should not require the exact same planned question to count as a good result. When the outcome fixture already expects earlier emergency screening, `alignment_only_ok` means any accepted emergency-first path is sufficient even if the chosen question card differs.

Rows that already accept `emergency_global_screen` are normalized as:

- `redFlagCoverageExpectation = partial`
- `genericQuestionScoring = exclude_for_now`

That combination is deliberate. A global emergency screen can preserve safe red-flag coverage without giving enough signal to score generic-question avoidance fairly. Those rows should stay visible in reports, but they should not yet be treated as clean generic-question comparisons.

## Guardrails

The normalization pack test verifies that:

- the fixture stays 1:1 with `shadow-planner-expected-outcomes.json`
- every accepted module exists in the complaint-module registry
- ambiguity counts and spot-check alternatives remain stable
- emergency-alignment-only rows track the existing emergency expectation exactly
- partial red-flag coverage and generic-metric exclusion stay tied to `emergency_global_screen`
- notes stay free of diagnosis or treatment instructions

## Intended Evaluation Use

Future report-only eval work can combine this pack with the outcome pack to:

- distinguish acceptable module ambiguity from true module misses
- avoid over-counting exact-question misses when emergency alignment is clinically enough
- separate partial emergency-screen coverage from complete direct-comparison coverage
- defer generic-question scoring on rows where the accepted answer is already a broad emergency screen

This package is fixture normalization only. No runtime files are touched.
