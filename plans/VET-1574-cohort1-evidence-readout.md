# VET-1574C Cohort 1 Evidence Readout

Readout status: PARTIAL.

Public beta decision: HOLD.

Evidence cutoff: 2026-06-13T02:52:03.716Z.

This is a point-in-time readout from current issue evidence, existing repo templates, and read-only production probes. It is not a completed 48-hour Cohort 1 report because the repo does not contain a completed tester registry, invite-send proof, full cohort counts, or an urgency distribution.

## Current Production Probe

Read-only probe:

- `https://pawvital-ai.vercel.app/`: HTTP 200
- `/admin/cohort-launch`: HTTP 307 to `/login?redirect=%2Fadmin%2Fcohort-launch&reason=session_expired`
- `/api/admin/private-tester`: HTTP 403 unauthenticated
- `/api/product-intelligence/snapshots?pet_id=prod-proof-readonly`: HTTP 401 unauthenticated
- `/api/notifications`: HTTP 401 unauthenticated

Current production alias resolves to deployment `dpl_HzCVqnom3J9v1Dpaacz9K3gibgDr` (`https://pawvital-dp66rzs3o-kandasubbarao4-5462s-projects.vercel.app`). The Vercel inspect output shows 60-second AI route lambdas on this deployment, but the deployment was created before PR #607 merged and before PR #608 opened. This proves the public home is reachable, unauthenticated admin/product/notification denial still holds, and the current deployment shape has 60-second AI route lambdas. It does not prove current positive-admin access, authenticated product-intelligence persistence, owner notification flow, the merged runtime stack, the safe-signup hotfix, or completed Cohort 1 flows.

## Current Production Monitoring Refresh

Read-only Vercel production monitoring was refreshed with explicit project scope because this worktree is not linked to a Vercel project.

- `vercel logs --project pawvital-ai --environment production --level error --since 1h --json --no-branch --limit 100`: `ERROR_JSON_ROWS=0`
- `vercel logs --project pawvital-ai --environment production --status-code 500 --since 1h --json --no-branch --limit 100`: `STATUS_500_JSON_ROWS=0`

This is a useful current log sample, but it is not a full Cohort 1 monitoring window and does not provide a fresh App Insights latency readout for `durationMs`, `extractionMs`, or `secondOpinionMs`.

PR #601 adds review-ready serverless reliability budget hardening and a latency probe/scorecard workflow at `b72c3620510d14fe5e2669e16adac876dfe112d7`, but it is open/blocked with no checks, not merged/deployed, and still lacks production alias/env/maxDuration proof plus live synthetic latency scorecard evidence. Treat it as `GO_REVIEW_ONLY`, not current production monitoring proof.

PR #603 adds review-only VET-1560 launch-readiness gate sync at `b52ebd1d8cef869ef3d869fe2fd192cfc97a094a`, but it is open/blocked with no checks and does not execute Cohort 1 launch operations. Treat it as gate traceability evidence, not public-beta GO.

PR #605 adds a draft stacked turn-depth standard guard at `979bca6ee1ba229f0e45599d1131ac7753f8dc96`, but it is stacked on PR #604, draft, not merged/deployed, and has no checks. Treat it as review-only drift protection, not production latency proof.

PR #606 added signup and symptom-check reliability fixes at `d790dc097b8bc97950d5cb5ad3bd3253b365ebd0`, but live GitHub state now shows it is closed unmerged with no checks. Manual signup -> login -> symptom-check smoke and NVIDIA phrasing configuration remain incomplete, so this is not landed production proof.

PR #607 merged the P0 runtime reliability stack to `master` as `250d0b3c517d285003c2d072c91f8d876e4c5026` from head `1ca37f8db6d1a0a2458c509a02ecc721d1962250`, but the current production alias deployment predates that merge. It still needs operator env/config proof, protected runtime/clinical review, and production smoke before it can count as Cohort 1 or public-beta proof.

