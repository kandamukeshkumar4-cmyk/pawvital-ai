-- Minimal persisted supplement lifecycle for Dog Brain follow-up loop.
-- Owner starts a trial (ask-vet framing only). Outcomes (better/same/worse/side_effect)
-- feed back into Brain context. Never stores dosage.

CREATE TABLE IF NOT EXISTS public.dog_brain_supplement_trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  supplement_name text NOT NULL,
  reason_signal_key text,
  status text NOT NULL CHECK (status IN ('ask_vet','active','stopped','follow_up_due')),
  started_at timestamptz,
  follow_up_due_at timestamptz,
  outcome text CHECK (outcome IN ('better','same','worse','side_effect')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dog_brain_supplement_trials ENABLE ROW LEVEL SECURITY;

-- RLS: owner only
DROP POLICY IF EXISTS "dog_brain_supplement_trials_owner_all" ON public.dog_brain_supplement_trials;
CREATE POLICY "dog_brain_supplement_trials_owner_all"
  ON public.dog_brain_supplement_trials
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for loop queries
CREATE INDEX IF NOT EXISTS idx_dog_brain_supplement_trials_user_pet
  ON public.dog_brain_supplement_trials (user_id, pet_id, status);
CREATE INDEX IF NOT EXISTS idx_dog_brain_supplement_trials_due
  ON public.dog_brain_supplement_trials (follow_up_due_at) WHERE follow_up_due_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dog_brain_supplement_trials TO authenticated;
