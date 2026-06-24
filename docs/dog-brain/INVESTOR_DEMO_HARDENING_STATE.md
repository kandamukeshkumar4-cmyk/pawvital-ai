# Investor Demo Hardening — Closed Loop State

> Single source of truth for the investor-demo hardening loop. Updated every iteration.
> Branch: `codex/investor-demo-hardening` · Worktree: `C:\pv-hardening` (NTFS, build/test capable)
> Main worktree `G:\MY Website\pawvital-ai` is exFAT — typecheck/eslint/test only, **no build**.

## Baseline (Iteration 1 — 2026-06-23)

- **Current commit:** `bba69b0` (origin/master tip) — Merge PR #710.
- **master contains PR #709 or newer:** YES. master tip is **#710** (`fd3cd14`).
  - #706 vet-safe supplement schema, #707 lifecycle safety hotfix, #708 onboarding test drift,
    #709 memory-trace ("explain memory behind symptom questions"), #710 selector-source trace.

### Phase status read from code (verified, not assumed)

| Phase | Scope | Status | Evidence |
|-------|-------|--------|----------|
| 1 | Selector trace from selected source | **ALREADY LANDED** | PR #710 `fd3cd14`: selector reports branch (complaint/brain/fallback); `deriveBrainQuestionTrace` no longer re-derives; repeat-avoidance trace gap fixed; tests added. |
| 2 | 60/90-day memory ranking (`src/lib/dog-brain/memory-ranking.ts`) | **DONE (iter 2)** | Pure module + 13 tests; wired in dog-brain-context.ts; severity stays dominant (urgency-safe). |
| 3 | Privacy-safe analytics (`src/lib/dog-brain/analytics.ts`) | **MODULE + LIFECYCLE WIRING DONE (iter 3,6)** | 8 events + 21 tests; lifecycle emitters wired into followups POST + followups/[id] PATCH + supplements POST/PATCH (5 points) with a 6-test wiring suite. `brain_context_loaded` + route trace/emergency emits in symptom-chat route still pending (higher-risk). |
| 4 | Live E2E workflow (`.github/workflows/dog-brain-live-e2e.yml`) | **HARNESS DONE (iter 5)** | Manual workflow_dispatch + env-gated `tests/e2e/dog-brain-live-e2e.ts` (seed→memory-question poll→emergency-suppression→cleanup→0-residual). Typechecks+lints; NOT yet executed live (needs operator secrets). |
| 5 | Supabase migration-ledger verify (`dog_brain_supplement_trials`) | **RUNBOOK (iter 4)** | STOP: MCP bound to wrong project (JobsearchAi, not PawVital). Runbook written with exact verify + repair commands + Node pg one-off. Live verify deferred to operator with correct creds. |
| 6 | UX polish across tabs | **NOT STARTED** | — |
| 8 | Clinical knowledge layer (`src/lib/clinical/knowledge-base.ts`, root-cause, supplement-guardrails) | **MODULES DONE (iter 7)** | 4 pure deterministic modules + 17 tests (all 8 domains, evidence-gated hypotheses, hard-fail supplement guardrails). NON-AUTHORITATIVE floor — does not touch triage urgency. Route/UI wiring is follow-up. |

### Do-not-touch (clinical determinism)
- `src/lib/triage-engine.ts`, `src/lib/clinical-matrix.ts`, `src/lib/symptom-memory.ts`
- `src/app/api/ai/symptom-chat/route.ts`: trace-wiring only, never clinical decisions.

## Iteration log

### Iteration 1 — 2026-06-23 (setup + verification)
- **Changed:** created NTFS worktree `C:\pv-hardening` on branch `codex/investor-demo-hardening` off `origin/master`; started `npm install`; wrote this state doc.
- **Verified:** master tip = #710; Phase 1 already landed (won't redo); Phases 2/3/4/8 files genuinely absent; `src/` clean in main worktree (only unrelated `plans/*.json` + `tmp/*.json` dirty from concurrent agents).
- **Failed:** nothing yet (baseline typecheck/test pending install completion).
- **Next action:** establish typecheck + targeted-test baseline, then implement **Phase 2 memory-ranking** as first commit (pure module, no clinical-logic change, test-backed).
- **Stop/defer:** build deferred to NTFS/Vercel (G: exFAT). No stop conditions hit.

