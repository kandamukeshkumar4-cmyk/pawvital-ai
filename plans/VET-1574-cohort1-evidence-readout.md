# VET-1574C Cohort 1 Evidence Readout

Readout status: PARTIAL.

Public beta decision: HOLD.

Evidence cutoff: 2026-06-11T14:49:33Z.

This is a point-in-time readout from current issue evidence, existing repo templates, and read-only production probes. It is not a completed 48-hour Cohort 1 report because the repo does not contain a completed tester registry, invite-send proof, full cohort counts, or an urgency distribution.

## Current Production Probe

Read-only probe:

- `https://pawvital-ai.vercel.app/`: HTTP 200
- `/admin/cohort-launch`: HTTP 307 to `/login?redirect=%2Fadmin%2Fcohort-launch&reason=session_expired`
- `/api/admin/private-tester`: HTTP 403 unauthenticated
- `/api/product-intelligence/snapshots?pet_id=prod-proof-readonly`: HTTP 401 unauthenticated
- `/api/notifications`: HTTP 401 unauthenticated

Current production alias resolves to deployment `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`. This proves the public home is reachable and unauthenticated admin/product/notification denial still holds. It does not prove current positive-admin access, authenticated product-intelligence persistence, or owner notification flow.

## Current Production Monitoring Refresh

Read-only Vercel production monitoring was refreshed with explicit project scope because this worktree is not linked to a Vercel project.

- `vercel logs --project pawvital-ai --environment production --since 1h --level error --json --no-branch --no-follow`: `ERROR_JSON_ROWS=0`
- `vercel logs --project pawvital-ai --environment production --since 1h --status-code 500 --json --no-branch --no-follow`: `STATUS_500_JSON_ROWS=0`

This is a useful current log sample, but it is not a full Cohort 1 monitoring window and does not provide a fresh App Insights latency readout for `durationMs`, `extractionMs`, or `secondOpinionMs`.

## Core Metrics

| Metric | Status | Current evidence |
|---|---|---|
| Tester count | Unknown | No completed Cohort 1 registry or admin export found. |
| Completed symptom checks | Partial, known proof count 1 | VET-1570C saved-tester replay reached symptom-check completion. |
| Final reports | Partial, known proof count 1 | VET-1570C saved-tester replay reached final report and History. |
| Feedback submissions | Partial, known proof count 1 | History feedback submission for symptom check `5aeff251-4b54-4e45-99b6-e99aa1550ce4` returned HTTP 200 with `ok: true`. |
| Failed/stalled flows | Partial | #585 timeout fixed/verified; #587 product-intelligence history fixed/verified; PR #594 adds current-deployment daily-readiness write proof but is open/blocked; #582 operational debt open; #588 model evidence open. |
| Urgency distribution | Unknown | No full Cohort 1 result dataset is present. |
| Owner-visible leakage scan | Partial pass | VET-1570C saved-tester replay was leakage-clean. No full-cohort leakage scan exists. |
| App Insights latency | Partial | `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, p95 secondOpinionMs=8075. |
| Scheduler/shadow readout | HOLD | Recorded `report_count=0`, `shadow_comparison_count=0`; backend proof remains empty. |

## Owner-Visible UX Proof

Passed for a saved-tester replay:

- authenticated saved tester session
- saved dog profile
- symptom-check completion
- final report
- History scan
- feedback submission
- leakage-clean owner-visible output

Limits:

- This is one saved-tester replay, not a full Cohort 1 dataset.
- Invite-send proof is missing.
- Current-deployment positive-admin proof is unavailable from this machine after later deployments.

## Backend Readout Proof

Partial backend proof exists:

- VET-1570C sampled Vercel logs showed no HTTP 500 rows; symptom-chat and feedback rows returned HTTP 200.
- VET-1570C App Insights recorded `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, p95 secondOpinionMs=8075.
- VET-1571C product-intelligence persistence recovery passed owner GET/POST/GET, RLS denial proof, focused tests, claim-language review, and post-smoke 500 log query.
- VET-1576C / PR #594 adds current-deployment daily-readiness/product-intelligence proof on `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`: row `61c44ae9-5b30-482d-8207-efbaf6598140`, history read pass, unowned pet read 404, clean owner-visible claim/leakage scan, and 0 JSON post-smoke error records.
- VET-1578C / PR #595 records recovery checkpoint UI `GO_REVIEW_ONLY` at `a9ad1ba953974f8c463812d24304b8ed74a3d4dd`, with refreshed claim-language/readiness evidence and formal TecjLead no-blocker review.
- Current last-hour Vercel production log sample returned zero error JSON rows and zero HTTP 500 JSON rows.

