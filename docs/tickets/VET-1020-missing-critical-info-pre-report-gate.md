# VET-1020 — Missing Critical Info Pre-Report Gate

## Goal

Block `generate_report` when the route still lacks a report-blocking critical sign for an active dangerous symptom family.

## Scope

- add a deterministic pre-report check in `symptom-chat/route.ts`
- keep the critical-info registry local to `uncertainty-routing.ts`
- return the existing `cannot_assess` terminal payload instead of attempting report generation
- add focused route coverage for unanswered and `"unknown"` critical-info cases

## Report-Blocking Critical Info

- `breathing_onset`
- `consciousness_level`
- `gum_color`

These only block report generation when they are relevant to the currently active symptom family.

## Behavior

- unanswered report-blocking critical info stops `generate_report`
- `"unknown"` on a report-blocking critical sign also stops `generate_report`
- the route returns the existing deterministic `cannot_assess` terminal outcome
- DeepSeek/Nemotron report generation is not attempted once the gate fires

## Non-goals

- changing benchmark fixtures or workflows
- altering non-terminal question flow behavior
- moving medical decisions into prompts
