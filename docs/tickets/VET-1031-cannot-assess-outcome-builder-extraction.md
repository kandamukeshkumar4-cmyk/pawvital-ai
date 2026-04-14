# VET-1031 — Cannot-Assess Outcome Builder Extraction

## Summary

- extracted the `cannot_assess` terminal response payload into `src/lib/symptom-chat/response-builders.ts`
- updated `route.ts` to delegate `cannot_assess` payload assembly through the shared builder while leaving `out_of_scope` in place for the follow-up decomposition ticket
- added a focused regression test to lock the extracted `cannot_assess` payload shape

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "cannot_assess"`
- `npm run build`
