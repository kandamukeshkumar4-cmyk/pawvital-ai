# Backup And Recovery Runbook

## Scope

- Supabase Postgres data and auth metadata
- Upstash Redis rate-limit state
- Vercel project env vars and deployment rollback state
- NVIDIA / sidecar credentials

## Ownership

- Primary owner: application operator
- Backup approver: repository admin

## Minimum Policy

- Supabase PITR/backups must be enabled in production
- GitHub Actions `Nightly Backup` must stay green and upload a fresh backup artifact every day
- Restore drills must be exercised at least quarterly
- Secrets must be recoverable from the password manager, not the repo
- Redis-backed rate limiting may be rebuilt, but its env/config must be documented

## Restore Targets

- RPO: 24 hours or better
- RTO: 4 hours or better

## Recovery Steps

1. Confirm the incident scope: data loss, bad deploy, secret compromise, or partial outage.
2. Freeze writes where possible: disable risky admin rollout paths and webhook mutations.
3. Pull the latest successful `Nightly Backup` artifact or trigger `workflow_dispatch` if you need a fresh snapshot before recovery.
4. Restore canonical Postgres data from Supabase backup/PITR or the latest `pg_dump` archive into a clean target.
5. Restore the `journal-photos` bucket export from `scripts/backup-storage.mjs` if media objects were lost.
6. Re-apply schema migrations, including hardening indexes and billing protections.
7. Rotate any compromised API keys or webhook secrets.
8. Reconcile Stripe subscription state via webhook replay or Stripe export if billing drift occurred.
9. Re-enable traffic only after smoke tests and `/api/health` pass.

## Automation

- Database dump script: `npm run backup:db`
- Storage export script: `npm run backup:storage`
- Nightly workflow: `.github/workflows/nightly-backup.yml`
- Required GitHub Actions secrets:
  - `DATABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Drill Evidence

- Record the date, operator, backup point used, restore duration, and validation outcome.
- Store drill notes outside the application repo if they contain secret or account details.