### Iteration 2 — 2026-06-23 (baseline + Phase 2 memory-ranking)
- **Changed:** added `src/lib/dog-brain/memory-ranking.ts` (pure ranking module); exported `BRAIN_SIGNAL_SYMPTOM_KEYS` from `question-priority.ts` (single source of truth); wired `rankDetectedSignals` into `dog-brain-context.ts` (reuses already-fetched follow-ups, supplement trials, vet-record text — no extra Supabase query); added `tests/dog-brain-memory-ranking.test.ts` (13 tests).
- **Verified:** baseline before change = typecheck clean + **102 suites / 2329 tests pass**. After change = typecheck clean, eslint clean on changed files, **103 suites / 2342 tests pass** (+13, zero regressions). Urgency-safety proven by tests: severity tier gap (500) > sum of all other terms (≤128), benign/info can never outrank alert, input never mutated, score is a number not an urgency.
- **Failed:** nothing.
- **Next action:** Phase 3 — `src/lib/dog-brain/analytics.ts` privacy-safe event layer (no free-text / raw symptom / photo) + tests.
- **Stop/defer:** build still deferred to NTFS/Vercel. No stop conditions hit.

### Iteration 3 — 2026-06-23 (Phase 3 analytics module)
- **Changed:** extended `src/lib/azure/telemetry.ts` allow-lists with 8 `dogbrain.*` `SafeEventName`s + 2 enum `SafePropertyKey`s (`questionSource`, `outcomeBucket`); added `src/lib/dog-brain/analytics.ts` (pure event builders + `toOutcomeBucket` coercion + `recordDogBrainEvent` over the existing App Insights sink); added `tests/dog-brain-analytics.test.ts` (21 tests).
- **Verified:** typecheck clean; eslint clean on changed files; **34 tests pass** (21 new analytics + 13 existing azure-telemetry, no regression). Privacy proven: builder params are enums/numbers only (free text structurally impossible); test asserts property keys ⊆ {questionSource, outcomeBucket}, measurements are non-negative ints, and the serialized envelope contains none of symptom/ownername/petname/notes/photo. Demo-mode = silent no-op.
- **Failed:** nothing.
- **Next action:** wire emitters at safe call-sites — `brain_context_loaded` in `dog-brain-context.ts`, follow-up/supplement lifecycle emits, and `question_trace`/`emergency_suppressed` in the symptom-chat route (trace-only, with route tests). Then Phase 5 migration-ledger verify (Supabase MCP available).
- **Stop/defer:** route trace wiring deliberately separated into its own route-test-gated commit. No stop conditions hit.

### Iteration 4 — 2026-06-23 (Phase 5 migration-ledger runbook — STOP hit, handled)
- **Changed:** added `docs/runbooks/supabase-migration-ledger-repair.md` (exact read-only verify SQL, Node `pg` one-off for this host, CLI `migration repair` path, evidence checklist).
- **Verified:** Supabase MCP `list_projects` returns ONLY `oripsqtuvyvhdhcnkgbz` ("JobsearchAi") — NOT PawVital `aammaxdsjhezmbvdkqee`. Confirmed target migration `supabase/migrations/20260622000000_dog_brain_supplement_trials.sql` is idempotent (IF NOT EXISTS table/columns/indexes, DROP/CREATE policy) with RLS + 3 indexes + owner-only policy in its DDL.
- **Failed / STOP:** live DB verification — **STOP CONDITION "Supabase project is wrong"**. Did NOT run anything against the wrong project. Followed Phase 5's prescribed fallback (write runbook). psql/CLI absent + stale env passwords (per memory) compound this; needs operator with current PawVital creds.
- **Next action:** Phase 4 — `.github/workflows/dog-brain-live-e2e.yml` (manual, env-gated) + e2e script skeleton; then Phase 3b route trace wiring with route tests; then Phase 8 clinical knowledge layer.
- **Stop/defer:** Phase 5 live verify deferred to operator (documented, not faked). No full-loop stop — other phases proceed.

