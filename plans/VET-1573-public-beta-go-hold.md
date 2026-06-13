# VET-1573C Public Beta GO/HOLD Evidence Refresh

Decision: HOLD for public beta.

Evidence cutoff: 2026-06-13T02:18:44Z.

## Why Public Beta Is HOLD

Public beta requires same-current-production proof across admin, tester, feedback, symptom-check, History, monitoring, owner copy, invite, privacy/support, and rollback gates. The current evidence is strong in several private-cohort lanes, but it is not complete enough for public beta.

Current production alias checked for this refresh: `https://pawvital-ai.vercel.app` resolves to deployment `dpl_HzCVqnom3J9v1Dpaacz9K3gibgDr` (`https://pawvital-dp66rzs3o-kandasubbarao4-5462s-projects.vercel.app`). Vercel inspect shows 60-second AI route lambdas on this deployment, but the deployment was created before PR #607 merged, so this is deployment-shape proof only and not public-beta, Cohort 1 launch, or merged-runtime smoke proof.

Known current blockers:

- Fresh current-deployment authorized-admin command-center and admin API proof is missing from this machine.
- Invite-send proof for the intended private-tester cohort is missing. PR #598 corrects the command-center allowlist-vs-invite proof semantics, and PR #600 adds a validator/readout, but the current registry still contains only the example/template row and is not invitation-send proof.
- Full Cohort 1 readout counts are missing: tester count, completed symptom checks, final reports, feedback submissions, stalled flows, and urgency distribution.
- Issue #582 remains open as Supabase REST/Auth versus `DATABASE_URL` operational debt.
- Issue #588 remains open; VET-1563 model-promotion evidence is incomplete.
- Privacy, terms, consent persistence, and public-beta support readiness are not proven.
- Scheduler/shadow readout remains empty and must stay separate from owner-visible UX proof.
- Serverless reliability PR #601 is open/blocked with no checks attached; production alias/env/maxDuration proof and live synthetic latency scorecard evidence are still missing.
- VET-1560 launch-readiness gate PR #603 is open/blocked with no checks attached. It is review-only gate visibility and keeps Cohort 1 launch execution, public beta, and model/NIM promotion on HOLD.
- Turn-depth standard guard PR #605 is draft, stacked on draft parent PR #604, has no attached checks, and remains review-only until accepted, merged/deployed, and backed by production alias/env/maxDuration proof plus live synthetic latency scorecard evidence.
- Signup/symptom-check reliability PR #606 is closed unmerged with no checks; manual signup/login/symptom smoke and NVIDIA phrasing configuration remain incomplete.
- P0 runtime reliability PR #607 merged to `master` as `250d0b3c517d285003c2d072c91f8d876e4c5026`, but the current production alias deployment predates that merge; no production smoke, attached checks, operator Supabase env alignment, NVIDIA phrasing configuration, or full runtime/protected-clinical review proof is present.
- Launch-stack PR gate recovery is blocked: PRs #591-#596 are open/non-draft/mergeable but have no attached checks, PR #598 is also open/non-draft/mergeable/blocked with no attached checks, PR #600 is clean only against the PR #598 base with no reported checks, PR #603 is open/non-draft/mergeable/blocked with no attached checks, the required `Threshold Review Gate` is absent where applicable, the PR #596 recovery branch has no workflow runs, and manual dispatch fails with `HTTP 422: Actions has been disabled for this user`.

## Owner-Visible UX Proof

Passed, but partial:

- VET-1570C production saved-tester replay on `dpl_581C9m5utNovKZXFGoEhybXFGqWa` reached symptom-check completion, final report, History, feedback submission, and leakage-clean owner-visible output.
- Feedback submission from History returned HTTP 200 with `ok: true` for symptom check `5aeff251-4b54-4e45-99b6-e99aa1550ce4`.

Not proven:

- Fresh current-deployment admin-positive proof.
- Invite-send proof.
- Full cohort-level counts and urgency distribution.

New owner-copy correction:

