# VET-1506C - Model Proxy Proposal

## Purpose

Plan a future model-proxy layer for PawVital before expanding agentic model
traffic. The proxy should make model calls visible, budgeted, redacted, and
fallback-safe without weakening deterministic clinical behavior.

This is a proposal only. No production model calls are rewired by VET-1506C.

## Candidate Tools

### LiteLLM

- Self-hostable proxy with OpenAI-compatible routing.
- Good fit when PawVital needs direct control over network path, logs, and
  provider credentials.
- Requires owner-managed hosting, upgrades, auth, storage, and incident
  response.

### Portkey

- Managed gateway with routing, budgets, observability, and policy controls.
- Good fit when the team wants less proxy infrastructure to operate directly.
- Requires vendor review for logging, retention, PII handling, and outage
  behavior.

## Non-Goals

- Do not move deterministic medical decisions into prompts.
- Do not let proxy output mutate `answered_questions`, `extracted_answers`,
  `unresolved_question_ids`, or emergency state.
- Do not enable `GROK_FINAL_REPORT`.
- Do not promote shadow flags.
- Do not replace existing Jest or benchmark gates.

## Target Routing Model

Route by runtime role, not by ad hoc call site:

| Role | Current intent | Proxy behavior later |
| --- | --- | --- |
| `second_opinion` | Pending-answer recovery support | Budgeted call with deterministic fallback |
| `grok_final_safety` | Final-stage safety verifier in shadow/on modes | One-call budget with fail-closed fallback |
| `grok_final_report` | Future final report model role | Remains budget-blocked until approved |
| sidecar consult/retrieval roles | Optional supporting services | Routed only after separate service review |

The existing model-router and model-budget layers should remain the source of
truth for feature modes, provider order, timeouts, and per-session caps. The
proxy should enforce those decisions; it should not invent new clinical
authority.

## Budget Caps

Minimum future controls:

- per-session caps from `src/lib/model-budget.ts`
- per-role daily call caps
- per-role daily spend caps
- per-provider spend caps
- timeout budgets by role
- circuit breakers for provider error rate, timeout rate, malformed output
  rate, and spend exhaustion

Current baseline caps to preserve:

- `second_opinion`: 2 calls per session
- `grok_final_safety`: 1 call per session
- `grok_final_report`: 0 calls per session

## Fallback Rules

- Deterministic clinical logic remains authoritative.
- If the proxy is down, over budget, or returns malformed output, the app must
  follow the existing deterministic fallback path.
- Fallback reasons stay internal-only and must not appear in owner-visible copy.
- Emergency escalation must never depend on proxy availability.
- A proxy success may add advisory comparison data only where the current route
  already accepts advisory model output.

## Caching

Default: no caching for freeform owner symptom text.

Caching may be considered only for:

- static system prompts
- static schema metadata
- model capability metadata
- fully sanitized eval prompts that contain no owner identifiers or private
  report content

Do not cache:

- owner text
- private tester identifiers
- pet profile details
- images, audio, or file references
- report bodies
- raw LLM request/response bodies from production

## PII Redaction

Before any proxy logging or persisted observability, redact or drop:

- owner names
- email addresses
- phone numbers
- street addresses and exact locations
- private tester identifiers
- pet names when linked to owner identity
- auth tokens, cookies, API keys, and webhook secrets
- raw image/audio/file payloads

The proxy should prefer metadata logs: role, provider, model id, feature mode,
latency, token counts, budget result, fallback reason, and sanitized eval ids.

## Rollout Risks

- Added latency in symptom-chat hot paths.
- Proxy outage or auth drift blocking optional model calls.
- Duplicate logging of sensitive content.
- Spend-cap bugs causing silent model starvation or unexpected billing.
- Caching stale model outputs across incompatible prompt or schema versions.
- Provider routing drift that makes eval history hard to compare.
- Vendor retention policies that conflict with PawVital privacy expectations.

## Proposed Rollout Sequence

1. Local-only proxy experiment with fake or stubbed prompts.
2. Staging shadow mode with synthetic sanitized eval payloads.
3. Staging shadow mode with real dev traffic only after redaction review.
4. Production shadow metadata only, with raw bodies disabled.
5. Production role-by-role routing after parity against existing gates.

Required proof before production routing:

- `npm run security:secrets`
- route or model-router tests for fail-closed behavior
- benchmark or release-gate parity for any clinical-adjacent path
- documented spend caps and kill switch
- confirmed redaction policy
- no owner-visible telemetry leakage