### Iteration 5 — 2026-06-23 (Phase 4 live-E2E harness)
- **Changed:** added `.github/workflows/dog-brain-live-e2e.yml` (manual `workflow_dispatch`, protected-environment-gated, installs Playwright chromium, uploads artifacts); added `tests/e2e/dog-brain-live-e2e.ts` (env-gated; seeds 90-day storyline + pending follow-up + worse-outcome supplement trial via service-role; logs in through the real UI; polls `POST /api/ai/symptom-chat` until `brain_question_trace` surfaces; asserts the emergency turn suppresses the trace; deletes everything in `finally` and asserts 0 residual; writes screenshots/result to `artifacts/dog-brain-e2e/`); added `e2e:dog-brain` npm script.
- **Verified:** typecheck clean while authored under `scripts/` (tsc strict-mode-validated the whole flow), then relocated to `tests/e2e/` (repo convention: `/scripts/*` is gitignored; `tests/` is committable but tsconfig-excluded) — code unchanged after validation incl. real endpoint/body shape, real table columns, response key `brain_question_trace.evidence_summary`); eslint clean. Assertions hit the API contract directly (robust) rather than DOM scraping.
- **Failed:** NOT executed against a live deployment — no E2E secrets / sandbox project in this environment, and running it would create prod rows (cleanup-residual is a STOP condition). First run is an operator action via the workflow with the `dog-brain-e2e` environment secrets.
- **Next action:** Phase 3b route trace wiring (analytics emitters) with route tests; then Phase 8 curated clinical knowledge layer; then Phase 6 UX polish.
- **Stop/defer:** live E2E execution deferred to operator (honest skeleton, typecheck-validated). No full-loop stop.

### Iteration 6 — 2026-06-23 (Phase 3b lifecycle emitter wiring)
- **Changed:** wired privacy-safe analytics emitters (fire-and-forget `void recordDogBrainEvent(...)`) into the CRUD routes where lifecycle events naturally occur — `dog_brain_followup_created` (followups POST, 201 only), `dog_brain_followup_outcome_recorded` (followups/[id] PATCH), `supplement_trial_started` (supplements POST, 201), `supplement_trial_marked_active` + `supplement_trial_outcome_recorded` (supplements PATCH). Added `tests/dog-brain-analytics-wiring.test.ts` (6 tests, real builders + spied sink).
- **Verified:** typecheck clean; eslint clean on changed files; **105 suites / 2365 tests pass** (no regression). Tests prove each route emits the correct event on genuine success and stays SILENT on dedup. Emitters are no-op without App Insights and never throw; they carry only counts/enums (no prompt/notes/supplement-name).
- **Failed:** nothing.
- **Next action:** Phase 8 — curated deterministic `src/lib/clinical/{knowledge-base,clinical-patterns,root-cause-hypotheses,supplement-guardrails}.ts` (evidence-linked, ask-vet framing, NO dosage/brand/price/diagnosis) + tests. Then the higher-risk symptom-chat route trace/context emits with route tests. Then Phase 6 UX polish.
- **Stop/defer:** `brain_context_loaded` + route trace emits intentionally deferred (giant route, multiple emergency early-returns → needs careful flag threading + route tests). No stop conditions hit.

### Iteration 7 — 2026-06-23 (Phase 8 clinical knowledge layer)
- **Changed:** added 4 pure deterministic modules — `src/lib/clinical/knowledge-base.ts` (8 domains: gi/urinary/skin_ear/respiratory/mobility/senior/medication_supplement/toxin_exposure, each with trigger_signal_keys, owner_observable_questions, NON-AUTHORITATIVE urgency_floor, missing_information, vet_handoff_points, disallowed_outputs, source_refs); `clinical-patterns.ts` (cluster matcher with min-signal thresholds); `root-cause-hypotheses.ts` (non-diagnostic, evidence-gated — no evidence → no hypothesis); `supplement-guardrails.ts` (SupplementSuggestion contract + hard-fail validator for dosage/brand/price/disease-claim/no-evidence + evidence-gated builder). Added `tests/clinical-knowledge-layer.test.ts` (17 tests).
- **Verified:** typecheck clean; eslint clean; **106 suites / 2382 tests pass** (+17, no regression). Safety proven: a string-scan test asserts NO dosage/price/brand/disease-claim across all curated content; hypotheses never expose disease names and require dog-specific evidence; the builder's own output always passes the guardrails; the owner-facing floor is explicitly separate from triage urgency (`triage-engine`/`clinical-matrix` untouched).
- **Failed:** nothing.
- **Next action:** wire the knowledge layer + the deferred analytics trace/context emits into the symptom-chat route (with route tests, minding emergency early-returns); then Phase 6 UX polish; then /thermo-review + open the PR.
- **Stop/defer:** route/UI wiring of the knowledge layer is a follow-up (modules are tested infra, like the analytics module). No stop conditions hit.

