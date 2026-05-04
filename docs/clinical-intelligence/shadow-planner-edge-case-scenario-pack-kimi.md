# VET-1443K Shadow Planner Edge-Case Scenario Expansion Pack

## Scope

This package adds validation-only fixture coverage:

- `tests/fixtures/clinical-intelligence/shadow-planner-edge-case-scenarios.json`
- `tests/clinical-intelligence/shadow-planner-edge-case-scenario-pack.test.ts`
- `docs/clinical-intelligence/shadow-planner-edge-case-scenario-pack-kimi.md`

It does not change planner code, adapter code, question cards, complaint modules, runtime routes, UI, infrastructure, or workflow files.

## Purpose

The edge-case pack extends the existing shadow planner scenario fixtures with dog-only owner-language cases that are intentionally harder to classify and score. These cases are for future old-vs-shadow planner evaluation and are not wired into owner-facing behavior.

Each fixture row records:

- possible primary complaint module IDs
- acceptable planned question-card candidates
- red flags that should stay visible to an evaluator
- whether emergency-screen questions should be preferred
- whether generic questions should be avoided
- repeated-question setup when applicable
- category markers for confusing multi-symptom, emergency-vs-mild, and not-sure owner language

## Coverage Summary

The fixture contains 24 scenarios and enforces the requested minimums:

- at least 8 confusing multi-symptom cases
- at least 8 emergency-vs-mild contrast cases
- at least 4 repeated-question avoidance cases
- at least 4 not-sure or ambiguous owner-answer cases

The scenarios stay dog-only and focus on the existing registered complaint families:

- heat exposure and respiratory overlap
- trauma, wound, and limping overlap
- urinary output ambiguity
- bloat and GI overlap
- collapse, weakness, and neuro overlap
- toxin exposure uncertainty
- GI blood or water-retention uncertainty
- skin emergency versus routine itch

## Repeated-Question Setup

Repeated-question cases include `repeatedQuestionSetup` with:

- `askedQuestionIds`
- `answeredQuestionIds`

The fixture intentionally excludes those IDs from `acceptablePlannedQuestionIds`. The test also runs the planner's existing answered-or-asked filter over registered cards to prove the remaining acceptable candidates are still reachable after the setup is applied.

## Guardrails

The test guard verifies that:

- the pack has exactly 24 dog-only cases
- category minimums are met
- case IDs are unique and stable
- every expected complaint module ID exists
- every acceptable planned question ID exists
- emergency-preferred cases include an emergency-screen candidate
- red-flag expectations map to existing card screens or module stop conditions
- repeated setup IDs are registered and excluded from acceptable next candidates
- generic-question avoidance cases include at least one complaint-specific candidate
- owner-facing fixture text avoids diagnosis or treatment instructions

## Intended Evaluation Use

A future comparison runner can score old planner output versus shadow planner output against this pack by checking:

- selected module against `expectedPrimaryComplaintModuleIds`
- planned question against `acceptablePlannedQuestionIds`
- screened red flags against `mustScreenRedFlags`
- emergency-first behavior against `shouldPreferEmergencyScreen`
- generic-question avoidance against `shouldAvoidGenericQuestion`
- repeated-question behavior against `repeatedQuestionSetup`

This is a fixture expansion only. It does not authorize new clinical signals, red flags, question cards, complaint modules, or planner behavior changes.
