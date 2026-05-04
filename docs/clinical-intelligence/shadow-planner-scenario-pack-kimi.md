# VET-1438K Shadow Planner Scenario Fixture Pack

## Scope

This package adds fixture and test coverage only:

- `tests/fixtures/clinical-intelligence/shadow-planner-scenarios.json`
- `tests/clinical-intelligence/shadow-planner-scenario-pack.test.ts`

It does not change planner logic, question cards, complaint modules, runtime routes, UI, infrastructure, or workflow files.

## Purpose

The fixture pack gives old-vs-shadow planner comparisons a stable set of dog-only owner-language scenarios across high-risk complaint families. Each scenario records:

- expected complaint module ID
- acceptable first question-card candidates
- red flags that must stay visible to an evaluator
- whether an emergency-screen card should be preferred
- whether a generic first question should be avoided
- whether the case is intentionally confusing and multi-symptom

The pack is designed as an evaluation input. It is not wired into live owner-facing behavior.

## Coverage Summary

The pack contains 33 scenarios, with at least 3 cases for each registered complaint module:

- `heatstroke_heat_exposure`
- `trauma_bleeding_wound`
- `urinary_obstruction`
- `bloat_gdv`
- `respiratory_distress`
- `collapse_weakness`
- `seizure_collapse_neuro`
- `toxin_poisoning_exposure`
- `gi_vomiting_diarrhea`
- `skin_itching_allergy`
- `limping_mobility_pain`

The fixture includes at least 12 emergency or must-not-miss scenarios and at least 8 confusing multi-symptom scenarios.

## Packaging Guardrails

The test validates that:

- the fixture has exactly 33 cases
- every listed module has at least 3 cases
- case IDs are unique and use stable snake-case IDs
- owner text stays dog-only
- owner-facing fixture text avoids diagnosis or treatment claims
- expected module IDs exist in the complaint-module registry
- acceptable first question IDs exist in the question-card registry
- emergency-preferred cases include at least one emergency-screen card candidate
- red-flag expectations map to existing card screens or module stop conditions

## Intended Evaluation Use

An evaluator can run old planner output and shadow planner output against each case, then compare:

- selected module versus `expectedComplaintModuleId`
- first selected question versus `acceptableFirstQuestionIds`
- screened red flags versus `mustScreenRedFlags`
- emergency-first behavior versus `shouldPreferEmergencyScreen`
- generic-question avoidance versus `shouldAvoidGenericQuestion`

The pack intentionally does not assert a single perfect first question. It allows multiple registry-backed candidates so planner iterations can improve ordering without making the fixture brittle.
