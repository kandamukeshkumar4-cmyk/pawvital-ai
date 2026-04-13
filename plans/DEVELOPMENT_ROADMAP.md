# PawVital Safety Rollout — Active Roadmap

Effective: 2026-04-13

## Phase 0 — Clear the Deck [COMPLETE]
- Reconcile review queue to zero
- Baseline gold-v1 benchmark and synthetic eval harness
- Sync roadmap and ticket board with shipped state

## Phase 1 — Unknown Handling and Payload Safety
- Structured-unknown fix for 4 guarded fields (appetite_status, blood_color, blood_amount, wound_discharge)
- Payload safety CI invariant
- Advisory emergency-sentinel CI gate (gold-v1, 16 cases, zero-miss binary)
- Owner: Qoder

## Phase 2 — Route Decomposition
- Refactor 4,707-line route.ts to orchestration-only (<2,000 lines)
- Extract: intake, extraction/normalization, question-flow, sidecar/evidence, report/response
- No behavior change; all existing tests must pass unchanged
- Owner: Codex

## Phase 3 — OOD and Abstention
- Wire uncertainty-contract.ts (currently dead code) into live route
- Implement out_of_scope and cannot_assess terminal outcomes
- Define owner UX copy before implementation
- Rollback: revert isolated PR
- Owner: Codex (core wiring), Qoder (UX copy/tests)

## Phase 4 — Contradiction Awareness
- Detection and logging only — no resolution ladder
- Capture contradiction type, source pair, case context in internal telemetry
- No owner-facing behavior change
- Owner: Qoder (detection/tests), Codex (review/integration)

## Phase 5 — Benchmark Gate
- Expand to 200+ cases, 30+ emergency, 15+ same-day, 45/50 complaint families
- Reduce unknown_concern below 25% of total
- Promote to blocking CI gate (zero-miss on emergency sentinels)
- Owner: Qoder (dataset), Codex (gate criteria/CI)

## Phase 6 — Breed Priors and Sidecar Promotion
- Add Pug, Corgi, Miniature Schnauzer, Irish Wolfhound, Newfoundland, mixed-breed fallback
- Sidecar shadow promotion one lane at a time after Phase 5 green
- Contradiction resolution only if Phase 4 telemetry shows it is needed
- Owner: Qoder (breed), Codex (sidecar/contradiction)
