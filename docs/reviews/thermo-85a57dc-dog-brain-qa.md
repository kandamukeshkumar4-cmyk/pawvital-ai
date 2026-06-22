# Thermo-Nuclear Review — Dog Brain backend + QA fixes

**Scope:** `git diff origin/master...HEAD` for the Dog Brain / QA work landing at
master `85a57dc` (followups API, async-offload gate, supplements model, vet-record
persistence, 90-day context window, dashboard follow-ups panel + pet-switcher
dropdown, symptom-checker remembers cards). ~593 insertions / 9 files.
Supersedes the stale `thermo-c4a2ff0-sweep-deploy.md` (which was scoped to an
older sweep deploy).

**Verdict: ✅ APPROVE — with one structural cleanup recommended (non-blocking).**

The diff is additive, well-commented, and the fixes are sound (each closes a real
bug found by tests or live QA). No clinical-safety violations:
`async-turn-offload.ts` changes the *transport* (sync vs async) only — it never
touches deterministic triage/urgency in triage-engine/clinical-matrix. No file
crosses 1k lines from this PR (`health-brief.tsx` at 843 was already large).

## 1. Structural — top finding (recommended, not blocking)

**Duplicated route-guard boilerplate.** `isMissingTable(error)` is copy-pasted
**verbatim in 7 API route files** (pets x2, health-log, dog-brain/signals,
dog-brain/followups x2, reminders), and the
`rate-limit → zod uuid → requireAuthenticatedApiUser → pets ownership 404 →
TABLE_MISSING` sequence is duplicated across signals/followups/reminders/health-log.

This is the clear code-judo move: extract
- `isMissingTable` → one shared util (`src/lib/api/table-missing.ts`), and
- a `requireOwnedPet({ request, petId })` helper that runs rate-limit + uuid
  validation + auth + ownership and returns `{ supabase, user, petId } | Response`.

Each route would shrink to its actual query + response. ~30 duplicated lines per
route deleted, and the contract (400/401/404/TABLE_MISSING) becomes enforced in
one place instead of re-implemented (and at risk of drifting) per route. Deferred
here only because it spans routes outside this PR's scope — worth its own ticket.

## 2. Lower-severity notes

- **`health-brief.tsx` `FollowupsPanel`** uses `// eslint-disable-next-line
  react-hooks/exhaustive-deps` with a `signalKey` memo to avoid re-running the
  effect on every render. Acceptable (the `signalKey` string is the real
  dependency), but the disable is a small smell; a `useEffectEvent`-style split
  would remove it if the codebase adopts that pattern.
- **followups POST dedup** is a pre-query + insert with 23505 race handling — the
  correct shape given PostgREST can't upsert a partial unique index. Good; the
  comment explains why upsert wasn't used.

## Approval-bar check

No structural regression · the one missed simplification (shared route guard) is
cross-PR and ticketed, not introduced here · no file-size explosion · no
spaghetti branching · no magic/casts (the one `SupabaseClient` type replaced an
`any`) · clinical determinism intact. **Passes.**

**Thermo-review verdict: APPROVE.** Net-positive, additive, sound fixes;
recommend a follow-up ticket to extract the shared `isMissingTable` +
`requireOwnedPet` route guard.
