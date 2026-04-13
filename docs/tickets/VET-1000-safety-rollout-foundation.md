# VET-1000 — Safety Rollout Foundation

Owner: `codex`
Branch: `codex/vet-1000-safety-rollout-foundation-v1`
Status: in progress

## Goal

Establish the Phase 0 and Phase 1 foundation for the dog-only deterministic safety rollout:

- baseline reality
- queue truth
- guarded unknown normalization
- payload safety invariants
- advisory emergency sentinel CI coverage

## Scope

### Project-memory and planning work

- replace the stale sidecar-first roadmap with the safety-rollout roadmap
- document April 13 baseline evidence
- reconcile stale review-queue entries against actual GitHub/master state
- publish the next ticket split for Codex and Qoder

### Runtime and CI work

- add canonical `unknown` support for guarded structured fields
- extend deterministic coercion for guarded unknown replies
- lock the emergency sentinel subset in an advisory CI job

## Acceptance Criteria

- roadmap reflects the corrected safety-rollout sequence
- Phase 0 baseline doc exists with queue evidence and benchmark baseline
- guarded unknown tests pass for the four targeted fields
- advisory sentinel CI job exists and runs without blocking the main merge gate
- shared project memory can be refreshed without stale in-review duplicates

## Notes

- No feature-flag infrastructure is introduced in this ticket.
- Rollback remains revert of the isolated PR.
- This ticket intentionally stops short of route decomposition and uncertainty wiring.

## Follow-On Ticket Split

### Codex-owned

1. `VET-1001` — route decomposition
   Branch: `codex/vet-1001-route-decomposition-v1`
2. `VET-1002` — uncertainty integration and terminal outcomes
   Branch: `codex/vet-1002-uncertainty-terminal-outcomes-v1`

### Qoder-owned

1. `VET-1003` — contradiction detection pack
   Branch: `qoder/vet-1003-contradiction-detection-pack-v1`
2. `VET-1004` — curated benchmark expansion
   Branch: `qoder/vet-1004-curated-benchmark-expansion-v1`
3. `VET-1005` — breed prior closure
   Branch: `qoder/vet-1005-breed-prior-closure-v1`

## Qoder Guardrails

- one ticket per branch
- no new inline route logic after Phase 2 starts
- no bundling unrelated behavior changes
- Qoder hands work back for Codex review before any landing decision
