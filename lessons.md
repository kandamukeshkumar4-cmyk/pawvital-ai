# PawVital Lessons

This file captures durable engineering lessons that should survive branch
handoffs. It is not a scratchpad, telemetry dump, or place for raw logs.

## Rules

- Record only lessons that change future implementation, validation, or rollout
  behavior.
- Do not store secrets, credentials, private tester identifiers, raw owner
  content, screenshots containing sensitive data, or unsanitized logs.
- Prefer links to sanitized docs, PRs, commits, and eval artifacts over pasted
  output.
- Keep each entry short enough that a future agent can scan it before starting a
  ticket.

## Eval Commit Convention

When a ticket depends on model or eval behavior, include these fields in the
commit message, PR body, or linked eval note:

- ticket id
- model version or provider mode
- eval suite name
- pass rate or score summary
- git hash that produced the result
- command used
- sanitized artifact path, if one exists
- decision made from the eval

Example format:

```text
Eval: wave3-release-gate
Model: nvidia-nim / router v1 / shadow flags unchanged
Pass rate: 0 blocked critical misses, release gate pass
Git hash: <commit>
Command: npm run eval:benchmark:release-gate
Decision: safe to merge docs-only follow-up
```

## When To Commit After Evals

- Commit after the required evals for the ticket pass on the exact branch being
  submitted.
- If an eval is advisory only, record it as advisory and do not let it replace a
  blocking Jest, benchmark, or release gate.
- If an eval fails, commit only after the failure is fixed or after a reviewer
  explicitly accepts the failure as out of scope.
- For docs-only guardrail tickets, run the documented docs/security validation
  and record that no runtime clinical files changed.

## Lesson Log

### 2026-05-19 - VET-1506C agentic ops baseline

- Local secret loading should be explicit and reviewable: use `.envrc.example`
  as the repo template, keep `.envrc` local, and load real values through an
  approved secret manager or ignored `.env.local`.
- Agentic model, traffic, and eval work should leave behind a reproducible eval
  record with model version, suite, pass rate, git hash, command, and decision.
- LLM traffic inspection belongs in local debugging runbooks only; captures must
  be redacted, kept out of git, and never used as production telemetry.