- VET-1580C / PR #598 is `GO_REVIEW_ONLY` for command-center/registry proof semantics at `2ee6d4c1ef48c68e3ce1398467dd1861391f6b87`. It changes the admin command-center count from `Testers invited` to `Allowlisted testers`, separates registry `allowlist_status` from manual `invitation_sent_proof`, adds an operational note that invitation delivery must be verified separately, and splits `Testers allowlisted` from `Invitations sent (attach manual proof)` in the Cohort 1 report template.
- This removes an owner-visible overclaim, but PR #598 is open/non-draft/blocked and does not supply invitation-send proof.
- VET-1582C / PR #600 is `GO_REVIEW_ONLY` for the invite-send proof validator at `30629f052bb8bc3215097fd02cd59f692d7e6a27`. Its generated readout currently reports one example/template row, intended tester count 0, rows with invitation proof 0, and blockers `NO_INTENDED_TESTERS` plus `PLACEHOLDER_ROWS_PRESENT`; this proves the current registry is still HOLD, not that invitations were sent.

## Backend And Monitoring Proof

Passed, but partial:

- App Insights for the VET-1570C saved-tester smoke window recorded `api.ai.symptom-chat` events=5, errors=0, p95 durationMs=41604, p95 extractionMs=0, and p95 secondOpinionMs=8075.
- Product-intelligence persistence recovered on `dpl_Bo7RYGjXjV6HGNs5XXUMA97zs7FL` with saved-tester owner GET/POST/GET, RLS denial proof, focused tests, claim-language review, and zero post-smoke 500 records.
- PR #594 adds newer current-deployment product-intelligence daily-readiness write proof on `dpl_8Yc6kfQMA6ahAxygLfrKbSMmLjzb`: row `61c44ae9-5b30-482d-8207-efbaf6598140`, history read pass, unowned pet read 404, clean owner-visible claim/leakage scan, and 0 JSON error records in the post-smoke Vercel error-log query.
- PR #601 is `GO_REVIEW_ONLY` for serverless reliability budget hardening in an open blocked PR at `b72c3620510d14fe5e2669e16adac876dfe112d7`, but it is not merged/deployed and still lacks production alias/env/maxDuration proof plus live synthetic latency probe/scorecard evidence.
- PR #606 is HOLD for signup and symptom-checker reliability fixes at `d790dc097b8bc97950d5cb5ad3bd3253b365ebd0` because it is closed unmerged with no checks and still lacks manual signup/login/symptom smoke plus NVIDIA phrasing configuration.
- PR #607 has merged to `master` at `250d0b3c517d285003c2d072c91f8d876e4c5026` from head `1ca37f8db6d1a0a2458c509a02ecc721d1962250`, but it is still HOLD for public beta because the current production alias deployment was created before the merge and no production smoke, attached checks, operator Supabase env alignment, NVIDIA phrasing configuration, or full runtime/protected-clinical review proof is present.

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

VET-1578C / PR #595 is `GO_REVIEW_ONLY` for the owner-visible recovery checkpoint UI branch. It adds local focused tests, refreshed claim-language/readiness proof, Bumblebee proof, local Playwright smoke, AutoScientists verification, and formal TecjLead `GO_REVIEW_ONLY`, but PR #595 is still open/blocked with no GitHub checks attached and is not landed on `master`.

Current PR #595 head is `a9ad1ba953974f8c463812d24304b8ed74a3d4dd`. Its formal TecjLead review is `GO_REVIEW_ONLY` with no blocking findings, and its refreshed claim-language/readiness evidence reviews 497 strings with `findings=[]`.

The current production proof is limited to daily-readiness/product-intelligence persistence. Recovery-checkpoint owner-visible UI is review-ready in PR #595, but authenticated production recovery-checkpoint write/smoke remains HOLD. Claim-language review in PR #595 covers the recovery checkpoint builder, owner workflow helper, analytics page, panel, and VET-1564 artifacts, but PR #595 must still be treated as PR review evidence until merged/deployed and production-smoked.

## PR Gate And Merge Readiness

Launch-stack PR gate readiness is HOLD.

