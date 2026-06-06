# VET-1573C Public Beta GO/HOLD Evidence Refresh

Decision: HOLD for public beta.

Evidence cutoff: 2026-06-06T22:47:34Z.

## Why Public Beta Is HOLD

Public beta requires same-current-production proof across admin, tester, feedback, symptom-check, History, monitoring, owner copy, invite, privacy/support, and rollback gates. The current evidence is strong in several private-cohort lanes, but it is not complete enough for public beta.

Current production alias checked for this refresh: `https://pawvital-ai.vercel.app` resolves to deployment `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`.

Known current blockers:

- Fresh current-deployment authorized-admin command-center and admin API proof is missing from this machine.
- Invite-send proof for the intended private-tester cohort is missing.
- Full Cohort 1 readout counts are missing: tester count, completed symptom checks, final reports, feedback submissions, stalled flows, and urgency distribution.
- Issue #582 remains open as Supabase REST/Auth versus `DATABASE_URL` operational debt.
- Issue #588 remains open; VET-1563 model-promotion evidence is incomplete.
- Privacy, terms, consent persistence, and public-beta support readiness are not proven.
- Scheduler/shadow readout remains empty and must stay separate from owner-visible UX proof.
- Launch-stack PR gate recovery is blocked: PRs #591-#596 are open/non-draft/mergeable but have no attached checks, the required `Threshold Review Gate` is absent, the PR #596 recovery branch has no workflow runs, and manual dispatch fails with `HTTP 422: Actions has been disabled for this user`.

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
- PR #594 adds newer current-deployment product-intelligence daily-readiness write proof on `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`: row `61c44ae9-5b30-482d-8207-efbaf6598140`, history read pass, unowned pet read 404, clean owner-visible claim/leakage scan, and 0 JSON error records in the post-smoke Vercel error-log query.

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

VET-1576C / PR #594 is GO for current-deployment daily-readiness/product-intelligence persistence only. This is not a public-beta GO by itself, and PR #594 is still open/blocked rather than landed on `master`.

VET-1578C / PR #595 is GO for review of the owner-visible recovery checkpoint UI branch only. It adds local focused tests, claim-language scan proof, Bumblebee proof, local Playwright smoke, AutoScientists verification, and TecjLead GO, but PR #595 is still open/blocked with no GitHub checks attached and is not landed on `master`.

The current production proof is limited to daily-readiness/product-intelligence persistence. Recovery-checkpoint owner-visible UI is review-ready in PR #595, but authenticated production recovery-checkpoint write/smoke remains HOLD. Claim-language review in `plans/VET-1564C-claim-language-review.json` is pass for the earlier surface; PR #595 includes a changed-file claim scan and must still be treated as PR review evidence until merged/deployed.

## PR Gate And Merge Readiness

Launch-stack PR gate readiness is HOLD.

- PRs #591-#596 are open, non-draft, and mergeable, but each currently reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- PR #596 (`codex/vet-1579c-threshold-gate-recovery` at `745a1173db546805afdedfe788677081cec2a93b`) attempted a workflow-only recovery for the required `Threshold Review Gate`.
- `gh run list --branch codex/vet-1579c-threshold-gate-recovery` returned no workflow runs.
- Manual dispatch failed with `HTTP 422: Actions has been disabled for this user`.
- This is an external PR-check attachment blocker. It does not convert any product-intelligence, model-promotion, admin, invite, cohort-readout, privacy/support, or public-beta lane to GO.

## Monitoring And Rollback

Private-cohort rollback and pause instructions exist in `docs/private-tester-incident-runbook.md`. The runbook covers pause criteria, tester disablement, feedback/report failure checks, emergency review, and deletion requests.

Monitoring is partial:

- VET-1570C sampled Vercel logs showed no HTTP 500 rows and App Insights metrics were captured.
- VET-1571C post-smoke 500 log query returned 0 JSON records.
- VET-1576C current-deployment product-intelligence write smoke reported 0 JSON error records after the daily-readiness write.
- No full Cohort 1 monitoring/readout packet exists for public beta.

## Final Gate

- Public beta: HOLD
- Private Cohort 1 admin authority: historical GO, current deployment unproven from this machine
- Private Cohort 1 launch/readout: partial HOLD for invite-send proof and full cohort counts
- Product-intelligence slice: GO for current-deployment daily-readiness persistence only
- Product-intelligence recovery checkpoint UI: GO for PR #595 review only; production write/smoke HOLD
- Candidate intake harness: GO review-only
- Model/NIM promotion: HOLD
- Launch-stack PR gate: HOLD, Actions disabled/checks not attaching
