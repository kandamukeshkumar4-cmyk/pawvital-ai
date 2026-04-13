# VET-1010 — CI Actions Runtime Hygiene

## Scope

- upgrade GitHub Actions workflow pins off deprecated Node 20-based `actions/*@v4`
- remove the noisy cross-run node_modules cache reservation failure in `ci.yml`
- keep CI behavior unchanged beyond cleaner runner compatibility and quieter install logs

## Root Cause

- `ci.yml` used a shared `node_modules` cache key keyed only by OS and `package-lock.json`
- concurrent runs could race to reserve the same cache key, producing `Unable to reserve cache` warnings even when the pipeline succeeded
- multiple workflows still pinned `actions/checkout@v4`, `actions/setup-node@v4`, and `actions/cache/*@v4`, which triggered GitHub's Node 20 deprecation warning

## Changes

- upgraded workflow action pins to current major versions:
  - `actions/checkout@v5`
  - `actions/setup-node@v6`
  - `actions/cache/save@v5`
  - `actions/cache/restore@v5`
- changed the `node_modules` cache key in `ci.yml` to be per-run using `github.run_id` and `github.run_attempt`
- left the overall CI job graph and auto-fix / review behavior unchanged

## Acceptance

- CI workflow definitions lint cleanly
- install job no longer logs cache reservation warnings from concurrent runs
- GitHub Actions deprecation warnings for Node 20 action runtimes are removed for the touched workflows
