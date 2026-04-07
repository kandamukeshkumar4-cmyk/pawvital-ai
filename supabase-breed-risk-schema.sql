-- VET-823: Breed Risk Intelligence Schema
-- Run in Supabase SQL Editor after the base schema

CREATE TABLE IF NOT EXISTS public.breed_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  breed TEXT NOT NULL,
  condition TEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 0,
  risk_score NUMERIC(5,4) NOT NULL DEFAULT 0,
  sample_size INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE (breed, condition)
);

CREATE INDEX IF NOT EXISTS idx_breed_risk_breed
  ON public.breed_risk_profiles (breed);

CREATE INDEX IF NOT EXISTS idx_breed_risk_score
  ON public.breed_risk_profiles (breed, risk_score DESC);

ALTER TABLE public.breed_risk_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'breed_risk_profiles'
      AND policyname = 'Authenticated read breed risk'
  ) THEN
    CREATE POLICY "Authenticated read breed risk"
      ON public.breed_risk_profiles
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'breed_risk_profiles'
      AND policyname = 'Service role manages breed risk'
  ) THEN
    CREATE POLICY "Service role manages breed risk"
      ON public.breed_risk_profiles
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;