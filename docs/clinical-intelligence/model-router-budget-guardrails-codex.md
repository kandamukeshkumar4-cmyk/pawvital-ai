# VET-1427 Model Router and Budget Guardrails

## Scope

This slice centralizes model/provider routing, feature-flag parsing, timeout defaults, and deterministic session budgets. VET-1426 later enables only the final-safety verifier path behind the existing Grok safety flag and session budget.

It does not change:

- emergency sentinel behavior
- repeat-loop policy
- planner behavior
- final report generation behavior

## Router

`src/lib/model-router.ts` is the single source of truth for:

- model ids and fallback ids for each runtime role
- provider order per role
- timeout defaults
- feature-flag modes
- fallback reason enums

Current feature flags:

- `SECOND_OPINION_EXTRACTOR=off|shadow|on`
- `GROK_FINAL_SAFETY=off|shadow|on`
- `GROK_FINAL_REPORT=off|shadow|on`
- `MODEL_ROUTER_VERSION=v1`

Closed-by-default behavior:

- all feature flags default to `off`
- Grok flags stay parsed with live behavior disabled by default
- provider lookup fails closed when no configured backend is available

## Budget

`src/lib/model-budget.ts` adds deterministic per-session controls stored in `session.case_memory.model_budget_state`.

Current session caps:

- `second_opinion`: `2`
- `grok_final_safety`: `1`
- `grok_final_report`: `0`

Current timeout defaults:

- `second_opinion`: `8000ms`
- `grok_final_safety`: `12000ms`
- `grok_final_report`: `20000ms`

Supported closed-fallback reasons:

- `budget_exceeded`
- `timeout`
- `provider_error`
- `malformed_json`
- `feature_disabled`
- `circuit_open`

Circuit behavior:

- circuits are deterministic per feature
- an open circuit blocks the feature before any provider call
- blocked calls fall back to deterministic runtime behavior

## Second Opinion Integration

The second-opinion extractor now uses the shared router and budget layers.

Behavior:

- the extractor still only runs for pending-question recovery on the first clarification retry
- the extractor consumes session budget before attempting a model call
- if budget is exhausted or the feature is off, the route falls back to the existing deterministic repeat-loop path
- the route persists budget counters internally and strips them from client payloads

## Safety Guardrails

- emergency guidance does not depend on router availability
- no model route may downgrade deterministic emergency state
- router failure still falls back to deterministic handling
- `grok_final_report` remains budget-blocked until a dedicated follow-up ticket explicitly enables it
- `grok_final_safety` is limited to one final-stage verification call per session and still defaults to `off`
