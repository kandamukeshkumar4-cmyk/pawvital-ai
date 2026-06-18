-- Daily Health Log schema (Phase 2 — owner-facing structured daily logging).
-- Idempotent: safe to run multiple times. Apply in the Supabase SQL editor.
-- Mirrors the RLS / trigger conventions of supabase-product-intelligence-schema.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  appetite text NOT NULL DEFAULT 'normal'
    CHECK (appetite IN ('normal', 'reduced', 'none', 'increased')),
  water text NOT NULL DEFAULT 'normal'
    CHECK (water IN ('normal', 'less', 'more')),
  stool text NOT NULL DEFAULT 'normal'
    CHECK (stool IN ('normal', 'soft', 'diarrhea', 'none', 'blood')),
  urination text NOT NULL DEFAULT 'normal'
    CHECK (urination IN ('normal', 'less', 'more', 'straining', 'none')),
  vomiting_count integer NOT NULL DEFAULT 0 CHECK (vomiting_count >= 0 AND vomiting_count <= 100),
  energy text NOT NULL DEFAULT 'normal'
    CHECK (energy IN ('normal', 'low', 'high')),
  weight_kg numeric(6, 2) CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg <= 200)),
  meds_given boolean NOT NULL DEFAULT false,
  notes text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pet_id, log_date)
);

CREATE INDEX IF NOT EXISTS daily_health_logs_user_pet_date_idx
  ON public.daily_health_logs (user_id, pet_id, log_date DESC);

CREATE OR REPLACE FUNCTION public.set_daily_health_logs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_daily_health_logs_updated_at
  ON public.daily_health_logs;
CREATE TRIGGER set_daily_health_logs_updated_at
  BEFORE UPDATE ON public.daily_health_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_daily_health_logs_updated_at();

ALTER TABLE public.daily_health_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_health_logs TO authenticated;

DROP POLICY IF EXISTS daily_health_logs_select_own ON public.daily_health_logs;
CREATE POLICY daily_health_logs_select_own
  ON public.daily_health_logs
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pets
      WHERE pets.id = daily_health_logs.pet_id AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS daily_health_logs_insert_own ON public.daily_health_logs;
CREATE POLICY daily_health_logs_insert_own
  ON public.daily_health_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pets
      WHERE pets.id = daily_health_logs.pet_id AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS daily_health_logs_update_own ON public.daily_health_logs;
CREATE POLICY daily_health_logs_update_own
  ON public.daily_health_logs
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pets
      WHERE pets.id = daily_health_logs.pet_id AND pets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pets
      WHERE pets.id = daily_health_logs.pet_id AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS daily_health_logs_delete_own ON public.daily_health_logs;
CREATE POLICY daily_health_logs_delete_own
  ON public.daily_health_logs
  FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.pets
      WHERE pets.id = daily_health_logs.pet_id AND pets.user_id = auth.uid()
    )
  );
