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

## VET-1100 World-Class Execution Guardrails

- Canonical spec: `plans/VET-1100-world-class-completion-mega-ticket.md`
- Hard prerequisite before any Phase 3 branch opens: `plans/SIDECAR_SIZING.md`
- `VET-1106` remains blocked unless the chosen topology preserves:
  - 20% VRAM headroom on every GPU tier
  - sync-path latency budget below 6 seconds
- Ownership update:
  - Codex owns `VET-1104` and `VET-1105`
  - Codex owns `services/multimodal-consult-service/app/main.py`
  - Codex owns `services/async-review-service/app/main.py`
- Phase 3 runtime rule:
  - `VET-1101` through `VET-1105` must each ship and test a `FORCE_FALLBACK=1` kill switch
- Phase 4 to Phase 5 gate:
  - `>=95%` healthy samples over a rolling 24-hour window
  - sample every 5 minutes
  - require at least 288 samples
- Shadow activation rule for `VET-1109`:
  - 100% of `high` and `emergency` cases
  - 5% of routine traffic by deterministic case hash
  - routine sampling auto-disables if overhead exceeds `+50ms p95` over a rolling 15-minute window or shadow error rate exceeds 20%
- Promotion rule for `VET-1110`:
  - no service reaches `ready` without the synthetic 2x baseline load test
- Corpus dependency:
  - `VET-1111` waits for `VET-1102`
  - embedding regeneration lands before domain backfill
- Phase 8 split:
  - `VET-1114a` = forward dual-write plus proposal logic
  - `VET-1114b` = historical backfill and reconciliation