PR #608 adds a safe-signup hotfix at `25677099a8b3e10eab195ab52d44a151baa60f17` after #607 introduced unsafe public signup auto-confirm behavior. Focused auth Jest 6 suites / 48 tests, build, public signup route scan, AutoScientists verifier, empty reviewThreads, and TecjLead/code-review GO_REVIEW_ONLY evidence pass locally, but PR #608 is open/blocked with no checks and still needs merge/deploy plus browser signup smoke.

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
| Serverless reliability hardening | GO_REVIEW_ONLY in open PR #601; production proof HOLD | PR #601 adds maxDuration/budget/deadline hardening and latency probe/scorecard workflow, but no checks are attached and production alias/env/maxDuration plus live synthetic latency scorecard proof are still missing. |
| VET-1560 launch-readiness gate sync | GO_REVIEW_ONLY in open PR #603; public beta HOLD | PR #603 adds review-only VET-1560 launch-readiness gate snapshot/dashboard/completion-audit wiring, but it has no checks, is not merged, and does not prove Cohort 1 launch execution. |
| Turn-depth standard guard | GO_REVIEW_ONLY in draft stacked PR #605; parent/prod proof HOLD | PR #605 pins `SYMPTOM_CHAT_TURN_DEPTH=standard` in repo-visible config with guard tests, but it is draft, stacked on PR #604, has no checks, is not merged/deployed, and requires maintainer acceptance of the non-secret `vercel.json` env choice. |
| Signup/symptom reliability | HOLD, PR #606 closed unmerged | PR #606 records focused signup/symptom-check tests, but it is closed without merge proof, manual signup/login/symptom smoke remains unchecked, and NVIDIA phrasing configuration remains incomplete. |
| P0 runtime reliability stack | MERGED_TO_MASTER, production deploy/smoke HOLD | PR #607 merged as `250d0b3c517d285003c2d072c91f8d876e4c5026`, but the current production deployment predates the merge and no production smoke/operator env proof is present. |
| Safe signup hotfix | GO_REVIEW_ONLY in open PR #608; deploy/browser-smoke HOLD | PR #608 restores public signup to the anon Supabase boundary after #607 introduced unsafe auto-confirm behavior. Focused auth Jest 6 suites / 48 tests, build, route scan, AutoScientists verifier, and empty reviewThreads pass, but the PR is open/blocked with no checks and is not deployed. |
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
- VET-1571 / PR #601 records serverless reliability hardening `GO_REVIEW_ONLY` at `b72c3620510d14fe5e2669e16adac876dfe112d7`, with local P0 implementation PASS and a latency probe/scorecard workflow.
- VET-1560 / PR #603 records launch-readiness gate sync `GO_REVIEW_ONLY` at `b52ebd1d8cef869ef3d869fe2fd192cfc97a094a`, with public beta and model/NIM promotion still HOLD.
- VET-1573 / PR #605 records turn-depth standard guard `GO_REVIEW_ONLY` at `979bca6ee1ba229f0e45599d1131ac7753f8dc96`, with focused guard/Jest/build/Bumblebee/AutoScientists/TecjLead proof but draft/stacked/no-checks status.
- VET-LAND / PR #606 records signup/symptom-check reliability tests at `d790dc097b8bc97950d5cb5ad3bd3253b365ebd0`, but the PR is closed unmerged, manual smoke remains unchecked, and NVIDIA phrasing configuration remains incomplete.
- P0 runtime reliability / PR #607 merged to `master` as `250d0b3c517d285003c2d072c91f8d876e4c5026` from head `1ca37f8db6d1a0a2458c509a02ecc721d1962250`, but current production deployment predates the merge and still lacks operator env/config proof, full runtime/protected-clinical review, and production smoke.
- VET-LAND hotfix / PR #608 restores public signup to the anon Supabase `signUp` boundary at `25677099a8b3e10eab195ab52d44a151baa60f17`, with focused auth Jest 6 suites / 48 tests, build, route scan, AutoScientists verifier, empty reviewThreads, and TecjLead/code-review evidence passing locally, but it is open/blocked with no checks and still lacks merge/deploy plus browser signup smoke.
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
- PR #601 is open/non-draft/blocked with no checks reported, so serverless reliability hardening is review-only evidence until merged/deployed and production alias/env/maxDuration plus live latency scorecard proof exists.
- PR #603 is open/non-draft/blocked with no checks reported, so VET-1560 launch-readiness gate sync is review-only artifact evidence, not public-beta readiness or launch execution proof.
- PR #605 is draft/stacked on PR #604 with no checks reported, so turn-depth guard evidence is review-only and not production latency or public-beta proof.
- PR #606 is closed unmerged with no checks reported, so signup/symptom reliability work is not landed master or production proof.
- PR #607 is merged to `master`, but the current production alias deployment predates the merge and no production smoke is present, so the P0 runtime reliability stack is not production latency, scheduler/shadow, or public-beta proof yet.
- PR #608 is open/non-draft/blocked with no checks reported, so the safe-signup hotfix is review-only and not deployed signup proof.

## PR Gate And Merge Readiness

PR #592 merge readiness is HOLD.

- PR #592 is open, non-draft, and mergeable, but `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- `gh run list --branch codex/vet-1574c-cohort1-evidence-readout` returns no workflow runs.
- `gh pr checks 592` reports no checks.
- PR #601 is open/non-draft/mergeable but reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`; it remains review-only reliability evidence until checks attach/pass and production latency proof is captured.
- PR #603 is open/non-draft/mergeable but reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`; it remains review-only VET-1560 gate evidence until checks attach/pass and the branch lands.
- PR #605 is open/draft/mergeable and clean against PR #604, but reports `statusCheckRollup=[]`; it remains review-only turn-depth guard evidence until the parent stack and checks are resolved.
- PR #606 is closed without `mergedAt` or `mergeCommit`; it remains non-production evidence only.
- PR #607 is merged to `master` as `250d0b3c517d285003c2d072c91f8d876e4c5026`, but the current production alias deployment predates the merge and no production smoke is present.
- PR #608 is open/non-draft/mergeable but reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`; it remains review-only safe-signup hotfix evidence until checks, merge/deploy, and browser signup smoke are resolved.
- PR #596 attempted workflow-only recovery for the required `Threshold Review Gate`, but issue #339 records that manual dispatch fails with `HTTP 422: Actions has been disabled for this user`.
- This merge-gate blocker does not change Cohort 1 evidence status. The readout remains PARTIAL and public beta remains HOLD.

