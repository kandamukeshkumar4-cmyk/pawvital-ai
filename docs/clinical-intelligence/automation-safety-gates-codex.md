# VET-1426C: Clinical Intelligence Automation Safety Gates

## Goal

Add repo-side automation guardrails so clinical-intelligence pull requests can
move faster without silently merging unsafe scope.

This ticket is scaffold only.

- No clinical runtime behavior changed.
- No workflow file was edited.
- No branch protection or ruleset was changed.
- No symptom-chat, triage-engine, clinical-matrix, symptom-memory, planner
  runtime wiring, RAG runtime retrieval, Vercel env, or RunPod behavior changed.

## Files

- `scripts/clinical-pr-risk-classifier.mjs`
- `scripts/clinical-pr-required-checks.mjs`
- `scripts/pr-isolation-check.mjs`
- `tests/clinical-intelligence/clinical-pr-risk-classifier.test.ts`
- `tests/clinical-intelligence/clinical-pr-required-checks.test.ts`
- `tests/clinical-intelligence/pr-isolation-check.test.ts`
- `docs/clinical-intelligence/automation-safety-gates-codex.md`

## What The Scripts Do

### `clinical-pr-risk-classifier.mjs`

Path-aware PR risk classifier.

- Marks complaint-module changes as medium-risk.
- Marks vet-knowledge changes as medium-risk.
- Marks these paths as high-risk:
  - `src/app/api/ai/symptom-chat/route.ts`
  - `src/lib/triage-engine.ts`
  - `src/lib/clinical-matrix.ts`
  - `src/lib/symptom-memory.ts`
  - `src/lib/clinical-intelligence/next-question-planner.ts`
  - `src/app/api/triage/next/route.ts`
  - emergency-sentinel fixtures, reports, and guard scripts
- Fails on protected workflow paths such as `.github/workflows/**`.
- Warns on protected infra paths such as `deploy/**` and RunPod or sidecar
  control scripts.
- Emits machine-readable JSON with a built-in human-readable summary string.

### `clinical-pr-required-checks.mjs`

Clinical-intelligence required-suite mapper.

If complaint-module files change, it maps:

- all complaint-module test suites currently in repo
- `vet-knowledge-complaint-source-map.test.ts`
- `vet-knowledge-coverage-gap-registry.test.ts`
- `vet-knowledge-source-gap-plan.test.ts`
- `vet-knowledge-registry-alignment.test.ts`
- `npm run build`

If vet-knowledge files change, it maps:

- `vet-knowledge-source-registry.test.ts`
- `vet-knowledge-complaint-source-map.test.ts`
- `vet-knowledge-coverage-gap-registry.test.ts`
- `vet-knowledge-source-gap-plan.test.ts`
- `vet-knowledge-registry-alignment.test.ts`
- `npm run build`

The mapper deduplicates repeated commands when both surfaces change.

### `pr-isolation-check.mjs`

PR isolation checker.

- Fails on temp artifacts such as `tmp/**`.
- Fails on unrelated spillover outside declared ticket-owned paths.
- Fails on protected workflow changes.
- Warns on protected infra paths when they are deliberately ticket-owned.
- Emits JSON plus a summary string suitable for workflow comments or PR logs.

## CLI Shape

All three scripts support:

- `--file <path>` repeated to pass an explicit changed-file list
- `--base <git-ref>` and `--head <git-ref>` to diff a range
- `--json` to print machine-readable JSON

`pr-isolation-check.mjs` also supports:

- `--owned-path <glob>` repeated to declare ticket-owned paths

If `--file` is omitted, the scripts resolve the repository default remote branch from `origin/HEAD` and diff it against `HEAD`:

```bash
git diff --name-only origin/HEAD...HEAD
```

In GitHub Actions PR runs, they use `GITHUB_BASE_REF` and fetch the corresponding `origin/<base>` ref if the shallow checkout did not include it.

Malformed options such as `--file` without a following path fail fast.

## Future Workflow Wiring

This ticket does not edit `.github/workflows`.

The intended future workflow shape is:

```bash
node scripts/clinical-pr-risk-classifier.mjs --json
node scripts/clinical-pr-required-checks.mjs --json
node scripts/pr-isolation-check.mjs --json --owned-path <pattern> ...
```

Recommended future job outputs:

- risk classification artifact or PR comment
- required-suite list for selective gate execution
- hard fail when temp artifacts or spillover appear

## Manual Branch Protection / Ruleset Settings

These settings must be enabled manually later or only after explicit approval.
This ticket does not change them.

Recommended manual settings:

1. Require pull requests for `master`.
2. Require the main CI workflow and threshold review gate to pass before merge.
3. Add future required checks only after the workflow jobs exist and are stable:
   - `Clinical PR Risk Classifier`
   - `Clinical PR Required Checks`
   - `PR Isolation Check`
4. Require conversation resolution before merge.
5. Restrict direct pushes to protected branches.
6. Keep workflow-file edits gated behind explicit maintainer review.

## Why These Gates Exist

These scripts encode the recurring review problems already seen in multi-model
PawVital work:

- complaint-module spillover stacked on unrelated PRs
- stray temp artifacts such as `tmp/rate-limit-failover-report.json`
- PRs that look safe in CI but are not isolated
- protected workflow or infra edits that should not merge casually

## Validation

Run:

```bash
npm test -- --runTestsByPath tests/clinical-intelligence/clinical-pr-risk-classifier.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/clinical-pr-required-checks.test.ts
npm test -- --runTestsByPath tests/clinical-intelligence/pr-isolation-check.test.ts
npm run build
```
