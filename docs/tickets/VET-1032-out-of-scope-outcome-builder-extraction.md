# VET-1032 — Out-of-Scope Outcome Builder Extraction

## Summary

- extracted the `out_of_scope` terminal response payload into `src/lib/symptom-chat/response-builders.ts`
- updated the early out-of-scope route return to delegate payload assembly through the shared builder without changing any routing logic
- added a focused regression test to lock the extracted `out_of_scope` payload shape

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "out_of_scope"`
- `npm run build`
