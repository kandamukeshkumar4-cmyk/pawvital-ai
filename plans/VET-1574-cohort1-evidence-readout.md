# VET-1574C Cohort 1 Evidence Readout

Readout status: PARTIAL.

Public beta decision: HOLD.

Evidence cutoff: 2026-06-12T15:57:16.361Z.

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

Current App Insights query refresh:

- Resource: `pawvital-appinsights` in `pawvital-rg`, workspace `managed-pawvital-appinsights-ws`
- 24h route `customEvents` for `pawvital.route.request` / `pawvital.route.error`: event count 0, `durationMs` count 0, `extractionMs` count 0, `secondOpinionMs` count 0
- 7d route `customEvents`: event count 0, `durationMs` count 0, `extractionMs` count 0, `secondOpinionMs` count 0
- 30d tables: `customEvents` count 0, `requests` count 0, `traces` count 0, `customMetrics` count 0

This is a blocker for the current Cohort 1 latency/error readout, not a pass. The current App Insights workspace query returned no fresh queryable cohort-window evidence for `durationMs`, `extractionMs`, or `secondOpinionMs`.

## Core Metrics

| Metric | Status | Current evidence |
|---|---|---|
| Tester count | Unknown | No completed Cohort 1 registry or admin export found. |
| Allowlist vs invite semantics | GO_REVIEW_ONLY in open PR #598; invite-send proof HOLD | PR #598 changes the command-center count to `Allowlisted testers`, separates registry `allowlist_status` from manual `invitation_sent_proof`, and separates manual invitation-send proof in the report template. It does not prove invitations were sent. |
| Invite-send proof validator | GO_REVIEW_ONLY in open dependent PR #600; current registry proof HOLD | PR #600 adds the VET-1582 validator/readout for PR #598 registry fields. The current generated readout reports intended tester count 0, rows with invitation proof 0, and blockers `NO_INTENDED_TESTERS` plus `PLACEHOLDER_ROWS_PRESENT`; it improves the proof harness but does not send or prove invitations. |
| Completed symptom checks | Partial, known proof count 1 | VET-1570C saved-tester replay reached symptom-check completion. |
| Final reports | Partial, known proof count 1 | VET-1570C saved-tester replay reached final report and History. |
| Feedback submissions | Partial, known proof count 1 | History feedback submission for symptom check `5aeff251-4b54-4e45-99b6-e99aa1550ce4` returned HTTP 200 with `ok: true`. |
| Failed/stalled flows | Partial | #585 timeout fixed/verified; #587 product-intelligence history fixed/verified; PR #594 adds current-deployment daily-readiness write proof but is open/blocked; #582 operational debt open; #588 model evidence open. |
| Urgency distribution | Unknown | No full Cohort 1 result dataset is present. |
| Owner-visible leakage scan | Partial pass | VET-1570C saved-tester replay was leakage-clean. No full-cohort leakage scan exists. |
| App Insights latency | Partial, current query HOLD | Historical VET-1570C evidence recorded `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, p95 secondOpinionMs=8075. The 2026-06-11 read-only App Insights refresh returned zero queryable route/custom event, request, trace, or custom metric rows in 24h/7d/30d windows, so no fresh cohort-window latency readout is available. |
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
- Invite-send proof is missing. PR #598 fixes the command-center/registry allowlist-vs-invite boundary, and PR #600 adds a validator, but the current registry still contains only the example/template row and is not invitation-send proof.
- Current-deployment positive-admin proof is unavailable from this machine after later deployments.

## Backend Readout Proof

Partial backend proof exists:

- VET-1570C sampled Vercel logs showed no HTTP 500 rows; symptom-chat and feedback rows returned HTTP 200.
- VET-1570C App Insights recorded `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, p95 secondOpinionMs=8075.
- VET-1571C product-intelligence persistence recovery passed owner GET/POST/GET, RLS denial proof, focused tests, claim-language review, and post-smoke 500 log query.
- VET-1576C / PR #594 adds current-deployment daily-readiness/product-intelligence proof on `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`: row `61c44ae9-5b30-482d-8207-efbaf6598140`, history read pass, unowned pet read 404, clean owner-visible claim/leakage scan, and 0 JSON post-smoke error records.
- VET-1578C / PR #595 records recovery checkpoint UI `GO_REVIEW_ONLY` at `a9ad1ba953974f8c463812d24304b8ed74a3d4dd`, with refreshed claim-language/readiness evidence and formal TecjLead no-blocker review.
- Current last-hour Vercel production log sample emitted zero error JSON rows and zero HTTP 500 JSON rows.
- 2026-06-12 read-only App Insights query refresh returned zero queryable route/custom event rows in 24h/7d windows and zero 30d union rows, so no fresh `durationMs`, `extractionMs`, or `secondOpinionMs` cohort-window latency readout is available from App Insights today.

Backend proof limits:

