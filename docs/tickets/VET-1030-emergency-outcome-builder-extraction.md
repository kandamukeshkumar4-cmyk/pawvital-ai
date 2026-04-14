# VET-1030 - Emergency Outcome Builder Extraction

## Goal

Continue route decomposition by moving emergency response building out of `symptom-chat/route.ts` and into a dedicated helper module without changing behavior.

## Scope

- Extract the vision-guardrail emergency response builder
- Extract the red-flag emergency response builder
- Keep the existing emergency message text, sanitized session payload, and `ready_for_report` behavior unchanged
- Add route-level regression coverage for both emergency builder paths

## Extracted Builder Surface

- `buildVisionGuardrailEmergencyResponse(...)`
- `buildRedFlagEmergencyResponse(...)`

Both helpers return the same owner-facing emergency payload shape:

- `type: "emergency"`
- existing emergency message copy
- sanitized `session`
- `ready_for_report: true`

## Validation

- `npx jest tests/symptom-chat.route.test.ts --runInBand -t "emergency"`
- `npm run build`
