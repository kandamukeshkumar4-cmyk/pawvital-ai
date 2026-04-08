-- VET-824: Health journal with user_id, AI summary, energy, multi-photo URLs, and Storage bucket.
-- Run in Supabase SQL Editor after core schema (supabase-schema.sql).
-- Idempotent: safe to re-run; extends existing journal_entries when present.

-- Prerequisite: public.journal_entries from supabase-schema.sql (or equivalent).

-- ---------------------------------------------------------------------------
-- Target shape (extends supabase-schema journal_entries):
--   id, user_id, pet_id, entry_date, mood, energy_level, notes, ai_summary,
--   photo_urls TEXT[]  (+ legacy columns type, title, content, photo_url, etc.)
-- ---------------------------------------------------------------------------

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS entry_date DATE;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS energy_level INTEGER;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS ai_summary TEXT;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[];

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'journal_entries' AND column_name = 'entry_date'
  ) THEN
    ALTER TABLE public.journal_entries RENAME COLUMN date TO entry_date;
  END IF;
END $$;

UPDATE public.journal_entries j
SET user_id = p.user_id
FROM public.pets p
WHERE j.pet_id = p.id AND j.user_id IS NULL;

UPDATE public.journal_entries
SET notes = COALESCE(notes, content, title)
WHERE notes IS NULL AND (content IS NOT NULL OR title IS NOT NULL);

UPDATE public.journal_entries
SET entry_date = COALESCE(entry_date, CURRENT_DATE)
WHERE entry_date IS NULL;

UPDATE public.journal_entries
SET photo_urls = CASE
  WHEN photo_urls IS NOT NULL AND array_length(photo_urls, 1) IS NOT NULL THEN photo_urls
  WHEN photo_url IS NOT NULL AND photo_url <> '' THEN ARRAY[photo_url]
  ELSE '{}'::TEXT[]
END
WHERE photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN entry_date SET NOT NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN photo_urls SET DEFAULT '{}';

UPDATE public.journal_entries SET photo_urls = '{}' WHERE photo_urls IS NULL;

ALTER TABLE public.journal_entries
  ALTER COLUMN photo_urls SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_energy_level_check'
  ) THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_energy_level_check
      CHECK (energy_level IS NULL OR (energy_level >= 1 AND energy_level <= 10));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_pet_id ON public.journal_entries(pet_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON public.journal_entries(entry_date DESC);

DROP TRIGGER IF EXISTS journal_entries_set_updated_at ON public.journal_entries;
CREATE OR REPLACE FUNCTION public.set_journal_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_set_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_journal_entries_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: users manage only rows where user_id = auth.uid()
-- ---------------------------------------------------------------------------

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage journal" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_select_own" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_insert_own" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_update_own" ON public.journal_entries;
DROP POLICY IF EXISTS "journal_entries_delete_own" ON public.journal_entries;

CREATE POLICY "journal_entries_select_own"
  ON public.journal_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "journal_entries_insert_own"
  ON public.journal_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_update_own"
  ON public.journal_entries FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "journal_entries_delete_own"
  ON public.journal_entries FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: journal-photos (private; access via signed URLs or authenticated reads)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'journal-photos',
  'journal-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "journal_photos_select_own" ON storage.objects;
DROP POLICY IF EXISTS "journal_photos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "journal_photos_update_own" ON storage.objects;
DROP POLICY IF EXISTS "journal_photos_delete_own" ON storage.objects;

CREATE POLICY "journal_photos_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "journal_photos_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "journal_photos_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "journal_photos_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'journal-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
