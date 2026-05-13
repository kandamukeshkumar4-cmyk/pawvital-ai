# VET-1426 Final Urgency Summary and Vet Handoff Safety Verifier

## Scope

VET-1426 adds a final-stage safety verifier for the report urgency summary and vet handoff surfaces.

It does not change:

- emergency sentinel behavior
- repeat-loop behavior
- planner behavior
- question selection
- routine chat turns
- diagnosis or treatment generation rules outside the bounded final-stage verifier

## Trigger Contract

The verifier runs only during report generation after the report draft exists.

It is gated by:

- `GROK_FINAL_SAFETY=off|shadow|on`
- the VET-1427 session budget for `grok_final_safety`

Default mode is `off`.

Mode behavior:

- `off`: no Grok call; deterministic urgency floor and deterministic handoff summary still apply
- `shadow`: call the verifier and record internal telemetry, but do not change the final report surfaces from the deterministic fallback
- `on`: call the verifier and allow only validated urgency escalation and validated handoff notes

## Input Contract

The verifier prompt is anchored to deterministic report state:

- deterministic urgency
- deterministic red flags
- explicit owner answers
- unresolved critical unknowns
- owner-facing summary draft
- generated vet handoff draft

The verifier never receives authority over emergency logic or question flow.

## Accepted Output

The model must return strict JSON only:

```json
{
  "unsafeDowngradeDetected": false,
  "missedRedFlags": [],
  "diagnosisOrTreatmentClaims": [],
  "recommendedUrgencyLanguage": "same_day",
  "vetHandoffNotes": [],
  "safeToShow": true
}
```

Accepted urgency language normalizes to:

- `monitor`
- `vet_48h`
- `same_day`
- `emergency`

## Deterministic Guardrails

- deterministic urgency is the floor
- the verifier cannot lower urgency
- the verifier cannot remove deterministic red flags
- the verifier cannot invent facts
- the verifier cannot add diagnosis wording
- the verifier cannot add treatment or prescription wording

Final urgency is the max of:

- current report urgency
- deterministic urgency
- accepted verifier urgency

The final vet handoff summary is deterministic. The model is only allowed to add validated notes that already match known facts.

## Rejection Cases

The verifier result is rejected and the pipeline falls back to deterministic output when any of these occur:

- malformed JSON
- missing required keys
- unsafe downgrade
- diagnosis wording
- treatment or prescription wording
- invented unsupported fact
- provider timeout
- provider error
- budget exceeded
- feature disabled
- circuit open

## Budget and Provider Wiring

- provider wrapper: `src/lib/xai-grok.ts`
- router source of truth: `src/lib/model-router.ts`
- per-session budget source of truth: `src/lib/model-budget.ts`

Current Grok final-safety policy:

- max calls per session: `1`
- timeout: `12000ms`
- default mode: `off`

`grok_final_report` remains blocked with a zero-call budget in this slice.

## Telemetry

Internal-only telemetry is recorded as stage `final_safety`.

Telemetry stays out of:

- client payloads
- owner-visible summary text
- `system_observability` counters exposed in report payloads

Recorded outcomes include:

- `accepted`
- `shadow`
- `rejected`
- `failed`
- `skipped`

Reasons include the bounded verifier rejection and fallback reasons listed above.
