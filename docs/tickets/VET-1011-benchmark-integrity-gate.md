# VET-1011 — Benchmark Integrity Gate

## Scope

- add a first-class CI job for curated benchmark integrity
- keep the job focused on dataset health, not simulated adjudication scores
- leave the existing emergency sentinel advisory job unchanged

## Why This Ticket Exists

- the expanded curated benchmark is already on `master`, but CI only checks the emergency sentinel slice as an advisory lane
- `eval-harness.ts` still documents itself as a simulation scaffold, so promoting its aggregate pass/fail output to a blocking clinical gate would overstate what it proves
- the benchmark *data* can still be guarded safely today by running the schema validator and benchmark linter on every PR

## Changes

- added `npm run eval:benchmark:lint`
- added a required `Benchmark Integrity` CI job that runs:
  - `npm run eval:benchmark:validate`
  - `npm run eval:benchmark:lint`
- updated `CI Gate` so benchmark-integrity must pass before the workflow succeeds

## Acceptance

- benchmark schema validation runs in CI on every PR
- benchmark lint runs in CI on every PR
- CI fails when the curated benchmark becomes structurally invalid
- this ticket does not claim that the simulated eval harness is a live clinical gate
