# VET-1023 — Route Sentinel JSON Reporter

## Goal

Add a machine-readable reporter for the designated route-backed sentinel replay pack without replacing `scripts/eval-harness.ts`.

## Scope

- add `scripts/route-sentinel-report.mjs`
- add an npm entrypoint for the reporter
- mirror the existing route sentinel replay contract in a standalone direct-route runner
- emit compact JSON that can be reviewed manually now and uploaded as an artifact later

## Non-goals

- replacing `scripts/eval-harness.ts`
- editing the sentinel replay fixture or Jest suite
- changing runtime route behavior, CI workflows, or benchmark source data

## JSON Output

- `generatedAt` — ISO timestamp for report generation
- `reporter` — stable reporter identifier
- `status` — overall `passed`, `failed`, or `error`
- `suite` — npm script name, parity source test path, fixture path, benchmark path, execution mode, and invocation command
- `fixturePack` — total case count, mode counts, expected type counts, expected reason-code counts, and a per-case manifest copied from the replay fixture shape
- `guardChecks` — machine-readable breadth checks that mirror the sentinel pack floor from the existing test
- `summary` — total, passed, failed, and actual response-type counts from the replay run
- `results` — one record per replay case with expected values, actual route outcome, check-level pass/fail data, and failure logs when relevant

## Validation

- `node scripts/route-sentinel-report.mjs`

## Notes

- The reporter stays intentionally narrow and reuses the same fixture manifest plus benchmark request source that the route sentinel test already relies on.
- The direct runner uses deterministic in-process mocks so the JSON report is stable even when local Jest startup is not the best integration surface for artifact generation.
