-- VET-1564A/B review-only product-intelligence persistence schema.
-- Do not apply this file outside the approved Supabase migration path.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  readiness_state text NOT NULL CHECK (readiness_state IN ('stable', 'watch', 'urgent', 'unknown')),
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'insufficient')),
  display_score integer CHECK (display_score BETWEEN 0 AND 100),
  evidence_coverage numeric(5, 4) NOT NULL CHECK (evidence_coverage >= 0 AND evidence_coverage <= 1),
  source_check_ids text[] NOT NULL DEFAULT '{}',
  generated_by text NOT NULL DEFAULT 'analytics-evidence-ring',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pet_id, snapshot_date, generated_by)
);

CREATE TABLE IF NOT EXISTS public.recovery_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  report_source_id text NOT NULL,
  checkpoint_date date NOT NULL,
  recovery_status text NOT NULL CHECK (recovery_status IN ('ready', 'insufficient_evidence', 'urgent_override')),
  source_check_ids text[] NOT NULL DEFAULT '{}',
  generated_by text NOT NULL DEFAULT 'analytics-evidence-ring',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, pet_id, report_source_id, checkpoint_date, generated_by)
);

CREATE INDEX IF NOT EXISTS daily_readiness_snapshots_user_pet_created_idx
  ON public.daily_readiness_snapshots (user_id, pet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recovery_checkpoints_user_pet_created_idx
  ON public.recovery_checkpoints (user_id, pet_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_product_intelligence_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_daily_readiness_snapshots_updated_at
  ON public.daily_readiness_snapshots;
CREATE TRIGGER set_daily_readiness_snapshots_updated_at
  BEFORE UPDATE ON public.daily_readiness_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_intelligence_updated_at();

DROP TRIGGER IF EXISTS set_recovery_checkpoints_updated_at
  ON public.recovery_checkpoints;
CREATE TRIGGER set_recovery_checkpoints_updated_at
  BEFORE UPDATE ON public.recovery_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_intelligence_updated_at();

ALTER TABLE public.daily_readiness_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_checkpoints ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.daily_readiness_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.recovery_checkpoints TO authenticated;

DROP POLICY IF EXISTS daily_readiness_snapshots_select_own
  ON public.daily_readiness_snapshots;
CREATE POLICY daily_readiness_snapshots_select_own
  ON public.daily_readiness_snapshots
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = daily_readiness_snapshots.pet_id
        AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS daily_readiness_snapshots_insert_own
  ON public.daily_readiness_snapshots;
CREATE POLICY daily_readiness_snapshots_insert_own
  ON public.daily_readiness_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = daily_readiness_snapshots.pet_id
        AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS daily_readiness_snapshots_update_own
  ON public.daily_readiness_snapshots;
CREATE POLICY daily_readiness_snapshots_update_own
  ON public.daily_readiness_snapshots
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = daily_readiness_snapshots.pet_id
        AND pets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = daily_readiness_snapshots.pet_id
        AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS recovery_checkpoints_select_own
  ON public.recovery_checkpoints;
CREATE POLICY recovery_checkpoints_select_own
  ON public.recovery_checkpoints
  FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = recovery_checkpoints.pet_id
        AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS recovery_checkpoints_insert_own
  ON public.recovery_checkpoints;
CREATE POLICY recovery_checkpoints_insert_own
  ON public.recovery_checkpoints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = recovery_checkpoints.pet_id
        AND pets.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS recovery_checkpoints_update_own
  ON public.recovery_checkpoints;
CREATE POLICY recovery_checkpoints_update_own
  ON public.recovery_checkpoints
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = recovery_checkpoints.pet_id
        AND pets.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.pets
      WHERE pets.id = recovery_checkpoints.pet_id
        AND pets.user_id = auth.uid()
    )
  );
