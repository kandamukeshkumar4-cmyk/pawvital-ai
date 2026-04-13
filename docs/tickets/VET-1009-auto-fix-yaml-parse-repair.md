# VET-1009 — Auto-Fix YAML Parse Repair

Owner: `codex`
Branch: `codex/vet-1009-auto-fix-yaml-parse-repair-v1`
Status: in progress

## Goal

Repair the invalid YAML shell quoting in `.github/workflows/auto-fix.yml` so GitHub Actions can parse the workflow and create real jobs again.

## Root Cause

- `VET-1007` changed trigger gating, but the workflow still contained two `gh pr comment --body "..."` shell commands with raw multi-line quoted text.
- GitHub treated those blocks as invalid YAML and failed the workflow at parse time with zero jobs, including run `24367786479` on `master`.
- `github-actionlint` reproduced the parser failure locally at the first broken comment block.

## Fix

- replace raw multi-line quoted comment bodies with heredoc-backed shell variables
- keep workflow behavior unchanged apart from making the file parseable

## Verification

- `npx github-actionlint .github/workflows/auto-fix.yml`
