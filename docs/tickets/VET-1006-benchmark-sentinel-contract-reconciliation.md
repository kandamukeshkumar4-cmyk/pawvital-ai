# VET-1006 — Benchmark Sentinel Contract Reconciliation

Owner: `codex`
Branch: `codex/vet-1006-benchmark-cleanup-reland-v1`
Status: in progress

## Goal

Restore the emergency sentinel advisory contract so CI matches the current expanded curated benchmark.

## Scope

- restrict `must_not_miss_marker` derivation to true `tier_1_emergency` benchmark rows
- update the advisory sentinel check to require a minimum emergency sentinel floor instead of the stale exact 16-case expectation
- regenerate enriched benchmark artifacts and restamp the benchmark report

## Acceptance Criteria

- `npm run eval:sentinels:advisory` passes on current benchmark data
- `npm run eval:benchmark:validate` passes
- benchmark lint returns zero errors
- fix stays bounded to benchmark scripts and generated benchmark artifacts

## Verification

- `node scripts/enrich-benchmark-cases.mjs`
- `node scripts/stamp-gold-benchmark.mjs`
- `npm run eval:sentinels:advisory`
- `npm run eval:benchmark:validate`
- `node scripts/benchmark-lint.mjs`