# VET-1506C - inspect-ai Eval Adoption Proposal

## Purpose

Propose a future inspect-ai layer for agent and tool evals while preserving the
existing PawVital gates. VET-1506C does not install inspect-ai, replace Jest, or
change CI behavior.

## Non-Goals

- Do not replace Jest route tests.
- Do not replace `npm run eval:benchmark:release-gate`.
- Do not replace route-sentinel or emergency-sentinel checks.
- Do not count synthetic inspect runs as organic tester traffic.
- Do not use inspect traces to store raw owner content or secrets.

## Existing Suites To Map Later

| Current suite | Current command or files | Future inspect-ai role |
| --- | --- | --- |
| Symptom-chat route regressions | `tests/symptom-chat*.test.ts` | Scenario tasks with structured scorers for owner-language turns |
| Model router and budget | `tests/model-router.test.ts`, `tests/model-budget.test.ts` | Mostly keep in Jest; mirror provider failure cases only if useful |
| NVIDIA/provider config | `tests/nvidia-models.test.ts` | Provider availability and fallback metadata checks |
| Telemetry invisibility | `tests/symptom-chat.telemetry-gate.test.ts` | Output-safety scorer for owner-visible payloads |
| Benchmark release gate | `npm run eval:benchmark:release-gate` | Dataset-backed inspect task after parity with current scorecard |
| Live benchmark harness | `scripts/eval-harness.ts`, `data/benchmarks/dog-triage/` | Structured task dataset with PawVital-specific safety scorers |
| Route sentinels | `npm run eval:benchmark:route-sentinels` | Keep as Jest first; optional inspect mirror for replay reporting |
| Shadow planner eval | `scripts/eval-shadow-planner-scenarios.ts` | Planner-choice task with registered-card and red-flag scorers |
| Shadow rollout readout | `tests/shadow-rollout*.test.ts`, scheduler artifacts | Sanitized artifact scorer for comparison health |
| Private tester smoke | `scripts/private-tester-smoke.mjs` | Do not migrate until credentialed browser policy is settled |

## Proposed Inspect Task Shape

Each inspect task should record:

- ticket id
- git hash
- model version or provider mode
- feature flags
- eval suite id
- case id
- sanitized input summary
- expected structured result
- actual structured result
- scorer verdict
- fallback reason, if internal and sanitized

Raw owner text, private tester identities, credentials, cookies, and raw model
payloads must stay out of inspect logs unless a separate privacy review approves
the storage path.

## Adoption Phases

### Phase 0 - Proposal Only

Document mapping and privacy rules. No package install and no CI changes.

### Phase 1 - Read-Only Mirror

Add an inspect-ai task that mirrors a small sanitized subset of an existing
non-clinical or already-adjudicated fixture. The existing Jest or benchmark gate
remains authoritative.

### Phase 2 - Parity Report

Run inspect side-by-side with the existing harness and compare:

- case count
- pass rate
- critical failure count
- unsafe downgrade count
- emergency recall
- repeated-question metric, when applicable

Do not promote inspect results until they match the existing gate semantics.

### Phase 3 - CI Advisory

Add an advisory CI job only after local parity is documented. Advisory failure
must not block merges until a separate ticket approves threshold behavior.

### Phase 4 - Blocking Gate, If Approved

Only after a clinical and engineering review, promote a narrow inspect task to a
blocking gate. The original Jest and benchmark commands stay in place unless a
separate migration ticket removes them.

## Eval Commit Link

Every inspect adoption branch must update `lessons.md` or a linked eval note
with:

- model version
- eval suite
- pass rate
- git hash
- command
- sanitized artifact path
- decision

## Acceptance Criteria For A Future Implementation Ticket

- No secrets or private tester data in inspect traces.
- Current Jest and benchmark gates still run.
- Inspect task uses deterministic scorers where possible.
- Any model-graded scorer is labeled advisory until reviewed.
- Failure output is concise enough for PR review.
- Rollback is a package/script removal, not a runtime behavior change.
