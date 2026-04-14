# VET-1027 — Route Dangerous Replay Advisory CI Job

## Goal

Wire the route-dangerous replay CLI into CI as a non-blocking advisory job with artifact upload.

## Scope

- update `.github/workflows/ci.yml`
- add a dedicated advisory job for `scripts/route-dangerous-replay.mjs`
- upload the generated JSON report as a downloadable CI artifact
- keep the job advisory only and out of `ci-gate`

## Non-goals

- changing runtime code, benchmark source data, tests, or package scripts
- making the dangerous replay job blocking
- altering the existing blocking route sentinel replay gate

## Workflow Behavior

- adds `Route Dangerous Replay Advisory` as a separate `continue-on-error` job
- restores cached `node_modules` from the shared install job, matching the rest of CI
- runs `node scripts/route-dangerous-replay.mjs --output=data/benchmark/route-dangerous-replay-advisory.json` when the CLI is present on the checked-out ref
- marks the advisory job failed when the generated report status is `failed`, `error`, or missing
- uploads `data/benchmark/route-dangerous-replay-advisory.json` as `route-dangerous-replay-advisory-artifacts`

## Landing-order Safety

- the current master base for this ticket does not yet contain `scripts/route-dangerous-replay.mjs`
- until VET-1026 lands on the checked-out ref, the job writes a small JSON artifact with `status: "skipped"` and `reason: "script_missing"`
- once VET-1026 is present, the same workflow automatically starts running the real route-backed replay without further workflow changes

## Acceptance

- `Route Dangerous Replay Advisory` is advisory only and does not participate in `ci-gate`
- CI always uploads a machine-readable JSON artifact for the advisory job
- the job stays robust on refs that do not yet contain the CLI and becomes live automatically after VET-1026 lands
