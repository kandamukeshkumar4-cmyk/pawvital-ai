# VET-1028 - Terminal Outcome Internal Metrics Normalization

## Goal

Normalize internal-only telemetry for terminal outcomes so `cannot_assess` and `out_of_scope` are recorded with one durable metric shape without changing owner-facing responses or leaking new fields into client payloads.

## Scope

- Add a dedicated internal `terminal_outcome` telemetry event
- Persist one normalized terminal outcome metric record per terminal response
- Parse the stored record for future internal monitoring helpers
- Keep terminal outcome payloads and sanitized client sessions unchanged

## Normalized Metric Fields

Each internal terminal outcome metric carries:

- `terminal_state`
- `reason_code`
- `conversation_state`
- `recommended_next_step`
- `turn_number`
- `question_id` when a terminal outcome is tied to a specific critical question

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "cannot_assess|out_of_scope|payload|VET-1028"`
- `npm run build`
