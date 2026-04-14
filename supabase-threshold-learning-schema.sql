CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.outcome_feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom_check_id UUID NOT NULL REFERENCES public.symptom_checks(id) ON DELETE CASCADE,
  matched_expectation TEXT NOT NULL CHECK (matched_expectation IN ('yes', 'partly', 'no')),
  confirmed_diagnosis TEXT,
  vet_outcome TEXT,
  owner_notes TEXT,
  symptom_summary TEXT,
  report_title TEXT,
  report_severity TEXT,
  report_recommendation TEXT,
  report_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  feedback_source TEXT NOT NULL DEFAULT 'owner_feedback',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_entries_check
  ON public.outcome_feedback_entries(symptom_check_id);

CREATE INDEX IF NOT EXISTS idx_outcome_feedback_entries_submitted
  ON public.outcome_feedback_entries(submitted_at DESC);

ALTER TABLE public.outcome_feedback_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own outcome feedback entries" ON public.outcome_feedback_entries;
CREATE POLICY "Users can view own outcome feedback entries"
  ON public.outcome_feedback_entries
  FOR SELECT
  USING (
    symptom_check_id IN (
      SELECT sc.id
      FROM public.symptom_checks sc
      JOIN public.pets p ON p.id = sc.pet_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create own outcome feedback entries" ON public.outcome_feedback_entries;
CREATE POLICY "Users can create own outcome feedback entries"
  ON public.outcome_feedback_entries
  FOR INSERT
  WITH CHECK (
    symptom_check_id IN (
      SELECT sc.id
      FROM public.symptom_checks sc
      JOIN public.pets p ON p.id = sc.pet_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.threshold_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_feedback_id UUID REFERENCES public.outcome_feedback_entries(id) ON DELETE SET NULL,
  symptom_check_id UUID REFERENCES public.symptom_checks(id) ON DELETE CASCADE,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('threshold_review', 'calibration_review')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'superseded')),
  summary TEXT NOT NULL,
  rationale TEXT NOT NULL,
  reviewer_notes TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threshold_proposals_status
  ON public.threshold_proposals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_threshold_proposals_feedback
  ON public.threshold_proposals(outcome_feedback_id);

ALTER TABLE public.threshold_proposals ENABLE ROW LEVEL SECURITY;
