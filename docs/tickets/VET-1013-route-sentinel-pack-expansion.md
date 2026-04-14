# VET-1013 — Route Sentinel Pack Expansion

## Scope

- expand the route-backed emergency sentinel replay pack from 16 to at least 24 curated cases
- add more direct emergency replays without changing runtime behavior
- add more safe question-path sentinels for critical unknown follow-ups
- keep the suite fast enough to remain a practical CI gate

## Why This Ticket Exists

- VET-1012 established a stronger route-backed safety gate, but the first designated replay pack was intentionally small
- a 16-case pack is useful for proving the mechanism, but still thin for sustained coverage of must-not-miss emergency routing and critical cannot-assess paths
- the fastest way to improve confidence is to grow the deterministic replay subset rather than broaden the runtime or benchmark-data surface

## Changes

- expanded `tests/fixtures/clinical/route-sentinel-replay-cases.json` to 26 curated replay cases
- added more direct emergency replays across urinary obstruction, hemorrhagic wound, allergic swelling, collapse, cardio-respiratory distress, and seizure contexts
- added more `followup_unknown` sentinels so all current critical unknown escalation paths are represented in the pack
- made the follow-up unknown replays explicit with owner unknown-response messages instead of relying on corpus wording
- added a small fixture-shape guard in `tests/benchmark.route-sentinels.test.ts` so the pack does not silently shrink below the intended breadth

## Acceptance

- `npm run eval:benchmark:route-sentinels` passes locally
- the replay pack contains at least 24 cases while preserving a mix of direct emergencies and safe question-path sentinels
- no runtime files, workflow files, or benchmark source data are changed
