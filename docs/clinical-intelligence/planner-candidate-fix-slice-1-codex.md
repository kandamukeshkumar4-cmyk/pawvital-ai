# Planner Candidate Fix Slice 1 (VET-1459C)

## Scope

This slice stays inside planner and eval support surfaces only:

- `src/lib/clinical-intelligence/shadow-planner-scenario-eval.ts`
- `tests/clinical-intelligence/next-question-planner.test.ts`
- `tests/clinical-intelligence/shadow-planner-scenario-eval.test.ts`
- `docs/clinical-intelligence/planner-candidate-fix-slice-1-codex.md`

It does not touch symptom-chat routing, triage-engine, clinical-matrix,
symptom-memory, question cards, complaint modules, red flags, clinical signals,
RAG, UI, env, infrastructure, or workflows.

## Goal

VET-1455K and VET-1458K isolated repeated-question planner candidates where the
shadow eval was still marking `actual_repeated_question_failure` even when the
planner did not reselect the prior asked or answered domain question.

This slice tightens that distinction:

- selecting a question already present in `askedQuestionIds` or
  `answeredQuestionIds` remains a true repeated-question failure
- reselecting the fixed comparison baseline `emergency_global_screen` is still
  reported as a generic-baseline quality miss, but no longer counted as an
  actual repeated-question setup failure for the locked repeated cases

## What Changed

- The eval harness now uses real `askedQuestionIds` and `answeredQuestionIds`
  when it decides whether a repeated-setup case should receive
  `actual_repeated_question_failure`.
- The broad comparison signal for the generic baseline still exists, so the
  report continues to surface when the planner stays on
  `emergency_global_screen`.
- Planner regression tests now include the locked trauma and skin repeat slices
  to prove the planner does not reselect `bleeding_volume_check` or
  `skin_location_distribution` once those IDs are already asked and answered.

## Outcome

- repeated-question setup metrics now measure actual prior-question reuse
  instead of generic baseline reuse
- the repeated eligible denominator remains `6`
- the repeated avoidance rate moves to `6/6`
- emergency alignment remains unchanged
- the candidate cases can stay in the report for generic-baseline or
  acceptable-question misses without being mislabeled as true repeat failures

## Notes

- Targeted planner/eval quality fix only.
- No runtime files touched.
