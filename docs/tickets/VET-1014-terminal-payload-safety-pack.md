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

## Validation Notes

- static file validation reported no TypeScript or Markdown errors in the new test and ticket files
- repeated local attempts to run the exact Jest command were blocked by an inconsistent Windows npm install state in this worktree (`ts-jest` missing before install, then `jest-cli` package config / `yargs` resolution failures while `npm ci` was still finalizing)
- no repository files outside the allowed test and ticket note were changed to work around the local package-manager issue
