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
| 3 | Privacy-safe analytics (`src/lib/dog-brain/analytics.ts`) | **MODULE DONE (iter 3)** | 8 events + builders + tests over existing App Insights sink; call-site wiring is next. |
| 4 | Live E2E workflow (`.github/workflows/dog-brain-live-e2e.yml`) | **NOT BUILT** | File absent. |
| 5 | Supabase migration-ledger verify (`dog_brain_supplement_trials`) | **UNVERIFIED** | Needs live check / runbook. |
| 6 | UX polish across tabs | **NOT STARTED** | — |
| 8 | Clinical knowledge layer (`src/lib/clinical/knowledge-base.ts`, root-cause, supplement-guardrails) | **NOT BUILT** | Files absent. |

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
