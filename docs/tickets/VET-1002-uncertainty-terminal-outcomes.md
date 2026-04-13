# VET-1002 — Uncertainty Terminal Outcomes

## Goal

Wire deterministic uncertainty handling into the live symptom-chat flow so the API can return explicit terminal outcomes for:

- `out_of_scope`
- `cannot_assess`

## Scope

- add deterministic out-of-scope detection for:
  - non-dog species
  - hypothetical / educational asks
  - medication dosing requests
  - procedure-guidance requests
  - clearly non-triage topics
- convert unsafe owner-cannot-assess critical-sign turns into a first-class
  `cannot_assess` terminal response instead of letting the route continue
- expose structured response fields:
  - `terminal_state`
  - `reason_code`
  - `owner_message`
  - `recommended_next_step`
- update the symptom-checker UI to render the new terminal message types

## Files

- `src/lib/clinical/uncertainty-routing.ts`
- `src/lib/ambiguous-reply.ts`
- `src/app/api/ai/symptom-chat/route.ts`
- `src/app/(dashboard)/symptom-checker/page.tsx`
- `tests/symptom-chat.route.test.ts`

## Verification

- `node G:\MY Website\pawvital-ai\node_modules\jest\bin\jest.js --verbose --runInBand --testPathPatterns=symptom-chat.route.test.ts`
- `node G:\MY Website\pawvital-ai\node_modules\next\dist\bin\next build --webpack`

Both commands were run from the `G:\MY Website\pawvital-ai-vet1002-uncertainty`
worktree with `NODE_PATH=G:\MY Website\pawvital-ai\node_modules`, and both
passed.
