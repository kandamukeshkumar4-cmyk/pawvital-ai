# PawVital Safety Rollout Roadmap

This document is the single source of truth for the dog-only deterministic safety program adopted on April 13, 2026. It replaces the older sidecar-first roadmap as the primary delivery plan for the symptom-chat safety rollout.

## Current Snapshot

As of April 13, 2026:

- `src/app/api/ai/symptom-chat/route.ts` is still a 4,720-line monolith on this branch.
- The curated dog gold benchmark is still undersized: 101 total cases, 16 must-not-miss emergency cases, 3 same-day cases, and 33 of 50 complaint families covered.
- The synthetic evaluation harness still reports perfect scores because it is simulation-based, not a live route gate.
- Only `vision-preprocess-service` is configured and healthy in the live app boundary; the heavier sidecars remain advisory/offline for production.
- The review queue in shared project memory drifted away from actual GitHub/master state and needed explicit reconciliation before any new safety wave could be trusted.

## Foundation Work On `codex/vet-1000-safety-rollout-foundation-v1`

This branch establishes the Phase 0 and Phase 1 foundation needed before route decomposition and uncertainty wiring:

- Recorded an April 13 baseline for:
  - the curated gold-v1 dataset and emergency sentinel subset
  - the synthetic eval harness run `EVAL-2026-04-13-225`
- Added an advisory emergency sentinel CI job without making it blocking.
- Extended guarded unknown handling so these structured fields can resolve explicit canonical `unknown` values:
  - `appetite_status`
  - `blood_color`
  - `blood_amount`
  - `wound_discharge`
- Added regression coverage for those guarded unknown paths.
- Replaced the stale roadmap with this safety-first program and documented queue reconciliation evidence.

## Delivery Phases

| Phase | Goal | Status |
| --- | --- | --- |
| 0 | Clear the deck: baseline reality, reconcile stale review queue, sync docs | In progress on `VET-1000` |
| 1 | Unknown handling, payload safety invariants, advisory emergency-sentinel gate | In progress on `VET-1000` |
| 2 | Route decomposition with no behavior change | Next |
| 3 | Wire uncertainty contract, add `out_of_scope` and `cannot_assess` | Planned |
| 4 | Contradiction detection and logging only | Planned |
| 5 | Expand curated benchmark and promote it to blocking CI | Planned |
| 6 | Breed priors and evidence-driven sidecar promotion | Planned |

## Phase Detail

### Phase 0 — Clear the Deck

Scope:

- Reconcile every stale in-review item in shared memory against actual GitHub/master state.
- Capture the April 13 baseline for the curated benchmark and synthetic harness.
- Sync roadmap, ticket board, and current-context notes to the safety rollout.

Ship criteria:

- Shared-memory review queue is zeroed for stale items.
- Baseline evidence is recorded in repo docs.
- The roadmap reflects the safety rollout instead of the old sidecar-first sequence.

### Phase 1 — Unknown Handling And Payload Safety

Scope:

- Canonical `unknown` values for the guarded structured fields.
- Payload safety locked with focused route assertions.
- Advisory emergency sentinel CI coverage.

Ship criteria:

- Guarded unknowns normalize deterministically.
- Payload telemetry remains stripped from owner-facing `service_observations`.
- Advisory sentinel job runs in CI without blocking merge.

### Phase 2 — Route Decomposition

Scope:

- Extract `route.ts` into callable modules with no behavior change:
  - intake/request parsing
  - answer extraction and normalization
  - question-flow orchestration
  - sidecar/evidence integration
  - report/response serialization

Ship criteria:

- `route.ts` drops below 2,000 lines.
- Existing route/program tests pass without changed expectations.
- New deterministic safety logic lands in modules, not inline route branches.

### Phase 3 — OOD And Abstention

Scope:

- Wire `src/lib/clinical/uncertainty-contract.ts` into live route call sites.
- Add deterministic OOD detection and explicit `out_of_scope` terminal responses.
- Add missing-critical-info gating and explicit `cannot_assess` terminal responses.
- Add owner-visible copy for each terminal outcome.

