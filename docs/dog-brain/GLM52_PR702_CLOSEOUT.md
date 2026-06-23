# GLM 5.2 — PR #702 Closeout Loop Memory

> Single state file for the Dog Brain backend-owned closed loop closeout.

## Current state (latest)

- branch: `codex/dog-brain-backend-owned-loop`
- worktree: `G:\MY Website\pawvital-ai-glm-dogbrain-loop`
- HEAD (before this session): `362b38a`
- PR: https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/702
- PR state: OPEN, not draft, `mergeable=MERGEABLE`, `mergeStateStatus=BLOCKED`, `reviewDecision=""`, `statusCheckRollup=[]`, 0 review threads.

Clear separation of where things stand:

| Area | State |
|---|---|
| Backend code (supplement trials + brain loop) | **Landed** on branch, locally verified |
| DB migration `20260622_dog_brain_supplement_trials.sql` | **APPLIED + verified** on active project `aammaxdsjhezmbvdkqee` (2026-06-23, user-approved) — see Supabase state |
| Supplements UI wiring | **Wired** — `SupplementTrialsPanel` (real GET/POST/PATCH, persisted, no dosing) on the Supplements page — see "UI status" |
| Client render side effects | **None** — `FollowupsPanel` does GET + PATCH only |
| Build | **Fails on G: — PROVEN environment-only** (G: is exFAT, which cannot create the junctions Turbopack needs); needs an NTFS/Linux/CI build — see "Build status" |
| PR gate | **Blocked** — required "Threshold Review Gate" check cannot run (Actions quota dead since 2026-06-03) |

## This session — supplement trial hardening

Goal: make the supplement trial loop durable and honest (idempotency, lifecycle, terminal outcome) on top of `362b38a`. No clinical files touched; no UI redesign; no migration applied.

What changed:

