# Launch Progress

## Done

- Created clean NTFS worktree `C:\pv-launch-backend` from `origin/master` at `9f9b324`, then rebased onto `origin/master` at `150993e`.
- Confirmed fresh repo root had no existing `LAUNCH_PROGRESS.md`; initialized this ledger instead of pretending it existed.
- Added launch preflight and idempotent migration-runner implementation slice.
- Added demo-mode gate audit and launch-critical API regression coverage for symptom-chat and dog-brain signals.
- Restored ignored local `.vercel/project.json` in the NTFS worktree for project `prj_VhKiLsdF7643yOSfAv9SxEmKDXfC` / team `team_Nwx0L2mSFhWa2CMylrlD017C`.
- Focused launch-preflight and dog-brain route Jest tests passed: 16 tests.
- Full symptom-chat route harness passed: 414 tests.
- `npm ci`, `npm audit`, `npm run build`, and full `npx jest` passed in the NTFS worktree.
- Bumblebee v0.1.1 final project scan found 0 findings.
- Pushed branch `codex/launch-backend-stabilization` to GitHub and opened draft PR 728: https://github.com/kandamukeshkumar4-cmyk/pawvital-ai/pull/728.
- Confirmed PR 728 has no review comments, no reviews, no review threads, and no GitHub checks reported.
- Independent TecjLead review blocked the PR on unledgered production schema adoption risk.
- Added migration database-state adoption checks: fully-applied unledgered migrations are recorded in `public.pawvital_schema_migrations` without re-running SQL, partial live schema states block, and absent migrations remain applyable.

## In progress

- Full verifier is not complete. Code-fixable launch tooling is implemented and published in draft PR 728; a reviewer-blocked migration adoption gap was fixed locally and needs re-review. Production env/migration/deploy steps remain blocked on human-only credentials and portal state.

## Blocked (human-only)

- Production Vercel Supabase env must point REST/Auth and `DATABASE_URL` at project `aammaxdsjhezmbvdkqee`.
- `NVIDIA_API_KEY` must be present in production Vercel env.
- Supabase DB credentials are required before applying launch migrations; do not commit secrets.
- PR 728 is still draft and `mergeStateStatus` is `BLOCKED`; do not merge until the required review/merge gate is satisfied.
- Production deploy can only run from a clean checkout at `origin/master`; this feature branch is not deployable by guard design.

## Next

- Re-run focused/full verifier after the migration adoption fix, push the fix to PR 728, and request reviewer re-check.
- If re-review is clean, convert the PR out of draft only when merge gates allow it.
- After env blockers are fixed, run `npm run launch-preflight`, `npm run launch:migrations -- --dry-run`, apply migrations only against Supabase project `aammaxdsjhezmbvdkqee`, merge/mirror from `master`, deploy from clean `origin/master`, and run production smoke.

## Verifier results (last run)

- Initial `npx jest --runInBand --runTestsByPath tests/launch-preflight.test.ts` from the fresh worktree could not run because `npx` attempted to install Jest and npm rejected with `ECOMPROMISED Lock compromised`.
- Focused launch/dog-brain Jest -> `npx jest --runInBand --runTestsByPath tests/launch-preflight.test.ts tests/dog-brain-signals-route.test.ts` -> 2 suites, 16 tests passed.
- Focused symptom-chat route Jest -> `npx jest --runInBand --runTestsByPath tests/symptom-chat.route.test.ts` -> 1 suite, 414 tests passed.
- `npm ci` -> installed 1077 packages; found 0 vulnerabilities.
- `npm audit` -> found 0 vulnerabilities.
- `npm run build` -> passed. Remaining output was existing Next/Turbopack warning about broad NFT tracing from `next.config.ts` import trace and existing `metadataBase` warnings.
- `npx jest --runInBand` after rebase -> 298 suites passed, 1 skipped; 4029 tests passed, 4 skipped.
- `npm run launch-preflight` on 2026-06-24 after PR creation -> blocked only on human-only production env after local Vercel project link was restored: missing Supabase URL, `DATABASE_URL`, anon key, service-role key, and `NVIDIA_API_KEY`; demo/API/migration checks passed.
- `npm run launch:migrations -- --dry-run` -> blocked cleanly on missing `DATABASE_URL` with the exact human action.
- Wrong-project `DATABASE_URL` migration smoke -> blocked before DB connection with the approved-project error.
- Positive preflight with production-shaped non-secret env -> `launch-preflight: OK`.
- Launch preflight now includes `[PASS] demo-mode.gates` and `[PASS] api-regression.launch-critical`.
- Bumblebee final scan after rebase -> exit 0, 0 findings; records `C:\Users\Windows 11\.codex\tmp\bumblebee\pv-launch-backend-rebased-20260624-112408\records.ndjson`.
- PR 728 current GitHub state -> draft, open, `mergeable=MERGEABLE`, `mergeStateStatus=BLOCKED`, no status checks, no comments/reviews/review threads.
- Reviewer blocker on unledgered production schema adoption -> fixed by `adopted_database_state` and `database_state_conflict` planning statuses in the migration runner.
- Focused adoption verification -> `node --check` for launch migration scripts passed; `npx jest --runInBand --runTestsByPath tests/launch-preflight.test.ts tests/dog-brain-signals-route.test.ts` -> 2 suites, 18 tests passed.
- Missing `DATABASE_URL` and wrong-project `DATABASE_URL` migration dry-runs both exit nonzero before DB work.
- Full verifier after adoption fix -> `npx jest --runInBand` -> 298 suites passed, 1 skipped; 4031 tests passed, 4 skipped.
- `npm run build` after adoption fix -> passed with existing Turbopack NFT and `metadataBase` warnings.
- `npm audit` after adoption fix -> found 0 vulnerabilities.
