# VET-1200 — Post-World-Class Hardening + Quality Loop (Wave 2)

> Canonical Wave 2 execution spec.
> This file is the tracked source of truth for issues `#154` through `#172`.

## Summary

- Wave 1 (`VET-1100`) is complete. All five sidecars are deployed, shadow infrastructure exists, the proposal pipeline exists, and threshold governance is enforced on `master`.
- Wave 2 activates the shadow stack, converts passive quality tooling into active operational loops, closes the advisory and hardening gaps, and improves operator visibility without weakening the deterministic clinical core.
- `VET-1201` is a docs-only gate and must land before any other Wave 2 branch opens.

## Global Safety Rules

1. `src/lib/triage-engine.ts` and `src/lib/clinical-matrix.ts` remain the medical authority.
2. `answered_questions`, `extracted_answers`, `unresolved_question_ids`, and `last_question_asked` remain protected deterministic state.
3. Compression remains narrative-only and cannot mutate control state.
4. Telemetry and shadow observations remain internal-only.
5. Promoted sidecars provide supplemental evidence only and never override deterministic urgency.
6. Emergency cases always bypass billing and usage gates.
7. Billing and rollout failures fail open for the user experience and fail loud in operator telemetry.

## Execution Order

### Mandatory first ticket

- `VET-1201` — roadmap sync, Wave 2 canonical spec, and Obsidian memory update.

### Hard-ordered chains

1. `VET-1202 -> VET-1203`
2. `VET-1202 -> VET-1206 -> VET-1207`
3. `VET-1216 -> VET-1217`
4. `VET-1203 -> VET-1211`

### Parallel-after-gate tickets

- `VET-1204`
- `VET-1205`
- `VET-1208`
- `VET-1209`
- `VET-1210`
- `VET-1212`
- `VET-1213`
- `VET-1214`
- `VET-1215`
- `VET-1218`

## Review Gates

- Every PR: Codex normal review.
- `VET-1203` and `VET-1218`: adversarial review path plus deploy/billing guard.
- `VET-1207`, `VET-1208`, and `VET-1209`: clinical-reviewer sign-off.

## Ticket Plan

### Phase A — Docs gate

#### `VET-1201` — Roadmap sync + Obsidian memory update

- Update `plans/DEVELOPMENT_ROADMAP.md` to show Wave 1 complete and Wave 2 active.
- Add this file as the canonical Wave 2 spec.
- Refresh `01 Active Work.md`, `04 Ticket Board.md`, and `16 Current Context Packet.md`.
- No runtime changes.

### Phase B — Shadow activation

#### `VET-1202` — Run Phase 5 shadow cycle

- Run the existing shadow cycle tooling against live sidecar infrastructure.
- Capture the first committed 288-sample baseline in `plans/phase5-shadow-baseline.md`.
- Record per-service promotion state, latency, timeout rate, and disagreement rate.
- No primary-path route changes.

#### `VET-1203` — Promote qualifying sidecar(s) to live traffic

- Add per-service `live_split_pct` support to the sidecar registry and routing layer.
- Start promoted services at 5% live traffic with deterministic case hashing.
- Add immediate env kill-switch support via `SIDECAR_LIVE_SPLIT_<SERVICE>=0`.
- Keep silent fallback to the NVIDIA path on any promoted-sidecar error.

### Phase C — Advisory fix

#### `VET-1204` — Fix Route Dangerous Replay Advisory

- Run the advisory job locally and identify whether the failure is stale expectation, broken script wiring, or a real regression.
- Fix expectation drift only when current behavior is demonstrably correct and document why.
- If the issue is a real regression, split it rather than silently updating the benchmark.

### Phase D — Confidence calibration

#### `VET-1205` — Wire confidence calibrator into route + report UI

- Call `calibrateConfidence()` during report generation.
- Add additive `calibrated_confidence` output to the report payload.
- Surface the confidence level and recommendation in the report UI.
- Keep calibration display-only and non-authoritative.

### Phase E — Eval harness quality loop

#### `VET-1206` — Eval harness baseline against full sidecar stack

