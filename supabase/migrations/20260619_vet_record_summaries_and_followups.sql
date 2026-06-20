-- VET-DOG-BRAIN: durable vet-record memory + follow-up queue
-- Idempotent — safe to run multiple times.
--
-- Apply via Supabase SQL editor:
--   https://supabase.com/dashboard/project/aammaxdsjhezmbvdkqee/sql/new
-- Or CLI: supabase db push --project-ref aammaxdsjhezmbvdkqee

-- 1. vet_record_summaries — extracted summary of an uploaded vet-record PDF,
--    pet-scoped, so the Dog Brain can remember prior vet visits.
CREATE TABLE IF NOT EXISTS public.vet_record_summaries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT,
  context_text TEXT,
  extracted_fields JSONB DEFAULT NULL,
  page_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.vet_record_summaries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vet_record_summaries'
      AND policyname = 'Users can manage their vet record summaries'
  ) THEN
    CREATE POLICY "Users can manage their vet record summaries"
      ON public.vet_record_summaries FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_vet_record_summaries_pet
  ON public.vet_record_summaries(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vet_record_summaries_user
  ON public.vet_record_summaries(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vet_record_summaries TO authenticated;

-- 2. dog_brain_followups — durable follow-up queue. When a pattern appears
--    ("stool soft 3 days"), a follow-up can be scheduled and resolved
--    (better / worse / same).
CREATE TABLE IF NOT EXISTS public.dog_brain_followups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE NOT NULL,
  signal_key TEXT NOT NULL,
  prompt TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'better', 'worse', 'same', 'dismissed')),
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.dog_brain_followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'dog_brain_followups'
      AND policyname = 'Users can manage their dog brain followups'
  ) THEN
    CREATE POLICY "Users can manage their dog brain followups"
      ON public.dog_brain_followups FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

-- One open follow-up per (pet, signal) — avoids duplicate nags for the same pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_followup_open_per_signal
  ON public.dog_brain_followups(pet_id, signal_key)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dog_brain_followups_pet
  ON public.dog_brain_followups(pet_id, status, due_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_brain_followups TO authenticated;