Backend proof limits:

- Scheduler/shadow readout is still empty where recorded.
- No full Cohort 1 telemetry window exists in repo evidence.
- Backend telemetry does not replace owner-visible UX proof.
- PR #594 is open/blocked, so this is evidence-in-PR, not landed master truth.
- PR #595 is open/blocked, so recovery checkpoint UI remains review-only evidence, not landed production truth.
- PR #591 is open/blocked, so the public-beta HOLD packet is evidence-in-PR, not landed master truth.

## PR Gate And Merge Readiness

PR #592 merge readiness is HOLD.

- PR #592 is open, non-draft, and mergeable, but `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- `gh run list --branch codex/vet-1574c-cohort1-evidence-readout` returns no workflow runs.
- `gh pr checks 592` reports no checks.
- PR #596 attempted workflow-only recovery for the required `Threshold Review Gate`, but issue #339 records that manual dispatch fails with `HTTP 422: Actions has been disabled for this user`.
- This merge-gate blocker does not change Cohort 1 evidence status. The readout remains PARTIAL and public beta remains HOLD.

PR #591 now records the recovered PR #595 formal TecjLead evidence at `d676b1d98de4757ae96165419b31900a8e0a83ce`, but PR #591 also remains open/blocked with no checks attached.

## Product-Quality Triage From Real Evidence

- #585 / VET-1570C: symptom-check stall, closed and production-verified.
- #587 / VET-1571C: product-intelligence history persistence failure, closed and production-verified; PR #594 refreshed current-deployment daily-readiness write proof.
- PR #595 / VET-1578C: recovery checkpoint owner-visible UI, `GO_REVIEW_ONLY`; authenticated production recovery write/smoke still HOLD.
- #582 / VET-1569C: REST/Auth versus `DATABASE_URL` project split, open operational debt.
- #588 / VET-1572C: model-promotion evidence chain, open release blocker; do not promote model flags.

## Required To Complete The Cohort 1 Readout

- Export or record intended private-tester invite count and active tester count.
- Record invite-send proof for the intended private-tester cohort.
- Aggregate completed symptom checks, final reports, and feedback submissions across all invited testers.
- Export urgency distribution for completed Cohort 1 checks.
- Run owner-visible leakage scan across all Cohort 1 reports, History entries, and feedback surfaces.
- Capture full Cohort 1 App Insights latency/error window for admin API, feedback API, symptom-chat, durationMs, extractionMs, and secondOpinionMs.
- Record scheduler/shadow readout status from the formal runner where relevant.
- Re-prove current-deployment authorized-admin command-center/API access or explicitly keep it historical only.
- Restore GitHub Actions scheduling/check attachment so PR #592 receives the required `Threshold Review Gate` and other required contexts.

## Final Gate

- Cohort 1 evidence readout: PARTIAL
- Cohort 1 launch execution: UNPROVEN_FULL_COHORT
- Owner-visible UX proof: PARTIAL_PASS
- Backend readout proof: PARTIAL
- Current production error/500 log sample: PASS, zero JSON rows in the last hour
- Product-intelligence backend proof: GO current-production daily-readiness only, in open PR #594
- Product-intelligence recovery checkpoint UI: GO_REVIEW_ONLY in open PR #595; production write/smoke HOLD
- Launch-stack PR gate: HOLD, Actions disabled/checks not attaching
- Public beta: HOLD
