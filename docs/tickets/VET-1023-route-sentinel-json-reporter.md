# VET-1023 — Route Sentinel JSON Reporter

## Goal

Add a machine-readable reporter for the designated route-backed sentinel replay pack without replacing `scripts/eval-harness.ts`.

## Scope

- add `scripts/route-sentinel-report.mjs`
- keep the sentinel fixture and Jest pack as the parity contract
- replay the route-backed cases directly in-process so the output is stable JSON
- support optional artifact writing with `--output=<path>`

## Non-goals

- replacing `scripts/eval-harness.ts`
- editing the sentinel replay fixture or Jest suite
- changing runtime route behavior, CI workflows, or benchmark source data
- adding package scripts or workflow plumbing in this ticket

## JSON Output

- `generatedAt` — ISO timestamp for report generation
- `reporter` — stable reporter identifier
- `status` — overall `passed`, `failed`, or `error`
- `suite` — parity source test path, fixture path, benchmark path, execution mode, and invocation command
- `fixturePack` — total case count, mode counts, expected type counts, expected reason-code counts, and a normalized per-case manifest copied from the replay fixture
- `guardChecks` — machine-readable breadth checks that mirror the sentinel pack floor from the existing test
- `summary` — total/passed/failed case counts, total/passed/failed check counts, and actual response-type counts
- `results` — one record per replay case with request message, expected values, actual route outcome, check-level pass/fail data, and failure logs when relevant
- `error` — present only when the reporter cannot finish the replay run

## Validation

- `node scripts/route-sentinel-report.mjs`

## Notes

- The reporter stays intentionally narrow and reuses the same fixture manifest plus benchmark request source that the route sentinel test already relies on.
- External service calls are mocked in-process so the deterministic clinical and route logic stay real while the JSON output remains stable enough for manual review and future artifact upload.
