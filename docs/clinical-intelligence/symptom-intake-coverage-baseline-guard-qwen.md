# VET-1492Q Symptom Intake Coverage Baseline Guard

## Purpose

This is a measurement guard only for symptom-intake coverage breadth.

It records owner-language phrases that are likely to be weakly mapped, dropped,
or held only by broad fallback behavior today. The goal is to lock a baseline for
future Codex runtime work, not to change the runtime in this ticket.

## Scope Boundaries

Validation-only.

This ticket creates only:

- `tests/fixtures/clinical-intelligence/symptom-intake-coverage-baseline-cases.json`
- `tests/clinical-intelligence/symptom-intake-coverage-baseline-guard.test.ts`
- `docs/clinical-intelligence/symptom-intake-coverage-baseline-guard-qwen.md`

It does not change runtime behavior, production traffic, model flags, model
routing, emergency sentinels, question cards, clinical logic, or owner-facing
copy.

## Current Known Problem

The current symptom intake has strong paths for several broad symptoms such as
limping and breathing difficulty, but realistic owner phrases can still fall
between known symptom families. In those cases, a silent no-op is risky because
the session can lose the owner's concern before a broad follow-up or emergency
screen has a chance to run.

This guard classifies that gap without registering any new family.

## Case Count

Total cases: 25

Classification counts:

- mapped_symptom: 2
- unknown_concern_fallback_needed: 6
- clarification_needed: 2
- missing_family: 15

Safety watch count:

- emergency/clarification watch cases: 12

## Top Missing Family Candidates

These are proposed IDs only. They are not live registered families.

- `proposed_rear_end_discomfort` - scooting on carpet, butt licking
- `proposed_pica_ingestion` - eating rocks, eating dirt
- `proposed_foreign_object_ingestion` - ate a sock
- `proposed_neuro_behavior_change` - head pressing
- `proposed_neuro_balance_behavior` - circling
- `proposed_increased_appetite_hunger` - appetite increased, always hungry
- `proposed_weight_gain_body_change` - weight gain
- `proposed_paw_pad_nail_injury` - paw pad cut, broken nail
- `proposed_tail_mobility_pain` - tail limp, tail base pain
- `proposed_hearing_change` - acute deafness

## Top Unknown Concern Fallback Candidates

These phrases should not disappear if they miss direct symptom mapping:

- foul smell near rear end
- drooling a lot
- arched back
- reluctant to move
- trouble swallowing
- gagging when swallowing

The guard requires each unknown-concern row to explain why a no-op session would
be unsafe.

## Emergency Or Clarification Watch Cases

The guard marks these rows as needing emergency screening or clarification:

- `drooling_a_lot`
- `ate_a_sock`
- `head_pressing`
- `circling`
- `staring_at_wall`
- `arched_back`
- `reluctant_to_move`
- `trouble_swallowing`
- `gagging_when_swallowing`
- `voice_changed`
- `noisy_breathing_stridor`
- `acute_deafness`

These rows are watch cases only. They do not alter urgency rules.

## Blocked Runtime Scope

This guard explicitly blocks edits to:

- `clinical-matrix`
- `triage-engine`
- `symptom-memory`
- `route`
- `model-router`
- `question-card registry`

It also blocks:

- runtime files
- route changes
- production behavior changes
- model routing changes
- emergency sentinel changes
- new live symptom families
- new question cards
- diagnosis or treatment guidance

## Recommended Codex Follow-Up Ticket

VET-1495C - Unknown Concern Never-Drop Runtime Patch

Recommended scope for that future ticket:

- implement a narrow unknown-concern never-drop path
- preserve proposed-family IDs as proposed-only until reviewed
- keep emergency and clarification screening deterministic
- add route-level regression coverage before changing behavior

This VET-1492Q guard remains validation-only and should be used as the baseline
for measuring that follow-up.
