# VET-1026 — Route Dangerous Replay CLI

## Goal

Add a machine-readable local CLI that replays the curated dangerous benchmark slice through the real symptom-chat route under deterministic mocks.

## Scope

- add `scripts/route-dangerous-replay.mjs`
- keep the route runtime real and local while mocking external integrations in-process
- select the dangerous slice directly from `data/benchmarks/dog-triage/gold-v1-enriched.jsonl`
- reuse sentinel fixture extraction payloads where they already exist and derive deterministic extraction for the remaining dangerous cases
- support optional artifact writing with `--output=<path>`

## Non-goals

- editing `scripts/eval-harness.ts`
- changing runtime files, workflow files, or benchmark source data
- replacing the narrower route-sentinel reporter from VET-1023

## Dangerous Slice Contract

- source of truth is the curated benchmark row set where `must_not_miss_marker === true`
- the CLI replays that full slice in benchmark order
- the benchmark request payload remains the owner-turn source of truth
- benchmark expectations stay the replay contract for response type, readiness, symptom inclusion, and follow-up state checks

## JSON Output

- `generatedAt` — ISO timestamp for replay generation
- `reporter` — stable CLI identifier
- `status` — `passed`, `failed`, or `error`
- `suite` — execution mode, source paths, simulated comparator path, and invocation command
- `dangerousSlice` — selection rule, case counts, benchmark distribution summaries, and extraction-source counts
- `guardChecks` — machine-readable checks that confirm the selected slice still matches the curated dangerous-slice contract
- `summary` — total/passed/failed case counts, check counts, expected-vs-actual response type counts, and extraction-source counts
- `results` — one record per replayed benchmark case with benchmark metadata, deterministic mock extraction, actual route outcome, and per-check pass/fail data
- `error` — present only when the CLI cannot finish a replay run

## Validation

- `node scripts/route-dangerous-replay.mjs`

## Notes

- The CLI is route-backed, not simulated, and stays intentionally separate from `scripts/eval-harness.ts`.
- Completed replay runs always emit JSON to stdout for manual review and future artifact upload, even when the route results contain case-level mismatches.
