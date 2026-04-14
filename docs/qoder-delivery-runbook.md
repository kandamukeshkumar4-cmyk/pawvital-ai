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

### 4. AI Code Review

**Triggered by**: `ai-review.yml` after CI Pipeline succeeds, and again when a draft PR becomes ready for review

**What happens**:
- Workflow finds the PR for your branch
- Fetches PR diff (max 80KB)
- Publishes an `AI Review Gate` check on the PR head SHA
- Sends to OpenRouter AI model (configurable, default: `xiaomi/mimo-v2-pro`)
- AI reviews against PawVital-specific rules:
  - Deterministic clinical logic must remain source of truth
  - Protected state (`answered_questions`, `extracted_answers`, `unresolved_question_ids`) must not be mutated by compression
  - Telemetry stays internal unless explicitly intended
  - No hidden regressions in route.ts, triage-engine.ts, symptom-memory.ts, clinical-matrix.ts
- Posts review comment with verdict and findings
- If APPROVED: submits GitHub approval on the PR and marks `AI Review Gate` successful
- If the review secret/model cannot produce a verdict: `AI Review Gate` fails closed and merge stays blocked

### 5. Auto-Merge

**Triggered by**: `auto-merge.yml` after AI Review succeeds

**Gate checks** (all must pass):
1. CI Gate passed with success
2. PR is not a draft
3. PR has no merge conflicts
4. `AI Review Gate` succeeded on the current PR head SHA
5. AI bot approved the specific commit SHA

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

### AI Review Requests Changes

1. Read the AI review comment on the PR
2. Fix the issues on the same branch
3. Push again
4. AI review re-runs automatically

### Auto-Merge Blocked

Common reasons:
- **Draft PR**: Mark as ready for review in GitHub UI
- **Merge conflict**: Rebase onto latest master and resolve conflicts
- **CI not green**: Fix CI failures first
- **AI Review Gate failed**: Address review findings or restore the review secret/model response path

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
| `.github/workflows/ai-review.yml` | AI-powered code review plus the `AI Review Gate` status check |
| `.github/workflows/auto-merge.yml` | Auto-merges when CI, `AI Review Gate`, and AI approval all pass |
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
