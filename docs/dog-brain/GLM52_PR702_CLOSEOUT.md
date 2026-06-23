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
| Supplements UI wiring | **API-only / not wired** — see "UI status" |
| Client render side effects | **None** — `FollowupsPanel` does GET + PATCH only |
| Build | **Unproven** — fails on G: for environment reasons (junction/readlink); needs a clean Linux/CI build |
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

## UI status — Supplements tab is API-only (not wired this session)

- `src/app/(dashboard)/supplements/page.tsx` (798 LOC, pixel-perfect to the PPTX mock) does **not** call `/api/dog-brain/supplements`. Confirmed: `grep -rn "dog-brain/supplements" src/` returns nothing.
- The page renders AI supplement plans that include dosage / frequency / brand / price. Wiring a Dog Brain "ask-vet trial start" off those cards would mix AI treatment data into the Dog Brain-owned flow, which the safety rule forbids — a correct wiring needs a separately-framed surface.
- Decision for this closeout: leave the Supplements UI **API-only** and record it honestly here rather than force a browser-observable redesign into a backend-durability closeout (prior restyles of this page were rejected). The supplement trial API is fully usable by a future, cleanly-separated UI surface.

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

## Verification (this session)

Recorded in the handoff for this loop. Focused supplement suite green; full results in the loop report.

## Safety check (unchanged + extended)

- No clinical files touched (`git diff origin/master..HEAD` empty for `triage-engine.ts`, `clinical-matrix.ts`, `symptom-chat/route.ts`, `symptom-memory.ts`).
- Supplement route stores `supplement_name`, `reason_signal_key`, `status`, `outcome` (better/same/worse/side_effect), `outcome_at`, `notes`. **No** dosage/frequency/brand/price fields. Tests assert no `dose|dosage|mg|ml` in persisted rows.
- No client-created follow-ups — `followups-panel.tsx` does GET + PATCH only.
