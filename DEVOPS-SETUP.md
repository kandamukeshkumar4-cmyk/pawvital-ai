# PawVital CI/CD Pipeline Setup

## Overview

This pipeline provides end-to-end DevOps automation for multi-agent development:

```
Agent pushes branch → Auto-PR → CI (lint/typecheck/build/test) → AI Review (Gemini) → Auto-Merge → Vercel Deploy
```

Works with **any tool**: Claude Code, Cursor, GitHub Copilot, Codex CLI, Antigravity, or manual commits.

---

## Step 1: Add GitHub Secrets

Go to **GitHub repo → Settings → Secrets and variables → Actions**

### Required Secret

| Secret | Description | Where to get it |
|--------|-------------|-----------------|
| `GOOGLE_AI_API_KEY` | Google AI API key for Gemini code review | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

### Optional Variables

Go to **Settings → Secrets and variables → Actions → Variables tab**

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_MODEL` | `gemini-2.5-pro` | Model for AI review (change to latest when available) |

> `GITHUB_TOKEN` is automatically provided by GitHub Actions — no setup needed.

---

## Step 2: Enable Branch Protection

Go to **GitHub repo → Settings → Branches → Add branch protection rule**

### Rule for `master`:

| Setting | Value |
|---------|-------|
| Branch name pattern | `master` |
| Require a pull request before merging | Yes |
| Require approvals | 1 |
| Require status checks to pass | Yes |
| Status checks that are required | `CI Gate` |
| Require branches to be up to date | Yes |
| Include administrators | Yes (recommended) |

This ensures:
- No direct pushes to master (all changes go through PRs)
- CI must pass before merge
- At least one approval (AI or human) before merge

---

## Step 3: Enable Auto-Merge (Optional)

Go to **GitHub repo → Settings → General → Pull Requests**

- [x] Allow auto-merge
- [x] Automatically delete head branches

This lets the auto-merge workflow clean up after itself.

---

## How It Works

### 1. Auto-PR Creation (`auto-pr.yml`)

When any agent pushes a branch matching these patterns, a PR is auto-created:

- `qwen/*` — agent branches (Claude, Codex, etc.)
- `feature/*` — feature work
- `fix/*` — bug fixes
- `devops/*` — infrastructure
- `test/*` — test work
- `docs/*` — documentation

The PR title is extracted from the branch name. VET-XXX ticket numbers are detected automatically.

### 2. CI Pipeline (`ci.yml`)

Runs on every PR to master. Four parallel jobs:

| Job | Command | What it catches |
|-----|---------|-----------------|
| Lint | `npm run lint` | Style violations, unused imports |
| Type Check | `npx tsc --noEmit` | Type errors, missing types |
| Build | `npm run build` | Build failures, missing env stubs |
| Test | `npm test` | Broken tests, regressions |

All four must pass for the **CI Gate** to go green.

On failure, a comment is posted on the PR with the failing job and a link to logs.

### 3. AI Code Review (`ai-review.yml`)

After CI passes, the diff is sent to **Gemini** for review.

Review checks:
- Clinical logic safety (no medical decisions in prompts)
- Protected state integrity (compression can't mutate control state)
- Telemetry boundaries (no internal markers in user payloads)
- Security (no XSS, injection, etc.)
- Scope discipline (changes match the stated ticket)

Verdict is either `APPROVE` (posts approval) or `REQUEST_CHANGES` (blocks merge with feedback).

### 4. Auto-Merge (`auto-merge.yml`)

When both CI Gate passes AND AI review approves:
- Squash-merges the PR to master
- Deletes the branch
- Vercel auto-deploys from master

---

## Workflow for Each Agent

### Claude Code / Codex CLI
```bash
# Agent finishes work, pushes branch
git push origin qwen/vet-XXX-description-v1
# → Auto-PR → CI → AI Review → Auto-Merge
```

### Cursor / Copilot
```bash
# Make changes in IDE, commit, push
git push origin feature/my-change
# → Auto-PR → CI → AI Review → Auto-Merge
```

### Antigravity
```bash
# Push from Antigravity
git push origin fix/bug-description
# → Auto-PR → CI → AI Review → Auto-Merge
```

### Manual
```bash
# Create PR manually via gh CLI
gh pr create --base master --head my-branch --title "My change"
# → CI → AI Review → Auto-Merge
```

---

## Failure Handling

| Failure | What happens | Who fixes it |
|---------|-------------|-------------|
| Lint fails | Comment on PR with error link | Branch author |
| Type check fails | Comment on PR with error link | Branch author |
| Build fails | Comment on PR with error link | Branch author |
| Tests fail | Comment on PR with error link | Branch author |
| AI review rejects | REQUEST_CHANGES with specific feedback | Branch author |
| Merge conflict | Auto-merge skips, PR stays open | Branch author rebases |

The PR stays open until all issues are fixed. Push new commits to the same branch and CI + review re-run automatically.

---

## Cost Notes

- **CI runs**: Free on GitHub Actions (2,000 min/month for free tier)
- **Gemini API**: Check current pricing at [ai.google.dev/pricing](https://ai.google.dev/pricing) — review calls use ~2-10K tokens each
- **Vercel**: Deploys only on merge to master (no extra cost from PRs)

---

## Troubleshooting

### CI Gate not appearing as required check
The `CI Gate` check only exists after the first PR triggers it. Create one PR, let CI run, then go back to branch protection settings and select `CI Gate` from the dropdown.

### AI review skipped
Check that `GOOGLE_AI_API_KEY` is set in GitHub Secrets. The workflow logs will show "GOOGLE_AI_API_KEY not set — skipping AI review" if missing.

### Auto-merge not triggering
1. Verify "Allow auto-merge" is enabled in repo settings
2. Verify branch protection requires the `CI Gate` status check
3. Verify the PR is not a draft
4. Verify there are no merge conflicts
