# Qoder Delivery Runbook

## Overview

This document describes the complete delivery flow for Qoder (and all other agents) working on the PawVital AI project. Every ticket follows the same path from local code to production deployment.

## Branch Naming Convention

**Format**: `<agent>/vet-<id>-<slug>-v1`

**Examples**:
- `qwen/vet-917-pipeline-hardening-v1`
- `qoder/vet-918-gold-benchmark-v1`
- `codex/vet-730-fix-retry-logic-v1`

**Supported agent prefixes** (all auto-detected by CI):
- `qwen/**`, `qoder/**`, `codex/**` — AI agents
- `claude/**`, `cursor/**`, `copilot/**`, `antigravity/**` — Other AI tools
- `feat/**`, `fix/**`, `chore/**`, `docs/**`, `test/**`, `perf/**`, `refactor/**`, `rebase/**`, `devops/**` — Standard git prefixes

## Complete Delivery Flow

### 1. Work Locally

```bash
# Create branch from master
git checkout -b qwen/vet-XXX-your-slug-v1

# Make your changes following the commit rhythm:
# Commit 1: scaffold, contracts, docs, schemas, fixtures
# Commit 2: main implementation or data expansion
# Commit 3: tests, validation, and review hardening
# Commit 4: PR-review fixes only if needed
```

### 2. Push Branch

```bash
git push origin qwen/vet-XXX-your-slug-v1
```

**What happens automatically**:
- GitHub Actions `auto-pr.yml` detects the push
- Extracts ticket ID (VET-XXX) from branch name
- Creates PR targeting `master` if one doesn't exist
- PR title formatted as: `VET-XXX: your slug`
- PR body includes branch name, ticket, agent, and commit history

### 3. CI Pipeline Runs

**Triggered by**: `ci.yml` on push to branch

**Jobs** (run in parallel after install):
1. **Lint** — `npm run lint`
2. **Type Check** — `npx tsc --noEmit`
3. **Build** — `npm run build` (with stub env vars)
4. **Test** — `npm test`
5. **CI Gate** — Verifies all 4 jobs succeeded

**If any job fails**:
- Comment posted on PR with failure details
- CI Gate blocks further progression
- Fix on the same branch, push again, CI re-runs

### 4. Required Human Approval

**Triggered by**: human review after CI Pipeline succeeds

**What happens**:
- A human reviewer checks the PR after CI turns green
- The reviewer confirms the latest branch head still matches the intended ticket scope
- The reviewer approves the current head SHA in GitHub

### 5. Auto-Merge

**Triggered by**: `auto-merge.yml` after CI succeeds or a review is submitted/dismissed

**Gate checks** (all must pass):
1. CI Gate passed with success
2. PR is not a draft
3. PR has no merge conflicts
4. PR review decision is `APPROVED`
5. At least one non-author human approval matches the current PR head SHA

**If all gates pass**:
- Squash-merges to `master`
- Deletes feature branch
- Posts success comment noting Vercel deployment in ~30 seconds

### 6. Vercel Production Deploy

**Triggered by**: Vercel webhook on master push

**What happens**:
- Vercel builds and deploys to production
- Takes ~30 seconds
- Production URL: `https://pawvital-ai.vercel.app`

## Finishing a Ticket

After pushing your branch and confirming PR creation:

```bash
node scripts/agent-done.mjs vet-XXX-your-slug "VET-XXX: short summary" --agent qoder
```

This script:
- Confirms you're on the correct branch
- Commits any uncommitted changes
- Pushes to origin
- Prints PR creation URL and next steps

## Full Completion (After Merge)

After the PR auto-merges and Vercel deploys:

```bash
node scripts/finalize-pawvital-ticket.mjs \
  --ticket VET-XXX \
  --agent qoder \
  --branch qwen/vet-XXX-your-slug-v1 \
  --commit <merge-sha> \
  --summary "VET-XXX: complete summary" \
  --verification "npm test && npm run build"
```

This script:
1. Records completion in Obsidian memory
2. Runs Codex review (via local Codex CLI)
3. Records review result in memory
4. Lands the ticket to production repo (`pawvital-ai-codex`)
5. Verifies Vercel production deployment
6. Updates all memory files automatically

## Failure Recovery

### CI Fails

1. Check the PR comment with failure details
2. Fix the issue on the same branch:
   ```bash
   git checkout qwen/vet-XXX-your-slug-v1
   # make fixes
   git add .
   git commit -m "fix: address CI failure"
   git push origin qwen/vet-XXX-your-slug-v1
   ```
3. CI re-runs automatically

### Review Requests Changes

1. Read the reviewer feedback on the PR
2. Fix the issues on the same branch
3. Push again
4. Ask the reviewer to re-check and approve the latest head SHA

### Auto-Merge Blocked

Common reasons:
- **Draft PR**: Mark as ready for review in GitHub UI
- **Merge conflict**: Rebase onto latest master and resolve conflicts
- **CI not green**: Fix CI failures first
- **Approval missing or stale**: Ask a non-author reviewer to approve the current head SHA

## Verification Commands

Before pushing, always run locally:

```bash
npm test && npm run build && npm run lint && npx tsc --noEmit
```

After merge, verify production:

```bash
vercel inspect https://pawvital-ai.vercel.app
```

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/auto-pr.yml` | Auto-creates PRs for supported branches |
| `.github/workflows/ci.yml` | Runs lint, typecheck, build, test, CI gate |
| `.github/workflows/auto-merge.yml` | Auto-merges when CI and a non-author human approval both match the current head SHA |
| `scripts/agent-done.mjs` | Finish agent's work (push + PR) |
| `scripts/finalize-pawvital-ticket.mjs` | Full completion workflow |
| `scripts/land-pawvital-ticket.mjs` | Land to production repo |
| `scripts/update-pawvital-memory.mjs` | Update Obsidian memory vault |

## Protected Clinical Logic

These files contain deterministic medical logic. Do not refactor, simplify, or "improve" without an explicit ticket:

- `src/lib/triage-engine.ts`
- `src/lib/clinical-matrix.ts`
- `src/app/api/ai/symptom-chat/route.ts`
- `src/lib/symptom-memory.ts`

**Rule**: Compression must never mutate protected control state (`answered_questions`, `extracted_answers`, `unresolved_question_ids`).

## Memory System

Shared memory lives in the Obsidian vault at `G:\MY Website\petviatal`. Key files:

- `01 Active Work.md` — Current review queue
- `04 Ticket Board.md` — In-review and recent landings
- `09 Completed Tickets.md` — Awaiting landing and recent landings
- `07 Agent Registry.md` — Registered workers
- `17 Activity Log.md` — Event stream

All memory updates are automated by the `finalize-pawvital-ticket.mjs` script.
