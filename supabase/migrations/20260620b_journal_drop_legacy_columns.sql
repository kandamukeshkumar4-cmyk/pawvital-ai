-- QA fix (corrective): journal create now fails with Postgres 23514
-- (check_violation), confirmed via Vercel runtime logs. The prior migration
-- relaxed NOT NULL and set a '' default on legacy text columns, but a leftover
-- CHECK constraint on a legacy column (e.g. CHECK (type IN (...))) rejects ''.
--
-- Clean permanent fix: DROP the legacy columns outright. Their data was already
-- migrated into the live columns by supabase-journal-schema.sql
-- (content/title -> notes, photo_url -> photo_urls, date -> entry_date), so this
-- is safe. DROP COLUMN also removes the column's CHECK/NOT NULL/DEFAULT.
--
-- Idempotent (IF EXISTS). Apply via Supabase SQL editor:
--   https://supabase.com/dashboard/project/aammaxdsjhezmbvdkqee/sql/new

ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS type;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS title;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS content;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS photo_url;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS "date";

-- Safety net: drop any remaining CHECK constraint on journal_entries that
-- references a now-removed legacy column or 'mood', so the live insert
-- (mood in happy/normal/low/sick) can never be rejected by a stale check.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'journal_entries'
      AND con.contype = 'c'
      AND (
        pg_get_constraintdef(con.oid) ILIKE '%type%'
        OR pg_get_constraintdef(con.oid) ILIKE '%title%'
        OR pg_get_constraintdef(con.oid) ILIKE '%content%'
        OR pg_get_constraintdef(con.oid) ILIKE '%mood%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.journal_entries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;
