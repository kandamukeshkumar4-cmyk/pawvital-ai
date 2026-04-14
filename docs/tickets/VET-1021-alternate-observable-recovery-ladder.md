# VET-1021 - Alternate Observable Recovery Ladder

## Goal

Add one deterministic alternate-observable retry for critical unknown answers, but only when `docs/ood-guardrails.md` explicitly documents that fallback.

## Scope

- `gum_color` gets a single guided retry before `cannot_assess`
- `breathing_onset` and `consciousness_level` stay on the existing direct `cannot_assess` path
- No prompt-based gating or benchmark/workflow changes

## Implementation Notes

1. Add a documented alternate-observable helper in `uncertainty-routing.ts`
2. In `symptom-chat/route.ts`, use that helper only on the first ambiguous critical reply
3. Persist the one-retry ladder with the existing `unresolved_question_ids` state
4. If the owner still cannot assess after the retry, return deterministic `cannot_assess`

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "alternate|cannot_assess|VET-1021"`
- `npm run build`
