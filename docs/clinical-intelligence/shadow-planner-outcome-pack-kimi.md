# VET-1441K Shadow Planner Scenario Outcome Pack

## Scope

This package adds fixture, test, and documentation coverage only:

- `tests/fixtures/clinical-intelligence/shadow-planner-expected-outcomes.json`
- `tests/clinical-intelligence/shadow-planner-outcome-pack.test.ts`
- `docs/clinical-intelligence/shadow-planner-outcome-pack-kimi.md`

It does not change planner logic, adapter logic, question cards, complaint modules, runtime routes, UI, infrastructure, or workflow files.

## Purpose

The outcome pack turns the merged `shadow-planner-scenarios.json` fixture into a stable comparison target for future old-vs-shadow planner evaluation work. The pack keeps expected outcomes out of runtime code so later Codex integration can score behavior without inventing expectations inside the planner path.

Each outcome row records:

- expected complaint module ID
- acceptable planned question IDs
- acceptable `selectedBecause` values for the first-turn comparison
- red flags that must stay visible to the comparison
- whether the shadow choice should beat a generic question
- whether the shadow choice should screen an emergency earlier
- whether the shadow choice should avoid a repeated question
- evaluator notes describing emergency status or acceptable ambiguity

## Outcome Rules

The pack is intentionally derived from the merged scenario fixture:

- `caseId` matches one scenario row exactly
- `expectedComplaintModuleId` matches the scenario module expectation
- `acceptablePlannedQuestionIds` mirrors the scenario’s acceptable first-question set
- `mustScreenRedFlags` mirrors the scenario’s must-screen red flags
- `shouldBeatGenericQuestion` mirrors `shouldAvoidGenericQuestion`
- `shouldScreenEmergencyEarlier` mirrors `shouldPreferEmergencyScreen`
- `shouldAvoidRepeatedQuestion` is always `true` because repeat avoidance is a universal expectation for the shadow comparison layer

`expectedSelectedBecause` is limited to first-turn comparison outcomes:

- `emergency_screen` when at least one acceptable planned question is an emergency-screen card
- `highest_information_gain` when at least one acceptable planned question is a non-emergency card

This pack intentionally does not expect `clarification`, `urgency_changing`, or `report_value` because these scenarios are packaged as first-turn comparison cases, not repeat, worsening-trajectory, or report-completion cases.

## Coverage Summary

The fixture contains one row for every merged scenario case and represents:

- heat
- trauma
- urinary
- bloat
- respiratory
- collapse
- seizure
- toxin
- GI
- skin
- limping

Emergency or must-not-miss rows are marked two ways:

- `shouldScreenEmergencyEarlier = true`
- notes prefixed with `Emergency or must-not-miss:`

Confusing multi-symptom rows add:

- `Acceptable ambiguity: ...`

This keeps clinically reasonable module overlap visible without forcing a single rigid first question in confuser cases.

## Guardrails

The test guard verifies that:

- the pack stays 1:1 with `shadow-planner-scenarios.json`
- every referenced module exists in the complaint-module registry
- every referenced planned question exists in the question-card registry
- `expectedSelectedBecause` stays aligned to real question-card reachability
- emergency rows still have reachable emergency-screen cards
- confusing multi-symptom rows remain explicitly marked for acceptable ambiguity
- evaluator notes stay free of diagnosis or treatment claims

## Intended Evaluation Use

A future comparison runner can score old planner output versus shadow planner output against this pack by checking:

- selected module against `expectedComplaintModuleId`
- planned question against `acceptablePlannedQuestionIds`
- `selectedBecause` against `expectedSelectedBecause`
- screened red flags against `mustScreenRedFlags`
- generic-question avoidance against `shouldBeatGenericQuestion`
- emergency-earlier behavior against `shouldScreenEmergencyEarlier`
- repeat avoidance against `shouldAvoidRepeatedQuestion`

The pack is a scoring artifact only. It does not change owner-facing behavior and it does not authorize planner runtime edits.