- Current App Insights query refresh returned zero rows across `customEvents`, `requests`, `traces`, and `customMetrics`, so the required Cohort 1 latency/error window remains missing rather than improved.
- Scheduler/shadow readout is still empty where recorded.
- No full Cohort 1 telemetry window exists in repo evidence.
- Backend telemetry does not replace owner-visible UX proof.
- PR #594 is open/blocked, so this is evidence-in-PR, not landed master truth.
- PR #595 is open/blocked, so recovery checkpoint UI remains review-only evidence, not landed production truth.
- PR #591 is open/blocked, so the public-beta HOLD packet is evidence-in-PR, not landed master truth.
- PR #598 is open/non-draft/blocked, so command-center/registry invite-semantics proof is evidence-in-PR, not landed master truth, and it does not prove invitations were sent.
- PR #600 is open/non-draft and clean against the PR #598 base, but it is a dependent review branch with no checks reported; its generated VET-1582 readout currently proves invite-send proof is still HOLD from the placeholder registry.

## PR Gate And Merge Readiness

PR #592 merge readiness is HOLD.

- PR #592 is open, non-draft, and mergeable, but `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- `gh run list --branch codex/vet-1574c-cohort1-evidence-readout` returns no workflow runs.
- `gh pr checks 592` reports no checks.
- PR #596 attempted workflow-only recovery for the required `Threshold Review Gate`, but issue #339 records that manual dispatch fails with `HTTP 422: Actions has been disabled for this user`.
- This merge-gate blocker does not change Cohort 1 evidence status. The readout remains PARTIAL and public beta remains HOLD.

PR #591 now records the recovered PR #595 formal TecjLead evidence, PR #598 non-draft invite-semantics evidence, and PR #592 readout evidence at `7fb9d9794682581f3bfd6055d83f60556eefdc49`, but PR #591 also remains open/blocked with no checks attached.

PR #591 now records PR #598's non-draft GO_REVIEW_ONLY invite semantics evidence at `7fb9d9794682581f3bfd6055d83f60556eefdc49`, but it does not yet record PR #600's invite-send proof validator. This VET-1574 refresh records PR #600, keeps public beta HOLD, and leaves a separate follow-up refresh needed for PR #591.

## Product-Quality Triage From Real Evidence

- #585 / VET-1570C: symptom-check stall, closed and production-verified.
- #587 / VET-1571C: product-intelligence history persistence failure, closed and production-verified; PR #594 refreshed current-deployment daily-readiness write proof.
- PR #595 / VET-1578C: recovery checkpoint owner-visible UI, `GO_REVIEW_ONLY`; authenticated production recovery write/smoke still HOLD.
- PR #598 / VET-1580C: command-center/registry invite-proof semantics, `GO_REVIEW_ONLY` in open non-draft PR; invitation-send proof still HOLD.
- PR #600 / VET-1582C: invite-send proof validator, `GO_REVIEW_ONLY` in open dependent PR; current generated readout keeps invite-send proof HOLD because the registry has only the example/template row.
- #582 / VET-1569C: REST/Auth versus `DATABASE_URL` project split, open operational debt.
- #588 / VET-1572C: model-promotion evidence chain, open release blocker; do not promote model flags.

## Required To Complete The Cohort 1 Readout

- Export or record intended private-tester invite count and active tester count.
- Record invite-send proof for the intended private-tester cohort; do not count allowlisted testers as invitations sent.
- Run the VET-1582 invite-send proof validator against the completed registry and attach the redacted GO_REVIEW_ONLY readout before treating invitations as sent.
- Aggregate completed symptom checks, final reports, and feedback submissions across all invited testers.
- Export urgency distribution for completed Cohort 1 checks.
- Run owner-visible leakage scan across all Cohort 1 reports, History entries, and feedback surfaces.
- Capture full Cohort 1 App Insights latency/error window for admin API, feedback API, symptom-chat, durationMs, extractionMs, and secondOpinionMs.
- Resolve App Insights ingestion/queryability or run a fresh authenticated cohort-window symptom-check telemetry capture so `durationMs`, `extractionMs`, and `secondOpinionMs` are queryable from the production App Insights resource.
- Record scheduler/shadow readout status from the formal runner where relevant.
- Re-prove current-deployment authorized-admin command-center/API access or explicitly keep it historical only.
- Restore GitHub Actions scheduling/check attachment so PR #592 receives the required `Threshold Review Gate` and other required contexts.

## Final Gate

- Cohort 1 evidence readout: PARTIAL
- Cohort 1 launch execution: UNPROVEN_FULL_COHORT
- Owner-visible UX proof: PARTIAL_PASS
- Backend readout proof: PARTIAL
- Current production error/500 log sample: PASS, zero JSON rows in the last hour
- Current App Insights query refresh: HOLD, zero queryable telemetry rows in checked windows
- Cohort command-center/registry invite-proof semantics: GO_REVIEW_ONLY in open PR #598; invitation-send proof HOLD
- Cohort invite-send proof validator: GO_REVIEW_ONLY in open dependent PR #600; current registry proof HOLD
- Product-intelligence backend proof: GO current-production daily-readiness only, in open PR #594
- Product-intelligence recovery checkpoint UI: GO_REVIEW_ONLY in open PR #595; production write/smoke HOLD
- Launch-stack PR gate: HOLD, Actions disabled/checks not attaching
- Public beta: HOLD
