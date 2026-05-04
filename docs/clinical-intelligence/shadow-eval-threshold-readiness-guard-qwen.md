# Shadow Eval Threshold Readiness Guard (VET-1445Q)

**Agent:** Qwen 3.6 Plus  
**Branch:** qwen/vet-1445q-shadow-eval-threshold-readiness-guard  
**Date:** 2026-05-04  
**Scope:** Validation-only guard and documentation. No runtime wiring, no CI enforcement, no planner behavior changes.

## Purpose

This ticket defines the planned threshold field names for the shadow planner
scenario eval so future CI gating can be added without renaming drift or
accidental fail-closed behavior in the current phase.

These threshold fields are report-only in this phase.

## Planned Threshold Fields

The planned threshold keys must stay aligned with the metric names already
returned by `evaluateShadowPlannerScenarios(...)` in
`src/lib/clinical-intelligence/shadow-planner-scenario-eval.ts`:

- `complaintModuleMatchRate`
- `acceptableQuestionRate`
- `emergencyScreenAlignmentRate`
- `repeatedQuestionAvoidanceRate`
- `genericQuestionAvoidanceRate`
- `redFlagScreenCoverageRate`

These are naming contracts only in this ticket. No threshold values, threshold
evaluators, or CI pass/fail rules are introduced here.

## Current Phase Rules

- No runtime files are touched by this guard.
- No workflow file enforces these thresholds yet.
- No CI fail-closed behavior is added in this ticket.
- The current shadow planner scenario eval continues to report metrics and
  failed cases only.
- Any future fail-closed CI gate must land in a separate ticket.

## Emergency Safety Constraint

Threshold review must never downgrade emergency behavior or override emergency_handoff.

Any future threshold gate must remain downstream of the existing emergency
behavior contract. It cannot:

- downgrade an already-emergency path
- weaken emergency-screen expectations
- suppress required red-flag coverage expectations
- reinterpret report-only quality metrics as authority over runtime triage

## No-Workflow-Enforcement Proof

As of this ticket, the workflow directory `.github/workflows/` does not contain
the six planned threshold field names and does not invoke any dedicated shadow
eval threshold gate.

That means the current repo state remains:

- report-only summary generation in the eval harness
- explicit local guard coverage in tests
- no GitHub workflow threshold enforcement yet

## Validation Contract

The guard test verifies:

1. the six planned threshold field names still exist on the current shadow eval
   summary shape
2. this document keeps the report-only and separate-ticket rules explicit
3. workflow files remain free of threshold-enforcement wiring

## Notes

- Validation-only guard.
- No runtime files touched.
- No CI fail-closed behavior added.