### Iteration 8 — 2026-06-23 (Phase 3c symptom-chat route analytics wiring)
- **Changed:** wired the two clean single-site Dog Brain analytics emits into `src/app/api/ai/symptom-chat/route.ts` — `brain_context_loaded` (set a count flag where Dog Brain context loads) and `brain_question_trace.emitted` (set a flag where `brainQuestionTrace` is computed), both emitted once in the EXISTING deferred `runAfterSafely(after())` telemetry block. Added `trackEvent` to the route test's telemetry mock so the inline-run deferred block doesn't throw.
- **Verified:** typecheck clean; eslint 0 errors (6 pre-existing warnings, none new); symptom-chat route tests **11 suites / 624 pass**; full targeted **106 suites / 2382 pass** (no regression). TRACE/TELEMETRY ONLY — no clinical decision, no payload shape, no emergency early-return touched; flags only flow into the deferred block.
- **Failed:** nothing. `emergency_question_trace_suppressed` intentionally NOT wired — it would require touching 3+ emergency early-return sites (the "churns the giant file" risk the brief says to STOP on); the emergency path already returns no trace, so this is a missing telemetry event only, not a behavior gap.
- **Next action:** Phase 6 UX polish (Playwright screenshots from the NTFS dev server; document if demo-mode loading stall blocks it), then `/thermo-review`, push, PR, final handoff.
- **Stop/defer:** emergency-suppressed emit deferred (multi-site risk). No stop conditions hit.

### Iteration 9 — 2026-06-23 (thermo-review + PR + handoff — LOOP COMPLETE)
- **Changed:** ran `/thermo-review` (APPROVE, no blocking findings); pushed `codex/investor-demo-hardening`; opened **PR #713**.
- **Verified:** thermo-review approved; full targeted suite **2382 pass**; typecheck + eslint clean; PR created. CI = "no checks reported" (Actions quota dead since Jun 3 — documented, not a regression).
- **Failed / deferred (operator/env-gated, NOT faked):** live E2E execution (needs sandbox secrets); Supabase live migration verify (MCP on wrong project); `emergency_question_trace_suppressed` emit (multi-site route risk); Phase 6 UX polish (this branch has ZERO `.tsx` changes — nothing visual to screenshot; full audit is separate net-new work + blocked by demo-mode loading stall).
- **Next action:** operator runs the live-E2E workflow + the migration runbook with correct creds; admin-merge PR #713 (CI gate is dead).

---

## FINAL HANDOFF

- **Branch:** `codex/investor-demo-hardening` (off `origin/master` @ #710)
- **PR:** https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/713
- **Commits (7):** d9b6f55 ranking · 3c740ce analytics module · 9334f6a migration runbook · c34e7cc live-E2E harness · cb29011 lifecycle wiring · 1a87eb7 clinical knowledge layer · 06edcdb route trace emits
- **Landed:** memory-ranking + wiring; analytics module + 8-event wiring (CRUD + route); clinical knowledge layer (4 modules); manual live-E2E harness; migration runbook. 6 new modules, 5 test suites (+57 tests), 2 docs, 1 CI workflow.
- **Did NOT land (deferred, documented):** live-E2E execution; Supabase live-verify (wrong-project STOP); emergency-suppressed emit; knowledge-layer route/UI wiring; Phase 6 UX (no UI in diff).
- **Failing:** none. Targeted suite 2382 pass; typecheck + eslint clean.
- **Migration ledger:** UNVERIFIED live (runbook written; MCP wrong project — STOP honored).
- **Production / live-E2E:** harness ready, NOT executed (needs operator secrets).
- **Thermo-review verdict:** APPROVE (no blockers; 2 minor DRY follow-ups noted).
- **Build:** deferred to NTFS/Vercel (local `G:` exFAT).
- **SIA:** verifier=typecheck+eslint+2382 targeted tests+thermo-review | trajectory=9 iterations, 7 commits, state doc per-iteration | decision=harness (added analytics/knowledge/E2E harness + runbook + state doc) | Goodhart guard=clinical determinism untouched; ranking/knowledge floors provably never alter triage urgency.
- **AutoLab:** baseline=#710 typecheck-clean+2329 tests | benchmark=typecheck+eslint+targeted suite+thermo gate | iterations=9 (best = 2382 pass, +57, 0 regressions) | budget=self-paced loop | outcome=improved.
- **Final verdict:** **STAGE-READY for the code that landed** (ranking, analytics, clinical knowledge, harness — all green + thermo-approved). **NOT yet fully stage-PROVEN end-to-end** until an operator runs the live-E2E + migration-verify with correct credentials and admin-merges #713 (CI gate dead).
