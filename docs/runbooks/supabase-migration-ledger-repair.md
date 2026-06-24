# Runbook — Supabase migration-ledger verify & repair (`dog_brain_supplement_trials`)

> Phase 5 of the investor-demo hardening loop. Verifies the Dog Brain supplement
> persistence backbone and repairs the migration ledger **without hand-editing it**.
> Do NOT fake completion — fill the Evidence section with real query output.

## Why this is a runbook, not an automated step

The Supabase MCP available in this session is bound to the **wrong account/project**:

- MCP `list_projects` returns exactly one project: `oripsqtuvyvhdhcnkgbz` ("JobsearchAi", us-west-2).
- The PawVital project is **`aammaxdsjhezmbvdkqee`** (see workspace memory `supabase-new-project`).
- Therefore the MCP **cannot reach** the PawVital database, and running anything
  against `oripsqtuvyvhdhcnkgbz` would touch an unrelated project. This is the
  declared loop **STOP condition "Supabase project is wrong"** — verification is
  deferred to an operator with the correct project link/credentials.

Additional environment facts (workspace memory):
- `supabase` CLI / `psql` are **not installed** on this machine.
- The `.env*` DB passwords are **stale** after the project migration; the current
  password must be supplied by the project owner at run time.
- The historically-working method here is a **Node `pg` one-off** (below).

## Target migration

- File: `supabase/migrations/20260622000000_dog_brain_supplement_trials.sql`
- Version token (14-digit, Supabase convention): **`20260622000000`**
- The DDL is fully idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
  EXISTS`, `DROP/CREATE POLICY`, `CREATE … INDEX IF NOT EXISTS`), so re-applying
  it is safe.

## Success criteria

1. Table `public.dog_brain_supplement_trials` exists with the lifecycle columns
   (`status`, `outcome`, `outcome_at`, `follow_up_due_at`, …).
2. Indexes exist: `uniq_supplement_trial_open` (partial unique),
   `idx_dog_brain_supplement_trials_user_pet`, `idx_dog_brain_supplement_trials_due`.
3. RLS is **enabled** and policy `dog_brain_supplement_trials_owner_all` exists.
4. `supabase_migrations.schema_migrations` contains version `20260622000000`.

---

## Step 1 — Verify (read-only). Run against project `aammaxdsjhezmbvdkqee`.

Connect with the **current** PawVital DB credentials, then run:

```sql
-- 1. Table + columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dog_brain_supplement_trials'
ORDER BY ordinal_position;

-- 2. Indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'dog_brain_supplement_trials'
ORDER BY indexname;

-- 3. RLS enabled + policies
SELECT relrowsecurity AS rls_enabled
FROM pg_class
WHERE oid = 'public.dog_brain_supplement_trials'::regclass;

SELECT polname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'dog_brain_supplement_trials';

-- 4. Migration ledger
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260622000000', '20260622000100', '20260618')
ORDER BY version;
```

### Node `pg` one-off (no psql/CLI required — the method that works on this host)

```bash
# From C:\pv-hardening (NTFS worktree). PGURI must be the CURRENT pooled or direct
# connection string for project aammaxdsjhezmbvdkqee — ask the project owner; the
# committed .env passwords are stale.
PGURI='postgresql://postgres:<CURRENT_PW>@db.aammaxdsjhezmbvdkqee.supabase.co:5432/postgres' \
node -e '
const { Client } = require("pg");
(async () => {
  const c = new Client({ connectionString: process.env.PGURI, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (label, sql) => { const r = await c.query(sql); console.log("\n== " + label + " =="); console.table(r.rows); };
  await q("columns", "select column_name,data_type,is_nullable from information_schema.columns where table_schema=\047public\047 and table_name=\047dog_brain_supplement_trials\047 order by ordinal_position");
  await q("indexes", "select indexname from pg_indexes where schemaname=\047public\047 and tablename=\047dog_brain_supplement_trials\047 order by indexname");
  await q("rls", "select relrowsecurity as rls_enabled from pg_class where oid=\047public.dog_brain_supplement_trials\047::regclass");
  await q("policies", "select polname,cmd from pg_policies where schemaname=\047public\047 and tablename=\047dog_brain_supplement_trials\047");
  await q("ledger", "select version from supabase_migrations.schema_migrations where version in (\04720260622000000\047,\04720260622000100\047,\04720260618\047) order by version");
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
'
```

## Step 2 — If the table is present but the ledger row is missing

The table was applied out-of-band (the idempotent DDL was run directly), so the
DB is correct but `schema_migrations` lacks the row. **Do not** `INSERT` into the
ledger by hand. Use the CLI repair (requires `supabase` CLI + project link):

```bash
supabase link --project-ref aammaxdsjhezmbvdkqee     # one-time, needs DB password
supabase migration list                              # shows local vs remote ledger
supabase migration repair --status applied 20260622000000
supabase migration repair --status applied 20260622000100   # supplements.notes
supabase migration list                              # confirm both now "applied" remote
```

If the CLI is unavailable, install it (`npm i -g supabase` or scoop/brew) on an
NTFS/WSL host — do not attempt from the `G:` exFAT mount.

## Step 3 — If the table is MISSING entirely

Apply the idempotent migration, then repair the ledger:

```bash
supabase db push        # applies pending migrations to the linked remote
# OR, without CLI, run the file via the Node pg one-off, then Step 2 repair.
```

## STOP / escalation

- If `link`/`repair` asks for a password you don't have → **stop**, ask the owner.
- If repair reports a permission error → **stop**, needs project-admin.
- Never run any of the above against `oripsqtuvyvhdhcnkgbz` (JobsearchAi).

## Evidence (fill with real output — do not leave blank to claim "done")

- [ ] Verified on project: `aammaxdsjhezmbvdkqee` at `<UTC timestamp>`
- [ ] Table + columns: `<paste>`
- [ ] Indexes (3 expected): `<paste>`
- [ ] RLS enabled = `true`; policy `dog_brain_supplement_trials_owner_all` present: `<paste>`
- [ ] `schema_migrations` contains `20260622000000`: `<yes/no>` → repaired? `<yes/no>`

### Prior evidence (workspace memory, not re-verified this iteration)
Memory `pawvital-pr702-supplement-loop` records the migration was **APPLIED +
verified** on `aammaxdsjhezmbvdkqee` via a Node `pg` one-off during the #702/#706
work. This runbook makes that check **repeatable** and adds the ledger-repair path.
