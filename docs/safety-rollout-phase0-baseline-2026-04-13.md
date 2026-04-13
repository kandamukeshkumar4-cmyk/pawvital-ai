# Safety Rollout Phase 0 Baseline

Date: April 13, 2026
Branch: `codex/vet-1000-safety-rollout-foundation-v1`

## Why This Exists

The safety rollout could not start from the previous project-memory state because the review queue and roadmap had drifted away from actual GitHub/master reality. This record captures the April 13 baseline before route decomposition and uncertainty wiring continue.

## Curated Gold-v1 Baseline

Source files:

- `data/benchmarks/dog-triage/gold-v1-manifest.json`
- `data/benchmarks/dog-triage/gold-v1-report.md`
- `data/benchmarks/dog-triage/gold-v1-enriched.jsonl`

Current baseline:

| Metric | Value |
| --- | --- |
| Freeze date | `2026-04-10` |
| Total cases | `101` |
| Must-not-miss emergency cases | `16` |
| Same-day cases | `3` |
| Complaint families covered | `33 / 50` |
| `unknown_concern` cases | `54 / 101` |

Interpretation:

- The curated set is useful for emergency sentinel gating and directional quality checks.
- It is not yet large or balanced enough to justify percentage-based blocking thresholds across the full program.
- Benchmark expansion remains mandatory before Phase 5 can become a real merge gate.

## Curated Emergency Sentinel Check

Command run:

```bash
npm run eval:sentinels:advisory
```

Result:

- PASS
- Confirmed exactly `16` designated must-not-miss emergency sentinel cases in `gold-v1-enriched.jsonl`
- Confirmed each sentinel remains dog-only and mapped to emergency-safe expectations

Current family distribution inside the sentinel subset:

- `difficulty_breathing`: `10`
- `pregnancy_birth`: `2`
- `swollen_abdomen`: `2`
- `coughing`: `1`
- `coughing_breathing_combined`: `1`
- `heat_intolerance`: `1`
- `nasal_discharge`: `1`
- `seizure_collapse`: `1`
- `trembling`: `1`

## Synthetic Eval Harness Baseline

Command run:

```bash
npm run eval:benchmark
```

Result:

- Run id: `EVAL-2026-04-13-225`
- Output file: `data/benchmark/scorecard-EVAL-2026-04-13-225.json`
- PASS across all reported metrics

Important caveat:

- `scripts/eval-harness.ts` still simulates outcomes and writes idealized scorecards.
- This output is useful as an advisory engineering baseline only.
- It is not the blocking clinical benchmark for the safety rollout.

## Review Queue Reconciliation

The shared-memory queue held nine stale items, not seven:

| Ticket | Prior queue state | Truth on April 13, 2026 | Evidence | Reconciliation action |
| --- | --- | --- | --- | --- |
| `VET-722` | In review | Already landed | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | Remove stale in-review duplicate |
| `VET-725` | In review with April 3 fail | Payload leak later fixed on master | PR #73, merge `5a35014d5290b90bfcd02aba0a0bdeec9e0985d2` | Remove stale in-review duplicate and treat April 3 fail as remediated by later merged fix |
| `VET-726` | In review | Already landed | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | Remove stale in-review duplicate |
| `VET-727` | In review | Already landed | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | Remove stale in-review duplicate |
| `VET-729` | In review | Functionality is already on `master` via blocker hardening | PR #74, merge `6ecb905c98cd63c8c872e3ec8900bdc9924bce60` | Mark standalone queue item absorbed/superseded by landed integration |
| `VET-730` | In review | Landed | PR #54, merge `a6fb3366378b019f0b7537ad6de3d411f8f90615` | Remove stale in-review duplicate |
| `VET-830` | In review | Landed | PR #50, merge `88a876680e567474a7b8af510937f42e43e65347` | Remove stale in-review duplicate |
| `VET-831` | In review | Landed | PR #55, merge `72a339af34dc0b5376e351c1304c77713faa99a2` | Remove stale in-review duplicate |
| `VET-734` | In review | Functionality is already on `master` via blocker hardening | PR #74, merge `6ecb905c98cd63c8c872e3ec8900bdc9924bce60` | Mark standalone queue item absorbed/superseded by landed integration |

## What This Branch Changes In Code

- Added canonical `unknown` handling for:
  - `blood_color`
  - `blood_amount`
  - `wound_discharge`
- Extended deterministic unknown coercion so ambiguous owner replies can resolve to `unknown` for guarded choice questions.
- Added focused route coverage for the guarded unknown flows.
- Added an advisory CI job for:
  - `npm run eval:sentinels:advisory`
  - `npm run eval:benchmark:dangerous`

## Remaining Risks After Phase 0 Foundation

- `route.ts` is still too large to safely absorb the uncertainty ladder without decomposition.
- `uncertainty-contract.ts` is still dead code until Phase 3 wiring lands.
- The curated benchmark still needs major family and same-day coverage expansion.
- Contradiction handling is still not live beyond the existing narrow cases.
