# VET-1001 — Route Decomposition

Owner: `codex`
Branch: `codex/vet-1001-route-decomposition-v1`
Status: in progress

## Goal

Reduce `src/app/api/ai/symptom-chat/route.ts` from a monolith into an orchestration layer by extracting no-behavior-change helper modules ahead of uncertainty wiring.

## Scope

### Route extraction work

- extract deterministic answer-coercion helpers into `src/lib/symptom-chat/answer-coercion.ts`
- extract deterministic answer-extraction helpers into `src/lib/symptom-chat/answer-extraction.ts`
- extract question/image/session context helpers into `src/lib/symptom-chat/context-helpers.ts`
- extract structured extraction parsing helpers into `src/lib/symptom-chat/extraction-helpers.ts`
- extract report/evidence helper logic into `src/lib/symptom-chat/report-helpers.ts`
- leave route behavior unchanged while shrinking the main file below the Phase 2 target

### Verification work

- keep the full symptom-chat route regression suite green
- keep the focused conversation-state regression pack green
- document any environment limitations separately from the decomposition result

## Acceptance Criteria

- `src/app/api/ai/symptom-chat/route.ts` is reduced below `2000` lines
- extracted helper files stay below the repo guidance ceiling
- no new deterministic clinical logic is moved into prompts
- `tests/symptom-chat.route.test.ts` passes unchanged
- conversation-state regression tests pass unchanged

## Verification

- `node G:\MY Website\pawvital-ai\node_modules\jest\bin\jest.js --verbose --runInBand --testPathPatterns=symptom-chat.route.test.ts`
- `node G:\MY Website\pawvital-ai\node_modules\jest\bin\jest.js --verbose --runInBand --testPathPatterns='conversation-state\.needs-clarification\.test\.ts|conversation-state\.transitions\.test\.ts|conversation-state-ui\.test\.ts'`

## Notes

- This ticket is a no-behavior-change refactor.
- Global `npm run build` and full-project typecheck remain environment-sensitive in the clean worktree because it reuses the main repo dependency tree rather than a full local install.
- The meaningful ship signal for this ticket is the unchanged route and conversation-state regression coverage.

## Follow-On

1. `VET-1002` — uncertainty integration and terminal outcomes
2. `VET-1003` — contradiction detection pack