- PRs #591-#596 are open, non-draft, and mergeable, but each currently reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- PR #598 is open/non-draft/mergeable but also reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`.
- PR #600 is open/non-draft/mergeable and `CLEAN` against PR #598's branch, but it has no reported checks and remains dependent review evidence until PR #598 lands and the validator is run against a completed registry.
- PR #601 is open/non-draft/mergeable but reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`; it remains review-only reliability evidence until checks attach/pass and production latency proof is captured.
- PR #603 is open/non-draft/mergeable but reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`; it remains review-only VET-1560 launch-readiness gate evidence and explicitly keeps Cohort 1 launch execution, public beta, and model/NIM promotion on HOLD.
- PR #604 is an open draft parent for the serverless-duration branch, reports `mergeStateStatus=BLOCKED` with `statusCheckRollup=[]`, and is not merged.
- PR #605 is an open draft stacked PR on PR #604, reports `mergeStateStatus=CLEAN` against that parent with `statusCheckRollup=[]`, and remains review-only turn-depth guard evidence until checks attach/pass, the stack lands, and production proof is captured.
- PR #606 is closed without `mergedAt` or `mergeCommit`; it remains non-production evidence only until the work lands elsewhere with checks, manual smoke, and configuration proof.
- PR #607 is merged to `master` as `250d0b3c517d285003c2d072c91f8d876e4c5026`, but `gh pr view 607` reports `statusCheckRollup=[]`; it remains public-beta HOLD until the merged runtime stack is deployed to the production alias, the PR #606 stack lineage is reviewed, operator env/config proof exists, full runtime/protected-clinical review is complete, and production smoke passes.
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
- 2026-06-12 read-only Vercel production monitoring refresh emitted zero JSON error rows and zero JSON HTTP 500 rows for the last hour.
- PR #600 adds a review-only invite-send proof validator, and PR #592 now records its placeholder-registry HOLD result in the Cohort 1 readout.
- PR #601 adds review-ready serverless reliability budget hardening and a latency probe/scorecard workflow, but production alias/env/maxDuration proof and live synthetic scorecard evidence remain missing.
- PR #603 adds review-only VET-1560 launch-readiness gate visibility, but the gate artifact itself keeps Cohort 1 launch execution, public beta, and model/NIM promotion on HOLD.
- PR #605 adds a review-only turn-depth standard guard in a draft stacked PR. PR #592 now records it as `GO_REVIEW_ONLY_IN_DRAFT_STACKED_PR_PARENT_PR604_HOLD`, separate from production reliability proof.
- PR #606 adds signup/symptom reliability work but is closed unmerged; manual smoke and NVIDIA phrasing configuration remain missing.
- PR #607 adds merged P0 runtime reliability stack evidence on `master`, but current-production deployment/smoke proof, parent/stack review after PR #606 closure, operator env/config proof, full runtime/protected-clinical review, and attached check evidence remain missing.
- No full Cohort 1 monitoring/readout packet exists for public beta.

## Final Gate

- Public beta: HOLD
- Private Cohort 1 admin authority: historical GO, current deployment unproven from this machine
- Private Cohort 1 launch/readout: partial HOLD for invite-send proof and full cohort counts
- Cohort command-center/registry invite-proof semantics: GO_REVIEW_ONLY in open PR #598; invitation-send proof HOLD
- Cohort invite-send proof validator: GO_REVIEW_ONLY in open dependent PR #600; current registry proof HOLD
- Product-intelligence slice: GO for current-deployment daily-readiness persistence only
- Product-intelligence recovery checkpoint UI: GO_REVIEW_ONLY for PR #595 at `a9ad1ba953974f8c463812d24304b8ed74a3d4dd`; production write/smoke HOLD
- Candidate intake harness: GO review-only
- Model/NIM promotion: HOLD
- Serverless reliability budget hardening: GO_REVIEW_ONLY in open PR #601; production alias/maxDuration/synthetic scorecard proof HOLD
- VET-1560 launch-readiness gates: GO_REVIEW_ONLY in open PR #603; Cohort 1 launch execution, public beta, and model/NIM promotion HOLD
- Turn-depth standard guard: GO_REVIEW_ONLY in draft stacked PR #605; parent PR #604, production alias/env/maxDuration proof, and live synthetic latency scorecard proof HOLD
- Signup/symptom-check reliability fixes: HOLD, PR #606 closed unmerged; manual smoke/configuration proof missing
- P0 runtime reliability stack: merged to master in PR #607, but current-production deployment/smoke, parent/stack review after PR #606 closure, operator env/config proof, full review, and checks evidence HOLD
- Launch-stack PR gate: HOLD, Actions disabled/checks not attaching
