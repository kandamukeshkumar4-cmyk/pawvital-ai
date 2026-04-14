# VET-1034 — Shared Memory Queue Reconciliation

## Summary

Tightened the PawVital shared-memory refresh pipeline so generated queue notes prefer live GitHub and landed-master state over stale static prose.

## What Changed

- Added live queue reconciliation in `scripts/update-pawvital-memory.mjs` using `gh issue list` and merged PR history from `gh pr list`.
- Treat tickets already recorded in the landed memory ledger or visible in merged PR titles as resolved for next-work filtering.
- Exclude open GitHub issues from single-ticket next-work suggestions when:
  - the title has no `VET-...` id
  - the title contains multiple `VET-...` ids and is therefore a session/meta issue
  - the ticket already appears landed on master and the issue is not explicitly marked as follow-on work
- Rewrite the generated `## Next Ticket`, `## Ready`, and `## Pending / Unblocked Work` sections from the reconciled live queue instead of trusting stale carried-forward text.
- Filter resolved tickets back out of `## Current Priorities` so already-landed work stops resurfacing in the current context packet.
- Keep a deterministic fallback path that uses the local landed-memory ledger when GitHub data is unavailable.

## Drift Prevented

- Already-merged tickets no longer keep reappearing as the next suggested ticket.
- Stale open issues whose work already landed on master are excluded from next-work suggestions.
- Multi-ticket session/meta issues no longer masquerade as a single actionable next ticket.
- The generated `01 Active Work`, `04 Ticket Board`, and `16 Current Context Packet` now converge on the live queue more reliably after each refresh.

## Validation

- Ran `node scripts/update-pawvital-memory.mjs refresh`.
- Confirmed the refreshed notes now surface `VET-730` as the only actionable single-ticket open issue and exclude issue `#43` from next-work suggestions.
