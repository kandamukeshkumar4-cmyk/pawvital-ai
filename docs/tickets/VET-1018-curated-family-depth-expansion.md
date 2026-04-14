# VET-1018 — Curated Benchmark Family Depth Expansion

## Goal

Raise the curated benchmark depth for safety-critical complaint families that were still below the minimum depth target.

## Why This Ticket Exists

The enriched dog-triage benchmark already had strong coverage for most of the target safety-critical families, but two of the required families were still under the `>= 5` case floor:

- `seizure_collapse`: 4 cases
- `pregnancy_birth`: 2 cases

This ticket closes that depth gap without touching runtime logic or workflow behavior.

## Scope

- add new curated emergency cases under `data/benchmarks/dog-triage/gold-candidate/`
- regenerate the enriched benchmark and stamped metadata
- keep all changes bounded to benchmark data and ticket documentation

## Changes

- added `emergency-postictal-no-recovery` for `seizure_collapse`
- added three reproductive emergency cases for `pregnancy_birth`:
  - `emergency-labor-green-discharge`
  - `emergency-postpartum-heavy-bleeding`
  - `emergency-hard-labor-no-puppy`
- regenerated:
  - `gold-v1-enriched.jsonl`
  - `gold-v1-stamp.json`
  - `gold-v1-manifest.json`
  - `gold-v1-report.md`
  - `benchmark-lint-report.md`

## Family Counts

- `difficulty_breathing`: `14 -> 14`
- `swollen_abdomen`: `9 -> 9`
- `seizure_collapse`: `4 -> 5`
- `urination_problem`: `6 -> 6`
- `wound_skin_issue`: `11 -> 11`
- `pregnancy_birth`: `2 -> 5`

## Validation

- `npm run eval:benchmark:validate`
- `npm run eval:benchmark:lint`

Both commands passed. The lint report still flags broader low-depth families outside this ticket's owned family list, which is expected and unchanged in intent.
