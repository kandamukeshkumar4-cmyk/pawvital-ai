# VET-1012 - Route Sentinel Replay Gate

## Goal

Replace the current simulated dangerous-slice confidence with a route-backed safety gate for a designated emergency sentinel pack.

## Why this ticket exists

`scripts/eval-harness.ts` still uses a simulation scaffold and explicitly says it has not yet been replaced with a live `/api/ai/symptom-chat` call. That makes the existing dangerous benchmark useful for reporting, but too weak to trust as the only regression protection for must-not-miss cases.

This ticket adds a narrower but stronger guard:

- replay a stable designated sentinel subset through the real symptom-chat route
- keep external model and sidecar dependencies mocked/deterministic
- fail CI if the live route stops returning an emergency-safe terminal for those cases

## Scope

- add a designated replay pack under `tests/fixtures/clinical/`
- add a focused Jest suite that imports `POST` from `/api/ai/symptom-chat/route`
- add an npm script for the replay suite
- add a blocking CI job for the replay suite

## Non-goals

- replacing the full `eval-harness.ts` simulation architecture
- replaying the entire 219-case curated benchmark through the route in CI
- exercising live NVIDIA, HF sidecar, or Supabase services

## Design

- Source of truth for the owner turn and pet payload remains `gold-v1-enriched.jsonl`.
- The replay fixture supplies deterministic extraction overrides so the test isolates live route safety control instead of model parsing variance.
- The initial designated pack covers:
  - direct emergency terminals for must-not-miss respiratory, GI, neuro, reproductive, wound, urinary, and systemic cases
  - follow-up `cannot_assess` escalation on critical unknown responses

## Done Criteria

- `npm run eval:benchmark:route-sentinels` passes locally
- CI runs the replay suite as a blocking job
- failures identify a live route regression, not just benchmark metadata drift

## Status

In progress