Ship criteria:

- The route calls `resolveUncertainty()` after extraction, before question advancement, and before report generation.
- `terminal_state`, `reason_code`, `owner_message`, and `recommended_next_step` serialize cleanly.
- Route tests cover both terminal outcomes end-to-end.

### Phase 4 — Contradiction Awareness

Scope:

- Detect and log contradictions only.
- Do not ship a resolution ladder yet.

Ship criteria:

- Contradiction telemetry emits with source pair and case context.
- No owner-facing behavior changes.

### Phase 5 — Benchmark Gate

Scope:

- Expand curated benchmark coverage to 200+ cases.
- Reach at least 30 emergency cases and 15 same-day cases.
- Fill at least 45 of 50 complaint families.
- Reduce `unknown_concern` concentration below 25 percent.

Ship criteria:

- Expanded curated benchmark is committed.
- Curated baseline is locked.
- Blocking CI gate enforces zero misses on designated emergency sentinel cases and no regression against the locked curated baseline.

### Phase 6 — Breed Priors And Sidecar Promotion

Scope:

- Add missing breed priors and explicit mixed-breed fallback.
- Promote sidecars one lane at a time through shadow mode only after Phase 5 gates are green.
- Design contradiction resolution only if Phase 4 telemetry shows it is necessary.

Ship criteria:

- No speculative safety logic.
- Every sidecar promotion is backed by shadow evidence and benchmark-neutral-or-better results.

## Baseline Reality

### Curated dog gold-v1

- Version: `gold-v1`
- Freeze date: `2026-04-10`
- Total cases: `101`
- Must-not-miss emergency sentinel cases: `16`
- Same-day cases: `3`
- Complaint families covered: `33 / 50`
- `unknown_concern` share: `54 / 101`

The curated set is the real safety baseline. It is currently too small to justify percentage-style blocking thresholds beyond the emergency sentinel subset.

### Synthetic eval harness

- Latest recorded run on this branch: `data/benchmark/scorecard-EVAL-2026-04-13-225.json`
- Result: `PASS`
- Important caveat: `scripts/eval-harness.ts` is still simulation-based and cannot be treated as the final merge gate for clinical safety.

## Ownership And Branch Rules

- Codex is principal engineer and review gate.
- Qoder is a bounded worker lane and may not choose architecture or widen scope.
- Every task gets its own branch:
  - `codex/vet-<id>-<slug>-v1`
  - `qoder/vet-<id>-<slug>-v1`
- Qoder may not add inline route logic after Phase 2 begins.
- Rollback remains revert of the isolated PR; no feature-flag system is assumed.

## Next Ticket Split

### Codex

- `VET-1001` — route decomposition
  - Branch: `codex/vet-1001-route-decomposition-v1`
  - Ownership: route orchestration extraction, no behavior change
- `VET-1002` — uncertainty integration and terminal outcomes
  - Branch: `codex/vet-1002-uncertainty-terminal-outcomes-v1`
  - Ownership: `resolveUncertainty()` call sites, terminal response serialization, owner-safe outcome wiring

### Qoder

- `VET-1003` — contradiction detection pack
  - Branch: `qoder/vet-1003-contradiction-detection-pack-v1`
  - Ownership: contradiction detection helper tests, route regressions, no owner-facing behavior change
- `VET-1004` — curated benchmark expansion
  - Branch: `qoder/vet-1004-curated-benchmark-expansion-v1`
  - Ownership: new curated cases, complaint-family coverage, adjudication artifacts
- `VET-1005` — breed prior closure
  - Branch: `qoder/vet-1005-breed-prior-closure-v1`
  - Ownership: new breed priors plus mixed-breed fallback after Phase 5 readiness

## Update Rule

After every meaningful implementation task:

- update this roadmap if phase status changed
- keep the baseline section current
- keep the next ticket split current
- keep Qoder ticket boundaries explicit and reviewable
