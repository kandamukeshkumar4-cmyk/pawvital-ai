# VET-1573C Public Beta GO/HOLD Evidence Refresh

Decision: HOLD for public beta.

Evidence cutoff: 2026-06-05T13:20:28Z.

## Why Public Beta Is HOLD

Public beta requires same-current-production proof across admin, tester, feedback, symptom-check, History, monitoring, owner copy, invite, privacy/support, and rollback gates. The current evidence is strong in several private-cohort lanes, but it is not complete enough for public beta.

Known current blockers:

- Fresh current-deployment authorized-admin command-center and admin API proof is missing from this machine.
- Invite-send proof for the intended private-tester cohort is missing.
- Full Cohort 1 readout counts are missing: tester count, completed symptom checks, final reports, feedback submissions, stalled flows, and urgency distribution.
- Issue #582 remains open as Supabase REST/Auth versus `DATABASE_URL` operational debt.
- Issue #588 remains open; VET-1563 model-promotion evidence is incomplete.
- Privacy, terms, consent persistence, and public-beta support readiness are not proven.
- Scheduler/shadow readout remains empty and must stay separate from owner-visible UX proof.

## Owner-Visible UX Proof

Passed, but partial:

- VET-1570C production saved-tester replay on `dpl_581C9m5utNovKZXFGoEhybXFGqWa` reached symptom-check completion, final report, History, feedback submission, and leakage-clean owner-visible output.
- Feedback submission from History returned HTTP 200 with `ok: true` for symptom check `5aeff251-4b54-4e45-99b6-e99aa1550ce4`.

Not proven:

- Fresh current-deployment admin-positive proof.
- Invite-send proof.
- Full cohort-level counts and urgency distribution.

## Backend And Monitoring Proof

Passed, but partial:

- App Insights for the VET-1570C saved-tester smoke window recorded `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, and p95 secondOpinionMs=8075.
- Product-intelligence persistence recovered on `dpl_Bo7RYGjXjV6HGNs5XXUMA97zs7FL` with saved-tester owner GET/POST/GET, RLS denial proof, focused tests, claim-language review, and zero post-smoke 500 records.

## Backend And Model Proof

VET-1563 candidate approval intake is GO for the review-only intake harness only. Model/NIM promotion remains HOLD:

- No candidate approval record exists.
- Candidate identity, provider, artifact type, and artifact hash are unresolved.
- Provider capture authorization is blocked.
- Frozen baseline/candidate output hashes are absent.
- Scorecards, owner approval, and smoke proof are absent.
- No runtime model routing, model flags, provider calls, Vercel env, Supabase schema, or clinical logic were changed.

Scheduler/shadow readout remains HOLD where recorded: `report_count=0`, `shadow_comparison_count=0`.

## Product Intelligence

VET-1571C is GO for the recovered product-intelligence persistence slice only. This is not a public-beta GO by itself.

The local `plans/VET-1564-production-readiness.json` artifact is a stale pre-smoke review artifact and still records `liveMigrationApplied=false` / `authenticatedProductionSmokeComplete=false`; later production proof lives in issue #587. Claim-language review in `plans/VET-1564C-claim-language-review.json` is pass, and must be rerun after any owner-visible copy changes.

## Monitoring And Rollback

Private-cohort rollback and pause instructions exist in `docs/private-tester-incident-runbook.md`. The runbook covers pause criteria, tester disablement, feedback/report failure checks, emergency review, and deletion requests.

Monitoring is partial:

- VET-1570C sampled Vercel logs showed no HTTP 500 rows and App Insights metrics were captured.
- VET-1571C post-smoke 500 log query returned 0 JSON records.
- No full Cohort 1 monitoring/readout packet exists for public beta.

## Final Gate

- Public beta: HOLD
- Private Cohort 1 admin authority: historical GO, current deployment unproven from this machine
- Private Cohort 1 launch/readout: partial HOLD for invite-send proof and full cohort counts
- Product-intelligence slice: GO for persistence only
- Candidate intake harness: GO review-only
- Model/NIM promotion: HOLD
