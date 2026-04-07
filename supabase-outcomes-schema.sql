CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.case_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.symptom_checks(id) ON DELETE CASCADE,
  reported_diagnosis TEXT,
  vet_confirmed BOOLEAN,
  outcome_notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_check
  ON public.case_outcomes(check_id);

CREATE INDEX IF NOT EXISTS idx_outcomes_confirmed
  ON public.case_outcomes(vet_confirmed)
  WHERE vet_confirmed = true;

ALTER TABLE public.case_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own case outcomes" ON public.case_outcomes;
CREATE POLICY "Users can view own case outcomes"
  ON public.case_outcomes
  FOR SELECT
  USING (
    check_id IN (
      SELECT sc.id
      FROM public.symptom_checks sc
      JOIN public.pets p ON p.id = sc.pet_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create own case outcomes" ON public.case_outcomes;
CREATE POLICY "Users can create own case outcomes"
  ON public.case_outcomes
  FOR INSERT
  WITH CHECK (
    check_id IN (
      SELECT sc.id
      FROM public.symptom_checks sc
      JOIN public.pets p ON p.id = sc.pet_id
      WHERE p.user_id = auth.uid()
    )
  );