- Run the full benchmark harness against the real sidecar-backed path.
- Commit `plans/eval-baseline-sidecar-stack.md` with accuracy, false positive rate, false negative rate, and top-10 failures.
- Flag any emergency false negative as a P0 blocker for `VET-1207`.

#### `VET-1207` — Fix top-3 eval harness clinical failures

- Use the `VET-1206` report to select the three highest-impact failures.
- Write a named regression test for each case before changing code.
- Apply the smallest safe fix for each failure.
- Re-run the affected eval cases and obtain clinical-reviewer sign-off for any deterministic logic changes.

### Phase F — Clinical quality

#### `VET-1208` — ICD-10 coverage audit + top-20 gaps

- Audit diagnosis labels used by the route, matrix, and triage engine.
- Add the top-20 missing canine mappings in `src/lib/icd-10-mapper.ts`.
- Commit `plans/icd10-coverage-audit.md`.
- Keep mappings display-only and reference-only.

#### `VET-1209` — First threshold proposal review cycle

- Run outcome-feedback backfill if needed to populate proposal inputs.
- Review real proposals in the admin dashboard.
- Accept at least one proposal and verify draft PR generation works end to end.
- Commit `plans/threshold-proposals-round1.md`.
- Do not apply any threshold change automatically.

### Phase G — Operator visibility

#### `VET-1210` — Production telemetry dashboard

- Add an admin-only telemetry route and page.
- Surface aggregated health metrics only: extraction success, rescue rate, repeat-question attempts, sidecar latency/error metrics, and shadow disagreement.
- Do not expose raw internal events.

#### `VET-1211` — Admin shadow rollout control panel

- Add admin-only read/write controls for `live_split_pct` after promotion is live.
- Allow split changes from 0 to 20 in increments of 5.
- Include kill-switch support and per-service health metadata.

### Phase H — Product hardening

#### `VET-1212` — Mobile responsiveness audit + fix

- Audit symptom checker, emergency banner, and report UI at 375px, 390px, and 768px.
- Eliminate horizontal scrolling, improve tap target sizes, and keep the emergency banner visible above the fold.

#### `VET-1213` — Notification reliability hardening

- Add retry with exponential backoff to digest sends.
- Track pending/sent/failed delivery state.
- Make mark-all-read idempotent.

### Phase I — Infrastructure

#### `VET-1214` — Rate limiting load test + Redis failover

- Add a synthetic load script and explicit failover policy tests.
- Ensure Redis-unavailable mode is never silently unlimited.
- Document the chosen fallback policy in code.

#### `VET-1215` — Auth hardening

- Harden expired-token refresh, refresh-token expiry, concurrent refresh, OAuth callback failure, and stale-session invalidation after password change.
- Add explicit regression coverage for all five edge cases.

### Phase J — Corpus

#### `VET-1216` — Second corpus ingestion pass

- Audit source quality and trust levels.
- Re-ingest or re-rank sources by verified trust.
- Commit `plans/corpus-quality-audit-round2.md`.

#### `VET-1217` — Breed-specific corpus expansion

- Identify the top-10 canine breeds in the user base.
- Ingest curated breed-tagged clinical records for top breed-specific conditions.
- Commit `plans/breed-expansion-manifest.md`.

### Phase K — Billing-sensitive hardening

#### `VET-1218` — Stripe webhook hardening + usage limits

- Harden webhook signature verification.
- Reconcile subscription state on key Stripe events.
- Add usage-limit checks at conversation start only.
- Fail open on billing-check errors and always bypass billing gates for emergency cases.

## Definition of Done

Wave 2 is complete only when all of the following are true:

- `VET-1201` docs gate has landed.
- A 288-sample shadow baseline is committed.
- At least one sidecar is promoted to controlled live traffic with a tested kill switch.
- Confidence calibration is visible in route output and report UI without changing urgency.
- Eval baseline is captured and the top-3 failures are fixed.
- Route Dangerous Replay Advisory is green again.
- ICD-10 coverage, telemetry visibility, mobile hardening, notification reliability, auth hardening, rate-limit hardening, corpus improvements, and billing safeguards are all landed and verified.
