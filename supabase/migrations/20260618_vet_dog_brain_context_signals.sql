-- VET-DOG-BRAIN: Add context_signals JSONB to daily_health_logs
-- Safe to run multiple times (all statements are idempotent).
--
-- Apply via Supabase SQL editor:
--   https://supabase.com/dashboard/project/aammaxdsjhezmbvdkqee/sql/new
--
-- Or via the Supabase CLI once credentials are available:
--   supabase db push --project-ref aammaxdsjhezmbvdkqee

-- 1. Add context_signals column (JSONB, nullable).
ALTER TABLE public.daily_health_logs
  ADD COLUMN IF NOT EXISTS context_signals jsonb DEFAULT NULL;

-- 2. Verify photo_urls exists; add if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'daily_health_logs'
      AND column_name  = 'photo_urls'
  ) THEN
    ALTER TABLE public.daily_health_logs
      ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
  END IF;
END;
$$;
