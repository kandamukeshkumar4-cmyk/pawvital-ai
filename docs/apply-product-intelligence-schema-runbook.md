# Apply Runbook — VET-1564 Product-Intelligence Schema

Applies `supabase-product-intelligence-schema.sql` (the `daily_readiness_snapshots` and
`recovery_checkpoints` tables behind the Whoop-style product-intelligence surface).

> **Owner-gated.** This is a production database change. It must be run by the owner/operator,
> not by an agent. The schema is review-only until applied through this runbook.

## Preconditions (do not skip)

1. **Same-project env (guards GitHub issue #582).** `DATABASE_URL` must reference the **same**
   Supabase project as `NEXT_PUBLIC_SUPABASE_URL`. Applying this schema against a `DATABASE_URL`
   that points at a different project than REST/Auth will create the tables in the wrong place and
   the API route will read/write a project the app never serves. Verify first:
   ```bash
   npm run check:supabase-env
   ```
   Do not proceed while #582 (REST/Auth vs `DATABASE_URL` split-brain) is open.
2. `pets` table exists in the target project (foreign-key target).
3. You have a current backup / point-in-time-recovery window on the target project.

## Apply

```bash
# from repo root, with .env.local pointing at the approved project
npm run db:apply-product-intelligence-schema
```

The script (`scripts/apply-schema.mjs`) runs the file in a single connection. The schema is
**idempotent** — every object uses `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS`,
so re-running it is safe.

## Verify (RLS is the safety boundary)

```sql
-- both tables present with RLS on
select relname, relrowsecurity
from pg_class
where relname in ('daily_readiness_snapshots', 'recovery_checkpoints');
-- expect relrowsecurity = true for both

-- ownership policies present (6 total: select/insert/update per table)
select tablename, policyname, cmd
from pg_policies
where tablename in ('daily_readiness_snapshots', 'recovery_checkpoints')
order by tablename, cmd;
```

Then run the live owner-scoped smoke against the snapshots route (owner GET/POST/GET + an
unowned-pet read that must return 404/denied). RLS correctness is what stops cross-owner reads —
confirm it before widening access.

## Rollback

These are additive tables with no app dependency until the route is exercised. To roll back:

```sql
drop table if exists public.recovery_checkpoints;
drop table if exists public.daily_readiness_snapshots;
drop function if exists public.set_product_intelligence_updated_at();
```

`ON DELETE CASCADE` on both foreign keys means tester rows are removed automatically when the owner
or pet is deleted — there is no direct `DELETE` grant to `authenticated`.

## Static contract guard

`tests/product-intelligence-schema.test.ts` locks the safety shape of this file (RLS enabled,
owner+pet-ownership scoping, cascade-only deletion, idempotent re-apply, pinned state vocabularies).
Run `npm test -- tests/product-intelligence-schema.test.ts` after any edit to the SQL.
