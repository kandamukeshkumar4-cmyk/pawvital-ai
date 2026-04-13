# VET-1007 — Auto-Fix Workflow Repair

Owner: `copilot`
Branch: `copilot/vet-1007-auto-fix-workflow-repair-v1`
Status: in progress

## Goal

Repair the auto-fix GitHub Actions workflow so merge pushes to master do not surface zero-job workflow failures, while preserving auto-fix behavior for failed PR CI runs.

## Root Cause

- `.github/workflows/auto-fix.yml` registered on every completed `CI Pipeline` workflow run.
- The workflow relied on a job-level `if` using `github.event.workflow_run.conclusion` and `github.event.workflow_run.event` to skip non-PR or successful runs.
- GitHub created repeated zero-second failed runs with no jobs for push-triggered completions, including failed run `24366113337` on `master`, and reported them as likely workflow-file issues.

## Fix

- add an unconditional `evaluate-trigger` job that computes whether auto-fix should run
- keep the existing `auto-fix` job behavior, but gate it on the `evaluate-trigger` job output instead of the original job-level `if`
- preserve the existing auto-fix steps so only failed PR CI runs can mutate PR branches or comment on the PR

## Verification

- `gh run view 24366113337 --repo kandamukeshkumar4-cmyk/pawvital-ai`
- `gh run view 24366113337 --repo kandamukeshkumar4-cmyk/pawvital-ai --json conclusion,event,headBranch,headSha,jobs,name,number,status,url,workflowDatabaseId,workflowName,displayTitle`
- `gh api repos/kandamukeshkumar4-cmyk/pawvital-ai/actions/runs/24366113337`
- `gh api repos/kandamukeshkumar4-cmyk/pawvital-ai/actions/runs/24366113337/attempts/1/jobs`
- `gh run list --workflow auto-fix.yml --repo kandamukeshkumar4-cmyk/pawvital-ai --limit 20`
- `gh workflow list --repo kandamukeshkumar4-cmyk/pawvital-ai`