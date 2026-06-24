# Review Packet — Dog Brain Investor-Demo Hardening

> For an independent reviewer (Codex). Self-contained summary of the work landed
> via PR #713 + #717. Companion to `INVESTOR_DEMO_HARDENING_STATE.md` (per-iteration log).

## 1. Summary
Hardens the already-live Dog Brain MVP (PRs #706–#710) into investor-demo-ready
shape. **Purely additive** — 6 new pure modules, 5 new test suites, route-level
wiring, 1 CI workflow, 2 docs. The deterministic clinical files
(`triage-engine.ts`, `clinical-matrix.ts`, `symptom-memory.ts`) are **not
touched**; `symptom-chat/route.ts` gains only **+27 lines of isolated, deferred
telemetry**.

## 2. Branches / PRs / merge status

| PR | Branch | Commits | Status | Merge commit |
|----|--------|---------|--------|--------------|
| #713 | `codex/investor-demo-hardening` | 8 | MERGED to `master` | `8eb7261` |
| #717 | `codex/migration-verify-evidence` | 1 | MERGED to `master` | `f856f9a` |

- Base branched from: `bba69b0` (master @ PR #710)
- Final `master` tip: `f856f9a` — GitHub + GitLab in sync
- Merge method: admin-bypass (GitHub Actions quota dead since Jun 3 — standard for this repo)

**Review commands:**
```
git fetch origin && git diff bba69b0..2b48ea4   # PR #713 (hardening)
git show a10d84e                                 # PR #717 (evidence)
```

## 3. Commits (PR #713, in order)
```
d9b6f55  feat(dog-brain): rank 60/90-day memory for symptom-checker tiebreak
3c740ce  feat(dog-brain): privacy-safe loop analytics module
9334f6a  docs(dog-brain): Supabase migration-ledger verify/repair runbook
c34e7cc  feat(dog-brain): manual live E2E harness for the memory loop
cb29011  feat(dog-brain): wire loop analytics into follow-up/supplement routes
1a87eb7  feat(clinical): curated deterministic clinical knowledge layer
06edcdb  feat(dog-brain): emit brain_context_loaded + question_trace from symptom-chat route
2b48ea4  docs(dog-brain): record thermo-review approval + PR #713 + final handoff
```
**PR #717:** `a10d84e  docs(dog-brain): record verified migration-ledger evidence (no repair needed)`

## 4. Files changed (23 files, +2612 / −5)

### New pure modules — `src/lib/`
| File | Lines | What it does |
|------|------|--------------|
| `src/lib/dog-brain/memory-ranking.ts` | +241 | Pure ranking of 60/90-day signals for the symptom-checker tiebreak (recency, repetition, worsening, follow-up/supplement links, vet-record relevance, symptom-map match). **Severity stays the dominant term** (tier gap 500 > max of all other terms ≤128) → ordering only breaks ties *within* a severity tier; **never alters deterministic urgency**. |
| `src/lib/dog-brain/analytics.ts` | +161 | Typed wrapper over the existing App Insights sink. 8 `dogbrain.*` events; builder params are enums/numbers only → free text structurally impossible. `toOutcomeBucket` + `safeCount`. |
| `src/lib/clinical/knowledge-base.ts` | +289 | 8 curated owner-observable domains → next question / missing info / vet-handoff / **non-authoritative** urgency floor + `disallowed_outputs`. |
| `src/lib/clinical/clinical-patterns.ts` | +125 | Non-diagnostic symptom-cluster matcher with `min_signals` thresholds. |
| `src/lib/clinical/root-cause-hypotheses.ts` | +112 | Non-diagnostic hypotheses, **produced only when dog-specific evidence exists**; explicit `safety_boundary`; no disease names. |
| `src/lib/clinical/supplement-guardrails.ts` | +193 | `SupplementSuggestion` contract + **hard-fail validator** (dosage/brand/price/disease-claim/no-evidence) + evidence-gated builder whose output always passes the validator. |

### Wiring (small, surgical)
| File | Lines | What changed |
|------|------|--------------|
| `src/lib/azure/telemetry.ts` | +17 | Extended `SafeEventName` (+8 `dogbrain.*`) and `SafePropertyKey` (+`questionSource`, `outcomeBucket`). |
| `src/lib/health-log/dog-brain-context.ts` | +21 | Calls `rankDetectedSignals` before the existing tiebreak consumers — reuses already-fetched follow-ups/trials/vet-records (no extra query). |
| `src/lib/dog-brain/question-priority.ts` | +2/−1 | Exported `BRAIN_SIGNAL_SYMPTOM_KEYS` (single source of truth for the ranker). |
| `src/app/api/dog-brain/followups/route.ts` | +7 | Emit `dog_brain_followup_created` on genuine 201 only. |
| `src/app/api/dog-brain/followups/[id]/route.ts` | +11 | Emit `dog_brain_followup_outcome_recorded` (bucketed) on success. |
| `src/app/api/dog-brain/supplements/route.ts` | +16 | Emit `supplement_trial_started` / `_marked_active` / `_outcome_recorded` on success. |
| `src/app/api/ai/symptom-chat/route.ts` | **+27** | Two outer-scope flags + emit `brain_context_loaded` / `brain_question_trace.emitted` in the **existing** deferred `runAfterSafely(after())` block. **No clinical decision, payload, or emergency early-return touched.** |

### Tests (+969 lines across 5 suites)
| File | Lines | Coverage |
|------|------|----------|
| `tests/dog-brain-memory-ranking.test.ts` | +159 | Ranking + **urgency-safety contract** (benign can't outrank alert; severity gap; no input mutation). |
| `tests/dog-brain-analytics.test.ts` | +202 | Enums/counts; defensive normalization; serialized-envelope privacy (no symptom/owner/pet/notes/photo). |
| `tests/dog-brain-analytics-wiring.test.ts` | +171 | Each CRUD route emits on success, silent on dedup (real builders, spied sink). |
| `tests/clinical-knowledge-layer.test.ts` | +233 | All 8 domains; evidence-gated hypotheses; **string-scan proving no dosage/brand/price/disease-claim** anywhere; builder output always validates. |
| `tests/symptom-chat.route.test.ts` | +4 | Added `trackEvent` to the telemetry mock so the inline-run deferred block doesn't throw. |

### CI / docs / config
| File | Lines | What |
|------|------|------|
| `.github/workflows/dog-brain-live-e2e.yml` | +76 | **Manual** `workflow_dispatch`, env-gated, protected-environment, uploads artifacts. Never runs on push/PR. |
| `tests/e2e/dog-brain-live-e2e.ts` | +297 | Env-gated harness: seed 90-day story → poll for memory question → assert emergency suppresses trace → cleanup → assert 0 residual. Typecheck-validated; **not yet run live**. |
| `docs/dog-brain/INVESTOR_DEMO_HARDENING_STATE.md` | +110 | Per-iteration state log + final handoff. |
| `docs/runbooks/supabase-migration-ledger-repair.md` | +142 (#713) / +29 (#717) | Verify/repair runbook; Evidence section filled with verified results in #717. |
| `package.json` | +1 | `e2e:dog-brain` script. |

## 5. Verification (all green)
- `npm run typecheck` → clean
- `npx eslint` on changed files → 0 errors (6 pre-existing warnings in `route.ts`, none new)
- Targeted suite `clinical|dog-brain|symptom|health-log|followups|vet-record|supplement` → **106 suites / 2382 tests pass**
- `symptom-chat` route suite → **11 suites / 624 pass** (no regression from the route edit)
- `npm run build` → deferred to NTFS/Vercel (local `G:` is exFAT); Vercel remote build succeeded on deploy
- **Thermo-review verdict: APPROVE** (no blocking findings; 2 minor DRY follow-ups noted: shared ISO-date parse helper, shared `NEVER_OUTPUT` constant)

## 6. Production & data state (live evidence)
- **Deployed to prod:** `dpl_3TkvcwAq3CtPUcVTjibTDrCMBNfv` (READY), aliased `pawvital-ai.vercel.app`. Smoke: homepage `200`; `/api/dog-brain/{signals,supplements}` `401` (real mode, auth-enforced).
- **Migration verified** against `aammaxdsjhezmbvdkqee` via direct `pg`: table + 13 columns; indexes `pkey` + `uniq_supplement_trial_open` + `idx_user_pet` + `idx_due`; RLS `relrowsecurity=true`; policy `dog_brain_supplement_trials_owner_all` (ALL, USING + WITH CHECK); CHECK constraints (status + outcome); `schema_migrations` contains `20260622000000` **and** `20260622000100` → **ledger correct, no repair**.
- **Vercel `DATABASE_URL` refreshed** (stale password fixed; new value authenticates). Note: only read by the inactive `azure-postgres-provider.ts` + the host-comparing `supabase-env-guard.ts`; the app uses the Supabase JS client.

## 7. Reviewer focus / safety guarantees to verify
1. **Clinical determinism untouched** — confirm `triage-engine.ts` / `clinical-matrix.ts` / `symptom-memory.ts` are not in the diff.
2. **Ranking can't change urgency** — `memory-ranking.ts` only reorders the *tiebreak* list consumed after complaint/red-flag/pending; severity is dominant. See the urgency-safety cases in `tests/dog-brain-memory-ranking.test.ts`.
3. **Route edit is telemetry-only** — review the +27 lines in `symptom-chat/route.ts`: two flags + emits inside the pre-existing deferred block; no payload/branch change.
4. **No PII in analytics** — `analytics.ts` + the envelope-privacy test.
5. **No dosage/brand/price/diagnosis** in the clinical layer — the string-scan test in `clinical-knowledge-layer.test.ts`.
6. **`urgency_floor` is non-authoritative** — distinct type from triage's `low|moderate|high|emergency`; confirm it is never wired into triage.

## 8. Deferred (operator/env-gated — not done, not faked)
- **Live-E2E execution** — harness ready; needs `dog-brain-e2e` GitHub environment secrets pointing at a sandbox project.
- **`emergency_question_trace_suppressed` emit** — intentionally not wired (would touch 3+ emergency early-returns; emergency path already emits no trace → only a missing telemetry event, not a behavior gap).
- **Knowledge-layer route/UI wiring** — modules are tested infra, staged for a follow-up PR (not yet consumed at runtime).
- **Phase 6 UX polish** — this branch has zero `.tsx` changes (nothing visual to screenshot).
