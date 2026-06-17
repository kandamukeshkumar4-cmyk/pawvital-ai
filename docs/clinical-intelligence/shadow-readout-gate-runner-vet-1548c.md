# VET-1548C - Shadow Readout Gate Runner

## Purpose

`scripts/shadow-readout-gate-runner.mjs` is the one-command admin runner for the
repeated PawVital shadow-readout gate. It is read-only unless explicitly asked
to dispatch the existing GitHub Actions scheduler.

Default command:

```bash
npm run shadow:readout-gate
```

Machine-readable output:

```bash
npm run shadow:readout-gate -- --json
```

Optional scheduler dispatch and wait:

```bash
npm run shadow:readout-gate -- --trigger-scheduler --wait-seconds 180
```

Prefer the latest scheduler artifact after a completed scheduler run:

```bash
npm run shadow:readout-gate -- --prefer-artifact --json
```

## What It Checks

- Confirms the current production source SHA from GitHub commit status.
- Confirms production deployment status with `vercel inspect` when available.
- Reads issue `#495` scheduler comments and parses the latest scheduler report.
- Optionally dispatches `shadow-readout-scheduler.yml` on `master`.
- Optionally downloads the latest scheduler artifact and uses its JSON report.
- Emits the gate fields needed for a GO or HOLD decision.

The runner prints:

- `production_sha`
- `production_deployment_status`
- `report_count`
- `latest_window_report_created_at`
- `observation_count`
- `second_opinion_trace: requested=..., not_requested=...`
- `shadow_comparison_count`
- `warning`
- `decision`

## Decision Policy

The runner returns `GO` only when all of these are true:

- production deployment status is confirmed ready, or GitHub deployment status
  is `success` when `--no-vercel` is used
- latest scheduler report is not blocked, failed, not due, or dry-run
- scheduler warning is `null`
- `report_count` increased compared with the previous scheduler report when a
  previous report is available
- `second_opinion_trace.requested > 0`
- `shadow_comparison_count > 0`

Otherwise it returns `HOLD` with a reason:

- `production_deployment_not_ready`
- `missing_scheduler_report`
- `scheduler_blocked`
- `readout_warning`
- `report_count_unchanged`
- `second_opinion_not_requested`
- `missing_shadow_comparisons`

By default, a HOLD is a successful readout command with a HOLD decision. Add
`--fail-on-hold` when the command is used as a hard CI/admin gate and should
exit with code `2` on HOLD.

## Scope Guard

This ticket is tooling, tests, and docs only. The runner does not:

- change runtime route code
- change model flags
- change Vercel environment variables
- change Supabase schema
- generate production traffic
- print secret values

## Validation Checklist

Before handoff, run:

```bash
npm test -- --runInBand --runTestsByPath tests/shadow-readout-gate-runner.test.ts
npm run build
npm run security:secrets
git diff --check
```
