# PawVital — Azure DevOps Setup Guide

## Why Azure DevOps?

- **Unified access control** — every AI model (Claude, Cursor, Copilot, Codex, Antigravity) gets its own PAT with scoped permissions
- **Audit trail** — every pipeline run, PR review, and work item change is logged
- **Pipeline environments** — manual approval gates before production
- **Variable groups** — one secure place for all secrets shared across pipelines
- **Board integration** — VET-XXX tickets can become Azure Board work items

---

## Architecture

```
GitHub (code)         Azure DevOps (pipeline + access)
├── branches    →     ├── Azure Pipelines CI
├── PRs         →     ├── Azure Pipelines AI Review (Gemini)
└── master push →     └── Azure Boards (optional ticket sync)
                              ↓
                         Vercel Deploy (triggered by GitHub master)
```

Azure Pipelines connects to GitHub via a **GitHub service connection**. It:
1. Listens for PR events on GitHub
2. Runs CI and AI review
3. Posts results back to the GitHub PR as status checks
4. Comments on the PR with the Gemini review verdict

---

## Step 1: Create Azure DevOps Organization and Project

1. Go to [dev.azure.com](https://dev.azure.com) → Sign in with Microsoft account
2. Create organization: `pawvital` (or your preferred name)
3. Create project: `PawVital` (Private, Git)

---

## Step 2: Connect GitHub Repository

1. In Azure DevOps → Project Settings → Service connections
2. Click **New service connection** → **GitHub**
3. Choose **GitHub App** (recommended) or **Personal Access Token**
4. Authorize access to `kandamukeshkumar4-cmyk/pawvital-ai`
5. Name the connection: `github-pawvital`

---

## Step 3: Create Variable Group (Secrets)

1. Pipelines → Library → **+ Variable group**
2. Name: `pawvital-ai-secrets`
3. Add these variables (mark as secret 🔒 where noted):

| Variable | Value | Secret? |
|----------|-------|---------|
| `GOOGLE_AI_API_KEY` | Your Google AI Studio key | 🔒 Yes |
| `GITHUB_PAT` | GitHub PAT (see below) | 🔒 Yes |

### Create the GitHub PAT

Go to [github.com/settings/tokens](https://github.com/settings/tokens/new) → Classic → Generate with:
- `repo` (full)
- `write:discussion`
- `pull_requests:write`

This PAT lets Azure Pipelines comment on GitHub PRs and post review decisions.

---

## Step 4: Create Pipelines

### Pipeline 1: CI

1. Pipelines → **New pipeline**
2. Source: **GitHub** → select `kandamukeshkumar4-cmyk/pawvital-ai`
3. Existing YAML → `azure-pipelines/ci.yml`
4. Name it: `PawVital-CI`
5. Save

### Pipeline 2: AI Review

1. Pipelines → **New pipeline**
2. Same repo → `azure-pipelines/ai-review.yml`
3. Name it: `PawVital-AI-Review`
4. Under **Variables**, link the variable group `pawvital-ai-secrets`
5. Save

---

## Step 5: Give Every AI Model Its Own PAT

Each tool gets a dedicated PAT scoped to exactly what it needs.

### Generate PATs in Azure DevOps

Go to **Azure DevOps → User Settings → Personal Access Tokens → New Token**

| Model/Tool | PAT Name | Scopes |
|-----------|----------|--------|
| Claude Code | `claude-pawvital` | Build: Read & Execute, Code: Read, Work Items: Read & Write |
| Cursor | `cursor-pawvital` | Build: Read, Code: Read |
| GitHub Copilot | `copilot-pawvital` | Build: Read, Code: Read |
| Codex CLI | `codex-pawvital` | Build: Read & Execute, Code: Read, Work Items: Read & Write |
| Antigravity | `antigravity-pawvital` | Build: Read & Execute, Code: Read |

### Configure Each Tool

**Claude Code** — add to `.env.local` or session environment:
```bash
AZURE_DEVOPS_PAT=<claude-pawvital token>
AZURE_DEVOPS_ORG=pawvital
AZURE_DEVOPS_PROJECT=PawVital
GITHUB_PAT=<github pat>
```
Claude can then call: `node scripts/devops/az-devops-client.mjs build-status <id>`

**Cursor** — Settings → Environment Variables:
```
AZURE_DEVOPS_PAT=<cursor-pawvital token>
AZURE_DEVOPS_ORG=pawvital
AZURE_DEVOPS_PROJECT=PawVital
```

**Codex CLI** — add to `~/.bashrc` or `~/.zshrc`:
```bash
export AZURE_DEVOPS_PAT=<codex-pawvital token>
export AZURE_DEVOPS_ORG=pawvital
export AZURE_DEVOPS_PROJECT=PawVital
```

**Antigravity** — set in tool settings / environment block (same vars as above)

---

## Step 6: Set Up GitHub Branch Protection

Go to GitHub → Settings → Branches → Add rule for `master`:

| Setting | Value |
|---------|-------|
| Require PR | Yes |
| Required status checks | `PawVital-CI / CI Gate` |
| Dismiss stale approvals | Yes |
| Include administrators | Yes |

This ensures no direct pushes to master and that Azure Pipelines CI must pass before any merge.

---

## Full Pipeline Flow

```
1. Any agent pushes branch → GitHub
2. GitHub notifies Azure DevOps (via service connection webhook)
3. PawVital-CI pipeline runs:
   ├── Install → Lint → TypeCheck → Build → Test (parallel)
   └── CI Gate: passes only if all 4 jobs succeed
4. PawVital-AI-Review pipeline runs (after CI Gate):
   ├── Gets PR diff from GitHub
   ├── Sends to Gemini 3.1 Pro
   └── Posts review comment + APPROVE or REQUEST_CHANGES to GitHub PR
5. If APPROVED:
   → Squash merge to master
   → Vercel auto-deploys
6. If REQUEST_CHANGES:
   → PR stays open
   → Agent pushes fix → loop back to step 2
```

---

## Available Agent Commands

Any model can run these against Azure DevOps:

```bash
# Check if a build passed
node scripts/devops/az-devops-client.mjs build-status 42

# Trigger CI manually on a branch
node scripts/devops/az-devops-client.mjs trigger-pipeline 1 qwen/vet-720-v1

# Create a work item on Azure Boards
node scripts/devops/az-devops-client.mjs create-work-item Bug "VET-720 answer recording regression"

# Comment on a GitHub PR
node scripts/devops/az-devops-client.mjs pr-comment 47 "Fix pushed to branch"

# List open PRs
node scripts/devops/az-devops-client.mjs list-prs
```

---

## Gemini Model Configuration

The AI review model defaults to `gemini-2.5-pro`. To change it:

1. In Azure DevOps → Pipelines → PawVital-AI-Review → Edit
2. Variables tab → Add `GEMINI_MODEL` = `gemini-2.5-pro-high` (or any supported model)

---

## Cost Notes

- **Azure DevOps**: Free for up to 5 users + unlimited private repos
- **Azure Pipelines**: 1,800 free minutes/month (Microsoft-hosted). Add self-hosted agent (your Windows machine) for unlimited minutes
- **Gemini API**: Pay-per-use at review time (~2-10K tokens per review)
- **Vercel**: Deploys only on master merge — no extra cost from pipeline runs
