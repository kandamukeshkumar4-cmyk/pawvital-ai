# VET-1428 Repeat Loop + Hallucination Telemetry Gate

## Scope

This gate is a regression-only telemetry layer for the post-VET-1426 symptom-chat stack:

- VET-1402 emergency sentinel
- VET-1423 repeat-loop guardrails
- VET-1424 deterministic coercion
- VET-1425 second-opinion extractor
- VET-1427 model router + budget guardrails
- VET-1426 final urgency handoff safety verifier

It does not enable new model behavior, change emergency sentinel logic, alter repeat-loop control flow, or move any feature flag to live-on.

## Stable Internal Gate Events

The telemetry gate now records these internal event markers:

- `repeat_loop_detected`
- `pending_question_resolved`
- `coercion_used`
- `second_opinion_used`
- `second_opinion_failed`
- `second_opinion_rejected`
- `grok_safety_used`
- `grok_safety_failed`
- `missed_red_flag_detected`
- `report_claim_removed`
- `final_safety_fallback`

These markers are internal-only. They are attached to durable telemetry notes and server-side telemetry logs, not to owner-facing payloads.

## How The Gate Reads Them

- Chat-turn regression checks read server telemetry logs emitted by `recordConversationTelemetry(...)`.
- Report-stage regression checks read the persisted internal shadow telemetry snapshot produced by `buildInternalShadowTelemetrySnapshot(...)`.

This keeps the gate honest about real internal signals while preserving the client-safety rule that internal telemetry must not leak into the owner response.

## Coverage

`tests/symptom-chat.telemetry-gate.test.ts` proves:

- duration coercion resolves and logs `coercion_used`
- repeated unknown replies do not loop forever
- second-opinion shadow mode logs accept/reject outcomes without changing owner output
- final-safety shadow mode logs fallback/failure and missed-red-flag detection internally only
- emergency red flags still bypass routine flow
- final handoff strips diagnosis/diagnostic sections
- telemetry/debug markers do not leak into owner-facing content
