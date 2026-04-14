# VET-1017 — Eval Harness Simulation Label Hardening

## Scope

- make `scripts/eval-harness.ts` explicit that it is simulated, not route-backed
- add an `execution_mode: "simulated"` field to the generated scorecard output
- tighten nearby ticket wording so reviewers do not confuse this harness with the live safety gate

## Why This Ticket Exists

- the dangerous-slice benchmark command is still useful for scorecard reporting, but it does not execute the real `/api/ai/symptom-chat` route
- newer route-backed safety gates now exist, so this harness needs clearer labels to avoid overstating what its pass/fail result proves
- the fix is documentation and labeling only; it does not widen the harness into a live evaluator

## Changes

- updated `scripts/eval-harness.ts` banner, inline comments, and scorecard shape to mark the harness as simulated
- added `execution_mode: "simulated"` to scorecard JSON output
- added explicit CLI output that the harness does not call `/api/ai/symptom-chat`
- clarified in `VET-910-runpod-evaluation-harness.md` that `runpod-benchmark.mjs` is the live deployed-app path while `eval-harness.ts` remains simulated

## Acceptance

- scorecard JSON now carries an explicit execution mode
- console output clearly states that the harness is simulated
- documentation no longer leaves room to mistake this harness for the live route-backed safety gate
- no runtime files, workflow files, or benchmark source data are changed
