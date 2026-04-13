# VET-1008 — Contradiction Awareness Wiring

## Scope

- add a deterministic text-contradiction detector under `src/lib/clinical/`
- wire contradiction detection into the live symptom-chat route as detection-only
- record contradiction telemetry internally and add ambiguity flags
- keep owner-facing behavior unchanged

## Out of Scope

- no contradiction resolution ladder
- no new terminal outcomes
- no benchmark changes
- no workflow or CI changes

## Acceptance

- documented contradiction rules from `docs/ood-guardrails.md` have deterministic coverage
- contradictions are persisted as ambiguity flags for internal scoring/reporting
- contradiction telemetry is internal-only and excluded from client payloads
- route behavior remains unchanged for owners beyond internal ambiguity tracking