1. **Idempotent POST `/api/dog-brain/supplements`.** Added an owner-scoped pre-query for an existing OPEN trial on `(user_id, pet_id, supplement_name, reason_signal_key)` with `status IN ('ask_vet','active')`. If found, returns the existing row with `{ deduped: true }` and never inserts. A `23505` from the race re-fetches the existing open trial and returns `{ deduped: true }` instead of a 500. NULL `reason_signal_key` uses `.is(...)` so NULL reasons dedupe too. Migration adds the backstop partial unique index `uniq_supplement_trial_open`.
2. **Lifecycle semantics.** An `ask_vet` trial no longer sets `started_at` (the trial hasn't started; the owner is meant to clear it with their vet first).
3. **Terminal outcome.** PATCH now sets `status = 'outcome_recorded'` (was `follow_up_due`) and stamps `outcome_at`, so an answered follow-up no longer keeps looking due. Migration adds `outcome_recorded` to the status CHECK and an `outcome_at` column (with idempotent `ADD COLUMN IF NOT EXISTS` / constraint swap for older table revisions).
4. **PATCH id validation.** A non-UUID `?id=` now returns 400 instead of producing a Postgres-level 500.

Files changed this session:

- `src/app/api/dog-brain/supplements/route.ts` — idempotent POST, lifecycle fix, terminal PATCH, UUID guard.
- `supabase/migrations/20260622_dog_brain_supplement_trials.sql` — `outcome_recorded` status, `outcome_at` column, partial unique index, idempotent re-apply guards.
- `tests/dog-brain-supplement.test.ts` — new tests: duplicate POST dedupe (no double insert), 23505 → dedupe, missing-table → honest 503, `ask_vet` does not set `started_at`, PATCH terminal status + `outcome_at`, non-UUID id → 400; migration assertions for the new columns/index.

## Prior session commits (on top of a07b77d)

1. `6f13038` fix(dog-brain): report followup persistence failures honestly (PROOF #11)
2. `9ef745a` docs(dog-brain): add GLM 5.2 PR #702 closeout loop memory
3. `bc7a68e` fix(dog-brain): match supplement trials FK to project profiles pattern
4. `50e1fb2` / `362b38a` docs(dog-brain): closeout state updates

## UI status — Supplements tab WIRED to the trial API (concrete + persisted)

- New `src/components/dog-brain/supplement-trials-panel.tsx`, rendered in the main column of `src/app/(dashboard)/supplements/page.tsx`.
- Real DB-backed (not a demo): GET `/api/dog-brain/supplements?pet_id=` lists the owner's persisted trials; POST starts an ask-vet trial (idempotent server-side); PATCH `?id=` records a terminal outcome. The panel re-reads the live list after each mutation, so what's shown is the real DB state and survives reload.
- Seeded one-tap from the AI "ask vet" suggestions (`classified.ask_vet` names) so the AI layer connects to the concrete trial layer, but the trials persist independently of the regenerated AI plan.
- Safety: the trial surface carries **no** dosage / frequency / brand / price — only supplement name, status, reason, outcome; framed "ask your vet". A test asserts no `dose|dosage|mg|ml|$|price` renders.
- The pixel-perfect `SupplementCard` is untouched; new logic is isolated in its own client component.
- Coverage: 6 jsdom tests (load, start→POST, outcome→PATCH, suggestion chip, safety invariant, no-pet empty render). `/supplements` compiles + serves 200 with no console errors; full authed exercise needs login + active pet (covered by the jsdom contract tests against the now-live API).

## Supabase state — APPLIED + VERIFIED (2026-06-23, user-approved)

- Active project ref: `aammaxdsjhezmbvdkqee` (confirmed from `G:\MY Website\pawvital-ai\.env.local` `NEXT_PUBLIC_SUPABASE_URL` host `db.aammaxdsjhezmbvdkqee.supabase.co`).
- The connected Supabase MCP only exposes an unrelated `JobsearchAi` project, and neither `psql` nor the `supabase` CLI is installed; the migration was applied via a one-off Node `pg` client (driver bundled in `pawvital-ai`) using the worktree `DATABASE_URL` (direct `:5432`), inside a single transaction. The script printed no secrets and was deleted after use.
- Pre-check: `profiles` + `pets` present; `dog_brain_supplement_trials` was **absent** (never applied) → confirmed the prior blocker was real.
- Post-apply verification against the live DB:
  - columns: `id, user_id, pet_id, supplement_name, reason_signal_key, status, started_at, follow_up_due_at, outcome, outcome_at, notes, created_at, updated_at`
  - `relrowsecurity = true` (RLS on)
  - policy: `dog_brain_supplement_trials_owner_all`
  - indexes: `dog_brain_supplement_trials_pkey`, `idx_dog_brain_supplement_trials_due`, `idx_dog_brain_supplement_trials_user_pet`, `uniq_supplement_trial_open`
  - status CHECK includes `outcome_recorded`; outcome CHECK = better/same/worse/side_effect
  - grants to `authenticated`: SELECT, INSERT, UPDATE, DELETE (+ default REFERENCES/TRIGGER/TRUNCATE)
- The supplement trial API path is now backed by a real, RLS-protected, indexed table.

## PR gate state — corrected root cause

- Ruleset **"Protectmaster"** requires the status check **"Threshold Review Gate"** on PRs to `master`.
- **Correction of a previous false claim:** the workflow `threshold-review-gate.yml` does **not** only trigger on review. Its actual triggers are: `pull_request` to `master` (opened/reopened/synchronize/ready_for_review), `pull_request_review`, `push` to `codex/**`, and `workflow_dispatch`.
- GitHub Actions **is enabled** on the repo (`actions/permissions` → `enabled:true, allowed_actions:all`).
- **Real reason no checks are reported:** the gate workflow's run history ends **2026-06-03**; every historical run was `pull_request_review`-triggered. No workflow runs have fired since — consistent with the known "CI dead since Jun 3 (Actions quota)" state. So `gh run list --branch codex/dog-brain-backend-owned-loop` is empty and `statusCheckRollup=[]` because **no Actions run at all**, not because of the trigger config.
- Consequence: `mergeStateStatus=BLOCKED` and the required check can't auto-satisfy until either Actions quota is restored (then re-push or `workflow_dispatch` to fire the gate) or a maintainer admin-merges (the documented path for recent Dog Brain PRs).
- This is an external ops/billing gate, not a code defect. Not merging, per instructions.

## Verification (latest run)

- `npm run typecheck` → pass (exit 0).
- `npx eslint .` → 0 errors, 51 pre-existing warnings.
- Focused (`run-brain-loop|dog-brain-summary-mapper|dog-brain-supplement|dog-brain-followups-panel|health-log.route`) → 6 suites / 42 tests pass.
- Broader (`dog-brain|health-log|followups|vet-record`) → 22 suites / 174 tests pass.
- Clinical/symptom slice → only the known pre-existing `symptom-checker.tester-onboarding.test.ts:139` fail; no clinical/symptom files touched by this PR.

## Build status — fails on G:, PROVEN environment-only (not code)

- `npm run build` → exit 1 with `TurbopackInternalError: failed to create junction point at "…\.next\node_modules\@react-pdf\renderer-…" … creation of a new symbolic link or junction point failed: Incorrect function. (os error 1)`.
- **Proof it is the filesystem, not the code:**
  - `Get-Volume -DriveLetter G` → `FileSystemType: exFAT` (the worktree lives on an exFAT volume).
  - `mklink /J <G: path>` → `Local NTFS volumes are required to complete the operation.` — exFAT cannot host junctions/symlinks at all, independent of any build.
  - Turbopack creates a junction for the `@react-pdf/renderer` dependency under `.next/node_modules` during setup, **before** compiling any route, so the build dies on the first junction regardless of source.
  - This PR touches none of `@react-pdf/renderer`, `.next/`, `next.config.ts`, build tooling, or package files.
- **Resolution:** build on an NTFS local volume or in Linux/CI. Not a code blocker; the typecheck + full test slices are the code-correctness proof available on this filesystem.

## Safety check (unchanged + extended)

- No clinical files touched (`git diff origin/master..HEAD` empty for `triage-engine.ts`, `clinical-matrix.ts`, `symptom-chat/route.ts`, `symptom-memory.ts`).
- Supplement route stores `supplement_name`, `reason_signal_key`, `status`, `outcome` (better/same/worse/side_effect), `outcome_at`, `notes`. **No** dosage/frequency/brand/price fields. Tests assert no `dose|dosage|mg|ml` in persisted rows.
- No client-created follow-ups — `followups-panel.tsx` does GET + PATCH only.

## Post-merge reconciliation (Opus follow-up, PR #706)

### Merge conflict — found and fixed
- PR #706 was opened from a branch forked off `eaa9c70`, which is the commit **before** the PR #702 merge (`7158820`) landed on `master`. GitHub reported the PR as `CONFLICTING` / `DIRTY`.
- Root cause: `master` (post-#702) and the closeout branch both rewrote `src/app/(dashboard)/supplements/page.tsx`. `master` was left **half-migrated** — #702 added `SupplementTrialsPanel` (no dosing) but kept the *old* dosing-based "tracked supplements" display (a loader mapping `dosage`/`frequency`/`brand`). The closeout completes that migration by removing the unsafe display.
- Resolution: rebased the single closeout commit onto `origin/master` (`7158820`). Only `page.tsx` conflicted; resolved by taking the closeout's complete vet-safe version (verified that every `master`-unique line in `page.tsx` was the old dosing/tracked UI — `MoreVertical`, `nutrition_grade`, `monthly_cost`, `formatAddedDate`, the dosing card — i.e. nothing worth preserving). Orphaned `tracked` loader removed as a consequence.
- Re-verified after rebase: `typecheck` clean, `eslint` on changed files 0 issues, **34 supplement tests pass** (`dog-brain-supplement|supplement-trials-panel|health-log.route`). No owner-facing `dosage/frequency/brand/price` in `page.tsx` or the AI route (only the negative prompt instructions + the marker comment remain).
- Force-pushed (`--force-with-lease`) `5c7da92` → `1912541`. **PR #706 is now `mergeable: MERGEABLE`** (`mergeStateStatus: BLOCKED` remains — the Threshold Review Gate, an external ops gate, not a conflict).

### Migration history — verified read-only (definitive)
Audited directly against the live PawVital project `aammaxdsjhezmbvdkqee` (read-only `pg` query using the main worktree's `DATABASE_URL`, since the connected Supabase MCP is bound to a different org — `JobsearchAi` — which is why the earlier MCP attempt returned permission denied):
- `dog_brain_supplement_trials` table **exists**, with all expected columns (`reason_signal_key`, `status`, `started_at`, `follow_up_due_at`, `outcome`, `outcome_at`, `notes`, …).
- Indexes **exist**: `dog_brain_supplement_trials_pkey`, `uniq_supplement_trial_open`, `idx_dog_brain_supplement_trials_user_pet`, `idx_dog_brain_supplement_trials_due`.
- RLS **enabled**, policy `dog_brain_supplement_trials_owner_all`.
- `supabase_migrations.schema_migrations` has **NO `20260622` entry** (latest recorded is `20260616181159`). The table was applied **out-of-band** (raw `pg` one-off), so the migration ledger does not track it.
- **OPS BLOCKER (honest state):** schema is correct and live, but migration history is dirty. Per the ticket's own rule, the ledger was **not** hand-edited. Safe remediation when the Supabase CLI is linked to the project: `supabase migration repair --status applied <version>` (note: the migration file is named `20260622_…`, an 8-digit prefix that does not match the CLI's 14-digit `YYYYMMDDHHMMSS` convention used by existing ledger rows — it must be renamed to a 14-digit version before `repair`/`db push` will accept it). Do **not** raw-insert into `schema_migrations`.

### Build root — confirmed environmental (no code fix)
- `outputFileTracingRoot` does not apply (standalone repo, not a monorepo). The failure is Turbopack creating an NTFS junction for `@react-pdf/renderer` under `.next/node_modules`, which exFAT (drive `G:`) cannot host at all (`mklink /J` → "Local NTFS volumes are required"). Documented inline in `next.config.ts`. Build path: NTFS / WSL / Vercel remote. `typecheck` (clean) is the code-correctness proof available on this filesystem.
