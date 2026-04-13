# Safety Rollout Phase 0 Baseline

Date: 2026-04-13
Branch: `codex/vet-1000-phase0-v1`
Master SHA at baseline: `8508be714fe99801e7b4e06c11c4c3c511679ba1`

## Why This Exists

Phase 0 of the PawVital Safety Rollout requires a clean, verified baseline before route
decomposition and uncertainty wiring begin. This record is the authoritative Phase 0
snapshot as of April 13, 2026.

---

## Queue Reconciliation

The shared-memory queue held nine stale items. Each was examined against git log and GitHub
PR state. Dispositions are final — no re-landing or re-review required.

| Ticket | Queue state before reconciliation | Truth on 2026-04-13 | Evidence | Disposition |
| --- | --- | --- | --- | --- |
| `VET-722` | In review | Already landed on master | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | `already_landed` |
| `VET-725` | In review — April 3 FAIL recorded | Later fixed and merged | PR #73, merge `5a35014d5290b90bfcd02aba0a0bdeec9e0985d2` | `already_landed` — April 3 fail superseded by PR #73 fix |
| `VET-726` | In review | Already landed on master | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | `already_landed` |
| `VET-727` | In review | Already landed on master | PR #52, merge `e387f12be2a00c7c0a8c7a074ebcd62049f5b442` | `already_landed` |
| `VET-729` | In review | Functionality absorbed into master via blocker hardening | PR #74, merge `6ecb905c98cd63c8c872e3ec8900bdc9924bce60` | `already_landed` — standalone branch superseded by integration |
| `VET-730` | In review | Already landed on master | PR #54, merge `a6fb3366378b019f0b7537ad6de3d411f8f90615` | `already_landed` |
| `VET-830` | In review | Already landed on master | PR #50, merge `88a876680e567474a7b8af510937f42e43e65347` | `already_landed` |
| `VET-831` | In review | Already landed on master | PR #55, merge `72a339af34dc0b5376e351c1304c77713faa99a2` | `already_landed` |
| `VET-734` | In review | Functionality absorbed into master via blocker hardening | PR #74, merge `6ecb905c98cd63c8c872e3ec8900bdc9924bce60` | `already_landed` — standalone branch superseded by integration |

Review queue items remaining after reconciliation: **0**

---

## Baseline Scripts

### 1. Advisory Emergency Sentinel Gate

Command: `npm run eval:sentinels:advisory`
Script: `scripts/check-emergency-sentinels.mjs`
Result: **PASS**

- Sentinel cases confirmed: 16
- Source: `data/benchmarks/dog-triage/gold-v1-enriched.jsonl`

Family distribution:

| Family | Count |
| --- | --- |
| `difficulty_breathing` | 10 |
| `pregnancy_birth` | 2 |
| `swollen_abdomen` | 2 |
| `coughing` | 1 |
| `coughing_breathing_combined` | 1 |
| `heat_intolerance` | 1 |
| `nasal_discharge` | 1 |
| `seizure_collapse` | 1 |
| `trembling` | 1 |

### 2. Benchmark — Full Gold-v1

Command: `npm run eval:benchmark`
Script: `scripts/eval-harness.ts`
Run ID: `EVAL-2026-04-13-866`
Output: `data/benchmark/scorecard-EVAL-2026-04-13-866.json`
Result: **PASS**

| Metric | Value | Target | Status |
| --- | --- | --- | --- |
| Emergency Recall | 100.0% | >98% | PASS |
| Unsafe Downgrade Rate | 0.00% | <1% | PASS |
| Abstention Correctness | 100.0% | >90% | PASS |
| Question Efficiency | 100.0% | >70% | PASS |
| Repeat Question Rate | 0.00% | <5% | PASS |
| Disposition Agreement | 100.0% | >85% | PASS |
| Over-Escalation Rate | 0.0% | <15% | PASS |

Total cases: 575 (synthetic harness — not a live route gate)

Caveat: `scripts/eval-harness.ts` simulates outcomes against benchmark fixtures. Scores are
advisory engineering baselines, not blocking clinical thresholds.

### 3. Benchmark — Dangerous/Emergency Slice

Command: `npm run eval:benchmark:dangerous`
Run ID: `EVAL-2026-04-13-622`
Output: `data/benchmark/scorecard-EVAL-2026-04-13-622.json`
Result: **PASS**

| Metric | Value | Target | Status |
| --- | --- | --- | --- |
| Emergency Recall | 100.0% | >98% | PASS |
| Unsafe Downgrade Rate | 0.00% | <1% | PASS |
| Abstention Correctness | 100.0% | >90% | PASS |
| Disposition Agreement | 100.0% | >85% | PASS |

Total cases (dangerous slice): 130

### 4. Full Test Suite

Command: `npm test -- --runInBand`
Result: **PASS**

| Metric | Value |
| --- | --- |
| Test Suites | 33 passed, 1 skipped, 33 of 34 total |
| Tests | 601 passed, 4 skipped, 605 total |
| Failures | 0 |

---

## Route File Line Count at Baseline

File: `src/app/api/ai/symptom-chat/route.ts`
Lines: **4,720**

This is the line count on master SHA `8508be714fe99801e7b4e06c11c4c3c511679ba1`.
Route decomposition target (Phase 2): reduce to <2,000 lines of orchestration-only code.

---

## Curated Gold-v1 Dataset State

Source files:

- `data/benchmarks/dog-triage/gold-v1-manifest.json`
- `data/benchmarks/dog-triage/gold-v1-report.md`
- `data/benchmarks/dog-triage/gold-v1-enriched.jsonl`

| Metric | Value |
| --- | --- |
| Freeze date | 2026-04-10 |
| Total cases | 101 |
| Must-not-miss emergency cases | 16 |
| Same-day cases | 3 |
| Complaint families covered | 33 / 50 |
| `unknown_concern` cases | 54 / 101 |

The curated set is sufficient for emergency sentinel gating. It is not yet large or balanced
enough for percentage-based blocking thresholds. Benchmark expansion is mandatory before
Phase 5 becomes a real CI merge gate.

---

## Remaining Risks Before Phase 1

- `route.ts` is a 4,720-line monolith — decomposition is Phase 2 and is required before
  uncertainty wiring can proceed safely.
- `uncertainty-contract.ts` is still dead code — Phase 3 wiring has not landed.
- The curated benchmark needs major family coverage and same-day case expansion before
  Phase 5 can be promoted to a blocking gate.
- Contradiction handling beyond existing narrow coercion cases is not live.
