# VET-1033 Stale GitHub Issue Cleanup

Date: 2026-04-14
Base master SHA: `09b3934fb7835eb444ed5c7d96a4102cdf4d030a`

## Summary

Reconciled stale open GitHub issues against merged PR state and current `master`.
Only issues with confirmed landed or superseded work were closed.

## Reconciled Issues

| Issue | Ticket | Authoritative landed PR | Merge commit | Why it was safe to close |
| --- | --- | --- | --- | --- |
| `#44` | `VET-828` | PR `#47` | `b559b67b40898dc23a4967df184608d729fab39f` | GitHub shows PR `#47` merged, and `master` contains the Obsidian/context packet memory sync files requested by the issue. |
| `#45` | `VET-829` | PR `#74` | `6ecb905c98cd63c8c872e3ec8900bdc9924bce60` | The owner-facing telemetry strip requested by the issue is present on `master` via centralized internal-telemetry filtering. The later route decomposition in PR `#81` preserved that sanitizer, but PR `#74` is the authoritative landing that introduced the behavior. |
| `#46` | `VET-830` | PR `#50` | `88a876680e567474a7b8af510937f42e43e65347` | GitHub shows PR `#50` merged, and `master` contains `transitionToConfirmed()` plus the route wiring introduced by that ticket. |
| `#48` | `VET-831` | PR `#55` | `72a339af34dc0b5376e351c1304c77713faa99a2` | The repo's current context packet and the 2026-04-13 safety-rollout baseline both record `VET-831` as already landed on `master` via PR `#55`. The open issue body no longer matches the authoritative landed ticket scope, so it was treated as stale ticket drift and closed with that note. |

## Verification Notes

- GitHub issue state checked with `gh issue view` for `#44`, `#45`, `#46`, and `#48`.
- Open issue inventory checked with `gh issue list --state open`.
- Merged PR state checked with `gh pr list --state merged` and `gh pr view`.
- `master` content verified from the clean worktree at `09b3934fb7835eb444ed5c7d96a4102cdf4d030a`.
- `#53` was intentionally left open per ticket instructions.
