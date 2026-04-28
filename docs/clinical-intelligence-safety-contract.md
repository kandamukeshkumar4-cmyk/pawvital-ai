# Clinical Intelligence Safety Contract

## Purpose

This contract defines the non-negotiable safety boundaries for PawVital's question intelligence work.
VET-1399 is measurement only. It establishes a baseline for follow-up question quality without changing production behavior.

## Product Boundary

- PawVital provides urgency guidance and vet handoff support only.
- PawVital does not diagnose.
- PawVital does not prescribe treatment.
- PawVital does not replace a veterinarian.

## Emergency Handling Rules

- Emergency guidance must not be blocked by auth.
- Emergency guidance must not be blocked by payment.
- Emergency guidance must not be blocked by usage limits.
- Emergency guidance must not be blocked by model failure.
- Emergency guidance must not be blocked by report failure.
- Emergency guidance must not be blocked by RAG failure.
- No model, RAG result, or planner may downgrade deterministic emergency signals.
- Deterministic emergency signals remain the source of truth for emergency escalation.

## Reasoning and UX Rules

- No raw chain-of-thought should be shown to users.
- User-facing reasoning should be a short clinical rationale only.
- Internal scoring, critique, and planning artifacts are measurement inputs, not user-facing output.

## Measurement Scope For VET-1399

- The question-quality eval harness may inspect the current deterministic question-selection path.
- The harness may score question quality, safety coverage, repetition behavior, and report usefulness.
- The harness may recommend future complaint modules based on baseline weaknesses.
- The harness must not change production question ordering, model behavior, RAG behavior, auth behavior, payment behavior, usage limits, or emergency routing.

## Change Control

- Any future intelligence work must preserve these rules before it can move from baseline measurement into production behavior.
- Any future change that touches deterministic emergency logic must be validated against the existing dangerous benchmark and release gate suites before rollout.
