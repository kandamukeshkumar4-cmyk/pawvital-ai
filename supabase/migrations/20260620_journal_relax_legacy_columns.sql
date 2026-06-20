-- QA fix: journal entry INSERT returns 500 in prod.
-- Root cause: the journal_entries table still carries legacy NOT NULL columns
-- (type/title/content from the original schema) that the current insert path
-- does not populate (it writes entry_date/mood/energy_level/notes/photo_urls).
-- A NOT NULL violation on a legacy column makes every create fail.
--
-- This migration relaxes those legacy columns so inserts succeed. Idempotent and
-- guarded by IF EXISTS — safe to run multiple times, no-ops if the columns are
-- already gone.
--
-- Apply via Supabase SQL editor:
--   https://supabase.com/dashboard/project/aammaxdsjhezmbvdkqee/sql/new

DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['type', 'title', 'content', 'date', 'photo_url']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'journal_entries'
        AND column_name = col
        AND is_nullable = 'NO'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.journal_entries ALTER COLUMN %I DROP NOT NULL',
        col
      );
    END IF;
  END LOOP;
END;
$$;

-- Belt-and-suspenders: give legacy text columns an empty-string default so any
-- code path that still references them inserts cleanly.
DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['type', 'title', 'content']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'journal_entries'
        AND column_name = col
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.journal_entries ALTER COLUMN %I SET DEFAULT %L',
        col, ''
      );
    END IF;
  END LOOP;
END;
$$;
