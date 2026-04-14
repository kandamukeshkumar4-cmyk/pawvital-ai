# VET-1014 — Terminal Payload Safety Regression Pack

Owner: `copilot`
Branch: `copilot/vet-1014-terminal-payload-safety-pack-v1`
Status: ready for review

## Goal

Add a focused regression suite proving internal telemetry never leaks through owner-facing symptom-chat payloads.

## Scope

- add `tests/symptom-chat.payload-safety.test.ts`
- cover question, emergency, cannot_assess, and out_of_scope responses
- keep the change test-only with no runtime, workflow, benchmark, or package edits

## Coverage

- seeds `clarification_reasons`, `service_timeouts`, `shadow_comparisons`, and internal-only `service_observations`
- asserts client payloads strip those internal fields while preserving safe public observations
- exercises a critical unknown-response cannot_assess path via `gum_color`
- exercises out_of_scope via unsupported species routing

## Verification

- `npx jest tests/symptom-chat.payload-safety.test.ts --runInBand`
- `npx eslint tests/symptom-chat.payload-safety.test.ts`

## Validation Notes

- local validation now passes after a clean `npm ci` in the dedicated worktree
- `npx eslint tests/symptom-chat.payload-safety.test.ts` passes
- `npx jest tests/symptom-chat.payload-safety.test.ts --runInBand` passes
