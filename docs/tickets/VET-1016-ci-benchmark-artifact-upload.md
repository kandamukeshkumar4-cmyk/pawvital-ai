# VET-1016 — CI Benchmark Artifact Upload

## Scope

- upload benchmark-generated reports from CI so reviewers can inspect them from the run page
- keep the change limited to workflow plumbing in `ci.yml`
- preserve the existing blocking vs advisory job behavior

## Why This Ticket Exists

- benchmark-related CI jobs already generate reviewable files inside the runner workspace, but those files disappear when the run finishes
- PR reviewers currently have to rerun benchmark commands locally to inspect the scorecards and lint report
- artifact upload fixes that visibility gap without changing runtime code or benchmark source data

## Changes

- updated `Emergency Sentinel Advisory` so the dangerous benchmark scorecard still runs and uploads even if the sentinel advisory step fails first
- upload `data/benchmark/scorecard-*.json` from the advisory job as `emergency-sentinel-advisory-benchmark-artifacts`
- updated `Benchmark Integrity` so schema validation and lint both run far enough to produce their reports before the job exits
- upload these files from the benchmark integrity job as `benchmark-integrity-artifacts`:
  - `data/benchmark/scorecard-*.json`
  - `data/benchmarks/dog-triage/benchmark-lint-report.md`
- added explicit result-preservation steps so artifact upload does not soften CI failures

## Acceptance

- PR reviewers can download benchmark scorecards and the lint report directly from CI
- `Benchmark Integrity` still fails when validation or lint fails
- `Emergency Sentinel Advisory` remains advisory while still publishing its dangerous-slice scorecard
- no runtime files or benchmark source files are changed