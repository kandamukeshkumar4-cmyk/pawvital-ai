# VET-917 - Qoder Pipeline Hardening

## Goal

Make `qoder/**` branches first-class Phase 2 delivery branches so Qoder work reliably appears on GitHub, runs CI, receives AI review, auto-merges, and deploys to Vercel.

## Why This Lands First

The Phase 2 plan depends on Qoder owning the broad implementation epics. Before those branches start, the repository pipeline must recognize `qoder/**` in the same places it already recognizes `codex/**`, `qwen/**`, `cursor/**`, and the other agent prefixes.

## Changes

- `.github/workflows/auto-pr.yml` now listens for pushes to `qoder/**`.
- `.github/workflows/ci.yml` now runs push-based CI for `qoder/**`, which is required because AI review is chained from successful push CI runs.
- `scripts/agent-watcher.mjs` now treats `qoder` as a known notify-style agent so failed Qoder PRs get task files and watcher cleanup.
- `AGENTS.md` now lists Qoder's finish command flag as `--agent qoder`.

## Qoder Branch Flow

1. Start each Qoder ticket from a clean `origin/master` base.
2. Use branch format `qoder/vet-<id>-<slug>-v1`.
3. Commit in broad-ticket stages:
   - scaffold and contracts
   - main implementation
   - tests, validation, and docs
   - review fixes only when required
4. Finish from the repo root:

```bash
node scripts/agent-done.mjs vet-<id>-<slug> "<what changed>" --agent qoder
```

5. Confirm the pushed branch creates a GitHub PR automatically.
6. Wait for `CI Gate` to pass.
7. Wait for AI review approval.
8. Confirm auto-merge to `master`.
9. Confirm Vercel production deploy is ready before the next broad ticket starts.

## Production Verification

Use the GitHub PR timeline and Vercel deployment status as the source of truth. For local follow-up checks, use the existing repo tools:

```bash
node scripts/agent-watcher.mjs --status
npm run verify:sidecars:vercel
```

If a PR does not auto-merge after CI and AI review pass, inspect `.github/workflows/auto-merge.yml` and the PR review decision before starting another Phase 2 implementation ticket.

## Done Criteria

- A `qoder/**` smoke branch opens a PR automatically.
- Push-based `CI Pipeline` runs on the Qoder branch.
- AI review runs after successful CI.
- Auto-merge is eligible after AI approval.
- Vercel production deploy is confirmed after merge.
