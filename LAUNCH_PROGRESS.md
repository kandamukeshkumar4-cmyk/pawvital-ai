# Launch Progress

## Done

- Created clean NTFS worktree `C:\pv-launch-backend` from `origin/master` at `9f9b324`.
- Confirmed fresh repo root had no existing `LAUNCH_PROGRESS.md`; initialized this ledger instead of pretending it existed.
- Added launch preflight and idempotent migration-runner implementation slice.
- Restored ignored local `.vercel/project.json` in the NTFS worktree for project `prj_VhKiLsdF7643yOSfAv9SxEmKDXfC` / team `team_Nwx0L2mSFhWa2CMylrlD017C`.
- Focused launch-preflight Jest test passed: 8 tests.
- `npm ci`, `npm audit`, `npm run build`, and full `npx jest` passed in the NTFS worktree.
- Bumblebee v0.1.1 final project scan found 0 findings.

## In progress

- Full verifier is not complete. Code-fixable launch tooling is implemented; production env/migration/deploy steps are blocked on human-only credentials and portal state.

## Blocked (human-only)

- Production Vercel Supabase env must point REST/Auth and `DATABASE_URL` at project `aammaxdsjhezmbvdkqee`.
- `NVIDIA_API_KEY` must be present in production Vercel env.
- Supabase DB credentials are required before applying launch migrations; do not commit secrets.
- Production deploy can only run from a clean checkout at `origin/master`; this feature branch is not deployable by guard design.

## Next

- Run broader verifier gates after dependency/runtime setup is available in the NTFS worktree.
- After env blockers are fixed, run `npm run launch-preflight`, `npm run launch:migrations -- --dry-run`, apply migrations only against Supabase project `aammaxdsjhezmbvdkqee`, and run production smoke from clean `origin/master`.

## Verifier results (last run)

- `npx jest --runInBand --runTestsByPath tests/launch-preflight.test.ts` from the fresh worktree could not run because `npx` attempted to install Jest and npm rejected with `ECOMPROMISED Lock compromised`.
- Focused Jest -> `npx jest --runInBand --runTestsByPath tests/launch-preflight.test.ts` -> 1 suite, 8 tests passed.
- `npm ci` -> installed 1077 packages; found 0 vulnerabilities.
- `npm audit` -> found 0 vulnerabilities.
- `npm run build` -> passed. Remaining output was existing Next/Turbopack warning about broad NFT tracing from `next.config.ts` import trace and existing `metadataBase` warnings.
- `npx jest --runInBand` -> 294 suites passed, 1 skipped; 4008 tests passed, 4 skipped.
- `npm run launch-preflight` -> blocked only on human-only production env after local Vercel project link was restored: missing Supabase URL, `DATABASE_URL`, anon key, service-role key, and `NVIDIA_API_KEY`.
- `npm run launch:migrations -- --dry-run` -> blocked cleanly on missing `DATABASE_URL` with the exact human action.
- Wrong-project `DATABASE_URL` migration smoke -> blocked before DB connection with the approved-project error.
- Positive preflight with production-shaped non-secret env -> `launch-preflight: OK`.
- Bumblebee final scan -> exit 0, 0 findings; records `C:\Users\Windows 11\.codex\tmp\bumblebee\pv-launch-backend-final-20260624-110700\records.ndjson`.
