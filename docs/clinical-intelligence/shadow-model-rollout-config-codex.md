# VET-1488 Shadow Model Rollout Config

## Scope

This rollout turns the model-change path on in shadow mode only. Owner-visible
behavior must stay deterministic unless a later promotion ticket explicitly
enables a live feature.

No changes are made to:

- emergency sentinel behavior
- repeat-loop policy
- question-card planner behavior
- final report live Grok behavior
- clinical matrix scoring

## Required Flags

Production and preview should use:

- `MODEL_ROUTER_VERSION=v1`
- `SECOND_OPINION_EXTRACTOR=shadow`
- `GROK_FINAL_SAFETY=shadow`
- `GROK_FINAL_REPORT=off`
- `XAI_GROK_FINAL_SAFETY_MODEL=grok-4.3`
- `XAI_GROK_FINAL_REPORT_MODEL=grok-4.3`

`GROK_FINAL_REPORT` remains off. The only Grok path in this rollout is the
final-stage safety verifier in shadow mode.

## Secret Requirement

Real Grok shadow calls require one server-only secret:

- `XAI_API_KEY` or `GROK_API_KEY`

Do not create a `NEXT_PUBLIC_` variant of this key. If the secret is absent,
the final-safety verifier fails closed through the deterministic fallback path
and records an internal provider fallback instead of changing owner-facing
output.

## Expected Behavior

- second opinion runs only on the existing pending-question recovery trigger
- final-safety verification runs only at report generation
- model calls respect per-session budgets
- fallback reasons stay internal
- telemetry is not included in owner-facing payloads
- emergency guidance remains deterministic

## Verification

Required before calling the rollout complete:

- focused shadow rollout config test
- telemetry gate test
- symptom-chat route suite
- build
- dangerous benchmark
- release gate
- Vercel production deployment with the new env values baked in
- no unresolved GitHub review threads