PR #591 is the public-beta GO/HOLD packet branch and must carry the same current PR #608 safe-signup blocker context before it is treated as the latest final decision artifact. Public beta, model/NIM promotion, production reliability proof, invite-send proof, and PR merge readiness remain HOLD regardless of this readout refresh.

## Product-Quality Triage From Real Evidence

- #585 / VET-1570C: symptom-check stall, closed and production-verified.
- #587 / VET-1571C: product-intelligence history persistence failure, closed and production-verified; PR #594 refreshed current-deployment daily-readiness write proof.
- PR #595 / VET-1578C: recovery checkpoint owner-visible UI, `GO_REVIEW_ONLY`; authenticated production recovery write/smoke still HOLD.
- PR #598 / VET-1580C: command-center/registry invite-proof semantics, `GO_REVIEW_ONLY` in open non-draft PR; invitation-send proof still HOLD.
- PR #600 / VET-1582C: invite-send proof validator, `GO_REVIEW_ONLY` in open dependent PR; current generated readout keeps invite-send proof HOLD because the registry has only the example/template row.
- PR #601 / VET-1571: serverless reliability hardening, `GO_REVIEW_ONLY` in open PR; production alias/env/maxDuration proof and live synthetic latency scorecard remain HOLD.
- PR #603 / VET-1560: launch-readiness gate sync, `GO_REVIEW_ONLY` in open PR; public beta remains HOLD and the gate snapshot does not execute Cohort 1 launch operations.
- PR #605 / VET-1573: turn-depth standard guard, `GO_REVIEW_ONLY` in draft stacked PR; parent PR #604, checks, merge/deploy, and production latency proof remain HOLD.
- PR #606 / VET-LAND: signup/symptom reliability, HOLD because the PR is closed unmerged and still lacks manual smoke/configuration proof.
- PR #607 / P0 runtime reliability: merged to `master`, but current-production deployment/smoke, operator env/config proof, protected runtime/clinical review, and public-beta proof remain HOLD.
- PR #608 / VET-LAND hotfix: `GO_REVIEW_ONLY` in open blocked PR; safe-signup boundary tests pass locally, but checks, merge/deploy, and browser signup smoke remain HOLD.
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
- Treat PR #601 serverless reliability hardening as review-only until checks attach/pass, the branch lands, and production alias/env/maxDuration plus live synthetic latency scorecard evidence exists.
- Treat PR #603 VET-1560 launch-readiness gate sync as review-only until checks attach/pass and the branch lands; it does not replace Cohort 1 launch execution evidence.
- Treat PR #605 turn-depth guard as review-only until checks attach/pass, the parent PR #604 is resolved, the branch lands, and production alias/env/maxDuration plus live synthetic latency scorecard evidence exists.
- Treat PR #606 signup/symptom reliability work as not landed because the PR is closed unmerged and still lacks manual signup/login/symptom smoke plus NVIDIA phrasing configuration.
- Treat PR #607 P0 runtime reliability stack as not current-production proof until a post-merge production deployment, operator env/config proof, protected clinical/runtime review, and production smoke are captured.
- Treat PR #608 safe-signup hotfix as review-only until checks attach/pass, the branch lands, the production alias deploys the hotfix, and browser signup smoke passes.
- Keep the PR #591 public-beta packet synchronized with PR #608 current-head safe-signup evidence; public beta remains HOLD until checks, merge/deploy, browser signup smoke, invite-send proof, cohort counts, monitoring, privacy/support, and rollback gates pass.
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
- Serverless reliability budget hardening: GO_REVIEW_ONLY in open PR #601; production alias/maxDuration/synthetic scorecard proof HOLD
- VET-1560 launch-readiness gate sync: GO_REVIEW_ONLY in open PR #603; public beta HOLD
- Turn-depth standard guard: GO_REVIEW_ONLY in draft stacked PR #605; parent PR #604 and production proof HOLD
- Signup/symptom reliability: HOLD, PR #606 closed unmerged; manual smoke/configuration proof missing
- P0 runtime reliability stack: merged to master in PR #607, but current-production deployment/smoke, env/config, and full-review proof HOLD
- Safe signup hotfix: GO_REVIEW_ONLY in open PR #608; deploy/browser-smoke proof HOLD
- Launch-stack PR gate: HOLD, Actions disabled/checks not attaching
- Public beta: HOLD
