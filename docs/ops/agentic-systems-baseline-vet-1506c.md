# VET-1506C - Agentic Ops Baseline

## Decision

Install the minimum agentic-ops baseline before more shadow readout, model
routing, or production traffic work. This ticket is tooling and documentation
only.

## Scope Guard

- No clinical logic changes.
- No runtime model routing changes.
- No model flag promotion.
- No Supabase schema changes.
- No Vercel environment changes.
- No production traffic generation.
- No secret values recorded in files, logs, docs, screenshots, PR bodies, or
  comments.

Protected runtime files stay out of scope:

- `src/app/api/ai/symptom-chat/route.ts`
- `src/lib/triage-engine.ts`
- `src/lib/clinical-matrix.ts`
- `src/lib/symptom-memory.ts`

## Privacy And Secrets Hygiene

### Local Env Loading

Use direnv only as a local loading shim. The committed template is
`.envrc.example`; real `.envrc` files stay local and ignored by git.

Recommended local setup:

1. Install direnv for the local shell.
2. Copy `.envrc.example` to `.envrc`.
3. Review the file before running `direnv allow`.
4. Load real values from an approved secret source or an ignored `.env.local`.
5. Run `npm run security:secrets` before pushing.

Do not commit real `.env`, `.env.local`, `.envrc`, pulled Vercel env files, or
secret-manager exports. The repo already ignores `.env*` while allowing
`.env*.example` templates.

### Approved Secret Sources

Approved local and operator sources:

- 1Password CLI
- Doppler
- Infisical
- Vault
- Deployment-platform secret stores, such as encrypted GitHub Actions secrets
  and Vercel environment variables

Unapproved sources:

- Chat messages
- PR bodies
- screenshots
- committed docs, fixtures, or test artifacts
- terminal transcripts that include raw values

### Secret Scan

Use the existing scanner:

```bash
npm run security:secrets
```

The command runs `.github/secret-scan.mjs` across tracked and pending text
files. It reports only redacted findings with fingerprints and lengths.

The CI workflow also includes a secret-scan job, so local success is a
pre-flight check, not a substitute for CI.

## Token And Model Proxy Plan

The model proxy proposal lives in:

- `docs/ops/model-proxy-proposal-vet-1506c.md`

This ticket does not rewire model calls. A future implementation ticket must
separately approve any LiteLLM, Portkey, or equivalent proxy integration.

## Reproducibility And Eval Commits

The living lessons and eval-commit convention live in:

- `lessons.md`

Minimum eval record fields:

- ticket id
- model version or provider mode
- eval suite name
- pass rate or score summary
- git hash
- command used
- sanitized artifact path, if one exists
- decision made from the eval

Commit after evals pass on the exact branch that will be reviewed. If an eval is
advisory or blocked by missing operator credentials, label that explicitly.

## LLM Visibility

The local mitmproxy runbook lives in:

- `docs/ops/mitmproxy-llm-observability-vet-1506c.md`

It is scoped to local debugging and staging-like agent loops only. It is not a
production telemetry source and must not capture or publish secrets.

## Evals

The inspect-ai adoption proposal lives in:

- `docs/ops/inspect-ai-eval-adoption-vet-1506c.md`

This ticket does not replace Jest, benchmark, release-gate, route-sentinel, or
private-tester smoke gates.

## Validation Checklist

Before landing changes in this lane:

```bash
npm run security:secrets
git diff --check
```

Also confirm:

- docs are ASCII-only unless an edited file already requires otherwise
- no real secrets are present in the diff
- no protected clinical runtime files changed
- no Vercel or Supabase configuration changed

## Continuation Gate

Once this branch lands, it is safe to continue invited tester-traffic collection
from an ops-baseline perspective. Do not start the formal VET-1492C rerun until
the scheduler reports real production sessions or observations. This baseline
does not itself authorize model promotion, production traffic expansion, or
secret changes.
