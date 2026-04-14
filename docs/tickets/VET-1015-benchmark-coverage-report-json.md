# VET-1015 — Benchmark Coverage Report JSON

## Scope

- add a machine-readable coverage summary for the curated dog-triage benchmark
- keep the change limited to a standalone script and this ticket note
- avoid any benchmark source edits, workflow edits, or runtime changes

## Why This Ticket Exists

- the curated benchmark now has enough breadth that quick manual counting is noisy and error-prone
- reviewers and future benchmark-expansion tickets need a simple JSON snapshot of current coverage
- the report should stay read-only and scriptable so it can be used locally or uploaded later without rewriting the benchmark files

## Changes

- added `scripts/benchmark-coverage-report.mjs`
- the script reads `data/benchmarks/dog-triage/gold-v1-enriched.jsonl` by default
- the script prints JSON to stdout with these top-level fields:
  - `total_curated_case_count`
  - `emergency_count`
  - `same_day_count`
  - `unknown_concern_case_count`
  - `unknown_concern_percentage`
  - `complaint_family_coverage`
  - `low_depth_families`
- added `--input=...` and `--low-depth-threshold=...` flags for alternate read-only reporting without changing the default usage

## Acceptance

- `node scripts/benchmark-coverage-report.mjs` prints machine-readable JSON
- the output covers complaint-family counts across the full curated family universe
- low-depth families are surfaced with a configurable threshold that defaults to `5`
- no benchmark source files, runtime files, or workflow files are changed
