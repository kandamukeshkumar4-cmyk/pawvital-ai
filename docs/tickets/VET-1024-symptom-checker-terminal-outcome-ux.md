# VET-1024 — Symptom Checker Terminal Outcome UX

## Goal

Improve the owner-facing symptom-checker UI for `cannot_assess` and `out_of_scope` terminal outcomes so the intake stops clearly and shows the reason plus the recommended next step.

## Scope

- add a small terminal-outcome presentation component under `src/components/symptom-checker/`
- wire the symptom-checker page to store terminal outcome metadata already returned by the API
- replace the normal composer/progress continuation UI when the latest assistant turn is a terminal outcome
- extend the existing symptom-checker UI test coverage for the new terminal presentation

## Non-goals

- changing route logic or terminal routing decisions
- changing any clinical contracts or reason-code generation
- changing workflows, benchmark data, or backend payload shape

## UX Changes

- terminal outcomes now render a dedicated owner-facing panel instead of leaving the normal chat composer visible
- the panel shows:
  - the terminal state
  - a human-readable reason label derived from the existing `reason_code`
  - the API-provided owner message
  - the API-provided recommended next step
- the symptom-checker header now shows a terminal-state badge for `cannot_assess` and `out_of_scope`
- the progress bar is hidden once the intake has ended in a terminal state

## Validation

- `npx jest tests/symptom-checker-state-ui.test.ts --runInBand`
- `npm run build`
